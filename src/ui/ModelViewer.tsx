import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { UploadedRobotModel } from '../robot/RobotModel';
import { buildTransformedGroup } from '../robot/RobotModel';

interface Props {
  model: UploadedRobotModel;
  onBack: () => void;
  onUpdate: (m: UploadedRobotModel) => void;
}

export function ModelViewer({ model, onBack, onUpdate }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  const [rotX, setRotX] = useState(model.rotX);
  const [rotY, setRotY] = useState(model.rotY);
  const [rotZ, setRotZ] = useState(model.rotZ);
  const [scaleMult, setScaleMult] = useState(model.scaleMult);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1b1b22);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 100);
    camera.position.set(1.2, 1.0, 1.4);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.target.set(0, 0.25, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 5, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x88aadd, 0.4);
    fill.position.set(-3, 2, -2);
    scene.add(fill);

    const grid = new THREE.GridHelper(2, 20, 0x555566, 0x333344);
    scene.add(grid);
    const axes = new THREE.AxesHelper(0.3);
    scene.add(axes);

    let raf = 0;
    const render = () => {
      raf = requestAnimationFrame(render);
      controls.update();
      renderer.render(scene, camera);
    };
    render();

    const onResize = () => {
      const nw = canvas.clientWidth;
      const nh = canvas.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh, false);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Rebuild model group when transforms change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (modelGroupRef.current) scene.remove(modelGroupRef.current);
    const updated: UploadedRobotModel = { ...model, rotX, rotY, rotZ, scaleMult };
    const group = buildTransformedGroup(updated);
    scene.add(group);
    modelGroupRef.current = group;
    onUpdate(updated);
  }, [rotX, rotY, rotZ, scaleMult]);

  const snapRotate = (axis: 'x' | 'y' | 'z', dir: 1 | -1) => {
    const delta = dir * Math.PI / 2;
    if (axis === 'x') setRotX((r) => r + delta);
    if (axis === 'y') setRotY((r) => r + delta);
    if (axis === 'z') setRotZ((r) => r + delta);
  };
  const reset = () => {
    setRotX(0); setRotY(0); setRotZ(0); setScaleMult(1);
  };

  return (
    <div id="model-viewer-page" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#16161c' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #2a2a33', color: '#eee', fontFamily: 'monospace', gap: 12 }}>
        <button onClick={onBack} style={{ padding: '6px 14px', background: '#2a2a33', border: '1px solid #3a3a44', color: '#eee', borderRadius: 4, cursor: 'pointer' }}>← Back</button>
        <div style={{ fontSize: 14, color: '#aaa' }}>Model: <span style={{ color: '#fff' }}>{model.name}</span></div>
        <div style={{ flex: 1 }} />
        <button onClick={reset} style={{ padding: '6px 14px', background: '#2a2a33', border: '1px solid #3a3a44', color: '#eee', borderRadius: 4, cursor: 'pointer' }}>Reset</button>
      </div>

      <div style={{ flex: 1, display: 'flex' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        <div style={{ width: 260, padding: 16, background: '#1c1c24', borderLeft: '1px solid #2a2a33', color: '#ddd', fontFamily: 'monospace', fontSize: 13 }}>
          <h3 style={{ marginTop: 0, color: '#fff', fontSize: 14, borderBottom: '1px solid #2a2a33', paddingBottom: 8 }}>Orientation</h3>

          <RotControl label="X axis" onPlus={() => snapRotate('x', 1)} onMinus={() => snapRotate('x', -1)} value={rotX} />
          <RotControl label="Y axis" onPlus={() => snapRotate('y', 1)} onMinus={() => snapRotate('y', -1)} value={rotY} />
          <RotControl label="Z axis" onPlus={() => snapRotate('z', 1)} onMinus={() => snapRotate('z', -1)} value={rotZ} />

          <h3 style={{ color: '#fff', fontSize: 14, borderBottom: '1px solid #2a2a33', paddingBottom: 8, marginTop: 24 }}>Scale</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={scaleMult}
              onChange={(e) => setScaleMult(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ width: 40, textAlign: 'right', color: '#fff' }}>{scaleMult.toFixed(2)}×</span>
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>
            Auto-fit: {model.autoFitScale.toFixed(3)} · Effective: {(model.autoFitScale * scaleMult).toFixed(3)}
          </div>

          <div style={{ marginTop: 24, padding: 10, background: '#222229', borderRadius: 4, fontSize: 11, color: '#999', lineHeight: 1.5 }}>
            Orbit: drag · Pan: right-drag · Zoom: scroll. The grid cell is 0.1 m. Rotate and scale until the robot sits upright and roughly fills one FTC robot footprint.
          </div>
        </div>
      </div>
    </div>
  );
}

function RotControl({ label, onPlus, onMinus, value }: { label: string; onPlus: () => void; onMinus: () => void; value: number }) {
  const deg = Math.round((value * 180) / Math.PI);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{ width: 60, color: '#bbb' }}>{label}</div>
      <button onClick={onMinus} style={{ width: 32, height: 28, background: '#2a2a33', border: '1px solid #3a3a44', color: '#eee', borderRadius: 4, cursor: 'pointer' }}>−90°</button>
      <button onClick={onPlus} style={{ width: 32, height: 28, background: '#2a2a33', border: '1px solid #3a3a44', color: '#eee', borderRadius: 4, cursor: 'pointer' }}>+90°</button>
      <div style={{ flex: 1, textAlign: 'right', color: '#fff' }}>{deg}°</div>
    </div>
  );
}
