import type { ParkInventoryReport } from "../types";

/**
 * 遠端觀測檔規則：
 * 1. 把 park_inventory_report.json 複製成
 *    src/data/inventories/{scan_id}.json
 * 2. 在 scanBindings.ts 綁到公園與路徑
 * 3. 照片／剖面／ply 放到 public/scans/{scan_id}/ 對應 JSON 裡的相對路徑
 */
const modules = import.meta.glob("./inventories/*.json", {
  eager: true,
  import: "default",
}) as Record<string, ParkInventoryReport>;

const byScanId = new Map<string, ParkInventoryReport>();

for (const [path, report] of Object.entries(modules)) {
  const fromName = path.split("/").pop()?.replace(/\.json$/i, "") ?? "";
  const scanId = report.scan_id || fromName;
  byScanId.set(scanId, report);
}

export function getReport(scanId: string | null | undefined): ParkInventoryReport | undefined {
  if (!scanId) return undefined;
  return byScanId.get(scanId);
}

export function hasReport(scanId: string | null | undefined): boolean {
  return Boolean(getReport(scanId));
}

export function listLoadedScanIds(): string[] {
  return [...byScanId.keys()].sort();
}
