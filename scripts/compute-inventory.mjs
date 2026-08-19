/**
 * 從去噪 PLY 分出樹幹、寫出樹身分 JSON。
 * 用法: node scripts/compute-inventory.mjs <jobDir> <scanId> [pathId]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const refreshMode = String(process.argv[2] || "").startsWith("--refresh-")
  ? process.argv[2]
  : "";
const refreshPhotosOnly = refreshMode === "--refresh-photos";
const refreshMasksOnly = refreshMode === "--refresh-masks";
const jobDir = refreshMode ? "" : process.argv[2];
const scanId = refreshMode ? process.argv[3] : process.argv[3];
const pathId = refreshMode ? "" : process.argv[4] || "";

if (!scanId || (!refreshMode && !jobDir)) {
  console.error("用法: node scripts/compute-inventory.mjs <jobDir> <scanId> [pathId]");
  console.error("   或: node scripts/compute-inventory.mjs --refresh-photos <scanId>   （重畫點雲側視）");
  console.error("   或: node scripts/compute-inventory.mjs --refresh-masks <scanId>");
  process.exit(1);
}

function log(msg) {
  console.log(`[compute ${scanId}] ${msg}`);
}

function typeSize(type) {
  if (type === "char" || type === "uchar" || type === "int8" || type === "uint8") return 1;
  if (type === "short" || type === "ushort" || type === "int16" || type === "uint16") return 2;
  if (type === "double" || type === "float64") return 8;
  return 4;
}

function readNum(view, offset, type, le) {
  const size = typeSize(type);
  let value = 0;
  if (type === "uchar" || type === "uint8") value = view.getUint8(offset);
  else if (type === "char" || type === "int8") value = view.getInt8(offset);
  else if (type === "ushort" || type === "uint16") value = view.getUint16(offset, le);
  else if (type === "short" || type === "int16") value = view.getInt16(offset, le);
  else if (type === "uint" || type === "uint32") value = view.getUint32(offset, le);
  else if (type === "int" || type === "int32") value = view.getInt32(offset, le);
  else if (type === "double" || type === "float64") value = view.getFloat64(offset, le);
  else value = view.getFloat32(offset, le);
  return { value, next: offset + size };
}

function parseHeader(text) {
  const headerEnd = text.indexOf("end_header");
  if (headerEnd < 0) throw new Error("PLY 缺少 end_header");
  const header = text.slice(0, headerEnd);
  const nl = text.indexOf("\n", headerEnd);
  const headerBytes = nl >= 0 ? nl + 1 : headerEnd + "end_header".length;
  let format = "binary_little_endian";
  let vertexCount = 0;
  const props = [];
  let inVertex = false;
  for (const raw of header.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("format ")) {
      if (line.includes("ascii")) format = "ascii";
      else if (line.includes("big")) format = "binary_big_endian";
      else format = "binary_little_endian";
    } else if (line.startsWith("element vertex")) {
      vertexCount = Number(line.split(/\s+/)[2]);
      inVertex = true;
    } else if (line.startsWith("element ")) {
      inVertex = false;
    } else if (inVertex && line.startsWith("property ")) {
      const parts = line.split(/\s+/);
      props.push({ type: parts[1], name: parts[parts.length - 1] });
    }
  }
  if (!vertexCount) throw new Error("PLY 沒有 vertex");
  return { format, vertexCount, props, headerBytes };
}

async function findPly(dir) {
  const names = await fs.readdir(dir, { recursive: true });
  const ply = names.map(String).find((n) => /\.ply$/i.test(n));
  if (!ply) throw new Error(`找不到 .ply：${dir}`);
  return path.join(dir, ply);
}

async function loadXyz(file, maxPoints = 120_000) {
  const buf = await fs.readFile(file);
  const headText = new TextDecoder("utf-8").decode(buf.subarray(0, 8192));
  const { format, vertexCount, props, headerBytes } = parseHeader(headText);
  const xi = props.findIndex((p) => p.name === "x");
  const yi = props.findIndex((p) => p.name === "y");
  const zi = props.findIndex((p) => p.name === "z");
  if (xi < 0 || yi < 0 || zi < 0) throw new Error("PLY 缺少 xyz");
  const step = Math.max(1, Math.ceil(vertexCount / maxPoints));
  const count = Math.ceil(vertexCount / step);
  const xyz = new Float32Array(count * 3);
  let out = 0;
  if (format === "ascii") {
    const text = new TextDecoder("utf-8").decode(buf).slice(headerBytes);
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < vertexCount && out < count; i += step) {
      const parts = (lines[i] || "").trim().split(/\s+/);
      const o = out * 3;
      xyz[o] = Number(parts[xi]);
      xyz[o + 1] = Number(parts[yi]);
      xyz[o + 2] = Number(parts[zi]);
      if (Number.isFinite(xyz[o])) out += 1;
    }
  } else {
    const le = format === "binary_little_endian";
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const stride = props.reduce((sum, p) => sum + typeSize(p.type), 0);
    for (let i = 0; i < vertexCount && out < count; i += step) {
      let offset = headerBytes + i * stride;
      const values = new Array(props.length);
      for (let p = 0; p < props.length; p += 1) {
        const read = readNum(view, offset, props[p].type, le);
        values[p] = read.value;
        offset = read.next;
      }
      const o = out * 3;
      xyz[o] = values[xi];
      xyz[o + 1] = values[yi];
      xyz[o + 2] = values[zi];
      if (Number.isFinite(xyz[o])) out += 1;
    }
  }
  return { xyz, count: out };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[i];
}

function pickUpAxis(xyz, count) {
  const cols = [[], [], []];
  for (let i = 0; i < count; i += 1) {
    cols[0].push(xyz[i * 3]);
    cols[1].push(xyz[i * 3 + 1]);
    cols[2].push(xyz[i * 3 + 2]);
  }
  const stats = cols.map((col) => {
    const sorted = [...col].sort((a, b) => a - b);
    return { min: sorted[0], max: sorted[sorted.length - 1], p05: percentile(sorted, 0.05), p95: percentile(sorted, 0.95) };
  });
  const spans = stats.map((s) => s.p95 - s.p05);
  // 樹高通常 3–25 m，且比路徑短
  let up = 2;
  let best = Infinity;
  for (let a = 0; a < 3; a += 1) {
    const h = spans[a];
    if (h >= 2 && h <= 28 && h < best) {
      best = h;
      up = a;
    }
  }
  if (best === Infinity) {
    up = spans.indexOf(Math.min(...spans));
  }
  return { up, stats, spans };
}

function clusterTrees(xyz, count, up) {
  const hx = up === 0 ? 1 : 0;
  const hy = up === 2 ? 1 : 2;
  const ups = [];
  for (let i = 0; i < count; i += 1) ups.push(xyz[i * 3 + up]);
  ups.sort((a, b) => a - b);
  const ground = percentile(ups, 0.08);
  const z0 = ground + 0.9;
  const z1 = ground + 1.7;
  const CELL = 0.32;
  const cells = new Map();
  for (let i = 0; i < count; i += 1) {
    const h = xyz[i * 3 + up];
    if (h < z0 || h > z1) continue;
    const x = xyz[i * 3 + hx];
    const y = xyz[i * 3 + hy];
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    const key = `${cx},${cy}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { cx, cy, n: 0, sx: 0, sy: 0, sz: 0, pts: [] };
      cells.set(key, cell);
    }
    cell.n += 1;
    cell.sx += x;
    cell.sy += y;
    cell.sz += h;
    if (cell.pts.length < 80) cell.pts.push([x, y]);
  }

  const occupied = [...cells.values()].filter((c) => c.n >= 3);
  const index = new Map(occupied.map((c) => [`${c.cx},${c.cy}`, c]));
  const seen = new Set();
  const groups = [];
  for (const start of occupied) {
    const id = `${start.cx},${start.cy}`;
    if (seen.has(id)) continue;
    const queue = [start];
    seen.add(id);
    const members = [];
    while (queue.length) {
      const cur = queue.pop();
      members.push(cur);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const k = `${cur.cx + dx},${cur.cy + dy}`;
          if (seen.has(k) || !index.has(k)) continue;
          seen.add(k);
          queue.push(index.get(k));
        }
      }
    }
    groups.push(members);
  }

  const trees = [];
  for (const members of groups) {
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    const pts = [];
    for (const m of members) {
      n += m.n;
      sx += m.sx;
      sy += m.sy;
      sz += m.sz;
      pts.push(...m.pts);
    }
    if (n < 18 || pts.length < 8) continue;
    const mx = sx / n;
    const my = sy / n;
    const mz = sz / n;
    let rSum = 0;
    const angles = [];
    for (const [x, y] of pts) {
      const dx = x - mx;
      const dy = y - my;
      rSum += Math.hypot(dx, dy);
      angles.push(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360);
    }
    const radius = rSum / pts.length;
    const dbh = Math.max(6, Math.min(140, radius * 200));
    if (radius < 0.04 || radius > 1.1) continue;
    angles.sort((a, b) => a - b);
    let maxGap = 0;
    for (let i = 0; i < angles.length; i += 1) {
      const next = i + 1 === angles.length ? angles[0] + 360 : angles[i + 1];
      maxGap = Math.max(maxGap, next - angles[i]);
    }
    const arc = Math.max(20, Math.min(360, 360 - maxGap));
    trees.push({
      x: mx,
      y: my,
      z: mz - ground,
      along: mx * 0.2 + my,
      dbh,
      arc,
      n,
      pts,
    });
  }

  trees.sort((a, b) => a.along - b.along);
  const merged = [];
  for (const tree of trees) {
    const prev = merged[merged.length - 1];
    if (prev && Math.hypot(tree.x - prev.x, tree.y - prev.y) < 0.85) {
      if (tree.n > prev.n) merged[merged.length - 1] = tree;
      continue;
    }
    merged.push(tree);
  }
  merged.sort((a, b) => b.n - a.n);
  const keep = merged.slice(0, 30).sort((a, b) => a.along - b.along);
  return { ground, trees: keep };
}

function padId(i) {
  return `Tree_${String(i).padStart(3, "0")}`;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgb) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    rgb.copy(raw, y * stride + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeRgb(width, height, r, g, b) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
  }
  return { width, height, rgb };
}

function setPx(img, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 3;
  img.rgb[i] = r;
  img.rgb[i + 1] = g;
  img.rgb[i + 2] = b;
}

function fillRect(img, x0, y0, w, h, r, g, b) {
  const x1 = Math.min(img.width, x0 + w);
  const y1 = Math.min(img.height, y0 + h);
  for (let y = Math.max(0, y0); y < y1; y += 1) {
    for (let x = Math.max(0, x0); x < x1; x += 1) setPx(img, x, y, r, g, b);
  }
}

function drawDot(img, x, y, radius, r, g, b) {
  const rr = Math.max(1, Math.round(radius));
  for (let dy = -rr; dy <= rr; dy += 1) {
    for (let dx = -rr; dx <= rr; dx += 1) {
      if (dx * dx + dy * dy <= rr * rr) {
        setPx(img, Math.round(x + dx), Math.round(y + dy), r, g, b);
      }
    }
  }
}

function drawCircle(img, cx, cy, radius, r, g, b) {
  const steps = Math.max(24, Math.round(radius * 6));
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    setPx(
      img,
      Math.round(cx + Math.cos(a) * radius),
      Math.round(cy + Math.sin(a) * radius),
      r,
      g,
      b,
    );
  }
}

const FONT_5X7 = {
  "0": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "11110", "10001", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  E: ["11111", "10000", "11110", "10000", "10000", "10000", "11111"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  D: ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  M: ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  e: ["00000", "01110", "10001", "11111", "10000", "10001", "01110"],
  r: ["00000", "10110", "11001", "10000", "10000", "10000", "10000"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function drawText(img, x, y, text, scale, r, g, b) {
  let ox = x;
  for (const ch of text) {
    const glyph = FONT_5X7[ch] || FONT_5X7[" "];
    for (let gy = 0; gy < 7; gy += 1) {
      for (let gx = 0; gx < 5; gx += 1) {
        if (glyph[gy][gx] !== "1") continue;
        fillRect(img, ox + gx * scale, y + gy * scale, scale, scale, r, g, b);
      }
    }
    ox += 6 * scale;
  }
}

function fitBounds(points, pad = 0.15) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) {
    minX = -1;
    minY = -1;
    maxX = 1;
    maxY = 1;
  }
  const dx = Math.max(0.4, maxX - minX);
  const dy = Math.max(0.4, maxY - minY);
  return {
    minX: minX - dx * pad,
    minY: minY - dy * pad,
    maxX: maxX + dx * pad,
    maxY: maxY + dy * pad,
  };
}

function project(bounds, x, y, width, height, margin = 36) {
  const sx = (width - margin * 2) / (bounds.maxX - bounds.minX);
  const sy = (height - margin * 2) / (bounds.maxY - bounds.minY);
  const s = Math.min(sx, sy);
  return {
    x: Math.round(margin + (x - bounds.minX) * s),
    y: Math.round(height - margin - (y - bounds.minY) * s),
  };
}

async function writePngFile(file, img) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, encodePng(img.width, img.height, img.rgb));
}

function drawPathMap(trees) {
  const img = makeRgb(920, 560, 243, 238, 227);
  fillRect(img, 0, 0, 920, 48, 45, 74, 53);
  drawText(img, 24, 16, "TREE ID MAP", 3, 255, 255, 255);
  const pts = trees.map((t) => [t.x, t.y]);
  const bounds = fitBounds(pts, 0.22);
  const pixels = trees.map((t) => project(bounds, t.x, t.y, img.width, img.height, 70));
  for (let i = 1; i < pixels.length; i += 1) {
    const a = pixels[i - 1];
    const b = pixels[i];
    const steps = Math.max(8, Math.hypot(b.x - a.x, b.y - a.y));
    for (let s = 0; s <= steps; s += 1) {
      const x = a.x + ((b.x - a.x) * s) / steps;
      const y = a.y + ((b.y - a.y) * s) / steps;
      drawDot(img, x, y, 2, 255, 138, 0);
    }
  }
  for (let i = 0; i < trees.length; i += 1) {
    const p = pixels[i];
    const red = trees[i].dbh >= 55 || trees[i].arc < 120;
    drawDot(img, p.x, p.y, 9, red ? 214 : 44, red ? 39 : 160, red ? 40 : 44);
    drawDot(img, p.x, p.y, 8, red ? 214 : 44, red ? 39 : 160, red ? 40 : 44);
  }
  return img;
}

function drawMask(tree) {
  const img = makeRgb(480, 640, 0, 0, 0);
  const column = tree.column && tree.column.length ? tree.column : [];
  const pts = column.length
    ? column.map((p) => [p[0] - tree.x, p[2]])
    : tree.pts.map(([x]) => [x - tree.x, tree.z]);
  const bounds = fitBounds(pts.length ? pts : [[0, tree.z]], 0.35);
  for (const [x, h] of pts) {
    const p = project(bounds, x, h, img.width, img.height, 12);
    drawDot(img, p.x, p.y, 3, 255, 255, 255);
  }
  return img;
}

function drawSlice(tree) {
  const img = makeRgb(640, 560, 255, 255, 255);
  const pts = tree.pts.length ? tree.pts : [[tree.x, tree.y]];
  const bounds = fitBounds(pts, 0.45);
  const c = project(bounds, tree.x, tree.y, img.width, img.height, 48);
  const radiusPx = Math.max(18, Math.min(110, tree.dbh * 1.1));
  for (let r = radiusPx; r >= 0; r -= 1) {
    drawCircle(img, c.x, c.y, r, 159, 212, 138);
  }
  drawCircle(img, c.x, c.y, radiusPx, 61, 140, 64);
  for (const [x, y] of pts) {
    const p = project(bounds, x, y, img.width, img.height, 48);
    drawDot(img, p.x, p.y, 3, 214, 39, 40);
  }
  drawDot(img, c.x, c.y, 4, 46, 125, 50);
  return img;
}

function drawPreview(xyz, count, tree, up, hx, hy) {
  const img = makeRgb(480, 640, 18, 22, 16);
  const collect = (radius) => {
    const near = [];
    for (let i = 0; i < count; i += 1) {
      const x = xyz[i * 3 + hx];
      const y = xyz[i * 3 + hy];
      const h = xyz[i * 3 + up];
      if (Math.hypot(x - tree.x, y - tree.y) > radius) continue;
      near.push([x - tree.x, h, y - tree.y]);
    }
    return near;
  };
  let near = collect(2.8);
  if (near.length < 500) near = collect(6.0);
  if (!near.length) return img;
  const pts = near.map((p) => [p[0], p[1]]);
  const bounds = fitBounds(pts, 0.12);
  for (const [x, h, side] of near) {
    const p = project(bounds, x, h, img.width, img.height, 24);
    const shade = Math.max(70, Math.min(180, 110 + side * 40));
    drawDot(img, p.x, p.y, 1, shade, Math.min(255, shade + 20), Math.max(0, shade - 10));
  }
  return img;
}

async function listImages(dir) {
  try {
    const names = await fs.readdir(dir, { recursive: true });
    return names
      .map(String)
      .filter((n) => /\.(jpe?g|png|webp)$/i.test(n) && !n.startsWith("."))
      .sort()
      .map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

function isSceneDumpImage(file) {
  const name = path.basename(file).toLowerCase();
  return /^(lidar|gauss|filter|ray)[_.-]/i.test(name) || /^gauss\./i.test(name);
}

function namedTreePhoto(files, treeId) {
  const want = treeId.toLowerCase();
  return (
    files.find((file) => path.basename(file, path.extname(file)).toLowerCase() === want) ||
    null
  );
}

function photoForTree(files, treeId, index, treeCount) {
  const named = namedTreePhoto(files, treeId);
  if (named) return named;
  const usable = files.filter((file) => !isSceneDumpImage(file));
  if (usable.length < treeCount || treeCount <= 0) return null;
  const pick =
    treeCount === 1
      ? 0
      : Math.round((index * (usable.length - 1)) / (treeCount - 1));
  return usable[pick] || null;
}

async function copyFirstPly(fromDir, destFile) {
  try {
    const src = await findPly(fromDir);
    await fs.mkdir(path.dirname(destFile), { recursive: true });
    await fs.copyFile(src, destFile);
    return true;
  } catch {
    return false;
  }
}

async function writeBindings(nextPathId, nextScanId) {
  if (!nextPathId || !nextScanId) return;
  const file = path.join(root, "public", "scans", "_bindings.json");
  let current = {};
  try {
    current = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    current = {};
  }
  current[nextPathId] = nextScanId;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(current, null, 2), "utf8");
}

function treeNotes(tree) {
  const notes = [];
  if (tree.arc < 120) notes.push("gap");
  if (tree.dbh >= 55) notes.push("wide_caliper");
  notes.push("not_1.3m");
  return notes.join(",");
}

function attachColumns(xyz, count, trees, up, hx, hy) {
  for (const tree of trees) tree.column = [];
  const stride = Math.max(1, Math.floor(count / 220000));
  for (let i = 0; i < count; i += stride) {
    const x = xyz[i * 3 + hx];
    const y = xyz[i * 3 + hy];
    const h = xyz[i * 3 + up];
    let best = -1;
    let bestD = Infinity;
    for (let t = 0; t < trees.length; t += 1) {
      const maxR = Math.max(0.42, (trees[t].dbh || 12) / 200 + 0.18);
      const d = Math.hypot(x - trees[t].x, y - trees[t].y);
      if (d <= maxR && d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best >= 0 && trees[best].column.length < 2600) {
      trees[best].column.push([x, y, h]);
    }
  }
}

function spawnOnce(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: root, windowsHide: true });
    let err = "";
    let out = "";
    child.stderr.on("data", (b) => {
      err += b.toString();
    });
    child.stdout.on("data", (b) => {
      out += b.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `${bin} exit ${code}`));
    });
  });
}

async function runPython(args) {
  const bins = process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"];
  let lastErr = new Error("找不到 Python");
  for (const bin of bins) {
    try {
      return await spawnOnce(bin, args);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function renderOfficialFigures(outScan, trees, only = "") {
  const payload = {
    scanId,
    only: only || undefined,
    trees: trees.map((tree, i) => ({
      id: tree.id || padId(i + 1),
      x: tree.x,
      y: tree.y,
      z: tree.z,
      dbh: tree.dbh,
      arc: tree.arc,
      note: treeNotes(tree),
      pts: tree.pts,
      column: (tree.column || []).slice(0, 2600),
    })),
  };
  const spec = path.join(outScan, "_figure_spec.json");
  await fs.writeFile(spec, JSON.stringify(payload), "utf8");
  try {
    const out = await runPython([
      path.join(root, "scripts", "render_inventory_figures.py"),
      spec,
      outScan,
    ]);
    if (out) log(out);
  } catch (err) {
    log(`Python 繪圖失敗，改用後備圖：${err instanceof Error ? err.message : err}`);
    await writePngFile(path.join(outScan, "maps", "tree_id_map_dbh.png"), drawPathMap(trees));
    for (let i = 0; i < trees.length; i += 1) {
      const id = padId(i + 1);
      await writePngFile(
        path.join(outScan, "masks", `real_tree_mask_${id}.png`),
        drawMask(trees[i]),
      );
      await writePngFile(
        path.join(outScan, "dbh", `dbh_slice_top_down_${id}.png`),
        drawSlice(trees[i]),
      );
    }
  } finally {
    await fs.unlink(spec).catch(() => {});
  }
}

async function main() {
  const denoisedDir = path.join(jobDir, "denoised");
  const gaussianDir = path.join(jobDir, "gaussian");
  const rawDir = path.join(jobDir, "raw");
  log("讀取去噪點雲…");
  const ply = await findPly(denoisedDir);
  const { xyz, count } = await loadXyz(ply);
  log(`點雲 ${count.toLocaleString("zh-TW")} 點`);
  const { up } = pickUpAxis(xyz, count);
  const hx = up === 0 ? 1 : 0;
  const hy = up === 2 ? 1 : 2;
  log("切 1.3 m 高度、分出樹幹…");
  const { trees } = clusterTrees(xyz, count, up);
  if (trees.length === 0) {
    throw new Error("沒有切出樹幹。請確認去噪 PLY 是路邊樹列點雲。");
  }
  log(`找到 ${trees.length} 棵樹身分`);
  attachColumns(xyz, count, trees, up, hx, hy);

  const outScan = path.join(root, "public", "scans", scanId);
  const photoDir = path.join(outScan, "photos");
  const previewDir = path.join(outScan, "previews");
  const maskDir = path.join(outScan, "masks");
  const dbhDir = path.join(outScan, "dbh");
  const mapDir = path.join(outScan, "maps");
  const modelDir = path.join(outScan, "models");
  await fs.mkdir(photoDir, { recursive: true });
  await fs.mkdir(previewDir, { recursive: true });
  await fs.mkdir(maskDir, { recursive: true });
  await fs.mkdir(dbhDir, { recursive: true });
  await fs.mkdir(mapDir, { recursive: true });
  await fs.mkdir(modelDir, { recursive: true });

  log("繪製路徑圖、Segmentation、橫切面…");
  await renderOfficialFigures(outScan, trees);

  const images = [
    ...(await listImages(path.join(rawDir, "go"))),
    ...(await listImages(path.join(rawDir, "return"))),
    ...(await listImages(rawDir)),
  ];
  const seenImg = new Set();
  const uniqueImages = images.filter((p) => {
    if (seenImg.has(p)) return false;
    seenImg.add(p);
    return true;
  });

  const hasGaussian = await copyFirstPly(
    gaussianDir,
    path.join(modelDir, "scene_gaussian.ply"),
  );

  const records = [];
  for (let i = 0; i < trees.length; i += 1) {
    const tree = trees[i];
    const id = padId(i + 1);
    const maskRel = `masks/real_tree_mask_${id}.png`;
    const sliceRel = `dbh/dbh_slice_top_down_${id}.png`;

    const previewRel = `previews/${id}.png`;
    await writePngFile(
      path.join(outScan, previewRel),
      drawPreview(xyz, count, tree, up, hx, hy),
    );
    let photoRel = null;
    const srcPhoto = photoForTree(uniqueImages, id, i, trees.length);
    if (srcPhoto) {
      const ext = path.extname(srcPhoto) || ".jpg";
      photoRel = `photos/${id}${ext.toLowerCase()}`;
      await fs.copyFile(srcPhoto, path.join(outScan, photoRel));
    }
    const notes = treeNotes(tree);
    records.push({
      Tree_ID: id,
      DBH_cm: Number(tree.dbh.toFixed(1)),
      DBH_method: tree.dbh > 55 ? "caliper" : "circle",
      DBH_note: notes,
      arc_coverage_deg: Number(tree.arc.toFixed(1)),
      dbh_is_strict_breast_height: false,
      GPS_Location: null,
      Local_XYZ_m: [
        Number(tree.x.toFixed(3)),
        Number(tree.y.toFixed(3)),
        Number(tree.z.toFixed(3)),
      ],
      Best_Photo: photoRel,
      PointCloud_Preview: previewRel,
      Mask_Path: maskRel,
      Cross_Section_Image: sliceRel,
      "3D_Model_Path": hasGaussian ? "models/scene_gaussian.ply" : null,
      Single_Tree_Ply: null,
      YOLO_confidence: Number(Math.min(0.95, 0.25 + Math.log10(tree.n) / 8).toFixed(4)),
      num_detections: 1,
    });
  }

  const report = {
    created_at: new Date().toISOString().slice(0, 19),
    scan_id: scanId,
    gps_available: false,
    num_trees: records.length,
    trees: records,
  };

  await fs.writeFile(
    path.join(outScan, "inventory.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(jobDir, "inventory.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  await writeBindings(pathId, scanId);
  await fs.writeFile(
    path.join(jobDir, "pipeline-status.json"),
    JSON.stringify(
      {
        status: "computed",
        message: `已算出 ${records.length} 棵樹身分`,
        treeCount: records.length,
      },
      null,
      2,
    ),
    "utf8",
  );
  log(`完成：${records.length} 棵（${records.map((t) => t.Tree_ID).join("、")}）`);
}

async function findDenoisedPly(outScan) {
  const plyCandidates = [path.join(outScan, "_inbox_staged", "denoised")];
  try {
    const jobs = await fs.readdir(path.join(root, "inbox"));
    for (const job of jobs) {
      plyCandidates.push(path.join(root, "inbox", job, "denoised"));
    }
  } catch {
    /* no inbox */
  }
  plyCandidates.push(path.join(outScan, "models"));
  for (const dir of plyCandidates) {
    try {
      return await findPly(dir);
    } catch {
      /* try next */
    }
  }
  return "";
}

