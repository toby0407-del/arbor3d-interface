import type { TreeRecord } from "../types";
import { formatDbh, methodLabel } from "../lib/format";
import { trafficLight } from "../lib/status";
import { StatusLight } from "./StatusLight";

type Props = {
  tree: TreeRecord;
  onOpen: (treeId: string) => void;
};

export function TreeCard({ tree, onOpen }: Props) {
  const light = trafficLight(tree.DBH_note);

  return (
    <button
      type="button"
      className={`tree-card is-${light}`}
      onClick={() => onOpen(tree.Tree_ID)}
    >
      <div className="tree-card-top">
        <span className="tree-id">{tree.Tree_ID}</span>
        <StatusLight light={light} size="sm" short />
      </div>
      <div className="tree-dbh">{formatDbh(tree.DBH_cm)}</div>
      <div className="tree-card-foot">
        <span>{methodLabel(tree.DBH_method)}</span>
        <span>弧度 {tree.arc_coverage_deg?.toFixed(1) ?? "—"}°</span>
      </div>
    </button>
  );
}
