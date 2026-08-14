import { hasReport } from "./inventory";

type LatLng = [number, number];

export type ScanBinding = {
  parkName: string;
  pathId: string;
  pathName: string;
  scanId: string;
  polyline: LatLng[];
};

/** 把掃描綁到 OSM 公園。遠端新資料只要加一筆，並放入 inventories/{scanId}.json。 */
export const SCAN_BINDINGS: ScanBinding[] = [
  {
    parkName: "臺中中央公園",
    pathId: "central-east",
    pathName: "水湳東側步道",
    scanId: "20260812070325",
    polyline: [
      [24.18793, 120.65331],
      [24.18781, 120.65332],
      [24.18762, 120.65333],
      [24.18744, 120.65334],
      [24.18725, 120.65333],
      [24.18705, 120.65332],
    ],
  },
];

const EMPTY_LAKE: ScanBinding = {
  parkName: "臺中中央公園",
  pathId: "central-lake",
  pathName: "湖濱環狀步道",
  scanId: "",
  polyline: [
    [24.18835, 120.6527],
    [24.18855, 120.6531],
    [24.1884, 120.65355],
    [24.18805, 120.6535],
    [24.18835, 120.6527],
  ],
};

export function bindingsForPark(parkName: string): ScanBinding[] {
  const bound = SCAN_BINDINGS.filter((item) => item.parkName === parkName);
  if (parkName === "臺中中央公園") {
    return [...bound, EMPTY_LAKE];
  }
  return bound;
}

export function bindingHasInventory(item: ScanBinding): boolean {
  return Boolean(item.scanId) && hasReport(item.scanId);
}
