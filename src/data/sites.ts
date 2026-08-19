import catalog from "./taiwan_sites.json";
import { bindingHasInventory, bindingsForPark } from "./scanBindings";

export type LatLng = [number, number];
export type SiteKind = "park" | "school";

export type ScanPath = {
  id: string;
  name: string;
  scanId: string | null;
  scanIds: string[];
  hasInventory: boolean;
  note: string;
  polyline: LatLng[];
};

export type ParkSite = {
  id: string;
  name: string;
  kind: SiteKind;
  district: string;
  center: LatLng;
  origin: LatLng;
  keywords: string;
  searchIndex: string;
  paths: ScanPath[];
};

type CatalogItem = {
  id: string;
  name: string;
  kind: SiteKind;
  district: string;
  center: LatLng;
  keywords: string;
};

const emptyPath = (siteId: string): ScanPath => ({
  id: `${siteId}-pending`,
  name: "尚未綁定掃描路徑",
  scanId: null,
  scanIds: [],
  hasInventory: false,
  note: "尚無盤點 JSON。可先現場錄製路線；遠端把檔案放入 src/data/inventories/{scan_id}.json 並在 scanBindings.ts 綁定後，這裡就會出現。",
  polyline: [],
});

function foldSearch(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("台", "臺")
    .replaceAll("巿", "市")
    .replaceAll("臺灣", "台灣");
}

const CITY_ALIASES: Array<[string, string[]]> = [
  ["臺中", ["台中", "taichung"]],
  ["臺北", ["台北", "taipei"]],
  ["新北", ["new taipei"]],
  ["臺南", ["台南", "tainan"]],
  ["高雄", ["kaohsiung"]],
  ["桃園", ["taoyuan"]],
  ["基隆", ["keelung"]],
  ["新竹", ["hsinchu"]],
  ["嘉義", ["chiayi"]],
  ["苗栗", ["miaoli"]],
  ["彰化", ["changhua"]],
  ["南投", ["nantou"]],
  ["雲林", ["yunlin"]],
  ["屏東", ["pingtung"]],
  ["宜蘭", ["yilan"]],
  ["花蓮", ["hualien"]],
  ["臺東", ["台東", "taitung"]],
  ["澎湖", ["penghu"]],
  ["金門", ["kinmen"]],
  ["連江", ["馬祖", "matsu"]],
];

/** 由長到短，方便從「台中惠來」剝出縣市 */
const CITY_FORMS: Array<{ canonical: string; forms: string[] }> = CITY_ALIASES.map(
  ([city, aliases]) => {
    const canonical = foldSearch(city);
    const forms = [canonical, ...aliases.map(foldSearch)].sort(
      (a, b) => b.length - a.length,
    );
    return { canonical, forms };
  },
).sort((a, b) => b.canonical.length - a.canonical.length);

const QUERY_SYNONYMS: Record<string, string[]> = {
  國小: ["國小", "國民小學", "小學"],
  小學: ["國小", "國民小學", "小學"],
  國中: ["國中", "國民中學", "中學"],
  中學: ["國中", "國民中學", "中學", "高中", "高級中學"],
  高中: ["高中", "高級中學"],
  大學: ["大學", "university"],
  專科: ["專科", "學院", "college"],
  公園: ["公園", "park"],
  學校: ["學校", "國小", "國中", "高中", "大學", "school"],
};

function cityAliasBlob(text: string): string {
  const folded = foldSearch(text);
  const extras: string[] = [];
  for (const { canonical, forms } of CITY_FORMS) {
    if (forms.some((form) => folded.includes(form))) {
      extras.push(canonical, ...forms);
    }
  }
  return extras.join(" ");
}

function tokenVariants(token: string): string[] {
  const folded = foldSearch(token);
  const syn = QUERY_SYNONYMS[folded];
  return syn ? syn.map(foldSearch) : [folded];
}

/**
 * 把「台中惠來」「臺中市 惠來公園」拆成可分別比對的關鍵字。
 * 空白、縣市名、行政區後綴都會切開。
 */
