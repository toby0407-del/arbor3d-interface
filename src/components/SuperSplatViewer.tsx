import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TreeRecord } from "../types";
import { trafficLight } from "../lib/status";

type Props = {
  tree: TreeRecord;
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTreePoints(tree: TreeRecord): THREE.Points {
  const rand = mulberry32(
    tree.Tree_ID.split("").reduce((s, c) => s + c.charCodeAt(0), 1),
  );
  const dbhM = Math.max(0.08, (tree.DBH_cm ?? 12) / 100);
  const trunkR = dbhM / 2;
  const height = 7 + dbhM * 8;
  const count = 14000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const light = trafficLight(tree.DBH_note);
  const bark = new THREE.Color(light === "red" ? "#6a3a32" : "#5a4030");
  const leaf = new THREE.Color(light === "yellow" ? "#9aa85a" : "#3f6b46");

  for (let i = 0; i < count; i += 1) {
    const isCanopy = i > count * 0.38;
    let x = 0;
    let y = 0;
    let z = 0;
    const color = isCanopy ? leaf : bark;
    if (isCanopy) {
      const u = rand();
      const v = rand();
      const w = rand();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const rr = (0.4 + w * 1.6) * (1.2 + dbhM * 4);
      x = Math.sin(phi) * Math.cos(theta) * rr;
      z = Math.sin(phi) * Math.sin(theta) * rr * 0.85;
      y = height * 0.62 + Math.cos(phi) * rr * 0.7;
    } else {
      const a = rand() * Math.PI * 2;
      const h = rand() * height * 0.72;
      const r = trunkR * (1.15 - h / height) + (rand() - 0.5) * 0.03;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      y = h;
    }
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    colors[i * 3] = color.r + (rand() - 0.5) * 0.08;
    colors[i * 3 + 1] = color.g + (rand() - 0.5) * 0.08;
    colors[i * 3 + 2] = color.b + (rand() - 0.5) * 0.06;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.045,
    vertexColors: true,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.92,
  });
  return new THREE.Points(geometry, material);
}

export function SuperSplatViewer({ tree }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#10140f");
    scene.fog = new THREE.Fog("#10140f", 12, 28);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 80);
    camera.position.set(4.2, 5.4, 6.2);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.target.set(0, 3.4, 0);
    controls.minDistance = 2.2;
    controls.maxDistance = 16;

    const points = buildTreePoints(tree);
    scene.add(points);
    scene.add(new THREE.AmbientLight("#dcead9", 0.7));

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(4.5, 48),
      new THREE.MeshBasicMaterial({ color: "#1b2418" }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const resize = () => {
      const { clientWidth, clientHeight } = canvas.parentElement ?? canvas;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    let frame = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    resetRef.current = () => {
      camera.position.set(4.2, 5.4, 6.2);
      controls.target.set(0, 3.4, 0);
      controls.update();
    };

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      controls.dispose();
      points.geometry.dispose();
      (points.material as THREE.PointsMaterial).dispose();
      renderer.dispose();
    };
  }, [tree]);

  return (
    <div className="splat-stage">
      <canvas ref={canvasRef} className="splat-canvas" />
      <div className="splat-overlay">
        <div>
          <div className="splat-kicker">SuperSplat 單棵樹</div>
          <div className="splat-title">{tree.Tree_ID}</div>
          <p>拖曳旋轉 · 滾輪縮放 · 模型檔尚未進 Git，先用點雲示意</p>
        </div>
        <button type="button" className="ghost-btn is-light" onClick={() => resetRef.current?.()}>
          重設視角
        </button>
      </div>
    </div>
  );
}
