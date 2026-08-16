import type { LatLng } from "../data/sites";

const KEY = "arbor3d.mapOverlays";

export type MapOverlay = {
  id: string;
  parkId: string;
  pathId: string | null;
  /** 顯示在地圖上的路段名稱（資料夾名或錄製名稱） */
  label: string;
  /** 盤點年度（匯入時選擇） */
  year?: number;
  polyline: LatLng[];
  source: "record" | "import";
  createdAt: string;
};

export function readOverlays(): MapOverlay[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MapOverlay[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeOverlays(list: MapOverlay[]): void {
  sessionStorage.setItem(KEY, JSON.stringify(list));
}

export function clearOverlays(): void {
  sessionStorage.removeItem(KEY);
}

export function upsertOverlay(next: MapOverlay): MapOverlay[] {
  const list = readOverlays().filter((item) => item.id !== next.id);
  list.unshift(next);
  writeOverlays(list);
  return list;
}

export function removeOverlay(id: string): MapOverlay[] {
  const list = readOverlays().filter((item) => item.id !== id);
  writeOverlays(list);
  return list;
}
