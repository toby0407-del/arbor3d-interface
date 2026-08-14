/** 讀 SuperSplat / 3DGS binary PLY 的 xyz（+ 可選 f_dc 顏色），給 Three.js 點雲用。 */

const SH_C0 = 0.28209479177387814;
const MAX_POINTS = 80000;

export type PlyCloud = {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
};

function headerEnd(bytes: Uint8Array): number {
  const needle = "end_header\n";
  const text = new TextDecoder().decode(bytes.subarray(0, 8192));
  const idx = text.indexOf(needle);
  if (idx < 0) throw new Error("PLY 找不到 end_header");
  return idx + needle.length;
}

export async function loadPlyCloud(url: string): Promise<PlyCloud> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`無法讀模型 ${url}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const dataStart = headerEnd(bytes);
  const header = new TextDecoder().decode(bytes.subarray(0, dataStart));
  if (!header.includes("binary_little_endian")) {
    throw new Error("目前只支援 binary little endian PLY");
  }

  const vertexMatch = header.match(/element vertex\s+(\d+)/);
  const count = vertexMatch ? Number(vertexMatch[1]) : 0;
  const props: string[] = [];
  let inVertex = false;
  for (const line of header.split("\n")) {
    if (line.startsWith("element vertex")) {
      inVertex = true;
      continue;
    }
    if (line.startsWith("element ")) {
      inVertex = false;
      continue;
    }
    if (inVertex && line.startsWith("property ") && !line.startsWith("property list")) {
      const name = line.trim().split(/\s+/).pop();
      if (name) props.push(name);
    }
  }

  const xi = props.indexOf("x");
  const yi = props.indexOf("y");
  const zi = props.indexOf("z");
  if (xi < 0 || yi < 0 || zi < 0) throw new Error("PLY 沒有 x y z");
  const rI = props.indexOf("f_dc_0");
  const gI = props.indexOf("f_dc_1");
  const bI = props.indexOf("f_dc_2");
  const stride = props.length * 4;
  const view = new DataView(buf, dataStart);
  const step = count > MAX_POINTS ? Math.ceil(count / MAX_POINTS) : 1;
  const outCount = Math.floor(count / step);
  const positions = new Float32Array(outCount * 3);
  const colors = new Float32Array(outCount * 3);

  let cx = 0;
  let cy = 0;
  let cz = 0;
  let n = 0;
  for (let i = 0; i < count; i += step) {
    const base = i * stride;
    const x = view.getFloat32(base + xi * 4, true);
    const y = view.getFloat32(base + yi * 4, true);
    const z = view.getFloat32(base + zi * 4, true);
    // 掃描座標常見 Y 上軸；Three.js 用 Y 朝上，這裡把 z 當高度
    positions[n * 3] = x;
    positions[n * 3 + 1] = z;
    positions[n * 3 + 2] = y;
    cx += x;
    cy += z;
    cz += y;
    if (rI >= 0 && gI >= 0 && bI >= 0) {
      const r = 0.5 + SH_C0 * view.getFloat32(base + rI * 4, true);
      const g = 0.5 + SH_C0 * view.getFloat32(base + gI * 4, true);
      const b = 0.5 + SH_C0 * view.getFloat32(base + bI * 4, true);
      colors[n * 3] = Math.min(1, Math.max(0, r));
      colors[n * 3 + 1] = Math.min(1, Math.max(0, g));
      colors[n * 3 + 2] = Math.min(1, Math.max(0, b));
    } else {
      colors[n * 3] = 0.45;
      colors[n * 3 + 1] = 0.62;
      colors[n * 3 + 2] = 0.4;
    }
    n += 1;
  }

  const inv = n ? 1 / n : 1;
  cx *= inv;
  cy *= inv;
  cz *= inv;
  for (let i = 0; i < n; i += 1) {
    positions[i * 3] -= cx;
    positions[i * 3 + 1] -= cy;
    positions[i * 3 + 2] -= cz;
  }

  return { positions, colors, count: n };
}
