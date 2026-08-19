import type { LatLng } from "../data/sites";
import type { TaiwanBasemapMode } from "./mapTiles";

const KEY = "arbor3d.mapView";
const VERSION = 2;

export type MapViewState = {
  v: number;
  center: [number, number];
  zoom: number;
  basemap: TaiwanBasemapMode;
  userPos: LatLng | null;
  /** 目前選中的公園／路徑，用來避免回到地圖時又飛一次 */
  focusKey: string;
  bootDone: boolean;
};

export function readMapView(): MapViewState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MapViewState;
    if (parsed?.v !== VERSION) return null;
    if (
      !parsed?.center ||
      !Number.isFinite(parsed.center[0]) ||
      !Number.isFinite(parsed.center[1]) ||
      !Number.isFinite(parsed.zoom)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeMapView(next: Omit<MapViewState, "v">): void {
  sessionStorage.setItem(KEY, JSON.stringify({ ...next, v: VERSION }));
}

export function clearMapView(): void {
  sessionStorage.removeItem(KEY);
}
