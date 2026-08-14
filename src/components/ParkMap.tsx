import type { TreeRecord } from "../types";
import { trafficLight } from "../lib/status";

type Props = {
  trees: TreeRecord[];
  selectedId?: string;
  onSelect: (treeId: string) => void;
};

export function ParkMap({ trees, selectedId, onSelect }: Props) {
  const xs = trees.map((t) => t.Local_XYZ_m[0]);
  const ys = trees.map((t) => t.Local_XYZ_m[1]);
  const padY = 5;
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  const minY = Math.min(...ys) - padY;
  const maxY = Math.max(...ys) + padY;
  const spanY = Math.max(maxY - minY, 8);
  // 這批樹沿步道排成一列，補寬 X 以免圖變超高、下面的樹被裁掉
  const minSpanX = spanY / 1.55;
  const spanX0 = Math.max(maxX - minX, 1);
  if (spanX0 < minSpanX) {
    const extra = (minSpanX - spanX0) / 2;
    minX -= extra;
    maxX += extra;
  }
  const spanX = maxX - minX;
  const width = 400;
  const height = 500;
  const toX = (x: number) => ((x - minX) / spanX) * width;
  const toY = (y: number) => ((maxY - y) / spanY) * height;

  return (
    <div className="park-map">
      <div className="park-map-head">
        <h2>相對座標俯視圖</h2>
        <p>X / Y 公尺 · 點的大小跟胸徑成比例 · 可點選</p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="公園樹木俯視圖"
      >
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#d7d0c0" strokeWidth="0.8" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="#f7f1e4" />
        <rect width={width} height={height} fill="url(#grid)" />
        <path
          d={`M ${toX(xs.reduce((a, b) => a + b, 0) / xs.length)} ${toY(maxY - 1.5)} L ${toX(xs.reduce((a, b) => a + b, 0) / xs.length)} ${toY(minY + 1.5)}`}
          stroke="#c8bda4"
          strokeWidth="14"
          strokeLinecap="round"
          opacity="0.4"
        />
        {trees.map((tree) => {
          const light = trafficLight(tree.DBH_note);
          const cx = toX(tree.Local_XYZ_m[0]);
          const cy = toY(tree.Local_XYZ_m[1]);
          const r = Math.max(7, Math.min(18, (tree.DBH_cm ?? 10) / 5));
          const selected = selectedId === tree.Tree_ID;
          return (
            <g
              key={tree.Tree_ID}
              className={`map-tree is-${light} ${selected ? "is-selected" : ""}`}
              onClick={() => onSelect(tree.Tree_ID)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(tree.Tree_ID);
                }
              }}
            >
              <circle cx={cx} cy={cy} r={r + 4} className="map-halo" />
              <circle cx={cx} cy={cy} r={r} className="map-dot" />
              <text x={cx + r + 6} y={cy - 4} className="map-id">
                {tree.Tree_ID.replace("Tree_", "")}
              </text>
              <text x={cx + r + 6} y={cy + 10} className="map-dbh">
                {tree.DBH_cm?.toFixed(1)} cm
              </text>
            </g>
          );
        })}
      </svg>
      <div className="axis-note">北 ↑ · 單位 m · 此掃描無 GPS，僅相對座標</div>
    </div>
  );
}
