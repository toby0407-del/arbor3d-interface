import { useMemo, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { ColorLegend } from "../components/ColorLegend";
import { OsmSiteMap } from "../components/OsmSiteMap";
import {
  SITE_COUNTS,
  findPark,
  findPath,
  formatDistance,
  searchSites,
  siteHasInventory,
  type LatLng,
  type SiteKind,
} from "../data/sites";
import { getReport } from "../data/inventory";
import { usePathRecorder, START_ACCURACY_M } from "../hooks/usePathRecorder";
import { downloadGpx, haversineMeters, toLatLngs } from "../lib/gpx";
import {
  readOverlays,
  removeOverlay,
  upsertOverlay,
  type MapOverlay,
} from "../lib/mapOverlays";
import { formatDbh } from "../lib/format";
import { scanAssetUrl } from "../lib/scanMedia";
import { lightShort, trafficLight } from "../lib/status";
import type { Session } from "../lib/session";
import type { TreeRecord } from "../types";
import { PathImportDialog } from "./PathImportDialog";

type Props = {
  session: Session;
  onLogout: () => void;
};

type KindFilter = "all" | SiteKind;

export function SitePickerPage({ session, onLogout }: Props) {
  const [parkId, setParkId] = useState<string | null>(null);
  const [pathId, setPathId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [showPathDb, setShowPathDb] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [previewTreeId, setPreviewTreeId] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<MapOverlay[]>(() => readOverlays());
  const recorder = usePathRecorder();

  const filtered = useMemo(() => {
    const rows = searchSites(query, kind);
    if (query.trim()) return rows;
    return [...rows].sort((a, b) => {
      const ia = siteHasInventory(a) ? 0 : 1;
      const ib = siteHasInventory(b) ? 0 : 1;
      if (ia !== ib) return ia - ib;
      if (!userPos) return 0;
      const da = haversineMeters(userPos[0], userPos[1], a.center[0], a.center[1]);
      const db = haversineMeters(userPos[0], userPos[1], b.center[0], b.center[1]);
      return da - db;
    });
  }, [query, kind, userPos]);

  const park = parkId ? findPark(parkId) : undefined;
  const path = parkId && pathId ? findPath(parkId, pathId) : undefined;
  const pathReport =
    path?.hasInventory && path.scanId ? getReport(path.scanId) : undefined;
  const liveTrack = useMemo(() => toLatLngs(recorder.points), [recorder.points]);

  const pickPark = (id: string) => {
    if (recorder.recording) {
      setNotice("請先停止記錄，再換地點。");
      return;
    }
    setParkId(id);
    setPathId(null);
    setShowPathDb(false);
    setShowImport(false);
    setPreviewTreeId(null);
    setNotice("");
  };

  const pickPath = (nextParkId: string, nextPathId: string) => {
    if (recorder.recording) {
      setNotice("請先停止記錄，再選路徑。");
      return;
    }
    setParkId(nextParkId);
    setPathId(nextPathId);
    const found = findPath(nextParkId, nextPathId);
    if (!found) return;
    setNotice("");
    setShowPathDb(false);
    setShowImport(true);
    if (found.hasInventory && found.scanId) {
      const report = getReport(found.scanId);
      setPreviewTreeId(report?.trees[0]?.Tree_ID ?? null);
    } else {
      setPreviewTreeId(null);
    }
  };

  const stopAndMaybeSave = () => {
    const points = [...recorder.points];
    recorder.stop();
    if (points.length < 2) {
      setNotice("點數不足，未保存。");
      return;
    }
    const wantSave = window.confirm("要保存這次錄製並顯示在地圖上嗎？");
    if (!wantSave) {
      recorder.reset();
      setNotice("已停止，未保存。");
      return;
    }
    const stamp = new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const suggested = park
      ? `${park.name} 現場錄製 ${stamp}`
      : `現場錄製 ${stamp}`;
    const label =
      window.prompt("這段路叫什麼？（會顯示在地圖上）", suggested)?.trim() ||
      suggested;
    const polyline = toLatLngs(points);
    const overlay: MapOverlay = {
      id: `rec-${Date.now().toString(36)}`,
      parkId: parkId ?? "",
      pathId,
      label,
      polyline,
      source: "record",
      createdAt: new Date().toISOString(),
    };
    setOverlays(upsertOverlay(overlay));
    recorder.reset();
    setNotice(`已保存「${label}」並畫在地圖上。`);
  };

  const onImported = (info: { label: string; scanId: string; year: number }) => {
    if (!parkId || !pathId || !path) return;
    const recorded = overlays.find(
      (item) =>
        item.parkId === parkId &&
        item.pathId === pathId &&
        item.source === "record",
    );
    const polyline =
      recorded?.polyline ??
      (path.polyline.length >= 2 ? path.polyline : []);
    if (polyline.length < 2) {
      setNotice(
        `已匯入 ${info.year} 年「${info.label}」。此路徑尚無座標，請先錄製並保存路線，才會畫在地圖上。`,
      );
      return;
    }
    const overlay: MapOverlay = {
      id: `imp-${info.year}-${parkId}-${pathId}-${info.scanId}`,
      parkId,
      pathId,
      label: info.label,
      year: info.year,
      polyline,
      source: "import",
      createdAt: new Date().toISOString(),
    };
    setOverlays(upsertOverlay(overlay));
    setNotice(`已標記 ${info.year} 年路段「${info.label}」。`);
  };

  return (
    <div className="site-picker">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <BrandMark size={28} />
          </span>
          <div>
            <div className="brand-name">Arbor3D 後台</div>
            <div className="brand-sub">
              {session.workId} · {session.name}
            </div>
          </div>
        </div>
        <p className="picker-hint">
          公園 {SITE_COUNTS.parks} · 學校 {SITE_COUNTS.schools} · 點路徑即可匯入
        </p>
        <button type="button" className="ghost-btn" onClick={onLogout}>
          登出
        </button>
      </header>

      <div className="picker-body">
        <aside className="picker-side">
          <h1>選拍攝地點</h1>

          <label className="search-field">
            搜尋
            <input
              type="search"
              value={query}
              placeholder="縣市＋名稱可連打，例如：台中惠來、逢甲"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="kind-tabs" role="tablist" aria-label="地點類型">
            {(
              [
                ["all", `全部 ${SITE_COUNTS.total}`],
                ["park", `公園 ${SITE_COUNTS.parks}`],
                ["school", `學校 ${SITE_COUNTS.schools}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={kind === id}
                className={`kind-tab ${kind === id ? "is-active" : ""}`}
                onClick={() => setKind(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="search-meta">{filtered.length} 筆</p>

          <h2>地點</h2>
          <ul className="picker-list is-scroll">
            {filtered.slice(0, 200).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`picker-item ${parkId === item.id ? "is-active" : ""}`}
                  onClick={() => pickPark(item.id)}
                >
                  <strong>
                    <span className={`kind-badge is-${item.kind}`}>
                      {item.kind === "school" ? "學校" : "公園"}
                    </span>
                    {item.name}
                    {siteHasInventory(item) ? (
                      <span className="ready-badge">已盤點</span>
                    ) : null}
                  </strong>
                  <span>
                    {item.district}
                    {userPos
                      ? ` · ${formatDistance(
                          haversineMeters(
                            userPos[0],
                            userPos[1],
                            item.center[0],
                            item.center[1],
                          ),
                        )}`
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {filtered.length > 200 ? (
            <p className="empty">僅顯示前 200 筆</p>
          ) : null}
          {filtered.length === 0 ? (
            <p className="empty">沒有符合的地點</p>
          ) : null}

          {park ? (
            <>
              <h2>路徑（點選＝匯入）</h2>
              <ul className="picker-list">
                {park.paths.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`picker-item ${pathId === item.id ? "is-active" : ""}`}
                      onClick={() => pickPath(park.id, item.id)}
                    >
                      <strong>{item.name}</strong>
                      <span>
                        {item.hasInventory
                          ? `掃描 ${item.scanId} · 點此匯入`
                          : "點此匯入資料"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <section className="record-panel">
            <h2>錄製路徑</h2>
            <p className="record-help">
              室外定位，精度 ≤ {START_ACCURACY_M} m 才開始記點。停止時可選擇保存到地圖。
            </p>
            <div className="record-actions">
              {recorder.recording ? (
                <button
                  type="button"
                  className="danger-btn"
                  onClick={stopAndMaybeSave}
                >
                  停止
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-btn"
                  style={{ marginTop: 0 }}
                  onClick={() => {
                    if (!parkId) {
                      setNotice("請先選地點。");
                      return;
                    }
                    setNotice("");
                    recorder.start();
                  }}
                >
                  開始記錄
                </button>
              )}
              <button
                type="button"
                className="ghost-btn"
                disabled={recorder.points.length < 2}
                onClick={() =>
                  downloadGpx(
                    recorder.points,
                    park ? `${park.name} 現場錄製` : "Arbor3D 現場錄製",
                  )
                }
              >
                下載 GPX
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={recorder.recording || recorder.points.length === 0}
                onClick={() => {
                  recorder.reset();
                }}
              >
                清除
              </button>
            </div>
            <p className="record-status">
              {recorder.recording
                ? recorder.locked
                  ? "記錄中"
                  : `等待 ≤ ${START_ACCURACY_M} m`
                : "未記錄"}
              {" · "}
              {recorder.points.length} 點
              {recorder.lastAccuracy != null
                ? ` · ${Math.round(recorder.lastAccuracy)} m`
                : ""}
            </p>
            {recorder.error ? <p className="login-error">{recorder.error}</p> : null}
          </section>

          {overlays.length > 0 ? (
            <section className="overlay-list">
              <h2>地圖上路段</h2>
              <ul className="picker-list">
                {overlays.map((item) => (
                  <li key={item.id}>
                    <div className="overlay-row">
                      <div>
                        <strong>{item.label}</strong>
                        <span>
                          {item.year != null ? `${item.year} 年 · ` : ""}
                          {item.source === "import" ? "匯入" : "錄製"} ·{" "}
                          {item.polyline.length} 點
                        </span>
                      </div>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => setOverlays(removeOverlay(item.id))}
                      >
                        移除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {notice ? <p className="login-error">{notice}</p> : null}

          <ColorLegend compact />
        </aside>

        <OsmSiteMap
          sites={filtered}
          selectedSite={park}
          selectedPathId={pathId}
          liveTrack={liveTrack}
          recording={recorder.recording}
          overlays={overlays}
          onPickPark={pickPark}
          onPickPath={pickPath}
          onUserPosition={setUserPos}
        />
      </div>

      {showImport && park && path ? (
        <PathImportDialog
          parkName={park.name}
          pathName={path.name}
          hasInventory={Boolean(path.hasInventory && pathReport)}
          onClose={() => setShowImport(false)}
          onImported={onImported}
          onOpenInventory={() => {
            setShowImport(false);
            setShowPathDb(true);
          }}
        />
      ) : null}

      {showPathDb && park && path && pathReport ? (
        <PathInventoryDialog
          parkName={park.name}
          pathName={path.name}
          scanId={pathReport.scan_id}
          trees={pathReport.trees}
          previewTreeId={previewTreeId}
          onPreviewTree={setPreviewTreeId}
          onClose={() => setShowPathDb(false)}
        />
      ) : null}
    </div>
  );
}

function PathInventoryDialog({
  parkName,
  pathName,
  scanId,
  trees,
  previewTreeId,
  onPreviewTree,
  onClose,
}: {
  parkName: string;
  pathName: string;
  scanId: string;
  trees: TreeRecord[];
  previewTreeId: string | null;
  onPreviewTree: (treeId: string) => void;
  onClose: () => void;
}) {
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(
    null,
  );
  const preview =
    trees.find((tree) => tree.Tree_ID === previewTreeId) ?? trees[0] ?? null;
  const pathMapUrl = `/scans/${scanId}/maps/tree_id_map_dbh.png`;
  const maskUrl = preview ? scanAssetUrl(scanId, preview.Mask_Path) : null;
  const photoUrl = preview ? scanAssetUrl(scanId, preview.Best_Photo) : null;

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
              掃描 {scanId} · {trees.length} 棵 · 點樹號可看 Segmentation · 點圖可放大
            </p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>
            關閉
          </button>
        </header>

        <div className="path-db-body">
          <aside className="path-db-map">
            <h3>路徑圖</h3>
            <button
              type="button"
              className="path-db-thumb"
              onClick={() =>
                setLightbox({ src: pathMapUrl, title: `${pathName} · 路徑圖` })
              }
            >
              <img src={pathMapUrl} alt={`${pathName} 路徑與樹位`} />
              <span>點擊放大</span>
            </button>
            <p>樹上編號對應中間表樹號</p>
          </aside>

          <div className="path-db-table-wrap">
            <table className="path-db-table">
              <thead>
                <tr>
                  <th>樹號</th>
                  <th>胸徑</th>
                  <th>狀態</th>
                  <th>備註</th>
                </tr>
              </thead>
              <tbody>
                {trees.map((tree) => {
                  const light = trafficLight(tree.DBH_note);
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
                      <td>
                        <span className={`path-db-pill is-${light}`}>
                          {lightShort(light)}
                        </span>
                      </td>
                      <td>{tree.DBH_note || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <aside className="path-db-preview">
            <h3>{preview ? preview.Tree_ID : "樹"} · Segmentation</h3>
            {maskUrl ? (
              <button
                type="button"
                className="path-db-thumb"
                onClick={() =>
                  setLightbox({
                    src: maskUrl,
                    title: `${preview?.Tree_ID} · Segmentation`,
                  })
                }
              >
                <img src={maskUrl} alt={`${preview?.Tree_ID} segmentation`} />
                <span>點擊放大</span>
              </button>
            ) : (
              <div className="path-db-empty">尚無 Segmentation 圖</div>
            )}
            {photoUrl ? (
              <>
                <h3>原圖</h3>
                <button
                  type="button"
                  className="path-db-thumb"
                  onClick={() =>
                    setLightbox({
                      src: photoUrl,
                      title: `${preview?.Tree_ID} · 原圖`,
                    })
                  }
                >
                  <img src={photoUrl} alt={`${preview?.Tree_ID} 照片`} />
                  <span>點擊放大</span>
                </button>
              </>
            ) : null}
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
