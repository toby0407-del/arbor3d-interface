import type { LatLng } from "../data/sites";

/** Local_XYZ_m：X 東、Y 北，單位公尺。 */
export function localToLatLng(
  origin: LatLng,
  xyz: [number, number, number],
): LatLng {
  const [lat0, lng0] = origin;
  const [x, y] = xyz;
  const lat = lat0 + y / 111_320;
  const lng = lng0 + x / (111_320 * Math.cos((lat0 * Math.PI) / 180));
  return [lat, lng];
}
