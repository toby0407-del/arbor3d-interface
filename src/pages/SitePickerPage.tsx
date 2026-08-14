import { useState } from "react";
import { ColorLegend } from "../components/ColorLegend";
import { OsmSiteMap } from "../components/OsmSiteMap";
import { PARKS, findPark, findPath } from "../data/sites";
import type { Session } from "../lib/session";

type Props = {
  session: Session;
  onLogout: () => void;
  onEnterPath: (parkId: string, pathId: string) => void;
};

export function SitePickerPage({ session, onLogout, onEnterPath }: Props) {
  const [parkId, setParkId] = useState<string | null>(null);
  const [pathId, setPathId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const park = parkId ? findPark(parkId) : undefined;
  const path = parkId && pathId ? findPath(parkId, pathId) : undefined;

  const pickPark = (id: string) => {
    setParkId(id);
    setPathId(null);
    setNotice("");
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
    onEnterPath(parkId, pathId);
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
        <p className="picker-hint">先點公園，再點路徑。有資料的路徑是實線，尚無資料是虛線。</p>
        <button type="button" className="ghost-btn" onClick={onLogout}>
          登出
        </button>
      </header>

      <div className="picker-body">
        <aside className="picker-side">
          <h1>這次是在哪裡拍的？</h1>
          <p className="lede">地圖用 OpenStreetMap 開源圖資。點公園看掃描路徑，再進該路徑的樹木盤點。</p>

          <h2>公園</h2>
          <ul className="picker-list">
            {PARKS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`picker-item ${parkId === item.id ? "is-active" : ""}`}
                  onClick={() => pickPark(item.id)}
                >
                  <strong>{item.name}</strong>
                  <span>{item.district}</span>
                </button>
              </li>
            ))}
          </ul>

          {park ? (
            <>
              <h2>{park.name}的路徑</h2>
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
                          : "尚無盤點資料"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="empty">還沒選公園。</p>
          )}

          {notice ? <p className="login-error">{notice}</p> : null}

          <button
            type="button"
            className="primary-btn"
            disabled={!path?.hasInventory}
            onClick={enter}
          >
            進入這條路徑的盤點
          </button>

          <ColorLegend compact />
        </aside>

        <OsmSiteMap
          selectedParkId={parkId}
          selectedPathId={pathId}
          onPickPark={pickPark}
          onPickPath={pickPath}
        />
      </div>
    </div>
  );
}
