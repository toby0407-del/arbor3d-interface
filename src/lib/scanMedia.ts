/** 掃描附件放在 public/scans/{scanId}/ 底下，路徑與 JSON 欄位相同。 */
export function scanAssetUrl(
  scanId: string | null | undefined,
  relative: string | null | undefined,
): string | null {
  if (!scanId || !relative) return null;
  const clean = relative.replace(/^\.?\//, "");
  return `/scans/${scanId}/${clean}`;
}
