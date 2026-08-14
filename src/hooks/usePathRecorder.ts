import { useCallback, useEffect, useRef, useState } from "react";
import { haversineMeters, type TrackPoint } from "../lib/gpx";

/** 第一個點必須達到這個精度才開始記路線 */
export const START_ACCURACY_M = 10;
/** 開始之後允許稍微變差，避免樹蔭下一掉點就斷線 */
export const HOLD_ACCURACY_M = 15;
const MIN_STEP_M = 2.5;

export function usePathRecorder() {
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [error, setError] = useState("");
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lockedRef = useRef(false);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearWatch();
    setRecording(false);
    setLocked(false);
    lockedRef.current = false;
  }, [clearWatch]);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setError("這個瀏覽器不支援定位。請改用手機的 Chrome 或 Safari。");
      return;
    }

    setError("");
    setPoints([]);
    setLastAccuracy(null);
    setLocked(false);
    lockedRef.current = false;
    setRecording(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setLastAccuracy(accuracy);

        const limit = lockedRef.current ? HOLD_ACCURACY_M : START_ACCURACY_M;
        if (accuracy > limit) return;

        if (!lockedRef.current) {
          lockedRef.current = true;
          setLocked(true);
        }

        setPoints((prev) => {
          const last = prev[prev.length - 1];
          if (last) {
            const distance = haversineMeters(
              last.lat,
              last.lng,
              latitude,
              longitude,
            );
            if (distance < MIN_STEP_M) return prev;
          }
          return [
            ...prev,
            {
              lat: latitude,
              lng: longitude,
              accuracy,
              time: position.timestamp,
            },
          ];
        });
      },
      (geoError) => {
        setRecording(false);
        setLocked(false);
        lockedRef.current = false;
        clearWatch();
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError("定位被拒絕。請在瀏覽器設定允許位置權限後再試。");
        } else if (geoError.code === geoError.POSITION_UNAVAILABLE) {
          setError("目前拿不到位置。請到室外、打開手機 GPS 後再試。");
        } else {
          setError("定位逾時，請再按一次開始記錄。");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      },
    );
  }, [clearWatch]);

  const reset = useCallback(() => {
    stop();
    setPoints([]);
    setLastAccuracy(null);
    setError("");
  }, [stop]);

  useEffect(() => () => clearWatch(), [clearWatch]);

  return {
    recording,
    locked,
    points,
    error,
    lastAccuracy,
    start,
    stop,
    reset,
  };
}
