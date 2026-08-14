type Props = {
  compact?: boolean;
};

export function FieldMeasureSlot({ compact = false }: Props) {
  return (
    <label className={`field-measure ${compact ? "is-compact" : ""}`}>
      <span className="field-label">
        現場手測胸徑
        <em>第一版預留</em>
      </span>
      <input type="text" disabled placeholder="尚未填寫" />
      {!compact ? <small>之後由現場人員填入，不覆蓋演算法數字</small> : null}
    </label>
  );
}
