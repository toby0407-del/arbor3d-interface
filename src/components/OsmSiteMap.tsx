import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { LatLng, ParkSite } from "../data/sites";
import { siteHasInventory } from "../data/sites";
import { TAIWAN_BOUNDS, TAIWAN_MIN_ZOOM, USER_VIEW_METERS } from "../lib/mapBounds";

type Props = {
  sites: ParkSite[];
  selectedSite?: ParkSite | null;
  selectedPathId: string | null;
  liveTrack?: LatLng[];
  recording?: boolean;
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
  map.setMaxBounds(TAIWAN_BOUNDS);
  map.setMinZoom(TAIWAN_MIN_ZOOM);
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
  const picked = [...ready, ...rest.slice(0, Math.max(0, MAX_MARKERS - ready.length))];
  return selectedSite ? [selectedSite, ...picked] : picked;
}

function geoErrorMessage(code: number): string {
  if (code === 1) {
    return "定位被拒絕。請點網址列左側圖示，允許「位置」後再按「定位我所在位置」。";
  }
  if (code === 2) {
    return "目前拿不到位置。請打開系統定位／GPS，到窗邊或室外後再試。";
  }
  return "定位逾時。請再按一次「定位我所在位置」。";
}

export function OsmSiteMap({
  sites,
  selectedSite = null,
  selectedPathId,
  liveTrack = [],
  recording = false,
  onPickPark,
  onPickPath,
  onUserPosition,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const liveLayerRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const callbacks = useRef({ onPickPark, onPickPath, onUserPosition });
  const lastFocusKey = useRef<string>("");
  const watchIdRef = useRef<number | null>(null);
  const userPosRef = useRef<LatLng | null>(null);
  const [locateNote, setLocateNote] = useState("按右上角「定位我所在位置」開始定位");
  const [locating, setLocating] = useState(false);
  const sitesRef = useRef(sites);
  const selectedRef = useRef(selectedSite);
  const selectedPathRef = useRef(selectedPathId);
  sitesRef.current = sites;
  selectedRef.current = selectedSite;
  selectedPathRef.current = selectedPathId;
  callbacks.current = { onPickPark, onPickPath, onUserPosition };

  const drawUser = useCallback((here: LatLng) => {
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
    }).addTo(userLayer);
    L.marker(here, { icon: userPin(), zIndexOffset: 1000 })
      .bindTooltip("你的位置", {
        permanent: true,
        direction: "right",
        className: "osm-user-tip",
      })
      .addTo(userLayer);
  }, []);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const flyToUser = useCallback((here: LatLng) => {
    const map = mapRef.current;
    if (!map) return;
    applyTaiwanLock(map);
    const taiwan = L.latLngBounds(
      L.latLng(21.7, 118.0),
      L.latLng(26.5, 122.3),
    );
    if (!taiwan.contains(here)) {
      setLocateNote("你的位置不在台灣／離島範圍內，地圖只顯示台灣地區。");
      return;
    }
    // ~100 km box centered on the user (Leaflet size = width & height in meters).
    const area = L.latLng(here[0], here[1]).toBounds(USER_VIEW_METERS);
    map.flyToBounds(area, {
      padding: [24, 24],
      maxZoom: 12,
      duration: 0.9,
    });
  }, []);

  const locateMe = useCallback(() => {
      const map = mapRef.current;
      if (!map) return;

      if (!window.isSecureContext) {
        setLocateNote("定位需要安全連線。請用 http://127.0.0.1 開啟，不要用區網 IP。");
        return;
      }
      if (!navigator.geolocation) {
        setLocateNote("這個瀏覽器不支援定位。請改用 Chrome 或 Safari。");
        return;
      }

      setLocating(true);
      setLocateNote("正在定位你的位置…（請允許瀏覽器的位置權限）");

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const here: LatLng = [pos.coords.latitude, pos.coords.longitude];
          drawUser(here);
          setLocating(false);
          setLocateNote(
            `已定位（誤差約 ${Math.round(pos.coords.accuracy)} 公尺）。已以你為中心顯示約 100 公里範圍。`,
          );
          flyToUser(here);

          stopWatch();
          watchIdRef.current = navigator.geolocation.watchPosition(
            (next) => {
              const point: LatLng = [
                next.coords.latitude,
                next.coords.longitude,
              ];
              drawUser(point);
            },
            () => {
              /* keep last good fix */
            },
            {
              enableHighAccuracy: true,
              maximumAge: 3000,
              timeout: 20000,
            },
          );
        },
        (err) => {
          setLocating(false);
          setLocateNote(geoErrorMessage(err.code));
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 25000,
        },
      );
    }, [drawUser, flyToUser, stopWatch]);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const map = L.map(hostRef.current, {
      zoomControl: true,
      maxBounds: TAIWAN_BOUNDS,
      maxBoundsViscosity: 1,
      minZoom: TAIWAN_MIN_ZOOM,
    }).setView([23.7, 121.0], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      bounds: TAIWAN_BOUNDS,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    liveLayerRef.current = L.layerGroup().addTo(map);
    userLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const onViewChange = () => redrawRef.current();
    map.on("moveend", onViewChange);
    map.on("zoomend", onViewChange);
    const timer = window.setTimeout(() => {
      map.invalidateSize();
      redrawRef.current();
      locateMe();
    }, 120);
    return () => {
      window.clearTimeout(timer);
      map.off("moveend", onViewChange);
      map.off("zoomend", onViewChange);
      stopWatch();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      liveLayerRef.current = null;
      userLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
  }, []);

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
          .bindTooltip(
            `${site.kind === "school" ? "學校" : "公園"} · ${site.name}（目前選定${siteHasInventory(site) ? " · 已有盤點" : ""}）`,
            {
              permanent: true,
              direction: "top",
              offset: [0, -18],
              className: "osm-selected-tip",
            },
          )
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

      if (!active) continue;
      for (const path of site.paths) {
        if (path.polyline.length < 2) continue;
        const pathActive = path.id === pathId;
        const line = L.polyline(path.polyline, {
          color: path.hasInventory ? "#ff8a00" : "#f0c14b",
          weight: pathActive ? 9 : 6,
          opacity: pathActive ? 1 : 0.85,
          dashArray: path.hasInventory ? undefined : "8 8",
        });
        line.bindTooltip(path.name);
        line.on("click", () => callbacks.current.onPickPath(site.id, path.id));
        layers.addLayer(line);
      }
    }

    if (userPosRef.current) drawUser(userPosRef.current);
  }, [drawUser]);
  const redrawRef = useRef(redrawMarkers);
  redrawRef.current = redrawMarkers;

  useEffect(() => {
    redrawMarkers();
  }, [sites, selectedSite, selectedPathId, redrawMarkers]);

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
    <div className="osm-wrap">
      <div ref={hostRef} className="osm-canvas" />
      <div className="osm-locate-bar">
        <button
          type="button"
          className="osm-locate-btn"
          disabled={locating || recording}
          onClick={() => locateMe()}
        >
          {locating ? "定位中…" : "定位我所在位置"}
        </button>
        {locateNote ? <div className="osm-locate-note">{locateNote}</div> : null}
      </div>
    </div>
  );
}
