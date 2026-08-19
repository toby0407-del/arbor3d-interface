import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { LatLng, ParkSite } from "../data/sites";
import { siteHasInventory } from "../data/sites";
import { TAIWAN_BOUNDS, TAIWAN_CENTER, TAIWAN_DEFAULT_ZOOM, TAIWAN_MIN_ZOOM } from "../lib/mapBounds";
import {
  addTaiwanBasemap,
  enableCursorCenteredZoom,
  type TaiwanBasemapMode,
} from "../lib/mapTiles";
import { geoErrorMessage, shouldAcceptGeoFix } from "../lib/geolocation";
import { readMapView, writeMapView } from "../lib/mapViewStore";
import type { MapOverlay } from "../lib/mapOverlays";
import type { MapTreeMarker } from "../lib/treePlacement";
import type { TrafficLight } from "../types";

type Props = {
  sites: ParkSite[];
  selectedSite?: ParkSite | null;
  selectedPathId: string | null;
  liveTrack?: LatLng[];
  recording?: boolean;
  overlays?: MapOverlay[];
  treeMarkers?: MapTreeMarker[];
  onPickPark: (parkId: string) => void;
  onPickPath: (parkId: string, pathId: string) => void;
  onPickTree?: (treeId: string) => void;
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
  const drawn = site.paths.filter((item) => item.polyline.length >= 2);
  if (drawn.length > 0) {
    const bounds = L.latLngBounds(drawn[0].polyline);
    for (const item of drawn.slice(1)) {
      bounds.extend(L.latLngBounds(item.polyline));
    }
    return bounds.pad(0.35);
  }
  return L.latLng(site.center[0], site.center[1]).toBounds(350);
}

