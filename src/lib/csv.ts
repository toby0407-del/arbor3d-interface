import { methodLabel } from "./format";
import { lightShort, noteLabel, trafficLight } from "./status";
import type { FieldMeasure } from "../hooks/useFieldMeasures";
import type { TreeRecord } from "../types";

function cell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function inventoryToCsv(
  trees: TreeRecord[],
  measures: Record<string, FieldMeasure>,
): string {
  const header = [
    "樹號",
    "胸徑_cm",
    "量測方法",
    "弧度_deg",
    "YOLO信心",
    "燈號",
    "備註",
    "標準1.3m",
    "現場手測_cm",
    "現場備註",
  ];
  const rows = trees.map((tree) => {
    const field = measures[tree.Tree_ID];
    return [
      tree.Tree_ID,
      tree.DBH_cm ?? "",
      methodLabel(tree.DBH_method),
      tree.arc_coverage_deg ?? "",
      tree.YOLO_confidence ?? "",
      lightShort(trafficLight(tree.DBH_note)),
      noteLabel(tree),
      tree.dbh_is_strict_breast_height ? "是" : "否",
      field?.dbhCm ?? "",
      field?.note ?? "",
    ]
      .map(cell)
      .join(",");
  });
  return `\uFEFF${header.join(",")}\n${rows.join("\n")}\n`;
}

export function downloadInventoryCsv(
  trees: TreeRecord[],
  measures: Record<string, FieldMeasure>,
  filename: string,
) {
  const blob = new Blob([inventoryToCsv(trees, measures)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
