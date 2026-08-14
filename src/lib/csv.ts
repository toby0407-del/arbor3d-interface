import type { FieldMeasure } from "../hooks/useFieldMeasures";
import type { ParkInventoryReport } from "../types";
import { methodLabel } from "./format";
import { lightLabel, trafficLight } from "./status";

function cell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function inventoryToCsv(
  report: ParkInventoryReport,
  field: Record<string, FieldMeasure>,
): string {
  const header = [
    "Tree_ID",
    "燈號",
    "演算法_DBH_cm",
    "方法",
    "演算法註記",
    "現場手測_DBH_cm",
    "現場備註",
    "Local_XYZ_m",
  ];
  const rows = report.trees.map((tree) => {
    const light = trafficLight(tree.DBH_note);
    const measure = field[tree.Tree_ID];
    return [
      tree.Tree_ID,
      lightLabel(light),
      tree.DBH_cm == null ? "" : tree.DBH_cm.toFixed(1),
      methodLabel(tree.DBH_method),
      tree.DBH_note || "",
      measure?.dbhCm ?? "",
      measure?.note ?? "",
      tree.Local_XYZ_m.join(" "),
    ].map((value) => cell(String(value)));
  });
  return [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportInventoryCsv(
  report: ParkInventoryReport,
  field: Record<string, FieldMeasure>,
) {
  downloadCsv(`Arbor3D_${report.scan_id}.csv`, inventoryToCsv(report, field));
}
