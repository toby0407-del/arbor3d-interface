import type { TreeRecord } from "../types";
import { fileName, methodLabel } from "../lib/format";

type Props = {
  tree: TreeRecord;
};

function hash(id: string): number {
  return id.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

export function EvidencePanel({ tree }: Props) {
  const seed = hash(tree.Tree_ID);
  const isCaliper = tree.DBH_method === "caliper";
  const radius = 28 + Math.min(40, (tree.DBH_cm ?? 12) * 0.4);
  const arc = ((tree.arc_coverage_deg ?? 180) / 360) * 2 * Math.PI;
  const lean = ((seed % 9) - 4) * 1.4;

  return (
    <div className="evidence-grid">
      <figure className="evidence-card">
        <figcaption>
          最佳照片
          <small>{fileName(tree.Best_Photo)}</small>
        </figcaption>
        <svg viewBox="0 0 320 220" className="evidence-art" aria-hidden="true">
          <rect width="320" height="220" fill="#c8d4b8" />
          <rect y="150" width="320" height="70" fill="#8a9a74" />
          <circle cx="250" cy="42" r="22" fill="#f3e6c4" opacity="0.8" />
          <ellipse cx={160 + lean} cy="92" rx="54" ry="48" fill="#3f5d46" />
          <ellipse cx={148 + lean} cy="78" rx="36" ry="30" fill="#2f4635" />
          <rect x={156 + lean} y="118" width="10" height="52" fill="#6a4b32" />
          <text x="16" y="208" fill="#1a2216" fontSize="11" opacity="0.55">
            示範佔位 · 真實照片尚未進 Git
          </text>
        </svg>
      </figure>

      <figure className="evidence-card">
        <figcaption>
          YOLO 遮罩
          <small>{fileName(tree.Mask_Path)}</small>
        </figcaption>
        <svg viewBox="0 0 320 220" className="evidence-art is-dark" aria-hidden="true">
          <rect width="320" height="220" fill="#141814" />
          <ellipse
            cx={158 + lean}
            cy="108"
            rx="42"
            ry="78"
            fill="#7cff9a"
            opacity="0.55"
          />
          <rect
            x={153 + lean}
            y="150"
            width="12"
            height="40"
            fill="#7cff9a"
            opacity="0.7"
          />
          <text x="16" y="24" fill="#9cffb0" fontSize="12">
            conf {(tree.YOLO_confidence ?? 0).toFixed(3)} · det {tree.num_detections ?? 0}
          </text>
        </svg>
      </figure>

      <figure className="evidence-card">
        <figcaption>
          胸高剖面
          <small>{fileName(tree.Cross_Section_Image)}</small>
        </figcaption>
        <svg viewBox="0 0 320 220" className="evidence-art" aria-hidden="true">
          <rect width="320" height="220" fill="#11140f" />
          <g transform="translate(160 118)">
            {Array.from({ length: 48 }, (_, i) => {
              const a = (i / 48) * arc - arc / 2;
              const jitter = ((seed + i) % 5) - 2;
              const rr = radius + jitter;
              return (
                <circle
                  key={i}
                  cx={Math.cos(a) * rr}
                  cy={Math.sin(a) * rr}
                  r="2.2"
                  fill="#dcead9"
                />
              );
            })}
            {isCaliper ? (
              <>
                <circle r={radius} fill="none" stroke="#888" strokeDasharray="4 4" />
                <line
                  x1={-radius}
                  x2={radius}
                  y1="0"
                  y2="0"
                  stroke="#7eb6ff"
                  strokeWidth="3"
                  markerStart="url(#arrow)"
                  markerEnd="url(#arrow)"
                />
                <text y="70" textAnchor="middle" fill="#7eb6ff" fontSize="12">
                  卡尺寬度（採用）
                </text>
              </>
            ) : (
              <>
                <circle r={radius} fill="none" stroke="#7cff9a" strokeWidth="2" />
                <text y="70" textAnchor="middle" fill="#7cff9a" fontSize="12">
                  圓擬合
                </text>
              </>
            )}
          </g>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
              <path d="M0,1.5 L8,4 L0,6.5" fill="#7eb6ff" />
            </marker>
          </defs>
          <text x="16" y="24" fill="#c8d4b8" fontSize="12">
            {methodLabel(tree.DBH_method)} · 弧度 {tree.arc_coverage_deg?.toFixed(1)}°
          </text>
        </svg>
      </figure>
    </div>
  );
}
