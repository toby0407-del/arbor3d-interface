import type { ParkSite, ScanPath } from "../data/sites";
import type { ParkInventoryReport } from "../types";
import { ColorLegend } from "../components/ColorLegend";
import { ParkMap } from "../components/ParkMap";
import { PathTreeMap } from "../components/PathTreeMap";
import { TreeCard } from "../components/TreeCard";
import { trafficLight } from "../lib/status";

type Props = {
  park: ParkSite;
  path: ScanPath;
  report: ParkInventoryReport;
  onOpenTree: (treeId: string) => void;
};

export function ParkOverview({ park, path, report, onOpenTree }: Props) {
  const counts = { green: 0, yellow: 0, red: 0 };
  for (const tree of report.trees) {
    counts[trafficLight(tree.DBH_note)] += 1;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="kicker">
            {park.name} · {path.name}
          </p>
          <h1>這條路徑上的樹</h1>
          <p className="lede">
            掃描 {report.scan_id} · {report.num_trees} 棵 · 地圖上的點就是樹的位子
          </p>
        </div>
        <div className="count-pills">
          <span className="pill is-green">淡綠 {counts.green}</span>
          <span className="pill is-yellow">淡黃 {counts.yellow}</span>
          <span className="pill is-red">淡紅 {counts.red}</span>
        </div>
      </div>

      <ColorLegend />

      <div className="overview-grid">
        <section className="park-map">
          <div className="park-map-head">
            <h2>路徑與樹位（OpenStreetMap）</h2>
            <p>
              綠線是這次掃描走的路。點的顏色就是燈號。此掃描原始檔沒有 GPS，樹位先用相對座標放到路徑上，之後換真實定位即可。
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
          <ParkMap trees={report.trees} onSelect={onOpenTree} />
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
