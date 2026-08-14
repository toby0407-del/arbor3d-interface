import { useEffect, useRef } from "react";
import L from "leaflet";
import type { ScanPath } from "../data/sites";
import type { TreeRecord } from "../types";
import { localToLatLng } from "../lib/geo";
import { trafficLight } from "../lib/status";
import { formatDbh } from "../lib/format";
import { TAIWAN_BOUNDS, TAIWAN_MIN_ZOOM } from "../lib/mapBounds";

type Props = {
  origin: [number, number];
  path: ScanPath;
  trees: TreeRecord[];
  onSelect: (treeId: string) => void;
};

const FILL: Record<string, string> = {
  green: "#cfe6cc",
  yellow: "#f0ddb0",
  red: "#ecc6c0",
};

export function PathTreeMap({ origin, path, trees, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const map = L.map(hostRef.current, {
      zoomControl: true,
      maxBounds: TAIWAN_BOUNDS,
      maxBoundsViscosity: 1,
      minZoom: TAIWAN_MIN_ZOOM,
    }).setView(origin, 18);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      bounds: TAIWAN_BOUNDS,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    mapRef.current = map;
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
  }, [origin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const group = L.layerGroup().addTo(map);
    L.polyline(path.polyline, {
      color: "#2f4635",
      weight: 6,
      opacity: 0.85,
    }).addTo(group);

    const points: L.LatLngExpression[] = [...path.polyline];
    for (const tree of trees) {
      const latlng = localToLatLng(origin, tree.Local_XYZ_m);
      points.push(latlng);
      const light = trafficLight(tree.DBH_note);
      const marker = L.circleMarker(latlng, {
        radius: Math.max(7, Math.min(14, (tree.DBH_cm ?? 12) / 6)),
        color: "#1a2216",
        weight: 1,
        fillColor: FILL[light],
        fillOpacity: 1,
      });
      marker.bindTooltip(`${tree.Tree_ID} · ${formatDbh(tree.DBH_cm)}`);
      marker.on("click", () => selectRef.current(tree.Tree_ID));
      marker.addTo(group);
    }

    map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 19 });
    return () => {
      group.remove();
    };
  }, [origin, path, trees]);

  return <div ref={hostRef} className="osm-canvas is-inset" />;
}
