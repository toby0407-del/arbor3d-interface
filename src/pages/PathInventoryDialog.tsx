import { useEffect, useMemo, useState } from "react";
import { PathTreeMap } from "../components/PathTreeMap";
import { PlyViewer } from "../components/PlyViewer";
import { useFieldMeasures } from "../hooks/useFieldMeasures";
import {
  CARBON_COEFFS,
  carbonForTree,
  coeffSelectValue,
  isCustomCoeff,
  totalCo2Ton,
} from "../lib/carbon";
import { downloadInventoryCsv } from "../lib/csv";
import {
  breastHeightLabel,
  formatArc,
  formatConfidence,
  formatDbh,
  formatScanTime,
  formatXyz,
  methodLabel,
} from "../lib/format";
import { scanAssetUrl } from "../lib/scanMedia";
import {
  inventoryStats,
  isReviewTree,
  lightShort,
  reviewReason,
  trafficLight,
} from "../lib/status";
import type { ParkInventoryReport, TrafficLight } from "../types";

type PreviewTab = "images" | "measure" | "model";
type Filter = "all" | TrafficLight | "review";
type TableView = "inventory" | "carbon";

type Props = {
  parkName: string;
  pathName: string;
  report: ParkInventoryReport;
  previewTreeId: string | null;
  onPreviewTree: (treeId: string) => void;
  onClose: () => void;
  onImport?: () => void;
};

function ZoomImage({
  src,
  title,
  alt,
  onOpen,
}: {
  src: string;
  title: string;
  alt: string;
  onOpen: () => void;
}) {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    setOk(true);
  }, [src]);
  if (!ok) {
    return <div className="path-db-empty">尚無{title}</div>;
  }
  return (
    <button type="button" className="path-db-thumb" onClick={onOpen}>
      <img src={src} alt={alt} onError={() => setOk(false)} />
      <span>點擊放大</span>
    </button>
  );
}

