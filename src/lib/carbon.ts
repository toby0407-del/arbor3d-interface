import type { FieldMeasure } from "../hooks/useFieldMeasures";
import type { TreeRecord } from "../types";

/** CO₂ / C 分子量比 44/12 */
export const CO2_FACTOR = 3.667;

export const CARBON_COEFFS = [
  { id: "broadleaf", label: "闊葉樹 0.027", value: 0.027 },
  { id: "conifer", label: "針葉樹 0.020", value: 0.02 },
] as const;

export const DEFAULT_CARBON_COEFF = 0.027;

export type CarbonRow = {
  circumferenceM: number | null;
  heightM: number | null;
  coeff: number;
  carbonD: number | null;
  co2Ton: number | null;
  measuredAt: string;
};

function parsePositive(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A：胸高圓周（m）= π × 胸徑(m) */
export function circumferenceMFromDbhCm(dbhCm: number): number {
  return (Math.PI * dbhCm) / 100;
}

/** 沒有實測樹高時，用胸徑粗估，之後可在現場改。 */
export function estimateHeightM(dbhCm: number): number {
  return Math.max(3.5, Math.min(22, 1.3 + 1.8 * Math.sqrt(dbhCm)));
}

export function treeCarbonD(aM: number, heightM: number, coeff: number): number {
  return aM * aM * heightM * coeff;
}

export function co2EquivalentTon(carbonD: number): number {
  return carbonD * CO2_FACTOR;
}

export function formatCarbonDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

export function carbonForTree(
  tree: TreeRecord,
  field: FieldMeasure | undefined,
  scanCreatedAt: string,
): CarbonRow {
  const dbh =
    parsePositive(field?.dbhCm) ??
    (tree.DBH_cm != null && tree.DBH_cm > 0 ? tree.DBH_cm : null);
  const height =
    parsePositive(field?.heightM) ??
    (tree.Height_m != null && tree.Height_m > 0 ? tree.Height_m : null) ??
    (dbh != null ? estimateHeightM(dbh) : null);
  const coeff = parsePositive(field?.coeff) ?? DEFAULT_CARBON_COEFF;
  const circumferenceM = dbh != null ? circumferenceMFromDbhCm(dbh) : null;
  const carbonD =
    circumferenceM != null && height != null
      ? treeCarbonD(circumferenceM, height, coeff)
      : null;
  return {
    circumferenceM,
    heightM: height,
    coeff,
    carbonD,
    co2Ton: carbonD != null ? co2EquivalentTon(carbonD) : null,
    measuredAt: field?.measuredAt?.trim() || formatCarbonDate(scanCreatedAt),
  };
}

export function totalCo2Ton(
  trees: TreeRecord[],
  measures: Record<string, FieldMeasure>,
  scanCreatedAt: string,
): number {
  return trees.reduce((sum, tree) => {
    const row = carbonForTree(tree, measures[tree.Tree_ID], scanCreatedAt);
    return sum + (row.co2Ton ?? 0);
  }, 0);
}
