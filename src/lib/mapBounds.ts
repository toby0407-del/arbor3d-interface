import type { LatLngBoundsExpression } from "leaflet";

/** 台灣本島 + 澎湖／金門／馬祖（不含全世界，減少圖磚量） */
export const TAIWAN_BOUNDS: LatLngBoundsExpression = [
  [21.7, 118.0], // 西南：屏東外海～金門西側
  [26.5, 122.3], // 東北：馬祖北側～宜蘭外海
];

/** 整塊台灣可見時的最小縮放，避免拉太遠載入海外圖磚 */
export const TAIWAN_MIN_ZOOM = 7;

/** 定位成功後，以使用者為中心顯示約 100 公里範圍（邊長） */
export const USER_VIEW_METERS = 100_000;