export function tokenizeQuery(query: string): string[] {
  let q = foldSearch(query.trim());
  if (!q) return [];

  // 行政區：西屯區、北區…
  q = q.replace(/([\u4e00-\u9fff]{1,4}[縣市])([\u4e00-\u9fff]{1,4}[鄉鎮市區])/g, "$1 $2 ");
  q = q.replace(/([\u4e00-\u9fff]{1,4}[鄉鎮市區])/g, " $1 ");

  const tokens: string[] = [];

  for (let part of q.split(/\s+/)) {
    if (!part) continue;
    let rest = part;
    for (const { canonical, forms } of CITY_FORMS) {
      const hit = forms.find((form) => rest.includes(form));
      if (!hit) continue;
      tokens.push(canonical);
      rest = rest.split(hit).join("");
      // 「臺中市惠來」剝完縣市後可能剩「市惠來」
      rest = rest.replace(/^(市|縣)/, "");
      break;
    }
    rest = rest.trim();
    if (rest) tokens.push(rest);
  }

  // 去重、去掉太短無意義的單字（保留數字／英文）
  const uniq: string[] = [];
  for (const token of tokens) {
    if (!token) continue;
    if (token.length < 2 && !/[a-z0-9]/i.test(token)) continue;
    if (!uniq.includes(token)) uniq.push(token);
  }
  return uniq;
}

function indexMatchesToken(index: string, token: string): boolean {
  return tokenVariants(token).some((variant) => index.includes(variant));
}

function scoreSite(site: ParkSite, tokens: string[]): number {
  const name = foldSearch(site.name);
  const district = foldSearch(site.district);
  let score = 0;
  for (const token of tokens) {
    const variants = tokenVariants(token);
    if (variants.some((v) => name === v)) score += 50;
    else if (variants.some((v) => name.includes(v))) score += 20;
    else if (variants.some((v) => district.includes(v))) score += 8;
    else score += 2;
  }
  if (siteHasInventory(site)) score += 5;
  return score;
}

function toSite(item: CatalogItem): ParkSite {
  const raw = `${item.name} ${item.district} ${item.keywords}`;
  const bound = bindingsForPark(item.name);
  const paths: ScanPath[] =
    bound.length > 0
      ? bound.map((entry) => {
          const ready = bindingHasInventory(entry);
          return {
            id: entry.pathId,
            name: entry.pathName,
            scanId: ready ? entry.scanId : null,
            scanIds: ready ? [entry.scanId] : [],
            hasInventory: ready,
            note: ready
              ? `已載入掃描 ${entry.scanId}。樹位由相對座標放到這條路徑上。`
              : "尚無盤點 JSON。遠端放入 inventories/{scan_id}.json 並綁定後即可進入。",
            polyline: entry.polyline,
          };
        })
      : [emptyPath(item.id)];
  paths.sort((a, b) => Number(a.hasInventory) - Number(b.hasInventory));

  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    district: item.district,
    center: item.center,
    origin: item.center,
    keywords: item.keywords,
    searchIndex: `${foldSearch(raw)} ${cityAliasBlob(raw)}${
      paths.some((path) => path.hasInventory) ? " 已盤點" : ""
    }`,
    paths,
  };
}

export const PARKS: ParkSite[] = (catalog as CatalogItem[]).map(toSite);

export const SITE_COUNTS = {
  total: PARKS.length,
  parks: PARKS.filter((s) => s.kind === "park").length,
  schools: PARKS.filter((s) => s.kind === "school").length,
};

export function findPark(parkId: string): ParkSite | undefined {
  return PARKS.find((park) => park.id === parkId);
}

export function findPath(parkId: string, pathId: string): ScanPath | undefined {
  return findPark(parkId)?.paths.find((path) => path.id === pathId);
}

export function siteHasInventory(site: ParkSite): boolean {
  return site.paths.some((path) => path.hasInventory);
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function searchSites(
  query: string,
  kind: "all" | SiteKind = "all",
): ParkSite[] {
  const tokens = tokenizeQuery(query);
  const matched = PARKS.filter((site) => {
    if (kind !== "all" && site.kind !== kind) return false;
    if (tokens.length === 0) return true;
    // 每個關鍵字都要命中（台中 + 惠來 → 臺中市的惠來公園）
    return tokens.every((token) => indexMatchesToken(site.searchIndex, token));
  });

  if (tokens.length === 0) return matched;
  return matched.sort((a, b) => scoreSite(b, tokens) - scoreSite(a, tokens));
}
