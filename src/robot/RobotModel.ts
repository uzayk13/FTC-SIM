import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';

export interface UploadedRobotModel {
  name: string;
  scene: THREE.Group;
  /** User-set snap rotations (radians), applied around the model's local axes. */
  rotX: number;
  rotY: number;
  rotZ: number;
  /** Multiplier on top of the auto-fit scale. 1 = auto-fit. */
  scaleMult: number;
  /** Auto-fit scale so model's max horizontal dimension equals FRAME_W. */
  autoFitScale: number;
}

const FRAME_W = 0.440;
const MAX_HULL_VERTS = 28;

const MAX_TEXT_GLTF_BYTES = 200 * 1024 * 1024;  // 200 MB; V8 string cap is ~512 MB
const MAX_GLB_BYTES = 500 * 1024 * 1024;        // 500 MB; practical upper bound

export async function parseGLBFile(file: File): Promise<UploadedRobotModel> {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
  const buf = await file.arrayBuffer();

  // Detect binary GLB via magic bytes.
  const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  const isBinary = head.length === 4 &&
    head[0] === 0x67 && head[1] === 0x6c && head[2] === 0x54 && head[3] === 0x46;

  const sizeMB = (buf.byteLength / (1024 * 1024)).toFixed(1);
  if (!isBinary && buf.byteLength > MAX_TEXT_GLTF_BYTES) {
    throw new Error(
      `This .gltf file is ${sizeMB} MB — too large for browser parsing (the JSON decode would exceed V8's ~512 MB string limit). ` +
      `Re-export as glTF-Binary (.glb) to drop the base64 bloat, and decimate your mesh in your CAD tool (Blender: Decimate modifier, target <200k triangles). ` +
      `A typical FTC robot glTF is 5–50 MB.`
    );
  }
  if (isBinary && buf.byteLength > MAX_GLB_BYTES) {
    throw new Error(
      `This .glb is ${sizeMB} MB — too large to parse in-browser without crashing. ` +
      `Decimate your mesh (Blender: Decimate modifier, target <200k triangles) and re-export.`
    );
  }

  let data: ArrayBuffer | string = buf;
  if (!isBinary) {
    // Text glTF — decode ourselves so BOM / encoding issues surface here,
    // not inside GLTFLoader's opaque decode path.
    const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
    try {
      JSON.parse(text);
    } catch (je: any) {
      const sizeKB = (buf.byteLength / 1024).toFixed(1);
      const tail = text.slice(-120).replace(/\s+/g, ' ');
      const last = new Uint8Array(buf, Math.max(0, buf.byteLength - 8));
      const lastHex = Array.from(last).map(b => b.toString(16).padStart(2, '0')).join(' ');
      throw new Error(
        `glTF JSON is malformed: ${je?.message ?? je}. ` +
        `File size: ${sizeKB} KB. Last bytes (hex): ${lastHex}. Last chars: "${tail}". ` +
        `The file looks truncated or corrupted during export. Re-export as glTF-Binary (.glb).`
      );
    }
    if (/"uri"\s*:\s*"(?!data:)/.test(text)) {
      throw new Error(
        'This .gltf references external files (.bin / textures) by URL. A single-file upload can\'t resolve those. ' +
        'Re-export as glTF-Binary (.glb) — a single self-contained file.'
      );
    }
    data = text;
  }

  let gltf;
  try {
    gltf = await loader.parseAsync(data, '');
  } catch (e: any) {
    // Diagnose what the file actually is so the user knows what to export.
    const head4 = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    const hex = Array.from(head4).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(head4).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    let guess = 'unknown';
    if (ascii.startsWith('solid')) guess = 'STL (ASCII)';
    else if (head4[0] === 0x4b && head4[1] === 0x61) guess = 'FBX Binary';
    else if (ascii.startsWith('# ') || ascii.startsWith('v ') || ascii.startsWith('o ')) guess = 'OBJ';
    else if (ascii.startsWith('ISO-')) guess = 'STEP (not supported in-browser)';
    else if (ascii.startsWith('PK')) guess = 'ZIP archive (maybe SolidWorks Pack&Go — unzip it first)';
    else if (head4[0] === 0x00 || head4[0] === 0x80) guess = 'STL (binary)';
    const msg = e?.message ?? String(e);

    // If it looks like text glTF that references external .bin/textures,
    // say so explicitly — that's the #1 gotcha.
    try {
      const text = new TextDecoder('utf-8').decode(buf);
      if (/"uri"\s*:/.test(text)) {
        throw new Error('This glTF references external files (.bin / textures). Re-export as glTF-Binary (.glb) — a single self-contained file.');
      }
    } catch { /* pass through to generic error */ }

    throw new Error(
      `Could not parse "${file.name}" as glTF/GLB. First bytes: ${hex} ("${ascii}"). ` +
      `Looks like: ${guess}. Parser said: ${msg}. Re-export as glTF-Binary (.glb).`
    );
  }
  const scene = gltf.scene as THREE.Group;

  const bbox = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const maxHorizontal = Math.max(size.x, size.z) || size.y || 1;
  const autoFitScale = FRAME_W / maxHorizontal;

  return {
    name: file.name,
    scene,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleMult: 1,
    autoFitScale,
  };
}

