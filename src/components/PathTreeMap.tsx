import { useMemo, useState } from "react";
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
};

export function PathTreeMap({ trees, selectedId }: Props) {
  const [zoomed, setZoomed] = useState(false);
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
    const mapWidth = 228;
    const rulerGap = 18;
    const rulerWidth = 26;
    const width = mapWidth + rulerGap + rulerWidth;
    const height = Math.round(Math.min(620, Math.max(340, spanY * 26)));
    const toSvg = (x: number, y: number) => ({
      x: ((x - x0) / spanX) * mapWidth,
      y: ((y1 - y) / (y1 - y0)) * height,
    });
    const sorted = [...trees].sort(
      (a, b) => a.Local_XYZ_m[1] - b.Local_XYZ_m[1],
    );
    const line = sorted.map((tree) =>
      toSvg(tree.Local_XYZ_m[0], tree.Local_XYZ_m[1]),
    );
    const distanceM = sorted.reduce((sum, tree, index) => {
      if (index === 0) return 0;
      const prev = sorted[index - 1];
      const dx = tree.Local_XYZ_m[0] - prev.Local_XYZ_m[0];
      const dy = tree.Local_XYZ_m[1] - prev.Local_XYZ_m[1];
      return sum + Math.hypot(dx, dy);
    }, 0);
    return {
      width,
      mapWidth,
      height,
      rulerX: mapWidth + rulerGap,
      line,
      start: line[0],
      end: line[line.length - 1],
      distanceM,
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

  const renderSvg = (className?: string) => (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label="路徑樹位"
      className={className}
    >
      <path d={path} className="path-tree-map-line" />
      <g className="path-tree-map-ruler" aria-hidden="true">
        <line
          className="path-tree-map-ruler-line"
          x1={layout.rulerX}
          y1={layout.end.y}
          x2={layout.rulerX}
          y2={layout.start.y}
        />
        <line
          className="path-tree-map-ruler-tick"
          x1={layout.rulerX - 6}
          y1={layout.start.y}
          x2={layout.rulerX + 6}
          y2={layout.start.y}
        />
        <line
          className="path-tree-map-ruler-tick"
          x1={layout.rulerX - 6}
          y1={layout.end.y}
          x2={layout.rulerX + 6}
          y2={layout.end.y}
        />
        <text x={layout.rulerX + 10} y={layout.start.y + 4}>
          0 m
        </text>
        <text x={layout.rulerX + 10} y={layout.end.y + 4}>
          {layout.distanceM.toFixed(1)} m
        </text>
      </g>
      <g
        className="path-tree-map-endcap is-start"
        transform={`translate(${layout.start.x},${layout.start.y})`}
        aria-label="起點"
      >
        <circle r="11" />
          <text className="path-tree-map-endcap-label is-start" x="18" y="4">
          起
        </text>
      </g>
      <g
        className="path-tree-map-endcap is-end"
        transform={`translate(${layout.end.x},${layout.end.y})`}
        aria-label="終點"
      >
        <rect x="-10" y="-10" width="20" height="20" rx="5" />
        <text className="path-tree-map-endcap-label is-end" x="-18" y="4">
          終
        </text>
      </g>
      {ordered.map((pt) => {
        const on = pt.id === selectedId;
        return (
          <g
            key={pt.id}
            className={`path-tree-map-node is-${pt.light}${on ? " is-on" : ""}`}
            transform={`translate(${pt.x},${pt.y})`}
            aria-label={pt.id}
            aria-current={on ? "true" : undefined}
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
  );

  return (
    <>
      <div className="path-tree-map">
        <button
          type="button"
          className="path-tree-map-zoom"
          aria-label="放大路徑圖"
          title="放大路徑圖"
          onClick={() => setZoomed(true)}
        >
          ＋
        </button>
        <div className="path-tree-map-main">{renderSvg()}</div>
      </div>
      {zoomed ? (
        <div
          className="path-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="放大路徑圖"
          onClick={() => setZoomed(false)}
        >
          <div className="path-lightbox-card" onClick={(event) => event.stopPropagation()}>
            <header>
              <strong>路徑圖</strong>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setZoomed(false)}
              >
                關閉
              </button>
            </header>
            <div className="path-tree-map path-tree-map--zoom">
              <div className="path-tree-map-main">{renderSvg("is-zoom")}</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
