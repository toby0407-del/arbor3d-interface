import { useEffect, useRef } from "react";
import L from "leaflet";
import { PARKS } from "../data/sites";

type Props = {
  selectedParkId: string | null;
  selectedPathId: string | null;
  onPickPark: (parkId: string) => void;
  onPickPath: (parkId: string, pathId: string) => void;
};

function parkPin(active: boolean) {
  return L.divIcon({
    className: "osm-pin",
    html: `<span class="osm-pin-dot ${active ? "is-active" : ""}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export function OsmSiteMap({
  selectedParkId,
  selectedPathId,
  onPickPark,
  onPickPath,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const callbacks = useRef({ onPickPark, onPickPath });
  callbacks.current = { onPickPark, onPickPath };

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const map = L.map(hostRef.current, { zoomControl: true }).setView(
      [24.17, 120.645],
      13,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!map || !layers) return;
    layers.clearLayers();

    for (const park of PARKS) {
      const marker = L.marker(park.center, {
        icon: parkPin(park.id === selectedParkId),
        title: park.name,
      });
      marker.bindTooltip(park.name, { permanent: true, direction: "top", offset: [0, -10] });
      marker.on("click", () => callbacks.current.onPickPark(park.id));
      layers.addLayer(marker);

      if (park.id !== selectedParkId) continue;

      for (const path of park.paths) {
        const active = path.id === selectedPathId;
        const line = L.polyline(path.polyline, {
          color: path.hasInventory ? "#2f4635" : "#8a8170",
          weight: active ? 8 : 5,
          opacity: active ? 1 : 0.75,
          dashArray: path.hasInventory ? undefined : "8 8",
        });
        line.bindTooltip(path.name);
        line.on("click", () => callbacks.current.onPickPath(park.id, path.id));
        layers.addLayer(line);
      }
    }

    const park = PARKS.find((item) => item.id === selectedParkId);
    if (park) {
      const path = park.paths.find((item) => item.id === selectedPathId);
      if (path) map.fitBounds(L.latLngBounds(path.polyline), { padding: [48, 48] });
      else map.flyTo(park.center, 16, { duration: 0.6 });
    }
  }, [selectedParkId, selectedPathId]);

  return <div ref={hostRef} className="osm-canvas" />;
}
