import {
  DEFAULT_CARBON_COEFF,
  circumferenceMFromDbhCm,
  co2EquivalentTon,
  estimateHeightM,
  treeCarbonD,
} from "./carbon";

/** 本年度固定拍攝期：3 月、7 月、9 月。 */
export const SURVEY_MONTHS = [3, 7, 9] as const;

/** 都市行道樹年胸徑增量粗估（cm／年）。幼木較快、大木較慢。 */
export function annualDbhIncrementCm(dbhCm: number): number {
  const d = Math.max(1, dbhCm);
  return Math.max(0.32, Math.min(1.28, 1.18 * Math.exp(-0.015 * d)));
}

export type GrowthKind = "backcast" | "measured" | "forecast";
export type GrowthFit = "ok" | "watch" | "off";
export type GrowthStatus = "normal" | "stalled" | "watch" | "abnormal";
export type TemporalRole = "previous" | "current" | "trend";

export type GrowthPoint = {
  year: number;
  month: number;
  label: string;
  dbhCm: number;
  heightM: number;
  kind: GrowthKind;
};

export type TemporalSnap = {
  role: TemporalRole;
  roleLabel: string;
  periodLabel: string;
  dbhCm: number;
  heightM: number;
  kind: GrowthKind;
  co2Ton: number;
};

export type TemporalGrowth = {
  previous: TemporalSnap;
  current: TemporalSnap;
  trend: TemporalSnap;
  points: GrowthPoint[];
  status: GrowthStatus;
  fit: GrowthFit;
  warning: boolean;
  expectedIncrementCm: number;
  periodIncrementCm: number;
  carbonDeltaTon: number;
  carbonNote: string;
};

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const MEASURED_WINDOW_DAYS = 20;

