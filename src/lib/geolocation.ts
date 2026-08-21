/**
 * 快速可靠定位：
 * 1) 先用快取（幾乎瞬間，誤差須 ≤ 400 m）
 * 2) Wi‑Fi／網路（同樣須夠準）
 * 3) 不夠準才短試 GPS；仍不夠準就不採用，地圖留在原處
 */

/** 誤差超過這個距離就不把地圖移過去（擋掉縣市級 IP／Wi‑Fi 粗定位） */
export const MAX_ACCEPTABLE_ACCURACY_M = 400;
export const MAX_FLY_ACCURACY_M = 400;

export type GeoResult = {
  lat: number;
  lng: number;
  accuracy: number;
  highAccuracy: boolean;
};

export function isUsableAccuracy(accuracy: number): boolean {
  return Number.isFinite(accuracy) && accuracy <= MAX_ACCEPTABLE_ACCURACY_M;
}

export function isFlyableAccuracy(accuracy: number): boolean {
  return Number.isFinite(accuracy) && accuracy <= MAX_FLY_ACCURACY_M;
}

function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/**
 * IP 資料庫常把「台灣」標在埔里（地理中心）。
 * 精度普通時幾乎一定不是真實 GPS。
 */
const PULI_IP_FALLBACK: [number, number] = [23.973875, 120.967037];

export function looksLikeTaiwanIpFallback(
  lat: number,
  lng: number,
  accuracy: number,
): boolean {
  if (!Number.isFinite(accuracy) || accuracy <= 50) return false;
  return (
    haversineMeters(lat, lng, PULI_IP_FALLBACK[0], PULI_IP_FALLBACK[1]) < 20_000
  );
}

/** 丟掉 IP 粗定位，也避免已經在逢甲又被拉去幾十公里外。 */
export function shouldAcceptGeoFix(
  next: { lat: number; lng: number; accuracy: number },
  prev: { lat: number; lng: number; accuracy: number } | null,
): boolean {
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return false;
  if (!isUsableAccuracy(next.accuracy)) return false;
  if (looksLikeTaiwanIpFallback(next.lat, next.lng, next.accuracy)) return false;
  if (!prev) return true;
  const moved = haversineMeters(prev.lat, prev.lng, next.lat, next.lng);
  if (moved > 800 && next.accuracy > prev.accuracy) return false;
  if (moved > 1_500) return false;
  return true;
}

export type GeoProgress = (message: string) => void;

function unsupportedError(): GeolocationPositionError {
  return Object.assign(new Error("unsupported"), {
    code: 0,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  }) as GeolocationPositionError;
}

function deniedError(): GeolocationPositionError {
  return Object.assign(new Error("denied"), {
    code: 1,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  }) as GeolocationPositionError;
}

function timeoutError(): GeolocationPositionError {
  return Object.assign(new Error("timeout"), {
    code: 3,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  }) as GeolocationPositionError;
}

function toResult(pos: GeolocationPosition, highAccuracy: boolean): GeoResult {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    highAccuracy,
  };
}

function isValid(pos: GeolocationPosition): boolean {
  return (
    Number.isFinite(pos.coords.latitude) &&
    Number.isFinite(pos.coords.longitude)
  );
}

function isAccurate(pos: GeolocationPosition): boolean {
  return isValid(pos) && isUsableAccuracy(pos.coords.accuracy);
}

function readOnce(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(unsupportedError());
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function watchFirstFix(
  options: PositionOptions,
  overallMs: number,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(unsupportedError());
      return;
    }

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      navigator.geolocation.clearWatch(watchId);
      fn();
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!isAccurate(pos)) return;
        finish(() => resolve(pos));
      },
      (err) => finish(() => reject(err)),
      options,
    );

    const timer = window.setTimeout(() => {
      finish(() => reject(timeoutError()));
    }, overallMs);
  });
}

/** 多路並行，回傳第一個成功的；若有「拒絕權限」優先拋出。 */
async function firstSuccess(
  tasks: Array<() => Promise<GeolocationPosition>>,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let pending = tasks.length;
    let denied: unknown = null;
    let lastErr: unknown = null;
    let done = false;

    for (const task of tasks) {
      void task()
        .then((pos) => {
          if (done || !isValid(pos)) {
            pending -= 1;
            if (!done && pending === 0) reject(denied ?? lastErr ?? timeoutError());
            return;
          }
          done = true;
          resolve(pos);
        })
        .catch((err) => {
          const code = (err as GeolocationPositionError)?.code;
          if (code === 1) denied = err;
          lastErr = err;
          pending -= 1;
          if (!done && pending === 0) reject(denied ?? lastErr ?? timeoutError());
        });
    }
  });
}