async function refreshPhotos() {
  const outScan = path.join(root, "public", "scans", scanId);
  const invFile = path.join(outScan, "inventory.json");
  const report = JSON.parse(await fs.readFile(invFile, "utf8"));
  const ply = await findDenoisedPly(outScan);
  if (!ply) throw new Error("找不到點雲，無法重畫點雲側視");
  log(`重畫各棵樹的點雲側視（${path.relative(root, ply)}）…`);
  const { xyz, count } = await loadXyz(ply, 400_000);
  const { up } = pickUpAxis(xyz, count);
  const hx = up === 0 ? 1 : 0;
  const hy = up === 2 ? 1 : 2;
  await fs.mkdir(path.join(outScan, "previews"), { recursive: true });
  for (const tree of report.trees || []) {
    const id = tree.Tree_ID;
    const xyzLocal = tree.Local_XYZ_m || [0, 0, 0];
    const preview = drawPreview(
      xyz,
      count,
      { x: xyzLocal[0], y: xyzLocal[1], z: xyzLocal[2] },
      up,
      hx,
      hy,
    );
    const previewRel = `previews/${id}.png`;
    await writePngFile(path.join(outScan, previewRel), preview);
    tree.PointCloud_Preview = previewRel;
  }
  report.created_at = new Date().toISOString().slice(0, 19);
  await fs.writeFile(invFile, JSON.stringify(report, null, 2), "utf8");
  log(`已重畫 ${report.trees.length} 張點雲側視`);
}

