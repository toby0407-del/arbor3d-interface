import type { TrafficLight } from "../types";

const ITEMS: { light: TrafficLight; title: string; detail: string }[] = [
  {
    light: "green",
    title: "淡綠",
    detail: "可信，可作盤點參考。",
  },
  {
    light: "yellow",
    title: "淡黃",
    detail: "有數字，但非標準 1.3 m。",
  },
  {
    light: "red",
    title: "淡紅",
    detail: "勿當正式樹圍，現場再量。",
  },
];

type Props = {
  compact?: boolean;
};

export function ColorLegend({ compact = false }: Props) {
  return (
    <section className={`color-legend ${compact ? "is-compact" : ""}`}>
      {compact ? null : <h2>燈號</h2>}
      <ul>
        {ITEMS.map((item) => (
          <li key={item.light} className={`legend-item is-${item.light}`}>
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>{item.title}</strong>
              {compact ? null : <p>{item.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
