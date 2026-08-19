import type { LatLng } from "../data/sites";
import { haversineMeters } from "./gpx";
import { trafficLight } from "./status";
import type { TrafficLight, TreeRecord } from "../types";

export type MapTreeMarker = {
  id: string;
  latlng: LatLng;
  light: TrafficLight;
};

function interpolate(
  polyline: LatLng[],
  cum: number[],
  total: number,
  t: number,
): LatLng {
  const dist = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < polyline.length; i += 1) {
    if (cum[i] >= dist || i === polyline.length - 1) {
      const span = cum[i] - cum[i - 1] || 1;
      const u = (dist - cum[i - 1]) / span;
      const a = polyline[i - 1];
      const b = polyline[i];
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    }
  }
  return polyline[polyline.length - 1];
}

function offsetFromPath(
  polyline: LatLng[],
  cum: number[],
  total: number,
  t: number,
  lateralM: number,
): LatLng {
  const onPath = interpolate(polyline, cum, total, t);
  if (!Number.isFinite(lateralM) || Math.abs(lateralM) < 0.05) return onPath;
  const dist = Math.min(1, Math.max(0, t)) * total;
  let i = 1;
  for (; i < polyline.length; i += 1) {
    if (cum[i] >= dist || i === polyline.length - 1) break;
  }
  const a = polyline[i - 1];
  const b = polyline[i];
  const midLat = (a[0] + b[0]) / 2;
  const dNorth = (b[0] - a[0]) * 111_320;
  const dEast = (b[1] - a[1]) * 111_320 * Math.cos((midLat * Math.PI) / 180);
  const len = Math.hypot(dEast, dNorth) || 1;
  const nEast = -dNorth / len;
  const nNorth = dEast / len;
  return [
    onPath[0] + (nNorth * lateralM) / 111_320,
    onPath[1] +
      (nEast * lateralM) / (111_320 * Math.cos((onPath[0] * Math.PI) / 180)),
  ];
}

/** 沒有樹上 GPS 時，依 Local_XYZ 沿著路徑折線放點，X 為路旁偏移。 */
export function treesAlongPolyline(
  polyline: LatLng[],
  trees: TreeRecord[],
): MapTreeMarker[] {
  if (polyline.length < 2 || trees.length === 0) return [];

  const withGps = trees.filter(
    (tree) =>
      tree.GPS_Location != null &&
      Number.isFinite(tree.GPS_Location[0]) &&
      Number.isFinite(tree.GPS_Location[1]),
  );
  if (withGps.length === trees.length) {
    return withGps.map((tree) => ({
      id: tree.Tree_ID,
      latlng: tree.GPS_Location as LatLng,
      light: trafficLight(tree.DBH_note),
    }));
  }

  const cum = [0];
  for (let i = 1; i < polyline.length; i += 1) {
    cum.push(
      cum[i - 1] +
        haversineMeters(
          polyline[i - 1][0],
          polyline[i - 1][1],
          polyline[i][0],
          polyline[i][1],
        ),
    );
  }
  const total = cum[cum.length - 1];
  if (total <= 0) {
    return trees.map((tree) => ({
      id: tree.Tree_ID,
      latlng: polyline[0],
      light: trafficLight(tree.DBH_note),
    }));
  }

  const ys = trees.map((tree) => tree.Local_XYZ_m[1]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = maxY - minY || 1;

  return trees.map((tree) => {
    const t = (tree.Local_XYZ_m[1] - minY) / span;
    return {
      id: tree.Tree_ID,
      latlng: offsetFromPath(polyline, cum, total, t, tree.Local_XYZ_m[0]),
      light: trafficLight(tree.DBH_note),
    };
  });
}
