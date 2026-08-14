import type { ParkSite, ScanPath } from "../data/sites";
import type { ParkInventoryReport } from "../types";
import type { FieldMeasure } from "../hooks/useFieldMeasures";
import { PathTreeMap } from "../components/PathTreeMap";
import { TreeCard } from "../components/TreeCard";
import { exportInventoryCsv } from "../lib/csv";
import { trafficLight } from "../lib/status";

type Props = {
  park: ParkSite;
  path: ScanPath;
  report: ParkInventoryReport;
  field: Record<string, FieldMeasure>;
  onOpenTree: (treeId: string) => void;
};

export function ParkOverview({ park, path, report, field, onOpenTree }: Props) {
  const counts = { green: 0, yellow: 0, red: 0 };
  for (const tree of report.trees) {
    counts[trafficLight(tree.DBH_note)] += 1;
  }
  const measured = Object.values(field).filter((item) => item.dbhCm.trim()).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="kicker">
            {park.name} · {path.name}
          </p>
          <h1>這條路徑上的樹</h1>
          <p className="lede">
            掃描 {report.scan_id} · {report.num_trees} 棵 · 現場已填 {measured} 棵
          </p>
        </div>
        <div className="count-pills">
          <span className="pill is-green">淡綠 {counts.green}</span>
          <span className="pill is-yellow">淡黃 {counts.yellow}</span>
          <span className="pill is-red">淡紅 {counts.red}</span>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => exportInventoryCsv(report, field)}
          >
            匯出 CSV
          </button>
        </div>
      </div>

      <figure className="scan-map">
        <figcaption>演算法俯視圖（樹號 + 胸徑）</figcaption>
        <img
          src={`/scans/${report.scan_id}/maps/tree_id_map_dbh.png`}
          alt={`${report.scan_id} 樹木俯視圖`}
        />
      </figure>

      <div className="overview-grid">
        <section className="park-map">
          <div className="park-map-head">
            <h2>路徑與樹位（OpenStreetMap）</h2>
            <p>
              線是掃描路徑。若你有現場錄製，會顯示你實際走的線。點的顏色就是燈號。
            </p>
          </div>
          <PathTreeMap
            origin={park.origin}
            path={path}
            trees={report.trees}
            onSelect={onOpenTree}
          />
        </section>

        <div className="overview-side">
          <div className="card-grid">
            {report.trees.map((tree) => (
              <TreeCard key={tree.Tree_ID} tree={tree} onOpen={onOpenTree} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
