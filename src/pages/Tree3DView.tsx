import { lazy, Suspense } from "react";
import type { TreeRecord } from "../types";
import { StatusLight } from "../components/StatusLight";
import { formatDbh, methodLabel } from "../lib/format";
import { trafficLight } from "../lib/status";

const SuperSplatViewer = lazy(() =>
  import("../components/SuperSplatViewer").then((mod) => ({
    default: mod.SuperSplatViewer,
  })),
);

type Props = {
  tree: TreeRecord;
  onBack: () => void;
};

export function Tree3DView({ tree, onBack }: Props) {
  const light = trafficLight(tree.DBH_note);

  return (
    <div className="page is-splat">
      <div className="splat-bar">
        <button type="button" className="text-btn" onClick={onBack}>
          ← 返回詳情
        </button>
        <div className="splat-meta">
          <strong>{tree.Tree_ID}</strong>
          <span>{formatDbh(tree.DBH_cm)}</span>
          <span>{methodLabel(tree.DBH_method)}</span>
          <StatusLight light={light} size="sm" short />
        </div>
      </div>
      <Suspense fallback={<div className="splat-stage splat-loading">載入 3D 檢視…</div>}>
        <SuperSplatViewer tree={tree} />
      </Suspense>
    </div>
  );
}