export function PathInventoryDialog({
  parkName,
  pathName,
  report,
  previewTreeId,
  onPreviewTree,
  onClose,
  onImport,
}: Props) {
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(
    null,
  );
  const [tab, setTab] = useState<PreviewTab>("images");
  const [tableView, setTableView] = useState<TableView>("inventory");
  const [filter, setFilter] = useState<Filter>("all");
  const { measures, update } = useFieldMeasures(report.scan_id);
  const stats = useMemo(() => inventoryStats(report.trees), [report.trees]);
  const co2Total = useMemo(
    () => totalCo2Ton(report.trees, measures, report.created_at),
    [measures, report.created_at, report.trees],
  );
  const visible = useMemo(() => {
    return report.trees.filter((tree) => {
      if (filter === "all") return true;
      if (filter === "review") return isReviewTree(tree);
      return trafficLight(tree.DBH_note) === filter;
    });
  }, [filter, report.trees]);

  const preview =
    visible.find((tree) => tree.Tree_ID === previewTreeId) ??
    visible[0] ??
    report.trees[0] ??
    null;

  useEffect(() => {
    if (preview && preview.Tree_ID !== previewTreeId) {
      onPreviewTree(preview.Tree_ID);
    }
  }, [onPreviewTree, preview, previewTreeId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (lightbox) {
          setLightbox(null);
          return;
        }
        onClose();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      if (visible.length === 0) return;
      const current = preview?.Tree_ID ?? visible[0].Tree_ID;
      const idx = visible.findIndex((tree) => tree.Tree_ID === current);
      const next =
        event.key === "ArrowDown"
          ? visible[(idx + 1) % visible.length]
          : visible[(idx - 1 + visible.length) % visible.length];
      onPreviewTree(next.Tree_ID);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, onClose, onPreviewTree, preview, visible]);

  const cacheBust = `?t=${encodeURIComponent(report.created_at)}`;
  const maskUrl = preview
    ? scanAssetUrl(report.scan_id, preview.Mask_Path, cacheBust)
    : null;
  const sliceUrl = preview
    ? scanAssetUrl(report.scan_id, preview.Cross_Section_Image, cacheBust)
    : null;
  const photoUrl = preview
    ? scanAssetUrl(report.scan_id, preview.Best_Photo, cacheBust)
    : null;
  const cloudPreviewUrl = preview
    ? scanAssetUrl(report.scan_id, preview.PointCloud_Preview, cacheBust)
    : null;
  const modelUrl = preview
    ? scanAssetUrl(
        report.scan_id,
        preview.Single_Tree_Ply || preview["3D_Model_Path"],
      )
    : null;
  const field = preview ? measures[preview.Tree_ID] : undefined;
  const light = preview ? trafficLight(preview.DBH_note) : "red";
  const carbon = preview
    ? carbonForTree(preview, field, report.created_at)
    : null;

  return (
    <div className="path-db-backdrop" role="presentation" onClick={onClose}>
      <div
        className="path-db-panel is-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="path-db-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="path-db-head">
          <div>
            <p className="path-db-kicker">{parkName}</p>
            <h2 id="path-db-title">{pathName}</h2>
            <p>
              掃描 {report.scan_id} · {formatScanTime(report.created_at)} ·{" "}
              {report.gps_available ? "有 GPS" : "無 GPS"} · 方向鍵可切樹
            </p>
            <div className="inv-summary" aria-label="盤點摘要">
              <span className="pill">{stats.total} 棵</span>
              <span className="pill is-green">淡綠 {stats.green}</span>
              <span className="pill is-yellow">淡黃 {stats.yellow}</span>
              <span className="pill is-red">淡紅 {stats.red}</span>
              <span className="pill">
                平均信心 {formatConfidence(stats.avgConfidence)}
              </span>
              <span className="pill is-green">
                吸收 CO₂ {co2Total.toFixed(2)} ton
              </span>
            </div>
          </div>
          <div className="path-db-head-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() =>
                downloadInventoryCsv(
                  report.trees,
                  measures,
                  `${report.scan_id}-inventory.csv`,
                  report.created_at,
                )
              }
            >
              匯出 CSV
            </button>
            {onImport ? (
              <button type="button" className="ghost-btn" onClick={onImport}>
                再匯入
              </button>
            ) : null}
            <button type="button" className="ghost-btn" onClick={onClose}>
              關閉
            </button>
          </div>
        </header>

        <div className="path-db-body">
          <aside className="path-db-map">
            <h3>路徑圖</h3>
            <PathTreeMap
              trees={report.trees}
              selectedId={preview?.Tree_ID ?? null}
              onPick={onPreviewTree}
            />
            <p>點中間資料列，左邊對應樹會亮燈；也可直接點路徑圖上的點</p>
            {stats.review > 0 ? (
              <section className="review-mini">
                <h3>待複核 {stats.review}</h3>
                <ul>
                  {report.trees.filter(isReviewTree).map((tree) => (
                    <li key={tree.Tree_ID}>
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => {
                          setFilter("review");
                          onPreviewTree(tree.Tree_ID);
                        }}
                      >
                        {tree.Tree_ID}
                      </button>
                      <span>{reviewReason(tree)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>

          <div
            className={`path-db-table-wrap${tableView === "carbon" ? " is-scroll-x" : ""}`}
          >
            <div className="inv-filters" role="tablist" aria-label="篩選">
              {(
                [
                  ["all", `全部 ${stats.total}`],
                  ["green", `淡綠 ${stats.green}`],
                  ["yellow", `淡黃 ${stats.yellow}`],
                  ["red", `淡紅 ${stats.red}`],
                  ["review", `待複核 ${stats.review}`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  className={`kind-tab ${filter === id ? "is-active" : ""}`}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
              <span className="inv-view-split" />
              {(
                [
                  ["inventory", "樹表"],
                  ["carbon", "碳吸收"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`kind-tab ${tableView === id ? "is-active" : ""}`}
                  onClick={() => {
                    setTableView(id);
                    if (id === "carbon") setTab("measure");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {visible.length === 0 ? (
              <div className="path-db-empty">這個篩選沒有樹</div>
            ) : tableView === "carbon" ? (
              <table className="path-db-table is-dense is-carbon">
                <thead>
                  <tr>
                    <th>樹號</th>
                    <th>
                      高度 1.3 m 處圓周 (m)<sup>A</sup>
                    </th>
                    <th>
                      樹高 (m)<sup>B</sup>
                    </th>
                    <th>
                      係數<sup>C</sup>
                    </th>
                    <th>
                      樹含碳量 [A²×B×C]<sup>D</sup>
                    </th>
                    <th>
                      吸收 CO₂ 當量 [D×3.667] (ton)
                    </th>
                    <th>測量日期</th>
                    <th>備註</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((tree) => {
                    const row = carbonForTree(
                      tree,
                      measures[tree.Tree_ID],
                      report.created_at,
                    );
                    const active = tree.Tree_ID === preview?.Tree_ID;
                    return (
                      <tr
                        key={tree.Tree_ID}
                        className={active ? "is-active" : undefined}
                        onClick={() => onPreviewTree(tree.Tree_ID)}
                      >
                        <td>
                          <code>{tree.Tree_ID}</code>
                        </td>
                        <td>{row.circumferenceM?.toFixed(3) ?? "—"}</td>
                        <td>
                          {row.heightM != null
                            ? row.heightEstimated && row.heightErrorM != null
                              ? `${row.heightM.toFixed(1)} ±${row.heightErrorM.toFixed(0)}`
                              : row.heightM.toFixed(1)
                            : "—"}
                        </td>
                        <td>{row.coeff}</td>
                        <td>{row.carbonD?.toFixed(4) ?? "—"}</td>
                        <td>{row.co2Ton?.toFixed(3) ?? "—"}</td>
                        <td>{row.measuredAt}</td>
                        <td>{measures[tree.Tree_ID]?.note?.trim() || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>本篩選合計</td>
                    <td>
                      {visible
                        .reduce((sum, tree) => {
                          const row = carbonForTree(
                            tree,
                            measures[tree.Tree_ID],
                            report.created_at,
                          );
                          return sum + (row.co2Ton ?? 0);
                        }, 0)
                        .toFixed(3)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            ) : (
              <table className="path-db-table is-dense">
                <thead>
                  <tr>
                    <th>樹號</th>
                    <th>胸徑</th>
                    <th>方法</th>
                    <th>弧度</th>
                    <th>信心度</th>
                    <th>狀態</th>
                    <th>備註</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((tree) => {
                    const rowLight = trafficLight(tree.DBH_note);
                    const active = tree.Tree_ID === preview?.Tree_ID;
                    return (
                      <tr
                        key={tree.Tree_ID}
                        className={active ? "is-active" : undefined}
                        onClick={() => onPreviewTree(tree.Tree_ID)}
                      >
                        <td>
                          <code>{tree.Tree_ID}</code>
                        </td>
                        <td>{formatDbh(tree.DBH_cm)}</td>
                        <td>{methodLabel(tree.DBH_method)}</td>
                        <td>{formatArc(tree.arc_coverage_deg)}</td>
                        <td>{formatConfidence(tree.YOLO_confidence)}</td>
                        <td>
                          <span className={`path-db-pill is-${rowLight}`}>
                            {lightShort(rowLight)}
                          </span>
                        </td>
                        <td>{measures[tree.Tree_ID]?.note?.trim() || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <aside className="path-db-preview">
            <div className="inv-tabs" role="tablist" aria-label="樹身分">
              {(
                [
                  ["images", "影像"],
                  ["measure", "量測"],
                  ["model", "3D"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={`kind-tab ${tab === id ? "is-active" : ""}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {!preview ? (
              <div className="path-db-empty">尚無盤點資料</div>
            ) : tab === "images" ? (
              <>
                <h3>
                  {preview.Tree_ID} · Segmentation · 信心度{" "}
                  {formatConfidence(preview.YOLO_confidence)}
                </h3>
                {maskUrl ? (
                  <ZoomImage
                    src={maskUrl}
                    title="Segmentation"
                    alt={`${preview.Tree_ID} segmentation`}
                    onOpen={() =>
                      setLightbox({
                        src: maskUrl,
                        title: `${preview.Tree_ID} · Segmentation`,
                      })
                    }
                  />
                ) : (
                  <div className="path-db-empty">尚無 Segmentation 圖</div>
                )}
                <h3>橫切面</h3>
                {sliceUrl ? (
                  <ZoomImage
                    src={sliceUrl}
                    title="橫切面"
                    alt={`${preview.Tree_ID} 橫切面`}
                    onOpen={() =>
                      setLightbox({
                        src: sliceUrl,
                        title: `${preview.Tree_ID} · 橫切面`,
                      })
                    }
                  />
                ) : (
                  <div className="path-db-empty">尚無橫切面圖</div>
                )}
                <h3>原圖</h3>
                {photoUrl ? (
                  <ZoomImage
                    src={photoUrl}
                    title="原圖"
                    alt={`${preview.Tree_ID} 照片`}
                    onOpen={() =>
                      setLightbox({
                        src: photoUrl,
                        title: `${preview.Tree_ID} · 原圖`,
                      })
                    }
                  />
                ) : (
                  <div className="path-db-empty">尚無現場原圖</div>
                )}
                <h3>點雲側視</h3>
                {cloudPreviewUrl ? (
                  <ZoomImage
                    src={cloudPreviewUrl}
                    title="點雲側視"
                    alt={`${preview.Tree_ID} 點雲側視`}
                    onOpen={() =>
                      setLightbox({
                        src: cloudPreviewUrl,
                        title: `${preview.Tree_ID} · 點雲側視`,
                      })
                    }
                  />
                ) : (
                  <div className="path-db-empty">尚無點雲側視</div>
                )}
              </>
            ) : tab === "measure" ? (
              <div className="measure-panel">
                <div className={`dbh-hero is-${light}`}>
                  <span>{preview.Tree_ID}</span>
                  <strong>
                    {formatDbh(preview.DBH_cm)}
                    <em> 胸徑</em>
                  </strong>
                </div>
                {light === "red" ? (
                  <p className="red-banner">{reviewReason(preview)}</p>
                ) : null}
                <dl className="spec-list">
                  <div>
                    <dt>量測方法</dt>
                    <dd>{methodLabel(preview.DBH_method)}</dd>
                  </div>
                  <div>
                    <dt>弧度覆蓋</dt>
                    <dd>{formatArc(preview.arc_coverage_deg)}</dd>
                  </div>
                  <div className={`is-breast ${preview.dbh_is_strict_breast_height ? "is-ok" : ""}`}>
                    <dt>胸高</dt>
                    <dd>{breastHeightLabel(preview.dbh_is_strict_breast_height)}</dd>
                  </div>
                  <div>
                    <dt>偵測次數</dt>
                    <dd>{preview.num_detections ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>相對座標</dt>
                    <dd className="mono">{formatXyz(preview.Local_XYZ_m)}</dd>
                  </div>
                </dl>
                <label className="field-measure">
                  <span className="field-label">
                    現場手測胸徑
                    <em>不覆蓋演算法數字</em>
                  </span>
                  <input
                    inputMode="decimal"
                    value={field?.dbhCm ?? ""}
                    placeholder="cm"
                    onChange={(event) =>
                      update(preview.Tree_ID, { dbhCm: event.target.value })
                    }
                  />
                </label>
                <label className="field-measure">
                  <span className="field-label">備註</span>
                  <input
                    value={field?.note ?? ""}
                    placeholder="現場補充、樹況、特殊狀況…"
                    onChange={(event) =>
                      update(preview.Tree_ID, { note: event.target.value })
                    }
                  />
                </label>
                {carbon ? (
                  <div className="carbon-box">
                    <h3>碳吸收</h3>
                    <p className="carbon-formula">
                      D = A² × B × C　·　CO₂ = D × 3.667
                    </p>
                    <dl className="spec-list is-carbon">
                      <div>
                        <dt>高度 1.3 m 處圓周 A</dt>
                        <dd>
                          {carbon.circumferenceM != null
                            ? `${carbon.circumferenceM.toFixed(3)} m`
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>樹含碳量 D</dt>
                        <dd>
                          {carbon.carbonD != null
                            ? carbon.carbonD.toFixed(4)
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>吸收 CO₂ 當量</dt>
                        <dd>
                          {carbon.co2Ton != null
                            ? `${carbon.co2Ton.toFixed(3)} ton`
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                    <label className="field-measure">
                      <span className="field-label">
                        樹高 B
                        <em>
                          {carbon.heightEstimated && carbon.heightErrorM != null
                            ? `空白則胸徑粗估，誤差約 ±${carbon.heightErrorM.toFixed(0)} m`
                            : "公尺"}
                        </em>
                      </span>
                      <input
                        inputMode="decimal"
                        value={field?.heightM ?? ""}
                        placeholder={
                          carbon.heightM != null
                            ? `${carbon.heightM.toFixed(1)}（估）`
                            : "m"
                        }
                        onChange={(event) =>
                          update(preview.Tree_ID, {
                            heightM: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="field-measure">
                      <span className="field-label">係數 C</span>
                      <select
                        value={coeffSelectValue(field?.coeff)}
                        onChange={(event) => {
                          const value = event.target.value;
                          update(preview.Tree_ID, {
                            coeff:
                              value === "custom"
                                ? isCustomCoeff(field?.coeff)
                                  ? field?.coeff ?? ""
                                  : "0.016"
                                : value,
                          });
                        }}
                      >
                        {CARBON_COEFFS.map((item) => (
                          <option key={item.id} value={String(item.value)}>
                            {item.label}
                          </option>
                        ))}
                        <option value="custom">自訂</option>
                      </select>
                    </label>
                    {isCustomCoeff(field?.coeff) ? (
                      <label className="field-measure">
                        <span className="field-label">自訂係數</span>
                        <input
                          inputMode="decimal"
                          value={field?.coeff ?? ""}
                          placeholder="0.0159"
                          onChange={(event) =>
                            update(preview.Tree_ID, {
                              coeff: event.target.value,
                            })
                          }
                        />
                      </label>
                    ) : null}
                    <label className="field-measure">
                      <span className="field-label">測量日期</span>
                      <input
                        value={field?.measuredAt ?? ""}
                        placeholder={carbon.measuredAt}
                        onChange={(event) =>
                          update(preview.Tree_ID, {
                            measuredAt: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            ) : (
              <PlyViewer
                url={modelUrl}
                label={preview.Single_Tree_Ply ? "單木點雲" : "高斯濺射"}
              />
            )}
          </aside>
        </div>
      </div>

      {lightbox ? (
        <div
          className="path-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.title}
          onClick={(event) => {
            event.stopPropagation();
            setLightbox(null);
          }}
        >
          <div
            className="path-lightbox-card"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <strong>{lightbox.title}</strong>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setLightbox(null)}
              >
                關閉
              </button>
            </header>
            <img src={lightbox.src} alt={lightbox.title} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