function treePin(light: TrafficLight) {
  const fill =
    light === "green" ? "#7dae7a" : light === "yellow" ? "#d2b56a" : "#d08980";
  return L.divIcon({
    className: "osm-pin",
    html: `<span class="osm-tree-dot" style="background:${fill}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
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
  treeMarkers = [],
  onPickPark,
  onPickPath,
  onPickTree,
  onUserPosition,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const liveLayerRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const treeLayerRef = useRef<L.LayerGroup | null>(null);
  const callbacks = useRef({ onPickPark, onPickPath, onPickTree, onUserPosition });
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const treeMarkersRef = useRef(treeMarkers);
  treeMarkersRef.current = treeMarkers;
  const lastFocusKey = useRef<string>("");
  const watchIdRef = useRef<number | null>(null);
  const userPosRef = useRef<LatLng | null>(null);
  const followingRef = useRef(false);
  const programmaticUntilRef = useRef(0);
  const locateGenRef = useRef(0);
  const pendingFlyRef = useRef(false);
  const followWantedRef = useRef(false);
  const pendingJumpRef = useRef<LatLng | null>(null);
  const haveGoodFixRef = useRef(false);
  const lastAccuracyRef = useRef<number | null>(null);
  const liveFixRef = useRef(false);
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
  basemapModeRef.current = basemapMode;
  callbacks.current = { onPickPark, onPickPath, onPickTree, onUserPosition };

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
      userPos: liveFixRef.current ? userPosRef.current : null,
      focusKey: lastFocusKey.current,
      bootDone: true,
    });
  }, []);

  const zoomToUser = useCallback((here: LatLng) => {
    const map = mapRef.current;
    if (!map) return;
    const taiwan = L.latLngBounds(TAIWAN_BOUNDS[0], TAIWAN_BOUNDS[1]);
    if (!taiwan.contains(here)) return;
    programmaticUntilRef.current = Math.max(
      programmaticUntilRef.current,
      Date.now() + 900,
    );
    // 點「我的位置」icon → 放大
    const nextZoom = Math.max(map.getZoom(), 18);
    map.flyTo(here, nextZoom, { duration: 0.65 });
    setLocateNote("已放大到我的位置。");
  }, []);

  const drawUser = useCallback(
    (here: LatLng) => {
      const userLayer = userLayerRef.current;
      if (!userLayer) return;
      userPosRef.current = here;
      haveGoodFixRef.current = true;
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

  const commitJump = useCallback(() => {
    const map = mapRef.current;
    const target = pendingJumpRef.current;
    if (!map || !target) return false;
    const size = map.getSize();
    if (!size.x || !size.y) return false;
    map.stop();
    map.setView(target, 15, { animate: false });
    const c = map.getCenter();
    return Math.abs(c.lat - target[0]) < 0.02 && Math.abs(c.lng - target[1]) < 0.02;
  }, []);

  const flyToUser = useCallback((here: LatLng, _animate = true) => {
    const map = mapRef.current;
    if (!map) return false;
    const taiwan = L.latLngBounds(TAIWAN_BOUNDS[0], TAIWAN_BOUNDS[1]);
    if (!taiwan.contains(here)) {
      setLocateNote("你的位置不在台灣／離島範圍內，地圖只顯示台灣地區。");
      return false;
    }
    pendingJumpRef.current = here;
    programmaticUntilRef.current = Date.now() + 2500;
    const tryJump = () => {
      commitJump();
    };
    tryJump();
    requestAnimationFrame(tryJump);
    window.setTimeout(tryJump, 50);
    window.setTimeout(tryJump, 200);
    window.setTimeout(tryJump, 500);
    return true;
  }, [commitJump]);

  const panFollowUser = useCallback((here: LatLng) => {
    const map = mapRef.current;
    if (!map || !followingRef.current) return;
    if (Date.now() < programmaticUntilRef.current) return;
    const taiwan = L.latLngBounds(TAIWAN_BOUNDS[0], TAIWAN_BOUNDS[1]);
    if (!taiwan.contains(here)) return;
    if (map.getZoom() < 14) {
      flyToUser(here);
      return;
    }
    programmaticUntilRef.current = Math.max(
      programmaticUntilRef.current,
      Date.now() + 500,
    );
    map.panTo(here, { animate: true, duration: 0.35 });
  }, [flyToUser]);

  const startWatch = useCallback(() => {
    stopWatch();
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (next) => {
        const point: LatLng = [next.coords.latitude, next.coords.longitude];
        const taiwan = L.latLngBounds(TAIWAN_BOUNDS[0], TAIWAN_BOUNDS[1]);
        if (
          !Number.isFinite(point[0]) ||
          !Number.isFinite(point[1]) ||
          !taiwan.contains(point)
        ) {
          if (!haveGoodFixRef.current) {
            setLocateNote("目前定位還不夠精準，未移動地圖。");
          }
          return;
        }
        const prev =
          liveFixRef.current && userPosRef.current && lastAccuracyRef.current != null
            ? {
                lat: userPosRef.current[0],
                lng: userPosRef.current[1],
                accuracy: lastAccuracyRef.current,
              }
            : null;
        if (
          !shouldAcceptGeoFix(
            {
              lat: point[0],
              lng: point[1],
              accuracy: next.coords.accuracy,
            },
            prev,
          )
        ) {
          if (pendingFlyRef.current && !haveGoodFixRef.current) {
            setBootLocating(false);
            setLocateNote("目前定位不夠精準，未移動地圖。請開系統定位後再按「快速定位」。");
          }
          return;
        }
        lastAccuracyRef.current = next.coords.accuracy;
        liveFixRef.current = true;
        drawUser(point);
        setLocating(false);
        setBootLocating(false);

        if (pendingFlyRef.current) {
          pendingFlyRef.current = false;
          const ok = flyToUser(point);
          if (followWantedRef.current && ok) {
            followingRef.current = true;
            setFollowing(true);
            setLocateNote("追蹤中。");
          } else if (ok) {
            setLocateNote("快速定位完成。");
          }
          return;
        }

        if (Date.now() < programmaticUntilRef.current) return;
        if (followingRef.current) panFollowUser(point);
      },
      (err) => {
        if (err.code === 3) return;
        setLocating(false);
        setBootLocating(false);
        if (!haveGoodFixRef.current) {
          setLocateNote(geoErrorMessage(err.code));
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 8_000,
      },
    );
  }, [drawUser, flyToUser, panFollowUser, stopWatch]);

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
      pendingFlyRef.current = fly;
      followWantedRef.current = follow;
      followingRef.current = false;
      setFollowing(false);
      setLocating(true);
      if (boot) setBootLocating(true);
      setLocateNote("請允許使用位置，正在定位…");
      if (liveFixRef.current && userPosRef.current && fly) {
        pendingFlyRef.current = false;
        const ok = flyToUser(userPosRef.current);
        setLocating(false);
        setBootLocating(false);
        if (follow && ok) {
          followingRef.current = true;
          setFollowing(true);
          setLocateNote("追蹤中。");
        } else if (ok) {
          setLocateNote("快速定位完成。");
        }
      }
      startWatch();

      window.setTimeout(() => {
        if (gen !== locateGenRef.current) return;
        if (haveGoodFixRef.current) return;
        setLocating(false);
        setBootLocating(false);
        setLocateNote("定位逾時。請再開 Wi‑Fi 後按「快速定位」。");
      }, 20_000);
    },
    [flyToUser, startWatch],
  );

  const onLocateButton = useCallback(() => {
    locateMe({ fly: true, follow: true });
  }, [locateMe]);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const host = hostRef.current;
    const saved = readMapView();
    const startCenter = saved?.center ?? TAIWAN_CENTER;
    const startZoom = saved?.zoom ?? TAIWAN_DEFAULT_ZOOM;

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
    treeLayerRef.current = L.layerGroup().addTo(map);
    userLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    applyTaiwanLock(map);

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
      if (Date.now() < programmaticUntilRef.current) return;
      pendingFlyRef.current = false;
      if (followingRef.current) {
        followingRef.current = false;
        setFollowing(false);
        setLocateNote("已停止追蹤（你移動了地圖）。再按「快速定位」可重新跟隨。");
      }
    };
    map.on("dragstart", onDragStart);
    map.on("zoomstart", onDragStart);

    const resize = () => {
      map.invalidateSize({ animate: false });
      if (Date.now() < programmaticUntilRef.current) {
        commitJump();
        return;
      }
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
      treeLayerRef.current = null;
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

      // 已綁定的路線都畫出來（含尚未匯入），不要只在選中公園時才出現
      for (const path of site.paths) {
        if (path.polyline.length < 2) continue;
        const pathActive = active && path.id === pathId;
        const pending = !path.hasInventory;
        const line = L.polyline(path.polyline, {
          color: pending ? "#2a6f97" : "#ff8a00",
          weight: pathActive ? 10 : pending ? 7 : 6,
          opacity: pathActive ? 1 : 0.95,
          dashArray: pending ? "10 8" : undefined,
        });
        line.bindTooltip(
          pending
            ? `${path.name}（尚未匯入）`
            : `${path.name}（已盤點 · ${path.scanId}）`,
          pending
            ? {
                permanent: true,
                direction: "center",
                className: "osm-overlay-tip",
              }
            : undefined,
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

  const redrawTrees = useCallback(() => {
    const map = mapRef.current;
    const layer = treeLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    for (const tree of treeMarkersRef.current) {
      const marker = L.marker(tree.latlng, {
        icon: treePin(tree.light),
        zIndexOffset: 700,
      });
      marker.bindTooltip("點擊查看", { direction: "top", offset: [0, -8] });
      marker.on("click", () => callbacks.current.onPickTree?.(tree.id));
      layer.addLayer(marker);
    }
  }, []);

  useEffect(() => {
    redrawMarkers();
  }, [sites, selectedSite, selectedPathId, redrawMarkers]);

  useEffect(() => {
    redrawOverlays();
  }, [overlays, redrawOverlays]);

  useEffect(() => {
    redrawTrees();
  }, [treeMarkers, redrawTrees]);

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
    followingRef.current = false;
    setFollowing(false);
    pendingFlyRef.current = false;

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
      setLocateNote("選定地區已置中。你目前較遠，可再按「快速定位」移到你附近。");
    } else {
      setLocateNote("選定地區已置中。請按「快速定位」移到你附近。");
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
          disabled={recording}
          onClick={onLocateButton}
        >
          {locating ? "定位中…" : following ? "追蹤中" : "快速定位"}
        </button>
        {locateNote ? <div className="osm-locate-note">{locateNote}</div> : null}
      </div>
    </div>
  );
}
