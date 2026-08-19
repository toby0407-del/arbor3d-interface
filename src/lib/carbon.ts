import type { FieldMeasure } from "../hooks/useFieldMeasures";
import type { TreeRecord } from "../types";

/** CO₂ / C 分子量比 44/12 */
export const CO2_FACTOR = 3.667;

/** 表定係數（盤點表 C 欄，各列皆為 0.0159） */
export const DEFAULT_CARBON_COEFF = 0.0159;

export const CARBON_COEFFS = [
  { id: "worksheet", label: "表定係數 0.0159", value: 0.0159 },
  { id: "broadleaf", label: "闊葉樹 0.027", value: 0.027 },
  { id: "conifer", label: "針葉樹 0.020", value: 0.02 },
] as const;

export function coeffSelectValue(raw: string | undefined): string {
  if (!raw || !raw.trim()) return String(DEFAULT_CARBON_COEFF);
  const n = Number(raw);
  const match = CARBON_COEFFS.find((item) => item.value === n);
  return match ? String(match.value) : "custom";
}

export function isCustomCoeff(raw: string | undefined): boolean {
  return coeffSelectValue(raw) === "custom";
}

export type CarbonRow = {
  circumferenceM: number | null;
  heightM: number | null;
  heightEstimated: boolean;
  heightErrorM: number | null;
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

/** 胸徑–樹高粗估的典型誤差（公尺），校園／行道樹約 25–35%。 */
export function heightEstimateErrorM(heightM: number): number {
  return Math.max(2, Math.min(6.5, 0.3 * heightM));
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
  const measuredHeight =
    parsePositive(field?.heightM) ??
    (tree.Height_m != null && tree.Height_m > 0 ? tree.Height_m : null);
  const heightEstimated = measuredHeight == null;
  const height =
    measuredHeight ?? (dbh != null ? estimateHeightM(dbh) : null);
  const coeff = parsePositive(field?.coeff) ?? DEFAULT_CARBON_COEFF;
  const circumferenceM = dbh != null ? circumferenceMFromDbhCm(dbh) : null;
  const carbonD =
    circumferenceM != null && height != null
      ? treeCarbonD(circumferenceM, height, coeff)
      : null;
  return {
    circumferenceM,
    heightM: height,
    heightEstimated,
    heightErrorM:
      heightEstimated && height != null ? heightEstimateErrorM(height) : null,
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
