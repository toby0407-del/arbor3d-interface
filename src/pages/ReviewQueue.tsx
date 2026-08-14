import type { ParkInventoryReport } from "../types";
import { FieldMeasureSlot } from "../components/FieldMeasureSlot";
import { StatusLight } from "../components/StatusLight";
import type { FieldMeasure } from "../hooks/useFieldMeasures";
import { exportInventoryCsv } from "../lib/csv";
import { formatDbh, methodLabel } from "../lib/format";
import { isReviewTree, reviewReason } from "../lib/status";

type Props = {
  report: ParkInventoryReport;
  field: Record<string, FieldMeasure>;
  onFieldChange: (treeId: string, next: { dbhCm: string; note: string }) => void;
  onOpenTree: (treeId: string) => void;
};

export function ReviewQueue({
  report,
  field,
  onFieldChange,
  onOpenTree,
}: Props) {
  const rows = report.trees.filter(isReviewTree);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="kicker">紅燈樹</p>
          <h1>待複核</h1>
          <p className="lede">
            {rows.length} 棵需現場再量。淡紅燈數字僅供參考，不要寫進正式盤點。
          </p>
        </div>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => exportInventoryCsv(report, field)}
        >
          匯出 CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="empty">這一趟沒有紅燈樹。</p>
      ) : (
        <div className="review-table">
          <div className="review-head">
            <span>樹號</span>
            <span>胸徑</span>
            <span>原因</span>
            <span>現場手測</span>
            <span />
          </div>
          {rows.map((tree) => (
            <div key={tree.Tree_ID} className="review-row">
              <div className="review-id">
                <strong>{tree.Tree_ID}</strong>
                <StatusLight light="red" size="sm" short />
              </div>
              <div>
                <div className="review-dbh">{formatDbh(tree.DBH_cm)}</div>
                <small>{methodLabel(tree.DBH_method)}</small>
              </div>
              <p className="review-reason">{reviewReason(tree)}</p>
              <FieldMeasureSlot
                compact
                dbhCm={field[tree.Tree_ID]?.dbhCm ?? ""}
                note={field[tree.Tree_ID]?.note ?? ""}
                onChange={(next) => onFieldChange(tree.Tree_ID, next)}
              />
              <button
                type="button"
                className="ghost-btn"
                onClick={() => onOpenTree(tree.Tree_ID)}
              >
                看詳情
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
