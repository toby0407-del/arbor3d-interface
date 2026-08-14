import type { TreeRecord } from "../types";
import { EvidencePanel } from "../components/EvidencePanel";
import { FieldMeasureSlot } from "../components/FieldMeasureSlot";
import { StatusLight } from "../components/StatusLight";
import { formatConfidence, formatDbh, formatXyz, methodLabel } from "../lib/format";
import { lightLabel, trafficLight } from "../lib/status";

type Props = {
  tree: TreeRecord;
  onBack: () => void;
  onOpen3d: () => void;
};

export function TreeDetail({ tree, onBack, onOpen3d }: Props) {
  const light = trafficLight(tree.DBH_note);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <button type="button" className="text-btn" onClick={onBack}>
            ← 返回總覽
          </button>
          <h1>{tree.Tree_ID}</h1>
          <p className="lede">{lightLabel(light)}</p>
        </div>
        <StatusLight light={light} />
      </div>

      <div className="detail-layout">
        <EvidencePanel tree={tree} />

        <aside className="measure-panel">
          <div className={`dbh-hero is-${light}`}>
            <span>胸徑 DBH</span>
            <strong>{formatDbh(tree.DBH_cm)}</strong>
            <em>{methodLabel(tree.DBH_method)}</em>
          </div>

          <dl className="spec-list">
            <div>
              <dt>弧度</dt>
              <dd>
                {tree.arc_coverage_deg?.toFixed(1) ?? "—"}°
                {tree.arc_coverage_deg != null && tree.arc_coverage_deg < 120 ? (
                  <small className="warn-inline">低於 120°，改走卡尺</small>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>標準 1.3 m</dt>
              <dd>{tree.dbh_is_strict_breast_height ? "是" : "否（非標準胸高）"}</dd>
            </div>
            <div>
              <dt>相對座標</dt>
              <dd className="mono">{formatXyz(tree.Local_XYZ_m)}</dd>
            </div>
            <div>
              <dt>YOLO 信心</dt>
              <dd>
                {formatConfidence(tree.YOLO_confidence)} · {tree.num_detections ?? 0}{" "}
                次偵測
              </dd>
            </div>
            <div>
              <dt>註記</dt>
              <dd>{tree.DBH_note || "ok"}</dd>
            </div>
          </dl>

          {light === "red" ? (
            <p className="red-banner">這個數字不要當正式樹圍，請現場再量。</p>
          ) : null}

          <FieldMeasureSlot />

          <button type="button" className="primary-btn" onClick={onOpen3d}>
            打開 3D 檢視
          </button>
        </aside>
      </div>
    </div>
  );
}
