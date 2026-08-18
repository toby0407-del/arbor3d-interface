export type PlyCloud = {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
};

type Prop = { name: string; type: string };

function parseHeader(text: string): {
  format: "ascii" | "binary_little_endian" | "binary_big_endian";
  vertexCount: number;
  props: Prop[];
  headerBytes: number;
} {
  const headerEnd = text.indexOf("end_header");
  if (headerEnd < 0) throw new Error("PLY 缺少 end_header");
  const header = text.slice(0, headerEnd);
  const nl = text.indexOf("\n", headerEnd);
  const headerBytes = nl >= 0 ? nl + 1 : headerEnd + "end_header".length;

  let format: "ascii" | "binary_little_endian" | "binary_big_endian" =
    "binary_little_endian";
  let vertexCount = 0;
  const props: Prop[] = [];
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

function typeSize(type: string): number {
  if (type === "char" || type === "uchar" || type === "int8" || type === "uint8")
    return 1;
  if (
    type === "short" ||
    type === "ushort" ||
    type === "int16" ||
    type === "uint16"
  )
    return 2;
  if (
    type === "int" ||
    type === "uint" ||
    type === "float" ||
    type === "int32" ||
    type === "uint32" ||
    type === "float32"
  )
    return 4;
  if (type === "double" || type === "float64") return 8;
  return 4;
}

function readNum(
  view: DataView,
  offset: number,
  type: string,
  le: boolean,
): { value: number; next: number } {
  const size = typeSize(type);
  let value = 0;
  if (type === "uchar" || type === "uint8") value = view.getUint8(offset);
  else if (type === "char" || type === "int8") value = view.getInt8(offset);
  else if (type === "ushort" || type === "uint16")
    value = view.getUint16(offset, le);
  else if (type === "short" || type === "int16")
    value = view.getInt16(offset, le);
  else if (type === "uint" || type === "uint32")
    value = view.getUint32(offset, le);
  else if (type === "int" || type === "int32") value = view.getInt32(offset, le);
  else if (type === "double" || type === "float64")
    value = view.getFloat64(offset, le);
  else value = view.getFloat32(offset, le);
  return { value, next: offset + size };
}

const SH_C0 = 0.28209479177387814;

export async function loadPlyCloud(
  url: string,
  maxPoints = 350_000,
): Promise<PlyCloud> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`無法讀取 ${url}`);
  const buf = await res.arrayBuffer();
  const headText = new TextDecoder("utf-8").decode(buf.slice(0, 8192));
  const { format, vertexCount, props, headerBytes } = parseHeader(headText);

  const idx = (name: string) => props.findIndex((p) => p.name === name);
  const xi = idx("x");
  const yi = idx("y");
  const zi = idx("z");
  if (xi < 0 || yi < 0 || zi < 0) throw new Error("PLY 缺少 xyz");

  const ri = idx("red");
  const gi = idx("green");
  const bi = idx("blue");
  const dc0 = idx("f_dc_0");
  const dc1 = idx("f_dc_1");
  const dc2 = idx("f_dc_2");
  const hasRgb = ri >= 0 && gi >= 0 && bi >= 0;
  const hasSh = dc0 >= 0 && dc1 >= 0 && dc2 >= 0;
  const rgbIsByte =
    hasRgb && (props[ri].type === "uchar" || props[ri].type === "uint8");

  const step = Math.max(1, Math.ceil(vertexCount / maxPoints));
  const count = Math.ceil(vertexCount / step);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let out = 0;

  const writeColor = (r: number, g: number, b: number, dest: number) => {
    colors[dest] = r;
    colors[dest + 1] = g;
    colors[dest + 2] = b;
  };

  if (format === "ascii") {
    const text = new TextDecoder("utf-8").decode(buf).slice(headerBytes);
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    for (let i = 0; i < vertexCount; i += step) {
      const parts = lines[i]?.trim().split(/\s+/) ?? [];
      const o = out * 3;
      positions[o] = Number(parts[xi]);
      positions[o + 1] = Number(parts[yi]);
      positions[o + 2] = Number(parts[zi]);
      if (hasRgb) {
        const scale = rgbIsByte ? 1 / 255 : 1;
        writeColor(
          Number(parts[ri]) * scale,
          Number(parts[gi]) * scale,
          Number(parts[bi]) * scale,
          o,
        );
      } else if (hasSh) {
        writeColor(
          0.5 + SH_C0 * Number(parts[dc0]),
          0.5 + SH_C0 * Number(parts[dc1]),
          0.5 + SH_C0 * Number(parts[dc2]),
          o,
        );
      } else {
        writeColor(0.72, 0.82, 0.7, o);
      }
      out += 1;
    }
  } else {
    const le = format === "binary_little_endian";
    const view = new DataView(buf);
    const stride = props.reduce((sum, p) => sum + typeSize(p.type), 0);
    for (let i = 0; i < vertexCount; i += step) {
      let offset = headerBytes + i * stride;
      const values = new Array<number>(props.length);
      for (let p = 0; p < props.length; p += 1) {
        const read = readNum(view, offset, props[p].type, le);
        values[p] = read.value;
        offset = read.next;
      }
      const o = out * 3;
      positions[o] = values[xi];
      positions[o + 1] = values[yi];
      positions[o + 2] = values[zi];
      if (hasRgb) {
        const scale = rgbIsByte ? 1 / 255 : 1;
        writeColor(
          values[ri] * scale,
          values[gi] * scale,
          values[bi] * scale,
          o,
        );
      } else if (hasSh) {
        writeColor(
          0.5 + SH_C0 * values[dc0],
          0.5 + SH_C0 * values[dc1],
          0.5 + SH_C0 * values[dc2],
          o,
        );
      } else {
        writeColor(0.72, 0.82, 0.7, o);
      }
      out += 1;
    }
  }

  return { positions, colors, count: out };
}
