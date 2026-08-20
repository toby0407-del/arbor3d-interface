import { useEffect, useState, type ReactNode } from "react";
import { useLandscapeLock } from "../hooks/useLandscapeLock";

function isPortraitViewport() {
  return window.matchMedia("(orientation: portrait)").matches;
}

/** 平板／手機直向時擋住畫面，要求橫向使用。 */
function shouldBlockPortrait() {
  return (
    isPortraitViewport() &&
    window.matchMedia("(max-width: 1180px), (max-height: 520px)").matches
  );
}

type Props = {
  children: ReactNode;
};

export function LandscapeGate({ children }: Props) {
  useLandscapeLock();
  const [blocked, setBlocked] = useState(() => shouldBlockPortrait());

  useEffect(() => {
    const portraitMq = window.matchMedia("(orientation: portrait)");
    const sizeMq = window.matchMedia("(max-width: 1180px), (max-height: 520px)");

    const update = () => setBlocked(shouldBlockPortrait());
    portraitMq.addEventListener("change", update);
    sizeMq.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      portraitMq.removeEventListener("change", update);
      sizeMq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <>
      {children}
      {blocked ? (
        <div className="landscape-gate" role="dialog" aria-modal="true" aria-label="請轉為橫向">
          <div className="landscape-gate-card">
            <div className="landscape-gate-icon" aria-hidden="true">
              ↻
            </div>
            <strong>請將裝置轉為橫向</strong>
            <p>此介面固定橫式使用，直向無法操作。</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
