import { useEffect, useMemo, useState } from "react";
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
  type ParkSite,
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
import { fetchInventories } from "../lib/importApi";
import { treesAlongPolyline } from "../lib/treePlacement";
import type { Session } from "../lib/session";
import type { ParkInventoryReport } from "../types";
import { PathImportDialog } from "./PathImportDialog";
import { PathInventoryDialog } from "./PathInventoryDialog";

type Props = {
  session: Session;
  onLogout: () => void;
};

type KindFilter = "all" | SiteKind;
type Notice = { tone: "ok" | "err"; text: string };

function withLiveInventory(
  site: ParkSite,
  binds: Record<string, string>,
  reports: Record<string, ParkInventoryReport>,
): ParkSite {
  return {
    ...site,
    paths: site.paths.map((path) => {
      const scan = binds[path.id] || path.scanId;
      const ready = Boolean(scan && (reports[scan] || getReport(scan)));
      return {
        ...path,
        scanId: ready ? scan : path.scanId,
        scanIds: ready && scan ? [scan] : path.scanIds,
        hasInventory: ready,
      };
    }),
  };
}

export function SitePickerPage({ session, onLogout }: Props) {
  const [parkId, setParkId] = useState<string | null>(null);
  const [pathId, setPathId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [showPathDb, setShowPathDb] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [previewTreeId, setPreviewTreeId] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<MapOverlay[]>(() => readOverlays());
  const [liveReports, setLiveReports] = useState<Record<string, ParkInventoryReport>>({});
  const [liveBinds, setLiveBinds] = useState<Record<string, string>>({});
  const recorder = usePathRecorder();

  useEffect(() => {
    void fetchInventories()
      .then((data) => {
        setLiveReports(data.reports);
        setLiveBinds(data.bindings);
      })
      .catch(() => {
        /* 本機尚未計算過 */
      });
  }, []);

  const filtered = useMemo(() => {
    const rows = searchSites(query, kind).map((site) =>
      withLiveInventory(site, liveBinds, liveReports),
    );
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
  }, [query, kind, userPos, liveBinds, liveReports]);

  const park = useMemo(() => {
    if (!parkId) return undefined;
    const found = findPark(parkId);
    if (!found) return undefined;
    return withLiveInventory(found, liveBinds, liveReports);
  }, [parkId, liveBinds, liveReports]);
  const path = park?.paths.find((item) => item.id === pathId);
  const boundScanId = pathId ? liveBinds[pathId] || path?.scanId || null : null;
  const pathReport = boundScanId
    ? liveReports[boundScanId] || getReport(boundScanId)
    : undefined;
  const pathReady = Boolean(pathReport);
  const liveTrack = useMemo(() => toLatLngs(recorder.points), [recorder.points]);
  const treeMarkers = useMemo(() => {
    if (!path?.polyline || !pathReport) return [];
    return treesAlongPolyline(path.polyline, pathReport.trees);
  }, [path, pathReport]);

  const pickPark = (id: string) => {
    if (recorder.recording) {
      setNotice({ tone: "err", text: "請先停止記錄，再換地點。" });
      return;
    }
    setParkId(id);
    setPathId(null);
    setShowPathDb(false);
    setShowImport(false);
    setPreviewTreeId(null);
    setNotice(null);
  };

  const pickPath = (nextParkId: string, nextPathId: string) => {
    if (recorder.recording) {
      setNotice({ tone: "err", text: "請先停止記錄，再選路徑。" });
      return;
    }
    setParkId(nextParkId);
    setPathId(nextPathId);
    const found = findPath(nextParkId, nextPathId);
    if (!found) return;
    setNotice(null);
    const scan = liveBinds[nextPathId] || found.scanId;
    const report = scan ? liveReports[scan] || getReport(scan) : undefined;
    if (report) {
      setPreviewTreeId(report.trees[0]?.Tree_ID ?? null);
      setShowPathDb(true);
      setShowImport(false);
    } else {
      setPreviewTreeId(null);
      setShowPathDb(false);
      setShowImport(true);
    }
  };

  const stopAndMaybeSave = () => {
    const points = [...recorder.points];
    recorder.stop();
    if (points.length < 2) {
      setNotice({ tone: "err", text: "點數不足，未保存。" });
      return;
    }
    const wantSave = window.confirm("要保存這次錄製並顯示在地圖上嗎？");
    if (!wantSave) {
      recorder.reset();
      setNotice({ tone: "ok", text: "已停止，未保存。" });
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
    setNotice({ tone: "ok", text: `已保存「${label}」並畫在地圖上。` });
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
      setNotice({
        tone: "ok",
        text: `已匯入 ${info.year} 年「${info.label}」。此路徑尚無座標，請先錄製並保存路線，才會畫在地圖上。`,
      });
    } else {
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
      setNotice({
        tone: "ok",
        text: `已上傳 ${info.year} 年「${info.label}」。請按「開始計算」產生樹身分。`,
      });
    }
  };

  const onComputed = (report: ParkInventoryReport) => {
    if (!pathId) return;
    setLiveReports((prev) => ({ ...prev, [report.scan_id]: report }));
    setLiveBinds((prev) => ({ ...prev, [pathId]: report.scan_id }));
    setPreviewTreeId(report.trees[0]?.Tree_ID ?? null);
    setShowImport(false);
    setShowPathDb(true);
    setNotice({
      tone: "ok",
      text: `已算出 ${report.num_trees} 棵樹身分。`,
    });
  };

  return (
    <div className="site-picker">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <BrandMark size={28} />
          </span>
          <div>
            <div className="brand-name">Arbor3D 樹木盤點</div>
            <div className="brand-sub">
              {session.workId} · {session.name} · {session.role}
            </div>
          </div>
        </div>
        <p className="picker-hint">
          公園 {SITE_COUNTS.parks} · 學校 {SITE_COUNTS.schools} · 已盤點路徑可直接查看成果
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
            {filtered.slice(0, 80).map((item) => (
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
          {filtered.length > 80 ? (
            <p className="empty">僅顯示前 80 筆，請用搜尋縮小範圍</p>
          ) : null}
          {filtered.length === 0 ? (
            <p className="empty">沒有符合的地點</p>
          ) : null}

          {park ? (
            <>
              <h2>路徑</h2>
              <ul className="picker-list">
                {park.paths.map((item) => {
                  const scan = liveBinds[item.id] || item.scanId;
                  const ready = Boolean(
                    scan && (liveReports[scan] || getReport(scan)),
                  );
                  return (
                  <li key={item.id}>
                    <div className={`path-row ${pathId === item.id ? "is-active" : ""}`}>
                      <button
                        type="button"
                        className="picker-item"
                        onClick={() => pickPath(park.id, item.id)}
                      >
                        <strong>
                          {item.name}
                          {ready ? (
                            <span className="ready-badge">已盤點</span>
                          ) : (
                            <span className="pending-badge">尚未匯入</span>
                          )}
                        </strong>
                        <span>
                          {ready
                            ? `掃描 ${scan} · 點此查看盤點`
                            : "尚無盤點 · 點此匯入"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          setParkId(park.id);
                          setPathId(item.id);
                          setShowPathDb(false);
                          setShowImport(true);
                        }}
                      >
                        匯入
                      </button>
                    </div>
                  </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          <details className="record-panel">
            <summary>
              錄製路徑
              <span>
                {recorder.recording
                  ? recorder.locked
                    ? "記錄中"
                    : "等待定位"
                  : "未記錄"}
                {" · "}
                {recorder.points.length} 點
              </span>
            </summary>
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
                      setNotice({ tone: "err", text: "請先選地點。" });
                      return;
                    }
                    setNotice(null);
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
            {recorder.error ? <p className="login-error">{recorder.error}</p> : null}
          </details>

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

          {notice ? (
            <p className={notice.tone === "ok" ? "picker-notice" : "login-error"}>
              {notice.text}
            </p>
          ) : null}

          <ColorLegend compact />
        </aside>

        <OsmSiteMap
          sites={filtered}
          selectedSite={park}
          selectedPathId={pathId}
          liveTrack={liveTrack}
          recording={recorder.recording}
          overlays={overlays}
          treeMarkers={treeMarkers}
          selectedTreeId={previewTreeId}
          onPickPark={pickPark}
          onPickPath={pickPath}
          onPickTree={(treeId) => {
            setPreviewTreeId(treeId);
            if (pathReport) {
              setShowImport(false);
              setShowPathDb(true);
            }
          }}
          onUserPosition={setUserPos}
        />
      </div>

      {showImport && park && path ? (
        <PathImportDialog
          parkName={park.name}
          pathName={path.name}
          pathId={path.id}
          hasInventory={pathReady}
          onClose={() => setShowImport(false)}
          onImported={onImported}
          onComputed={onComputed}
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
          report={pathReport}
          previewTreeId={previewTreeId}
          onPreviewTree={setPreviewTreeId}
          onClose={() => setShowPathDb(false)}
          onImport={() => {
            setShowPathDb(false);
            setShowImport(true);
          }}
        />
      ) : null}
    </div>
  );
}
