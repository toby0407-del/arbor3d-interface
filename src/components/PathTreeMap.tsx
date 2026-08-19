import { useMemo } from "react";
import { trafficLight } from "../lib/status";
import type { TrafficLight, TreeRecord } from "../types";

const FILL: Record<TrafficLight, string> = {
  green: "#7dae7a",
  yellow: "#d2b56a",
  red: "#d08980",
};

function shortId(id: string) {
  return id.replace(/^Tree_?/i, "") || id;
}

type Props = {
  trees: TreeRecord[];
  selectedId: string | null;
  onPick: (treeId: string) => void;
};

export function PathTreeMap({ trees, selectedId, onPick }: Props) {
  const layout = useMemo(() => {
    if (!trees.length) return null;
    const xs = trees.map((tree) => tree.Local_XYZ_m[0]);
    const ys = trees.map((tree) => tree.Local_XYZ_m[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(2.4, (maxX - minX) * 1.8, 2);
    const spanY = Math.max(6, (maxY - minY) * 1.18);
    const midX = (minX + maxX) / 2;
    const padY = Math.max(1.4, spanY * 0.08);
    const x0 = midX - spanX / 2;
    const y0 = minY - padY;
    const y1 = maxY + padY;
    const width = 240;
    const height = Math.round(Math.min(620, Math.max(340, spanY * 26)));
    const toSvg = (x: number, y: number) => ({
      x: ((x - x0) / spanX) * width,
      y: ((y1 - y) / (y1 - y0)) * height,
    });
    const sorted = [...trees].sort(
      (a, b) => a.Local_XYZ_m[1] - b.Local_XYZ_m[1],
    );
    return {
      width,
      height,
      line: sorted.map((tree) =>
        toSvg(tree.Local_XYZ_m[0], tree.Local_XYZ_m[1]),
      ),
      pts: trees.map((tree) => ({
        id: tree.Tree_ID,
        light: trafficLight(tree.DBH_note),
        ...toSvg(tree.Local_XYZ_m[0], tree.Local_XYZ_m[1]),
      })),
    };
  }, [trees]);

  if (!layout) {
    return <div className="path-db-empty">尚無路徑圖</div>;
  }

  const path = layout.line
    .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
    .join(" ");
  const ordered = [...layout.pts].sort((a, b) =>
    a.id === selectedId ? 1 : b.id === selectedId ? -1 : 0,
  );

  return (
    <div className="path-tree-map">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label="路徑樹位"
      >
        <path d={path} className="path-tree-map-line" />
        {ordered.map((pt) => {
          const on = pt.id === selectedId;
          return (
            <g
              key={pt.id}
              className={`path-tree-map-node is-${pt.light}${on ? " is-on" : ""}`}
              transform={`translate(${pt.x},${pt.y})`}
              onClick={() => onPick(pt.id)}
              role="button"
              tabIndex={0}
              aria-label={pt.id}
              aria-current={on ? "true" : undefined}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onPick(pt.id);
                }
              }}
            >
              {on ? <circle className="path-tree-map-pulse" r="18" /> : null}
              <circle
                className="path-tree-map-dot"
                r={on ? 10 : 7}
                fill={FILL[pt.light]}
              />
              <text y={on ? -18 : -13}>{shortId(pt.id)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
