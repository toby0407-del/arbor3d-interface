import { useEffect, useRef, useState } from "react";
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadPlyCloud } from "../lib/loadPly";

type Props = {
  url: string | null;
  label: string;
};

/** 把最長軸（樹高）轉成 Z，樹會直立。 */
function standTreeUpright(geo: BufferGeometry) {
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return;
  const size = box.getSize(new Vector3());
  const from = new Vector3(0, 0, 1);
  if (size.x >= size.y && size.x >= size.z) from.set(1, 0, 0);
  else if (size.y >= size.x && size.y >= size.z) from.set(0, 1, 0);
  if (from.z > 0.99) return;
  geo.applyQuaternion(new Quaternion().setFromUnitVectors(from, new Vector3(0, 0, 1)));
}

function placeSideView(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  center: Vector3,
  radius: number,
) {
  const dist = Math.max(radius * 2.1, 1.2);
  camera.up.set(0, 0, 1);
  camera.position.set(center.x + dist, center.y, center.z + radius * 0.35);
  camera.lookAt(center);
  controls.target.copy(center);
  const polar = Math.PI / 2 - 0.22;
  controls.minPolarAngle = polar;
  controls.maxPolarAngle = polar;
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.update();
}

export function PlyViewer({ url, label }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<"empty" | "loading" | "ready" | "error">(
    url ? "loading" : "empty",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !url) {
      setStatus("empty");
      resetRef.current = null;
      return;
    }

    let dead = false;
    let renderer: WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let raf = 0;
    setStatus("loading");
    setMessage("載入點雲…");

    const scene = new Scene();
    scene.background = new Color(0x10140f);
    const camera = new PerspectiveCamera(55, 1, 0.05, 4000);
    camera.up.set(0, 0, 1);

    const run = async () => {
      try {
        const cloud = await loadPlyCloud(url);
        if (dead) return;

        renderer = new WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        host.replaceChildren(renderer.domElement);
        renderer.domElement.className = "splat-canvas";

        const geo = new BufferGeometry();
        geo.setAttribute("position", new Float32BufferAttribute(cloud.positions, 3));
        geo.setAttribute("color", new Float32BufferAttribute(cloud.colors, 3));
        standTreeUpright(geo);
        geo.computeBoundingSphere();
        const points = new Points(
          geo,
          new PointsMaterial({
            size: 0.045,
            vertexColors: true,
            sizeAttenuation: true,
          }),
        );
        scene.add(points);

        const center = geo.boundingSphere?.center?.clone() ?? new Vector3();
        const radius = geo.boundingSphere?.radius || 4;

        controls = new OrbitControls(camera, renderer.domElement);
        placeSideView(camera, controls, center, radius);
        resetRef.current = () => {
          if (controls) placeSideView(camera, controls, center, radius);
        };

        const resize = () => {
          if (!renderer) return;
          const w = host.clientWidth || 1;
          const h = host.clientHeight || 1;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h, false);
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(host);

        const tick = () => {
          if (dead || !renderer) return;
          controls?.update();
          renderer.render(scene, camera);
          raf = requestAnimationFrame(tick);
        };
        tick();
        setStatus("ready");
        setMessage(`${cloud.count.toLocaleString()} 點`);

        return () => {
          ro.disconnect();
        };
      } catch (err) {
        if (!dead) {
          setStatus("error");
          setMessage(err instanceof Error ? err.message : "點雲載入失敗");
        }
      }
    };

    let extraCleanup: (() => void) | undefined;
    void run().then((cleanup) => {
      extraCleanup = cleanup;
    });

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      extraCleanup?.();
      controls?.dispose();
      renderer?.dispose();
      scene.clear();
      resetRef.current = null;
    };
  }, [url]);

  return (
    <div className="splat-stage ply-embed">
      <div ref={hostRef} className="splat-stage-host" />
      {status !== "ready" ? (
        <div className={status === "empty" || status === "error" ? "splat-missing" : "splat-loading"}>
          <div className="splat-empty">
            <strong>{label}</strong>
            <p>
              {status === "empty"
                ? "尚未匯入 3D 模型"
                : status === "loading"
                  ? "載入點雲…"
                  : message}
            </p>
          </div>
        </div>
      ) : (
        <div className="splat-overlay is-compact">
          <div>
            <div className="splat-kicker">3D</div>
            <div className="splat-title">{label}</div>
            <p>{message} · 左右拖曳繞樹轉、滾輪縮放</p>
          </div>
          <button
            type="button"
            className="ghost-btn is-light"
            onClick={() => resetRef.current?.()}
          >
            重置視角
          </button>
        </div>
      )}
    </div>
  );
}
