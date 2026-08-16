import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { LatLng, ParkSite } from "../data/sites";
import { siteHasInventory } from "../data/sites";
import { MAIN_ISLAND_BOUNDS, TAIWAN_BOUNDS, TAIWAN_CENTER, TAIWAN_DEFAULT_ZOOM, TAIWAN_MIN_ZOOM, USER_VIEW_METERS } from "../lib/mapBounds";
import {
  addTaiwanBasemap,
  enableCursorCenteredZoom,
  type TaiwanBasemapMode,
} from "../lib/mapTiles";
import { geoErrorMessage, getBestPosition } from "../lib/geolocation";
import { readMapView, writeMapView } from "../lib/mapViewStore";
import type { MapOverlay } from "../lib/mapOverlays";

type Props = {
  sites: ParkSite[];
  selectedSite?: ParkSite | null;
  selectedPathId: string | null;
  liveTrack?: LatLng[];
  recording?: boolean;
  overlays?: MapOverlay[];
  onPickPark: (parkId: string) => void;
  onPickPath: (parkId: string, pathId: string) => void;
  onUserPosition?: (here: LatLng) => void;
};

function userPin() {
  return L.divIcon({
    className: "osm-pin",
    html: `<span class="osm-user-wrap"><span class="osm-user-pulse"></span><span class="osm-user-dot"></span></span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function selectedPin() {
  return L.divIcon({
    className: "osm-pin",
    html: `<span class="osm-selected-wrap"><span class="osm-selected-pulse"></span><span class="osm-selected-dot"></span></span>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

function focusBounds(site: ParkSite, pathId: string | null): L.LatLngBounds {
  const path = site.paths.find((item) => item.id === pathId);
  if (path && path.polyline.length >= 2) {
    return L.latLngBounds(path.polyline);
  }
  return L.latLng(site.center[0], site.center[1]).toBounds(350);
}

function inventoryPin() {
  return L.divIcon({
    className: "osm-pin",
    html: `<span class="osm-inventory-wrap"><span class="osm-inventory-dot"></span></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function applyTaiwanLock(map: L.Map) {
  // 防止 zoomend → setZoom → zoomend 無限迴圈（會出現 NaN LatLng 卡住）
  if ((map as L.Map & { __taiwanLocking?: boolean }).__taiwanLocking) return;
  const size = map.getSize();
  if (!size.x || !size.y) return;

  (map as L.Map & { __taiwanLocking?: boolean }).__taiwanLocking = true;
  try {
    map.setMaxBounds(TAIWAN_BOUNDS);
    map.options.maxBoundsViscosity = 1;

    const minZ = map.getBoundsZoom(L.latLngBounds(TAIWAN_BOUNDS[0], TAIWAN_BOUNDS[1]), true);
    // size 未就緒時 Leaflet 可能回傳 Infinity／NaN，setZoom 後會炸掉
    if (!Number.isFinite(minZ) || minZ > 14) {
      if (map.getMinZoom() !== TAIWAN_MIN_ZOOM) map.setMinZoom(TAIWAN_MIN_ZOOM);
      return;
    }

    const locked = Math.max(TAIWAN_MIN_ZOOM, Math.min(12, Math.ceil(minZ + 0.15)));
    if (map.getMinZoom() !== locked) map.setMinZoom(locked);

    const zoom = map.getZoom();
    if (Number.isFinite(zoom) && zoom < locked - 1e-6) {
      map.setZoom(locked, { animate: false });
    }

    const center = map.getCenter();
    const bounds = L.latLngBounds(TAIWAN_BOUNDS[0], TAIWAN_BOUNDS[1]);
    if (
      Number.isFinite(center.lat) &&
      Number.isFinite(center.lng) &&
      !bounds.contains(center)
    ) {
      map.panInsideBounds(bounds, { animate: false });
    }
  } finally {
    (map as L.Map & { __taiwanLocking?: boolean }).__taiwanLocking = false;
  }
}

const MAX_MARKERS = 250;

function pickSitesInView(
  map: L.Map,
  sites: ParkSite[],
  selectedSite: ParkSite | null,
): ParkSite[] {
  const bounds = map.getBounds().pad(0.08);
  const center = map.getCenter();
  const nearby = sites.filter(
    (site) =>
      site.id !== selectedSite?.id && bounds.contains(site.center),
  );
  nearby.sort((a, b) => {
    const ia = siteHasInventory(a) ? 0 : 1;
    const ib = siteHasInventory(b) ? 0 : 1;
    if (ia !== ib) return ia - ib;
    return map.distance(center, a.center) - map.distance(center, b.center);
  });
  const ready = nearby.filter(siteHasInventory);
  const rest = nearby.filter((site) => !siteHasInventory(site));
  const picked = [
    ...ready,
    ...rest.slice(0, Math.max(0, MAX_MARKERS - ready.length)),
  ];
  return selectedSite ? [selectedSite, ...picked] : picked;
}

export function OsmSiteMap({
  sites,
  selectedSite = null,
  selectedPathId,
  liveTrack = [],
  recording = false,
  overlays = [],
  onPickPark,
  onPickPath,
  onUserPosition,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const liveLayerRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const callbacks = useRef({ onPickPark, onPickPath, onUserPosition });
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const lastFocusKey = useRef<string>("");
  const watchIdRef = useRef<number | null>(null);
  const userPosRef = useRef<LatLng | null>(null);
  const followingRef = useRef(false);
  const programmaticMoveRef = useRef(false);
  const locateGenRef = useRef(0);
  const [locateNote, setLocateNote] = useState("進入後會先定位，再移到你附近");
  const [locating, setLocating] = useState(false);
  const [following, setFollowing] = useState(false);
  const [bootLocating, setBootLocating] = useState(() => !readMapView()?.bootDone);
  const [basemapMode, setBasemapMode] = useState<TaiwanBasemapMode>(
    () => readMapView()?.basemap ?? "street",
  );
  const basemapRef = useRef<ReturnType<typeof addTaiwanBasemap> | null>(null);
  const basemapModeRef = useRef(basemapMode);
  const sitesRef = useRef(sites);
  const selectedRef = useRef(selectedSite);
  const selectedPathRef = useRef(selectedPathId);
  const skipBootRef = useRef(Boolean(readMapView()?.bootDone));
  sitesRef.current = sites;
  selectedRef.current = selectedSite;
  selectedPathRef.current = selectedPathId;
  followingRef.current = following;
  basemapModeRef.current = basemapMode;
  callbacks.current = { onPickPark, onPickPath, onUserPosition };

  const persistView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return;
    const zoom = map.getZoom();
    if (!Number.isFinite(zoom)) return;
    writeMapView({
      center: [c.lat, c.lng],
      zoom,
      basemap: basemapModeRef.current,
      userPos: userPosRef.current,
      focusKey: lastFocusKey.current,
      bootDone: true,
    });
  }, []);

  const zoomToUser = useCallback((here: LatLng) => {
    const map = mapRef.current;
    if (!map) return;
    const taiwan = L.latLngBounds(TAIWAN_BOUNDS[0], TAIWAN_BOUNDS[1]);
    if (!taiwan.contains(here)) return;
    programmaticMoveRef.current = true;
    // 點「我的位置」icon → 放大
    const nextZoom = Math.max(map.getZoom(), 18);
    map.flyTo(here, nextZoom, { duration: 0.65 });
    window.setTimeout(() => {
      programmaticMoveRef.current = false;
    }, 850);
    setLocateNote("已放大到我的位置。");
  }, []);

  const drawUser = useCallback(
    (here: LatLng) => {
      const userLayer = userLayerRef.current;
      if (!userLayer) return;
      userPosRef.current = here;
      callbacks.current.onUserPosition?.(here);
      userLayer.clearLayers();
      L.circle(here, {
        radius: 25,
        color: "#1e90ff",
        weight: 2,
        fillColor: "#1e90ff",
        fillOpacity: 0.15,
      })
        .on("click", () => zoomToUser(here))
        .addTo(userLayer);
      L.marker(here, { icon: userPin(), zIndexOffset: 1000 })
        .bindTooltip("我的位置", {
          permanent: true,
          direction: "right",
          className: "osm-user-tip",
        })
        .on("click", () => zoomToUser(here))
        .addTo(userLayer);
    },
    [zoomToUser],
  );

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const flyToUser = useCallback((here: LatLng, animate = true) => {
    const map = mapRef.current;
    if (!map) return false;
    applyTaiwanLock(map);
    const taiwan = L.latLngBounds(TAIWAN_BOUNDS[0], TAIWAN_BOUNDS[1]);
    if (!taiwan.contains(here)) {
      setLocateNote("你的位置不在台灣／離島範圍內，地圖只顯示台灣地區。");
      return false;
    }
    const zoom = Math.min(
      16,
      Math.max(
        14,
        map.getBoundsZoom(
          L.latLng(here[0], here[1]).toBounds(USER_VIEW_METERS),
          false,
        ),
      ),
    );
    programmaticMoveRef.current = true;
    if (animate) {
      map.flyTo(here, zoom, { duration: 0.85 });
    } else {
      map.setView(here, zoom, { animate: false });
    }
    window.setTimeout(() => {
      programmaticMoveRef.current = false;
    }, animate ? 1000 : 80);
    return true;
  }, []);

  const panFollowUser = useCallback((here: LatLng) => {
    const map = mapRef.current;
    if (!map || !followingRef.current) return;
    const taiwan = L.latLngBounds(TAIWAN_BOUNDS[0], TAIWAN_BOUNDS[1]);
    if (!taiwan.contains(here)) return;
    programmaticMoveRef.current = true;
    map.panTo(here, { animate: true, duration: 0.35 });
    window.setTimeout(() => {
      programmaticMoveRef.current = false;
    }, 400);
  }, []);

  const startWatch = useCallback(() => {
    stopWatch();
    if (!navigator.geolocation) return;
    // 追蹤也走快速模式（Wi‑Fi），較不易在室內斷掉
    watchIdRef.current = navigator.geolocation.watchPosition(
      (next) => {
        const point: LatLng = [next.coords.latitude, next.coords.longitude];
        drawUser(point);
        if (followingRef.current) panFollowUser(point);
      },
      () => {
        /* keep last good fix */
      },
      {
        enableHighAccuracy: false,
        maximumAge: 8_000,
        timeout: 20_000,
      },
    );
  }, [drawUser, panFollowUser, stopWatch]);

  const stopFollowing = useCallback((note?: string) => {
    followingRef.current = false;
    setFollowing(false);
    setLocateNote(note ?? "已停止追蹤。再按「快速定位」可重新跟隨。");
  }, []);

  const fitMainIsland = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.invalidateSize();
    map.fitBounds(L.latLngBounds(MAIN_ISLAND_BOUNDS[0], MAIN_ISLAND_BOUNDS[1]), {
      padding: [36, 36],
      maxZoom: 8,
      animate: false,
    });
  }, []);

  /** fly=true：移到使用者；follow=true：之後持續跟隨；boot=進場第一次定位 */
  const locateMe = useCallback(
    (opts: { fly?: boolean; follow?: boolean; boot?: boolean } = {}) => {
      const { fly = true, follow = false, boot = false } = opts;
      const map = mapRef.current;
      if (!map) return;

      if (!window.isSecureContext) {
        setBootLocating(false);
        setLocateNote(
          "定位需要安全連線。請用 http://127.0.0.1 開啟，不要用區網 IP。",
        );
        return;
      }
      if (!navigator.geolocation) {
        setBootLocating(false);
        setLocateNote("這個瀏覽器不支援定位。請改用 Chrome 或 Safari。");
        return;
      }

      const gen = ++locateGenRef.current;
      setLocating(true);
      if (boot) setBootLocating(true);
      setLocateNote("請允許使用位置，正在定位…");

      void (async () => {
        try {
          const fix = await getBestPosition((msg) => {
            if (gen !== locateGenRef.current) return;
            setLocateNote(msg);
          });
          if (gen !== locateGenRef.current || !mapRef.current) return;

          const here: LatLng = [fix.lat, fix.lng];
          drawUser(here);
          setLocating(false);
          setBootLocating(false);
          const acc = Math.round(fix.accuracy);
          const modeHint = fix.highAccuracy ? "GPS" : "Wi‑Fi／網路";

          if (fly) {
            const ok = flyToUser(here);
            if (!ok) {
              setFollowing(false);
              followingRef.current = false;
              startWatch();
              return;
            }
          }

          if (follow) {
            followingRef.current = true;
            setFollowing(true);
            setLocateNote(
              `追蹤中（${modeHint}，誤差約 ${acc} 公尺）。再按一次可停止。`,
            );
          } else {
            setLocateNote(
              `快速定位完成（${modeHint}，誤差約 ${acc} 公尺）。`,
            );
          }
          startWatch();
        } catch (err) {
          if (gen !== locateGenRef.current) return;
          setLocating(false);
          setBootLocating(false);
          setFollowing(false);
          followingRef.current = false;
          const code = (err as GeolocationPositionError)?.code ?? 3;
          setLocateNote(geoErrorMessage(code));
          fitMainIsland();
        }
      })();
    },
    [drawUser, fitMainIsland, flyToUser, startWatch],
  );

  const onLocateButton = useCallback(() => {
    if (following) {
      stopFollowing();
      return;
    }
    locateMe({ fly: true, follow: true });
  }, [following, locateMe, stopFollowing]);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const host = hostRef.current;
    const saved = readMapView();
    const startCenter = saved?.center ?? TAIWAN_CENTER;
    const startZoom = saved?.zoom ?? TAIWAN_DEFAULT_ZOOM;
    if (saved?.focusKey) lastFocusKey.current = saved.focusKey;

    const map = L.map(host, {
      zoomControl: true,
      // true = 以滑鼠位置為中心縮放（勿用 'center'）
      scrollWheelZoom: true,
      doubleClickZoom: true,
      maxBounds: TAIWAN_BOUNDS,
      maxBoundsViscosity: 1,
      minZoom: TAIWAN_MIN_ZOOM,
      preferCanvas: true,
    }).setView(startCenter, startZoom, { animate: false });
    // 國土測繪：街道（預設）+ 正射空拍可切換
    basemapRef.current = addTaiwanBasemap(
      map,
      TAIWAN_BOUNDS,
      saved?.basemap ?? "street",
    );
    enableCursorCenteredZoom(map);
    layerRef.current = L.layerGroup().addTo(map);
    liveLayerRef.current = L.layerGroup().addTo(map);
    overlayLayerRef.current = L.layerGroup().addTo(map);
    userLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    applyTaiwanLock(map);

    if (saved?.userPos) {
      userPosRef.current = saved.userPos;
      // drawUser 在下方 effect 就緒後由還原流程呼叫；此處先畫點
      L.circle(saved.userPos, {
        radius: 25,
        color: "#1e90ff",
        weight: 2,
        fillColor: "#1e90ff",
        fillOpacity: 0.15,
      }).addTo(userLayerRef.current);
      L.marker(saved.userPos, { icon: userPin(), zIndexOffset: 1000 })
        .bindTooltip("我的位置", {
          permanent: true,
          direction: "right",
          className: "osm-user-tip",
        })
        .addTo(userLayerRef.current);
      callbacks.current.onUserPosition?.(saved.userPos);
    }

    let redrawTimer = 0;
    let persistTimer = 0;
    const scheduleRedraw = () => {
      window.clearTimeout(redrawTimer);
      redrawTimer = window.setTimeout(() => redrawRef.current(), 120);
    };
    const schedulePersist = () => {
      window.clearTimeout(persistTimer);
      persistTimer = window.setTimeout(() => persistView(), 200);
    };
    map.on("moveend", scheduleRedraw);
    map.on("zoomend", scheduleRedraw);
    map.on("moveend", schedulePersist);
    map.on("zoomend", schedulePersist);

    // 手動拖／捏地圖 → 停止追蹤（與 Google Maps 相同）
    const onDragStart = () => {
      if (programmaticMoveRef.current) return;
      if (followingRef.current) {
        followingRef.current = false;
        setFollowing(false);
        setLocateNote("已停止追蹤（你移動了地圖）。再按「快速定位」可重新跟隨。");
      }
    };
    map.on("dragstart", onDragStart);
    map.on("zoomstart", onDragStart);

    const resize = () => {
      // 視窗／版面大小變了：只重算尺寸與台灣鎖，不重置中心與縮放
      map.invalidateSize({ animate: false });
      applyTaiwanLock(map);
      schedulePersist();
    };
    const observer = new ResizeObserver(() => resize());
    observer.observe(host);

    const t1 = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
      applyTaiwanLock(map);
      redrawRef.current();
      if (skipBootRef.current) {
        setBootLocating(false);
        setLocateNote("已恢復上次地圖位置。");
        if (navigator.geolocation && window.isSecureContext) {
          startWatch();
        }
        persistView();
        return;
      }
      locateMe({ fly: true, follow: false, boot: true });
    }, 120);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(redrawTimer);
      window.clearTimeout(persistTimer);
      locateGenRef.current += 1;
      observer.disconnect();
      map.off("moveend", scheduleRedraw);
      map.off("zoomend", scheduleRedraw);
      map.off("moveend", schedulePersist);
      map.off("zoomend", schedulePersist);
      map.off("dragstart", onDragStart);
      map.off("zoomstart", onDragStart);
      stopWatch();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      liveLayerRef.current = null;
      overlayLayerRef.current = null;
      userLayerRef.current = null;
      basemapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
  }, []);

  useEffect(() => {
    basemapRef.current?.setMode(basemapMode);
    persistView();
  }, [basemapMode, persistView]);

  const redrawMarkers = useCallback(() => {
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!map || !layers) return;
    layers.clearLayers();

    const selected = selectedRef.current ?? null;
    const selectedParkId = selected?.id ?? null;
    const pathId = selectedPathRef.current;
    const drawList = pickSitesInView(map, sitesRef.current, selected);

    for (const site of drawList) {
      const active = site.id === selectedParkId;

      if (active) {
        L.marker(site.center, { icon: selectedPin(), zIndexOffset: 800 })
          .bindTooltip(`${site.name}`, {
            permanent: false,
            direction: "top",
            offset: [0, -18],
            className: "osm-selected-tip",
          })
          .on("click", () => callbacks.current.onPickPark(site.id))
          .addTo(layers);
      } else if (siteHasInventory(site)) {
        L.marker(site.center, { icon: inventoryPin(), zIndexOffset: 500 })
          .bindTooltip(
            `${site.kind === "school" ? "學校" : "公園"} · ${site.name}（已有盤點）`,
          )
          .on("click", () => callbacks.current.onPickPark(site.id))
          .addTo(layers);
      } else {
        const marker = L.circleMarker(site.center, {
          radius: 5,
          color: "#1a2216",
          weight: 1,
          fillColor: site.kind === "school" ? "#5b7c99" : "#2f4635",
          fillOpacity: 0.75,
        });
        marker.bindTooltip(
          `${site.kind === "school" ? "學校" : "公園"} · ${site.name}`,
        );
        marker.on("click", () => callbacks.current.onPickPark(site.id));
        layers.addLayer(marker);
      }

      // 已盤點路線：未選中也畫出來；選中時加粗
      for (const path of site.paths) {
        if (path.polyline.length < 2) continue;
        if (!path.hasInventory && !active) continue;
        const pathActive = active && path.id === pathId;
        const line = L.polyline(path.polyline, {
          color: path.hasInventory ? "#ff8a00" : "#f0c14b",
          weight: pathActive ? 9 : path.hasInventory ? 6 : 5,
          opacity: pathActive ? 1 : 0.9,
          dashArray: path.hasInventory ? undefined : "8 8",
        });
        line.bindTooltip(
          path.hasInventory
            ? `${path.name}（已盤點 · ${path.scanId}）`
            : path.name,
        );
        line.on("click", () => callbacks.current.onPickPath(site.id, path.id));
        layers.addLayer(line);
      }
    }

    if (userPosRef.current) drawUser(userPosRef.current);
  }, [drawUser]);
  const redrawRef = useRef(redrawMarkers);
  redrawRef.current = redrawMarkers;

  const redrawOverlays = useCallback(() => {
    const map = mapRef.current;
    const layer = overlayLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    for (const item of overlaysRef.current) {
      if (item.polyline.length < 2) continue;
      const color = item.source === "import" ? "#2a6f97" : "#c45c26";
      const line = L.polyline(item.polyline, {
        color,
        weight: 7,
        opacity: 0.95,
      });
      line.bindTooltip(item.label, {
        permanent: true,
        direction: "center",
        className: "osm-overlay-tip",
      });
      layer.addLayer(line);
    }
  }, []);

  useEffect(() => {
    redrawMarkers();
  }, [sites, selectedSite, selectedPathId, redrawMarkers]);

  useEffect(() => {
    redrawOverlays();
  }, [overlays, redrawOverlays]);

  // Center selected area (~1/4 view). Soft lock only if user is already inside.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || recording) return;

    if (!selectedSite) {
      lastFocusKey.current = "";
      applyTaiwanLock(map);
      return;
    }

    const area = focusBounds(selectedSite, selectedPathId);
    const focusKey = `${selectedSite.id}:${selectedPathId ?? ""}`;
    if (focusKey === lastFocusKey.current) return;
    lastFocusKey.current = focusKey;

    const size = map.getSize();
    const padX = Math.max(40, Math.round(size.x * 0.25));
    const padY = Math.max(40, Math.round(size.y * 0.25));
    const padding = {
      paddingTopLeft: L.point(padX, padY),
      paddingBottomRight: L.point(padX, padY),
      maxZoom: 18,
      duration: 0.7,
    };

    const here = userPosRef.current;
    if (here && area.pad(2).contains(here)) {
      // User is near the site: show both, stay within Taiwan.
      const both = L.latLngBounds(area.getSouthWest(), area.getNorthEast());
      both.extend(here);
      applyTaiwanLock(map);
      map.flyToBounds(both, padding);
      setLocateNote("已把你與選定地區一起置中。");
      return;
    }

    // Center the site; map stays limited to Taiwan + nearby islands.
    applyTaiwanLock(map);
    map.flyToBounds(area, padding);
    if (here) {
      setLocateNote("選定地區已置中。你目前較遠，可再按「定位我所在位置」飛到約 100 公里範圍。");
    } else {
      setLocateNote("選定地區已置中。請按「定位我所在位置」以你為中心顯示約 100 公里範圍。");
    }
  }, [selectedSite, selectedPathId, sites, recording, liveTrack.length]);

  useEffect(() => {
    const map = mapRef.current;
    const live = liveLayerRef.current;
    if (!map || !live) return;
    live.clearLayers();
    if (liveTrack.length === 0) return;

    L.polyline(liveTrack, {
      color: recording ? "#ff2d2d" : "#1a5276",
      weight: 6,
      opacity: 0.95,
    }).addTo(live);

    const last = liveTrack[liveTrack.length - 1];
    L.marker(last, { icon: userPin() }).addTo(live);

    if (recording) {
      map.panTo(last);
      if (map.getZoom() < 17) map.setZoom(17);
    } else if (liveTrack.length >= 2) {
      map.fitBounds(L.latLngBounds(liveTrack), { padding: [40, 40] });
    }
  }, [liveTrack, recording]);

  return (
    <div className={`osm-wrap ${basemapMode === "photo" ? "is-photo" : "is-street"}`}>
      <div ref={hostRef} className="osm-canvas" />
      {bootLocating ? (
        <div className="osm-boot-locate" role="status">
          <strong>正在定位</strong>
          <span>請在跳出的視窗按「允許」，定位成功後會移到你附近</span>
        </div>
      ) : null}
      <div className="osm-basemap-switch" role="group" aria-label="底圖">
        <button
          type="button"
          className={basemapMode === "street" ? "is-on" : undefined}
          onClick={() => setBasemapMode("street")}
        >
          街道
        </button>
        <button
          type="button"
          className={basemapMode === "photo" ? "is-on" : undefined}
          onClick={() => setBasemapMode("photo")}
        >
          空拍
        </button>
      </div>
      <div className="osm-locate-bar">
        <button
          type="button"
          className={`osm-locate-btn ${following ? "is-following" : ""}`}
          disabled={locating || recording}
          onClick={onLocateButton}
        >
          {locating ? "定位中…" : following ? "停止追蹤" : "快速定位"}
        </button>
        {locateNote ? <div className="osm-locate-note">{locateNote}</div> : null}
      </div>
    </div>
  );
}