export function parseScanDate(iso: string): Date {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function midMonth(year: number, month: number): Date {
  return new Date(year, month - 1, 15);
}

function heightAtDbh(
  dbhCm: number,
  measuredHeightM: number | null,
  baseDbhCm: number,
): number {
  if (measuredHeightM != null && baseDbhCm > 0) {
    return Math.max(2.5, measuredHeightM * (dbhCm / baseDbhCm));
  }
  return estimateHeightM(dbhCm);
}

function co2At(dbhCm: number, heightM: number): number {
  return co2EquivalentTon(
    treeCarbonD(circumferenceMFromDbhCm(dbhCm), heightM, DEFAULT_CARBON_COEFF),
  );
}

function kindForSurvey(scan: Date, survey: Date): GrowthKind {
  const days =
    Math.abs(survey.getTime() - scan.getTime()) / (24 * 60 * 60 * 1000);
  if (days <= MEASURED_WINDOW_DAYS) return "measured";
  return survey.getTime() < scan.getTime() ? "backcast" : "forecast";
}

function pointAt(
  survey: Date,
  scan: Date,
  baseDbh: number,
  measuredHeight: number | null,
  increment: number,
  label: string,
): GrowthPoint {
  const yearsDelta = (survey.getTime() - scan.getTime()) / MS_PER_YEAR;
  const dbh = Math.max(3, baseDbh + increment * yearsDelta);
  return {
    year: survey.getFullYear(),
    month: survey.getMonth() + 1,
    label,
    dbhCm: dbh,
    heightM: heightAtDbh(dbh, measuredHeight, baseDbh),
    kind: kindForSurvey(scan, survey),
  };
}

function previousSurveyDate(scan: Date): Date {
  const year = scan.getFullYear();
  const earlier = SURVEY_MONTHS.map((month) => midMonth(year, month)).filter(
    (date) => date.getTime() < scan.getTime(),
  );
  return earlier.at(-1) ?? midMonth(year, SURVEY_MONTHS[0]);
}

function nextSurveyDate(scan: Date): Date {
  const year = scan.getFullYear();
  const later = SURVEY_MONTHS.map((month) => midMonth(year, month)).find(
    (date) => date.getTime() > scan.getTime(),
  );
  return later ?? midMonth(year, SURVEY_MONTHS[SURVEY_MONTHS.length - 1]);
}

function toSnap(
  role: TemporalRole,
  roleLabel: string,
  point: GrowthPoint,
): TemporalSnap {
  return {
    role,
    roleLabel,
    periodLabel: `${point.year}年${point.label}`,
    dbhCm: point.dbhCm,
    heightM: point.heightM,
    kind: point.kind,
    co2Ton: co2At(point.dbhCm, point.heightM),
  };
}

export function classifyGrowth(opts: {
  dbhCm: number | null | undefined;
  note?: string | null;
  yoloConfidence?: number | null;
}): GrowthStatus {
  const dbh = opts.dbhCm;
  if (dbh == null || !(dbh > 0)) return "abnormal";
  const note = opts.note ?? "";
  if (
    note === "no_measurement" ||
    note.includes("wide_caliper") ||
    note.includes("gap")
  ) {
    return "abnormal";
  }
  if (dbh >= 110) return "abnormal";
  if (dbh >= 90 || annualDbhIncrementCm(dbh) <= 0.38) return "stalled";
  if (dbh < 14 || (opts.yoloConfidence != null && opts.yoloConfidence < 0.42)) {
    return "watch";
  }
  return "normal";
}

export function growthFitFromStatus(status: GrowthStatus): GrowthFit {
  if (status === "abnormal") return "off";
  if (status === "normal") return "ok";
  return "watch";
}

export function growthStatusLabel(status: GrowthStatus): string {
  if (status === "normal") return "正常";
  if (status === "stalled") return "停長";
  if (status === "watch") return "觀察";
  return "Warning";
}

function carbonNoteFor(
  status: GrowthStatus,
  carbonDeltaTon: number,
  increment: number,
): string {
  const delta =
    carbonDeltaTon >= 0
      ? `+${carbonDeltaTon.toFixed(3)} t`
      : `−${Math.abs(carbonDeltaTon).toFixed(3)} t`;
  if (status === "abnormal") return `碳匯 ${delta}（不計）`;
  if (status === "stalled") return `${increment.toFixed(2)} cm／年　${delta}`;
  if (status === "watch") return `碳匯 ${delta}（參考）`;
  return `碳匯 ${delta}`;
}

/** Previous Survey → Current Survey → Growth Trend */
export function temporalGrowth(opts: {
  dbhCm: number;
  heightM: number | null;
  heightEstimated: boolean;
  scanIso: string;
  note?: string | null;
  yoloConfidence?: number | null;
}): TemporalGrowth {
  const scan = parseScanDate(opts.scanIso);
  const baseDbh = Math.max(1, opts.dbhCm);
  const measuredHeight = opts.heightEstimated ? null : opts.heightM;
  const increment = annualDbhIncrementCm(baseDbh);
  const prevDate = previousSurveyDate(scan);
  const nextDate = nextSurveyDate(scan);

  const previousPoint = pointAt(
    prevDate,
    scan,
    baseDbh,
    measuredHeight,
    increment,
    `${prevDate.getMonth() + 1}月`,
  );
  const currentPoint: GrowthPoint = {
    year: scan.getFullYear(),
    month: scan.getMonth() + 1,
    label: `${scan.getMonth() + 1}月${scan.getDate()}日`,
    dbhCm: baseDbh,
    heightM: heightAtDbh(baseDbh, measuredHeight, baseDbh),
    kind: "measured",
  };
  const trendPoint = pointAt(
    nextDate,
    scan,
    baseDbh,
    measuredHeight,
    increment,
    `${nextDate.getMonth() + 1}月`,
  );

  const previous = toSnap("previous", "前期", previousPoint);
  const current = toSnap("current", "本期", currentPoint);
  const trend = toSnap("trend", "趨勢", trendPoint);
  const status = classifyGrowth({
    dbhCm: opts.dbhCm,
    note: opts.note,
    yoloConfidence: opts.yoloConfidence,
  });
  const carbonDeltaTon = current.co2Ton - previous.co2Ton;

  return {
    previous,
    current,
    trend,
    points: [previousPoint, currentPoint, trendPoint],
    status,
    fit: growthFitFromStatus(status),
    warning: status === "abnormal",
    expectedIncrementCm: increment,
    periodIncrementCm: current.dbhCm - previous.dbhCm,
    carbonDeltaTon,
    carbonNote: carbonNoteFor(status, carbonDeltaTon, increment),
  };
}

export function formatScanMonthDay(iso: string): string {
  const date = parseScanDate(iso);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
