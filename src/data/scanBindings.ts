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
    pathId: "fengchia-campus",
    pathName: "校園掃描路徑",
    scanId: "20260812070325",
    polyline: [
      [24.17995, 120.64838],
      [24.17985, 120.6484],
      [24.1797, 120.64842],
      [24.17955, 120.64843],
      [24.1794, 120.64842],
      [24.17925, 120.6484],
    ],
  },
];

export function bindingsForPark(parkName: string): ScanBinding[] {
  return SCAN_BINDINGS.filter((item) => item.parkName === parkName);
}

export function bindingHasInventory(item: ScanBinding): boolean {
  return Boolean(item.scanId) && hasReport(item.scanId);
}
