import type { TrafficLight } from "../types";

const ITEMS: { light: TrafficLight; title: string; detail: string }[] = [
  {
    light: "green",
    title: "淡綠",
    detail: "演算法較可信。圓擬合通過，且接近標準 1.3 m 胸高，可作盤點參考。",
  },
  {
    light: "yellow",
    title: "淡黃",
    detail: "有算出數字，但量測高度不是標準 1.3 m，請標註後再使用。",
  },
  {
    light: "red",
    title: "淡紅",
    detail: "卡尺偏寬或量不到。現場再量，不要當正式樹圍。",
  },
];

type Props = {
  compact?: boolean;
};

export function ColorLegend({ compact = false }: Props) {
  return (
    <section className={`color-legend ${compact ? "is-compact" : ""}`}>
      <h2>燈號代表什麼</h2>
      <ul>
        {ITEMS.map((item) => (
          <li key={item.light} className={`legend-item is-${item.light}`}>
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
