import type { DbhMethod } from "../types";

export function methodLabel(method: DbhMethod): string {
  if (method === "circle") return "圓擬合";
  if (method === "caliper") return "虛擬卡尺";
  return method || "—";
}

export function formatDbh(cm: number | null | undefined): string {
  if (cm == null) return "—";
  return `${cm.toFixed(1)} cm`;
}

export function formatXyz(xyz: [number, number, number]): string {
  return xyz.map((n) => n.toFixed(3)).join(" , ") + " m";
}

export function fileName(path: string | null | undefined): string {
  if (!path) return "尚未匯入";
  return path.split("/").pop() ?? path;
}

export function formatConfidence(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatScanTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-Hant", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
