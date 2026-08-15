import { useMemo, useState } from "react";
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
import { usePathRecorder, START_ACCURACY_M } from "../hooks/usePathRecorder";
import { downloadGpx, haversineMeters, toLatLngs } from "../lib/gpx";
import type { Session } from "../lib/session";

type Props = {
  session: Session;
  onLogout: () => void;
  onEnterPath: (
    parkId: string,
    pathId: string,
    recordedPolyline?: LatLng[],
  ) => void;
};

type KindFilter = "all" | SiteKind;

export function SitePickerPage({ session, onLogout, onEnterPath }: Props) {
  const [parkId, setParkId] = useState<string | null>(null);
  const [pathId, setPathId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [useRecorded, setUseRecorded] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const recorder = usePathRecorder();

  const filtered = useMemo(() => {
    const rows = searchSites(query, kind);
    // 有搜尋字時保留相關度排序；空搜尋才依盤點／距離排
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
  const liveTrack = useMemo(() => toLatLngs(recorder.points), [recorder.points]);
  const hasRecordedTrack = liveTrack.length >= 2 && !recorder.recording;

  const pickPark = (id: string) => {
    if (recorder.recording) {
      setNotice("請先停止記錄，再換地點。");
      return;
    }
    setParkId(id);
    setPathId(null);
    setNotice("");
    setUseRecorded(false);
  };

  const pickPath = (nextParkId: string, nextPathId: string) => {
    setParkId(nextParkId);
    setPathId(nextPathId);
    const found = findPath(nextParkId, nextPathId);
    if (!found) return;
    if (!found.hasInventory) {
      setNotice(found.note);
      return;
    }
    setNotice("");
  };

  const enter = () => {
    if (!parkId || !pathId || !path) return;
    if (!path.hasInventory) {
      setNotice(path.note);
      return;
    }
    onEnterPath(
      parkId,
      pathId,
      useRecorded && hasRecordedTrack ? liveTrack : undefined,
    );
  };

  return (
    <div className="site-picker">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="28" height="28">
              <circle cx="16" cy="16" r="15" fill="#2f4635" />
              <path
                d="M16 7.5c-3.2 3.2-5.4 6.4-5.4 9.4 0 3 2.4 5.1 5.4 5.1s5.4-2.1 5.4-5.1c0-3-2.2-6.2-5.4-9.4Z"
                fill="#dcead9"
              />
              <rect x="14.6" y="20.2" width="2.8" height="5.2" rx="1" fill="#efe8d8" />
            </svg>
          </span>
          <div>
            <div className="brand-name">Arbor3D 後台</div>
            <div className="brand-sub">
              {session.workId} · {session.name}
            </div>
          </div>
        </div>
        <p className="picker-hint">
          公園 {SITE_COUNTS.parks} · 學校 {SITE_COUNTS.schools}
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
              <h2>路徑</h2>
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
                          ? `掃描 ${item.scanId}`
                          : "尚無盤點"}
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
              室外定位，精度 ≤ {START_ACCURACY_M} m 才開始記點。
            </p>
            <div className="record-actions">
              {recorder.recording ? (
                <button type="button" className="danger-btn" onClick={recorder.stop}>
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
                    setUseRecorded(false);
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
                  setUseRecorded(false);
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
            {hasRecordedTrack ? (
              <label className="record-check">
                <input
                  type="checkbox"
                  checked={useRecorded}
                  onChange={(event) => setUseRecorded(event.target.checked)}
                />
                用錄製路線進入盤點
              </label>
            ) : null}
            {recorder.error ? <p className="login-error">{recorder.error}</p> : null}
          </section>

          {notice ? <p className="login-error">{notice}</p> : null}

          {park && path && !path.hasInventory ? (
            <p className="empty">此路徑尚無盤點資料，可先錄 GPX。</p>
          ) : null}

          <button
            type="button"
            className="primary-btn"
            disabled={!path?.hasInventory || recorder.recording}
            onClick={enter}
          >
            {path && !path.hasInventory ? "尚無盤點資料" : "進入盤點"}
          </button>

          <ColorLegend compact />
        </aside>

        <OsmSiteMap
          sites={filtered}
          selectedSite={park}
          selectedPathId={pathId}
          liveTrack={liveTrack}
          recording={recorder.recording}
          onPickPark={pickPark}
          onPickPath={pickPath}
          onUserPosition={setUserPos}
        />
      </div>
    </div>
  );
}
