export type LatLng = [number, number];

export type ScanPath = {
  id: string;
  name: string;
  scanId: string | null;
  hasInventory: boolean;
  note: string;
  polyline: LatLng[];
};

export type ParkSite = {
  id: string;
  name: string;
  district: string;
  center: LatLng;
  /** 相對座標原點，用來把 Local_XYZ_m 放到地圖上 */
  origin: LatLng;
  paths: ScanPath[];
};

export const PARKS: ParkSite[] = [
  {
    id: "central",
    name: "臺中中央公園",
    district: "西屯區 · 水湳",
    center: [24.18799, 120.65327],
    origin: [24.18799, 120.65327],
    paths: [
      {
        id: "central-east",
        name: "水湳東側步道",
        scanId: "20260812070325",
        hasInventory: true,
        note: "示範掃描，樹位由相對座標放到這條路徑上。",
        polyline: [
          [24.18793, 120.65331],
          [24.18781, 120.65332],
          [24.18762, 120.65333],
          [24.18744, 120.65334],
          [24.18725, 120.65333],
          [24.18705, 120.65332],
        ],
      },
      {
        id: "central-lake",
        name: "湖濱環狀步道",
        scanId: null,
        hasInventory: false,
        note: "尚無盤點 JSON，之後由遠端機器放入實際資料。",
        polyline: [
          [24.18835, 120.6527],
          [24.18855, 120.6531],
          [24.1884, 120.65355],
          [24.18805, 120.6535],
          [24.18835, 120.6527],
        ],
      },
    ],
  },
  {
    id: "huilai",
    name: "惠來公園",
    district: "西屯區",
    center: [24.15518, 120.63954],
    origin: [24.15518, 120.63954],
    paths: [
      {
        id: "huilai-main",
        name: "主園道掃描線",
        scanId: null,
        hasInventory: false,
        note: "尚無盤點 JSON，之後由遠端機器放入實際資料。",
        polyline: [
          [24.1554, 120.6392],
          [24.1553, 120.6397],
          [24.15495, 120.63985],
          [24.1548, 120.6394],
        ],
      },
    ],
  },
  {
    id: "wenxin",
    name: "文心森林公園（公七）",
    district: "南屯區",
    center: [24.14507, 120.64508],
    origin: [24.14507, 120.64508],
    paths: [
      {
        id: "wenxin-loop",
        name: "圓滿劇場外環",
        scanId: null,
        hasInventory: false,
        note: "尚無盤點 JSON，之後由遠端機器放入實際資料。",
        polyline: [
          [24.1454, 120.6447],
          [24.14535, 120.6454],
          [24.1448, 120.64545],
          [24.14475, 120.64475],
          [24.1454, 120.6447],
        ],
      },
    ],
  },
  {
    id: "fengchia",
    name: "逢甲大學校園",
    district: "西屯區",
    center: [24.1794, 120.6467],
    origin: [24.1794, 120.6467],
    paths: [
      {
        id: "fengchia-road",
        name: "校門口行道樹",
        scanId: null,
        hasInventory: false,
        note: "尚無盤點 JSON，之後由遠端機器放入實際資料。",
        polyline: [
          [24.1791, 120.6462],
          [24.1793, 120.6468],
          [24.1797, 120.6471],
        ],
      },
    ],
  },
];

export function findPark(parkId: string): ParkSite | undefined {
  return PARKS.find((park) => park.id === parkId);
}

export function findPath(parkId: string, pathId: string): ScanPath | undefined {
  return findPark(parkId)?.paths.find((path) => path.id === pathId);
}
