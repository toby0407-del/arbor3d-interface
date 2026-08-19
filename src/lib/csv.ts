import { carbonForTree } from "./carbon";
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
  scanCreatedAt = "",
): string {
  const header = [
    "樹號",
    "胸徑_cm",
    "量測方法",
    "弧度_deg",
    "YOLO信心",
    "燈號",
    "量測說明",
    "標準1.3m",
    "現場手測_cm",
    "備註",
    "高度1.3m處圓周_m",
    "樹高_m",
    "係數",
    "樹含碳量_D",
    "吸收CO2當量_ton",
    "測量日期",
  ];
  const rows = trees.map((tree) => {
    const field = measures[tree.Tree_ID];
    const carbon = carbonForTree(tree, field, scanCreatedAt);
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
      carbon.circumferenceM?.toFixed(3) ?? "",
      carbon.heightM?.toFixed(1) ?? "",
      carbon.coeff,
      carbon.carbonD?.toFixed(4) ?? "",
      carbon.co2Ton?.toFixed(3) ?? "",
      carbon.measuredAt,
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
  scanCreatedAt = "",
) {
  const blob = new Blob([inventoryToCsv(trees, measures, scanCreatedAt)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