export async function ensureGeolocationPermission(
  onProgress?: GeoProgress,
): Promise<"granted" | "prompt" | "denied" | "unknown"> {
  onProgress?.("請允許使用位置…");
  if (!navigator.geolocation) throw unsupportedError();

  try {
    const status = await navigator.permissions?.query?.({
      name: "geolocation" as PermissionName,
    });
    if (status?.state === "denied") throw deniedError();
    if (status?.state === "granted") return "granted";
    if (status?.state === "prompt") return "prompt";
  } catch (err) {
    if ((err as GeolocationPositionError)?.code === 1) throw err;
  }
  return "unknown";
}

/** 快速可靠：快取 → Wi‑Fi 並行 → 短 GPS（都必須夠準才採用） */
export async function getBestPosition(
  onProgress?: GeoProgress,
): Promise<GeoResult> {
  if (!navigator.geolocation) throw unsupportedError();
  await ensureGeolocationPermission(onProgress);

  let best: GeolocationPosition | null = null;
  let bestHigh = false;

  const take = (
    pos: GeolocationPosition,
    highAccuracy: boolean,
  ): GeoResult | null => {
    if (!isValid(pos)) return null;
    if (!best || pos.coords.accuracy < best.coords.accuracy) {
      best = pos;
      bestHigh = highAccuracy;
    }
    return isAccurate(pos) ? toResult(pos, highAccuracy) : null;
  };

  const requireAccurate = (
    task: () => Promise<GeolocationPosition>,
    highAccuracy: boolean,
  ) => async () => {
    const pos = await task();
    const hit = take(pos, highAccuracy);
    if (!hit) throw timeoutError();
    return pos;
  };

  // 1) 快取：通常 < 1 秒，但誤差太大就不用
  onProgress?.("快速定位中…");
  try {
    const cached = await readOnce({
      enableHighAccuracy: false,
      maximumAge: 300_000,
      timeout: 2_000,
    });
    const hit = take(cached, false);
    if (hit) return hit;
    const cachedBest = best as GeolocationPosition | null;
    if (cachedBest && isUsableAccuracy(cachedBest.coords.accuracy)) {
      return toResult(cachedBest, bestHigh);
    }
  } catch (err) {
    if ((err as GeolocationPositionError)?.code === 1) throw err;
  }

  // 2) Wi‑Fi／網路（夠準才用；否則立刻改試 GPS，不等粗定位耗完）
  onProgress?.("正在定位…");
  try {
    const coarse = await readOnce({
      enableHighAccuracy: false,
      maximumAge: 0,
      timeout: 8_000,
    });
    const hit = take(coarse, false);
    if (hit) return hit;
    const coarseBest = best as GeolocationPosition | null;
    if (coarseBest && isUsableAccuracy(coarseBest.coords.accuracy)) {
      return toResult(coarseBest, bestHigh);
    }
  } catch (err) {
    if ((err as GeolocationPositionError)?.code === 1) throw err;
  }

  // 3) 短試 GPS（室外補強）
  onProgress?.("改用精準定位…");
  try {
    const precise = await firstSuccess([
      requireAccurate(
        () =>
          readOnce({
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10_000,
          }),
        true,
      ),
      requireAccurate(
        () =>
          watchFirstFix(
            {
              enableHighAccuracy: true,
              maximumAge: 0,
              timeout: 10_000,
            },
            10_000,
          ),
        true,
      ),
    ]);
    const hit = take(precise, true);
    if (hit) return hit;
  } catch (err) {
    if ((err as GeolocationPositionError)?.code === 1) throw err;
  }

  const lastBest = best as GeolocationPosition | null;
  if (lastBest && isUsableAccuracy(lastBest.coords.accuracy)) {
    return toResult(lastBest, bestHigh);
  }
  throw timeoutError();
}

export function geoErrorMessage(code: number): string {
  if (code === 1) {
    return "定位被拒絕。請允許網站「位置」，並開啟系統定位服務。";
  }
  if (code === 2) {
    return "目前拿不到位置。請開 Wi‑Fi／定位後再按「快速定位」。";
  }
  if (code === 0) {
    return "瀏覽器不支援定位。請用 Chrome 或 Safari，開啟 http://127.0.0.1";
  }
  return "定位逾時。請再開 Wi‑Fi 後按「快速定位」。";
}
