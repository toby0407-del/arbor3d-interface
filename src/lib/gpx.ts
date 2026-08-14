import type { LatLng } from "../data/sites";

export type TrackPoint = {
  lat: number;
  lng: number;
  accuracy: number;
  time: number;
};

export function toLatLngs(points: TrackPoint[]): LatLng[] {
  return points.map((point) => [point.lat, point.lng]);
}

export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function trackToGpx(points: TrackPoint[], name: string): string {
  const rows = points
    .map(
      (point) =>
        `      <trkpt lat="${point.lat.toFixed(7)}" lon="${point.lng.toFixed(7)}"><time>${new Date(point.time).toISOString()}</time></trkpt>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Arbor3D" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${rows}
    </trkseg>
  </trk>
</gpx>
`;
}

export function downloadGpx(points: TrackPoint[], name: string): void {
  const blob = new Blob([trackToGpx(points, name)], {
    type: "application/gpx+xml",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  anchor.href = url;
  anchor.download = `arbor3d-track-${stamp}.gpx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
