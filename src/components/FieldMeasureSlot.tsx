type Props = {
  compact?: boolean;
  dbhCm: string;
  note: string;
  onChange: (next: { dbhCm: string; note: string }) => void;
};

export function FieldMeasureSlot({
  compact = false,
  dbhCm,
  note,
  onChange,
}: Props) {
  return (
    <label className={`field-measure ${compact ? "is-compact" : ""}`}>
      <span className="field-label">
        現場手測胸徑
        <em>不覆蓋演算法數字</em>
      </span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="例如 34.2"
        value={dbhCm}
        onChange={(event) => onChange({ dbhCm: event.target.value, note })}
      />
      {compact ? null : (
        <input
          type="text"
          placeholder="現場備註（選填）"
          value={note}
          onChange={(event) => onChange({ dbhCm, note: event.target.value })}
        />
      )}
      {compact ? null : (
        <small>存在這台瀏覽器，可隨 CSV 一起匯出。</small>
      )}
    </label>
  );
}
