import type { LatLngBoundsExpression } from "leaflet";

/**
 * 可拖曳外圍：東西向再拓約 1.5 倍。
 * 搭配 maxBoundsViscosity=1，邊緣釘死，不會滑出露出底色。
 */
export const TAIWAN_BOUNDS: LatLngBoundsExpression = [
  [19.0, 114.8],
  [29.0, 127.9],
];

/** 初始畫面：台灣本島置中 */
export const MAIN_ISLAND_BOUNDS: LatLngBoundsExpression = [
  [21.5, 119.6],
  [25.6, 122.4],
];

export const TAIWAN_CENTER: [number, number] = [23.7, 121.0];

export const TAIWAN_DEFAULT_ZOOM = 7;

export const TAIWAN_MIN_ZOOM = 6;

/** 手動按「定位」／初次飛到使用者時的視野邊長（公尺） */
export const USER_VIEW_METERS = 8_000;
