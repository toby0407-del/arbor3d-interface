"""
產出與 Arbor3D 盤點相同風格的圖：
- 路徑圖：X/Y 散點、綠／紅點、不標樹號
- Segmentation：黑底白幹遮罩
- 橫切面：紅點 + 綠圓擬合，點上不編號
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

plt.rcParams["font.sans-serif"] = [
    "Microsoft JhengHei",
    "Microsoft YaHei",
    "SimHei",
    "Noto Sans CJK TC",
    "DejaVu Sans",
]
plt.rcParams["axes.unicode_minus"] = False
plt.rcParams["figure.facecolor"] = "white"
plt.rcParams["axes.facecolor"] = "white"
plt.rcParams["axes.grid"] = True
plt.rcParams["grid.linestyle"] = ":"
plt.rcParams["grid.color"] = "#c8c8c8"


def light_color(note: str, dbh: float) -> str:
    note = note or ""
    if "wide_caliper" in note or "gap" in note or not note:
        return "#d62728"
    if dbh >= 55:
        return "#d62728"
    return "#2ca02c"


def circle_points(cx: float, cy: float, radius: float, arc_deg: float, n: int = 36):
    start = -math.radians(arc_deg) / 2
    pts = []
    for i in range(max(8, n)):
        a = start + (i / max(1, n - 1)) * math.radians(max(40, arc_deg))
        jitter = 0.012 * radius * math.sin(i * 1.7)
        r = max(0.01, radius + jitter)
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts


def draw_path_map(trees: list[dict], scan_id: str, dest: Path) -> None:
    xs = [t["x"] for t in trees]
    ys = [t["y"] for t in trees]
    colors = [light_color(t.get("note", ""), t.get("dbh", 0)) for t in trees]
    y_span = max(8.0, (max(ys) - min(ys)) * 1.15)
    x_span = max(1.6, (max(xs) - min(xs)) * 1.8)
    height = min(14.0, max(8.5, 2.8 + y_span / 8))
    width = 3.35
    fig, ax = plt.subplots(figsize=(width, height), dpi=140)
    ax.scatter(
        xs,
        ys,
        s=92,
        c=colors,
        edgecolors="black",
        linewidths=0.7,
        zorder=3,
    )
    ax.set_xlabel("X (m)")
    ax.set_ylabel("Y (m)")
    ax.set_title(f"Park inventory {scan_id} ({len(trees)} trees)")
    mid_x = (min(xs) + max(xs)) / 2
    ax.set_xlim(mid_x - x_span / 2, mid_x + x_span / 2)
    pad = max(2.0, y_span * 0.06)
    ax.set_ylim(min(ys) - pad, max(ys) + pad)
    ax.grid(True, linestyle=":", linewidth=0.7)
    fig.tight_layout()
    dest.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(dest, bbox_inches="tight")
    plt.close(fig)


def _smooth(values, k: int = 7):
    import numpy as np

    arr = np.asarray(values, dtype=float)
    if arr.size == 0:
        return arr
    k = min(k, max(1, arr.size))
    kernel = np.ones(k) / k
    pad = k // 2
    padded = np.pad(arr, (pad, pad), mode="edge")
    return np.convolve(padded, kernel, mode="valid")[: arr.size]


def raster_trunk(column: list, tree: dict, size: int = 512):
    import numpy as np

    grid = np.zeros((size, size), dtype=np.uint8)
    radius = max(0.06, float(tree.get("dbh", 12)) / 200.0)
    x_lim = max(0.62, radius * 9.0)
    half = radius * 0.92
    cx = size / 2.0
    # 舊批次遮罩是照片裡的一小段樹幹，不是拉滿全圖的橢圓
    y0 = int(size * 0.16)
    y1 = int(size * 0.62)
    offsets = np.zeros(y1 - y0)
    widths = np.full(y1 - y0, half)

    if column:
        xs = np.array([float(p[0]) - float(tree["x"]) for p in column], dtype=float)
        ys = np.array([float(p[1]) - float(tree["y"]) for p in column], dtype=float)
        hs = np.array([float(p[2]) for p in column], dtype=float)
        keep = np.hypot(xs, ys) <= max(0.14, radius * 1.6)
        xs, hs = xs[keep], hs[keep]
        if xs.size >= 20:
            h_mid = float(np.median(hs))
            h0, h1 = h_mid - 0.7, h_mid + 1.15
            in_win = (hs >= h0) & (hs <= h1)
            xs, hs = xs[in_win], hs[in_win]
            n = y1 - y0
            edges = np.linspace(h0, h1, n + 1)
            raw_off = np.zeros(n)
            raw_w = np.full(n, half)
            for i in range(n):
                sel = (hs >= edges[i]) & (hs < edges[i + 1])
                if int(sel.sum()) < 4:
                    continue
                lo = float(np.percentile(xs[sel], 22))
                hi = float(np.percentile(xs[sel], 78))
                raw_off[i] = 0.18 * (0.5 * (lo + hi))
                raw_w[i] = float(np.clip((hi - lo) / 2.0, half * 0.75, half * 1.2))
            offsets = _smooth(raw_off, 11)
            widths = _smooth(raw_w, 11)

    for i, r in enumerate(range(y0, y1)):
        t = i / max(1, y1 - y0 - 1)
        taper = 0.88 + 0.12 * math.sin(t * math.pi)
        w_m = float(widths[i] if i < len(widths) else half) * taper
        off_m = float(offsets[i] if i < len(offsets) else 0.0)
        w_px = max(2, int(round(w_m / (2 * x_lim) * size)))
        c = int(round(cx + off_m / (2 * x_lim) * size))
        grid[r, max(0, c - w_px) : min(size, c + w_px + 1)] = 255

    try:
        from scipy.ndimage import gaussian_filter

        soft = gaussian_filter(grid.astype(float), 1.1)
        grid = np.where(soft > 70, np.uint8(255), np.uint8(0))
    except Exception:
        pass
    return grid


def draw_mask(tree: dict, dest: Path) -> None:
    grid = raster_trunk(tree.get("column") or [], tree)
    dest.parent.mkdir(parents=True, exist_ok=True)
    plt.imsave(dest, grid, cmap="gray", vmin=0, vmax=255)


def draw_slice(tree: dict, dest: Path) -> None:
    pts = tree.get("pts") or []
    cx, cy = tree["x"], tree["y"]
    radius = max(0.04, float(tree.get("dbh", 12)) / 200.0)
    if len(pts) < 6:
        pts = circle_points(cx, cy, radius, float(tree.get("arc", 180)))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    fig, ax = plt.subplots(figsize=(7.1, 6.1), dpi=130)
    circle = Circle(
        (cx, cy),
        radius,
        facecolor="#9fd48a",
        edgecolor="#3d8c40",
        linewidth=1.6,
        alpha=0.45,
        zorder=1,
    )
    ax.add_patch(circle)
    ax.scatter(xs, ys, s=22, c="#d62728", label="胸高切片實際點雲", zorder=3)
    ax.plot(cx, cy, "+", color="#2e7d32", markersize=13, markeredgewidth=2, zorder=4)
    ax.set_aspect("equal", adjustable="box")
    ax.set_xlabel("X(m)")
    ax.set_ylabel("Y(m)")
    dbh = float(tree.get("dbh", 0))
    arc = float(tree.get("arc", 0))
    ax.set_title(
        "胸高切片俯視圖 (由上往下看) - RANSAC 圓形擬合\n"
        f"DBH = {dbh:.1f} 公分，涵蓋角度 = {arc:.0f}°"
    )
    ax.legend(loc="upper right", fontsize=8, framealpha=0.92)
    ax.grid(True, linestyle=":", linewidth=0.7)
    fig.tight_layout()
    dest.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(dest, bbox_inches="tight")
    plt.close(fig)


def normalize_trees(payload: dict) -> tuple[str, list[dict]]:
    scan_id = payload.get("scanId") or payload.get("scan_id") or "scan"
    raw = payload.get("trees") or []
    trees = []
    for tree in raw:
        if "Tree_ID" in tree:
            xyz = tree.get("Local_XYZ_m") or [0, 0, 1.3]
            trees.append(
                {
                    "id": tree["Tree_ID"],
                    "x": float(xyz[0]),
                    "y": float(xyz[1]),
                    "z": float(xyz[2] if len(xyz) > 2 else 1.3),
                    "dbh": float(tree.get("DBH_cm") or 0),
                    "arc": float(tree.get("arc_coverage_deg") or 180),
                    "note": tree.get("DBH_note") or "",
                    "pts": tree.get("pts") or [],
                    "column": tree.get("column") or [],
                }
            )
        else:
            trees.append(tree)
    return scan_id, trees


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("用法: python render_inventory_figures.py <input.json> <outScanDir>")
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = Path(sys.argv[2])
    scan_id, trees = normalize_trees(payload)
    if not trees:
        raise SystemExit("沒有樹可畫")

    only = payload.get("only")
    if only not in ("masks", "slices"):
        draw_path_map(trees, scan_id, out / "maps" / "tree_id_map_dbh.png")
    for tree in trees:
        tid = tree["id"]
        if only not in ("slices",):
            draw_mask(tree, out / "masks" / f"real_tree_mask_{tid}.png")
        if only not in ("masks",):
            draw_slice(tree, out / "dbh" / f"dbh_slice_top_down_{tid}.png")
    print(f"wrote figures for {len(trees)} trees")


if __name__ == "__main__":
    main()