async function refreshMasks() {
  const outScan = path.join(root, "public", "scans", scanId);
  const invFile = path.join(outScan, "inventory.json");
  const report = JSON.parse(await fs.readFile(invFile, "utf8"));
  const ply = await findDenoisedPly(outScan);
  if (!ply) throw new Error("找不到點雲，無法重畫 Segmentation");
  log(`依點雲重畫樹幹遮罩（${path.relative(root, ply)}）…`);
  const { xyz, count } = await loadXyz(ply, 400_000);
  const { up } = pickUpAxis(xyz, count);
  const hx = up === 0 ? 1 : 0;
  const hy = up === 2 ? 1 : 2;
  const trees = (report.trees || []).map((tree) => {
    const xyzLocal = tree.Local_XYZ_m || [0, 0, 0];
    return {
      id: tree.Tree_ID,
      x: xyzLocal[0],
      y: xyzLocal[1],
      z: xyzLocal[2],
      dbh: tree.DBH_cm || 12,
      arc: tree.arc_coverage_deg || 180,
      pts: [],
      column: [],
    };
  });
  attachColumns(xyz, count, trees, up, hx, hy);
  await fs.mkdir(path.join(outScan, "masks"), { recursive: true });
  await renderOfficialFigures(outScan, trees, "masks");
  report.created_at = new Date().toISOString().slice(0, 19);
  await fs.writeFile(invFile, JSON.stringify(report, null, 2), "utf8");
  log(`已重畫 ${trees.length} 張 Segmentation`);
}

const boot = refreshMasksOnly ? refreshMasks : refreshPhotosOnly ? refreshPhotos : main;
boot().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
