import L from "leaflet";

export type TaiwanBasemapMode = "street" | "photo";

const ATTR =
  '&copy; <a href="https://maps.nlsc.gov.tw/">內政部國土測繪中心</a>';

/** 通用電子地圖（繁中街道） */
export const TW_STREET_URL =
  "https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}";

/** 正射影像（空拍） */
export const TW_PHOTO_URL =
  "https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}";

/** 缺圖時填色，避免露出灰／米色大塊（1×1 PNG） */
const FILL_STREET =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4ce0QAATKAmEOTEzgAAAAAElFTkSuQmCC";
const FILL_OCEAN =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPgcg0AAAD8AKBeu5J/AAAAAElFTkSuQmCC";

const TILE_OPTS = {
  maxZoom: 19,
  // 多預載周圍圖磚，平移／縮放較不易露底
  keepBuffer: 12,
  updateWhenIdle: false,
  updateWhenZooming: true,
  updateInterval: 50,
  attribution: ATTR,
} as const;

export function createTaiwanBasemaps() {
  // 不要設 tileLayer.bounds：邊界附近會故意不請求圖磚，留下大塊空白（爆版感）
  const street = L.tileLayer(TW_STREET_URL, {
    ...TILE_OPTS,
    errorTileUrl: FILL_STREET,
  });
  const photo = L.tileLayer(TW_PHOTO_URL, {
    ...TILE_OPTS,
    errorTileUrl: FILL_OCEAN,
  });
  return { street, photo };
}

/** 預設加街道圖；回傳切換函式 */
export function addTaiwanBasemap(
  map: L.Map,
  _bounds?: L.LatLngBoundsExpression,
  initial: TaiwanBasemapMode = "street",
) {
  const layers = createTaiwanBasemaps();
  const active = initial === "photo" ? layers.photo : layers.street;
  active.addTo(map);

  let removeTimer = 0;
  const setMode = (mode: TaiwanBasemapMode) => {
    const next = mode === "photo" ? layers.photo : layers.street;
    const prev = mode === "photo" ? layers.street : layers.photo;
    window.clearTimeout(removeTimer);
    if (!map.hasLayer(next)) next.addTo(map);
    next.bringToFront();
    // 新圖載入後再拆舊圖，減少切換時空洞
    const finish = () => {
      if (map.hasLayer(prev) && map.hasLayer(next)) map.removeLayer(prev);
    };
    next.once("load", finish);
    removeTimer = window.setTimeout(finish, 600);
    map.invalidateSize({ animate: false });
  };

  return { ...layers, setMode };
}

/** 滾輪／+/- 按鈕縮放都以游標下的點為中心 */
export function enableCursorCenteredZoom(map: L.Map) {
  let lastLatLng: L.LatLng | null = null;
  map.on("mousemove", (e: L.LeafletMouseEvent) => {
    lastLatLng = e.latlng;
  });

  map.options.scrollWheelZoom = true;

  const zoomAroundCursor = (delta: number) => {
    const target = lastLatLng ?? map.getCenter();
    const next = Math.max(
      map.getMinZoom(),
      Math.min(map.getMaxZoom(), map.getZoom() + delta),
    );
    if (next === map.getZoom()) return;
    map.setZoomAround(target, next);
  };

  const zoom = map.zoomControl;
  if (!zoom) return;

  const container = zoom.getContainer();
  if (!container) return;
  const inBtn = container.querySelector(".leaflet-control-zoom-in");
  const outBtn = container.querySelector(".leaflet-control-zoom-out");

  const bind = (el: Element | null, delta: number) => {
    if (!el) return;
    el.addEventListener(
      "click",
      (e) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        zoomAroundCursor(delta);
      },
      true,
    );
  };
  bind(inBtn, 1);
  bind(outBtn, -1);
}