/**
 * Apply the orientation + scale transforms to a fresh group containing a clone
 * of the model. Returns the transformed group (caller adds to scene).
 */
export function buildTransformedGroup(model: UploadedRobotModel): THREE.Group {
  const wrapper = new THREE.Group();
  const inner = model.scene.clone(true);
  inner.rotation.set(model.rotX, model.rotY, model.rotZ);
  const s = model.autoFitScale * model.scaleMult;
  inner.scale.setScalar(s);
  wrapper.add(inner);

  // Re-center on origin + rest on y=0
  const box = new THREE.Box3().setFromObject(inner);
  const c = new THREE.Vector3();
  box.getCenter(c);
  inner.position.set(-c.x, -box.min.y, -c.z);

  inner.traverse((o: any) => {
    if ((o as THREE.Mesh).isMesh) {
      (o as THREE.Mesh).castShadow = true;
      (o as THREE.Mesh).receiveShadow = true;
    }
  });
  return wrapper;
}

export interface HullShape {
  shape: CANNON.ConvexPolyhedron;
  offset: CANNON.Vec3;
  bboxVolume: number;
}

/**
 * Build one convex hull per mesh node in the model. Falls back to a single
 * combined hull if the model contains only one mesh. Returns shapes in the
 * transformed group's local space, with offsets relative to that space origin.
 */
export function buildHulls(transformed: THREE.Group): HullShape[] {
  const meshes: THREE.Mesh[] = [];
  transformed.updateMatrixWorld(true);
  transformed.traverse((o: any) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });

  const root = transformed;
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const out: HullShape[] = [];
  for (const m of meshes) {
    const geom = m.geometry as THREE.BufferGeometry;
    const posAttr = geom.getAttribute('position');
    if (!posAttr) continue;

    const toLocal = new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld);
    const pts: THREE.Vector3[] = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(toLocal);
      pts.push(v.clone());
    }
    if (pts.length < 4) continue;

    const sampled = downsamplePoints(pts, 400);
    const hullShape = hullFromPoints(sampled);
    if (!hullShape) continue;
    out.push(hullShape);
  }

  if (out.length === 0) return [];
  return out;
}

function downsamplePoints(pts: THREE.Vector3[], maxN: number): THREE.Vector3[] {
  if (pts.length <= maxN) return pts;
  const stride = pts.length / maxN;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < maxN; i++) out.push(pts[Math.floor(i * stride)]);
  return out;
}

function hullFromPoints(pts: THREE.Vector3[]): HullShape | null {
  const hull = new ConvexHull();
  hull.setFromPoints(pts);

  const vertSet = new Map<string, number>();
  const verts: CANNON.Vec3[] = [];
  const faces: number[][] = [];

  for (const face of hull.faces) {
    const faceIdx: number[] = [];
    let edge = face.edge;
    do {
      const p = edge.head().point;
      const key = `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
      let idx = vertSet.get(key);
      if (idx === undefined) {
        idx = verts.length;
        vertSet.set(key, idx);
        verts.push(new CANNON.Vec3(p.x, p.y, p.z));
      }
      faceIdx.push(idx);
      edge = edge.next;
    } while (edge !== face.edge);
    if (faceIdx.length >= 3) faces.push(faceIdx);
  }

  if (verts.length < 4 || faces.length < 4) return null;

  // If hull is too detailed, rebuild from a subset of its own vertices.
  if (verts.length > MAX_HULL_VERTS) {
    const subset: THREE.Vector3[] = [];
    const stride = verts.length / MAX_HULL_VERTS;
    for (let i = 0; i < MAX_HULL_VERTS; i++) {
      const v = verts[Math.floor(i * stride)];
      subset.push(new THREE.Vector3(v.x, v.y, v.z));
    }
    return hullFromPoints(subset); // one level of recursion, subset <= MAX
  }

  // Compute bbox volume (proxy for mass weighting)
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let cx = 0, cy = 0, cz = 0;
  for (const v of verts) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.z > maxZ) maxZ = v.z;
    cx += v.x; cy += v.y; cz += v.z;
  }
  const n = verts.length;
  cx /= n; cy /= n; cz /= n;
  const bboxVolume = Math.max(1e-6, (maxX - minX) * (maxY - minY) * (maxZ - minZ));

  // Re-center shape vertices at origin; the centroid becomes the shape offset.
  const centered = verts.map(v => new CANNON.Vec3(v.x - cx, v.y - cy, v.z - cz));
  const shape = new CANNON.ConvexPolyhedron({ vertices: centered, faces });
  return {
    shape,
    offset: new CANNON.Vec3(cx, cy, cz),
    bboxVolume,
  };
}
