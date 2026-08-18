import type { TrafficLight, TreeRecord } from "../types";

export type InventoryStats = {
  total: number;
  green: number;
  yellow: number;
  red: number;
  review: number;
  avgConfidence: number | null;
};

export function trafficLight(note: string | null | undefined): TrafficLight {
  const value = note ?? "";
  if (
    !value ||
    value === "no_measurement" ||
    value.includes("wide_caliper") ||
    value.includes("gap")
  ) {
    return "red";
  }
  if (value.includes("not_1.3m")) return "yellow";
  return "green";
}

export function lightLabel(light: TrafficLight): string {
  if (light === "green") return "演算法較可信";
  if (light === "yellow") return "有數字，但不是標準 1.3 m";
  return "卡尺偏寬或量不到，不要當正式樹圍";
}

export function lightShort(light: TrafficLight): string {
  if (light === "green") return "可信";
  if (light === "yellow") return "非標準高度";
  return "勿當正式樹圍";
}

export function reviewReason(tree: TreeRecord): string {
  const notes = (tree.DBH_note || "").split(",").filter(Boolean);
  const parts: string[] = [];
  if (notes.includes("wide_caliper")) parts.push("卡尺偏寬");
  if (notes.includes("gap")) parts.push("切片有缺口");
  if (notes.includes("no_measurement")) parts.push("量不到");
  if (tree.arc_coverage_deg != null && tree.arc_coverage_deg < 120) {
    parts.push(`弧度僅 ${tree.arc_coverage_deg.toFixed(1)}°`);
  }
  if (notes.includes("not_1.3m")) parts.push("不是標準 1.3 m");
  return parts.join(" · ") || "需現場再量";
}

export function isReviewTree(tree: TreeRecord): boolean {
  return trafficLight(tree.DBH_note) === "red";
}

export function noteLabel(tree: TreeRecord): string {
  const reason = reviewReason(tree);
  if (trafficLight(tree.DBH_note) === "green") return "通過";
  return reason;
}

export function inventoryStats(trees: TreeRecord[]): InventoryStats {
  let green = 0;
  let yellow = 0;
  let red = 0;
  let confSum = 0;
  let confN = 0;
  for (const tree of trees) {
    const light = trafficLight(tree.DBH_note);
    if (light === "green") green += 1;
    else if (light === "yellow") yellow += 1;
    else red += 1;
    if (tree.YOLO_confidence != null) {
      confSum += tree.YOLO_confidence;
      confN += 1;
    }
  }
  return {
    total: trees.length,
    green,
    yellow,
    red,
    review: trees.filter(isReviewTree).length,
    avgConfidence: confN ? confSum / confN : null,
  };
}
