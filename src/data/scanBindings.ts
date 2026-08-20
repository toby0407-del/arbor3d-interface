import { hasReport } from "./inventory";

type LatLng = [number, number];

export type ScanBinding = {
  parkName: string;
  pathId: string;
  pathName: string;
  scanId: string;
  polyline: LatLng[];
};

/**
 * 把掃描綁到 OSM 地點（公園或學校）。
 * parkName 必須與 taiwan_sites.json 的 name 完全相同。
 */
export const SCAN_BINDINGS: ScanBinding[] = [
  {
    parkName: "逢甲大學",
    pathId: "fengchia-campus-20260818",
    pathName: "校園掃描路徑（8/18）",
    scanId: "20260818092855",
    // 學思樓／育成中心南側走廊（紅線）：兩排建物中間空地，西→東，不到水池
    polyline: [
      [24.18122, 120.64674],
      [24.18122, 120.64684],
      [24.18122, 120.64694],
      [24.18122, 120.64704],
      [24.18122, 120.64714],
    ],
  },
];

export function bindingsForPark(parkName: string): ScanBinding[] {
  return SCAN_BINDINGS.filter((item) => item.parkName === parkName);
}

export function bindingHasInventory(item: ScanBinding): boolean {
  return Boolean(item.scanId) && hasReport(item.scanId);
}
