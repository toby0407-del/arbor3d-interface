import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TreeRecord } from "../types";
import { fileName } from "../lib/format";
import { loadPlyCloud } from "../lib/loadPly";
import { scanAssetUrl } from "../lib/scanMedia";

type Props = {
  tree: TreeRecord;
  scanId: string;
};

export function SuperSplatViewer({ tree, scanId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const ply = tree["3D_Model_Path"] || tree.Single_Tree_Ply;
  const url = scanAssetUrl(scanId, ply);
  const [status, setStatus] = useState(url ? "載入 3D 模型…" : "模型尚未匯入");
  const [failed, setFailed] = useState(!url);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) {
      setFailed(true);
      setStatus("模型尚未匯入");
      return;
    }

    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let geometry: THREE.BufferGeometry | undefined;
    let material: THREE.PointsMaterial | undefined;
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 120);

    const resize = () => {
      if (!renderer) return;
      const parent = canvas.parentElement ?? canvas;
      renderer.setSize(parent.clientWidth, parent.clientHeight, false);
      camera.aspect = parent.clientWidth / Math.max(parent.clientHeight, 1);
      camera.updateProjectionMatrix();
    };

    setFailed(false);
    setStatus("載入 3D 模型…");

    (async () => {
      try {
        const cloud = await loadPlyCloud(url);
        if (disposed) return;
        setStatus(`${cloud.count.toLocaleString()} 點 · 拖曳旋轉 · 滾輪縮放`);

        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#10140f");
        scene.fog = new THREE.Fog("#10140f", 18, 42);

        camera.position.set(3.6, 2.8, 5.2);
        controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.target.set(0, 0.4, 0);
        controls.minDistance = 0.6;
        controls.maxDistance = 28;

        geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(cloud.positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(cloud.colors, 3));
        material = new THREE.PointsMaterial({
          size: 0.035,
          vertexColors: true,
          sizeAttenuation: true,
        });
        scene.add(new THREE.Points(geometry, material));
        scene.add(new THREE.AmbientLight("#dcead9", 0.8));

        resize();
        window.addEventListener("resize", resize);
        const tick = () => {
          controls?.update();
          renderer?.render(scene, camera);
          frame = requestAnimationFrame(tick);
        };
        tick();
        resetRef.current = () => {
          camera.position.set(3.6, 2.8, 5.2);
          controls?.target.set(0, 0.4, 0);
          controls?.update();
        };
      } catch (err) {
        if (!disposed) {
          setFailed(true);
          setStatus(err instanceof Error ? err.message : "模型讀取失敗");
        }
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      controls?.dispose();
      geometry?.dispose();
      material?.dispose();
      renderer?.dispose();
    };
  }, [url]);

  if (failed) {
    return (
      <div className="splat-stage splat-missing">
        <div className="splat-empty">
          <div className="splat-kicker">3D 模型</div>
          <div className="splat-title">{tree.Tree_ID}</div>
          <p>{status}</p>
          <p className="splat-path">
            {url ? (
              <>
                請確認 <code>{fileName(ply)}</code> 在{" "}
                <code>public/scans/{scanId}/</code>
              </>
            ) : (
              "JSON 裡也還沒有 3D 路徑。"
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="splat-stage">
      <canvas ref={canvasRef} className="splat-canvas" />
      <div className="splat-overlay">
        <div>
          <div className="splat-kicker">單棵樹 3DGS</div>
          <div className="splat-title">{tree.Tree_ID}</div>
          <p>{status}</p>
        </div>
        <button type="button" className="ghost-btn is-light" onClick={() => resetRef.current?.()}>
          重設視角
        </button>
      </div>
    </div>
  );
}
