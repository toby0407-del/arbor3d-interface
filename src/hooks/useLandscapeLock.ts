import { useEffect } from "react";

async function tryLockLandscape() {
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: OrientationLockType) => Promise<void>;
  };
  if (!orientation?.lock) return;
  try {
    await orientation.lock("landscape");
  } catch {
    /* iOS Safari 多數情況不允許，改靠 manifest + 直向提示 */
  }
}

/** 盡力鎖橫向；不支援時由 LandscapeGate 提示使用者轉裝置。 */
export function useLandscapeLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    void tryLockLandscape();

    const onFirstTap = () => {
      void tryLockLandscape();
    };
    document.addEventListener("pointerdown", onFirstTap, { once: true });

    const onVisible = () => {
      if (document.visibilityState === "visible") void tryLockLandscape();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("pointerdown", onFirstTap);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}
