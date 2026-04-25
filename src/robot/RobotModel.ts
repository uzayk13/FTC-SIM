import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

const MAX_GLB_BYTES = 600 * 1024 * 1024;        // 600 MB; practical upper bound

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

  let data: ArrayBuffer;
  if (isBinary) {
    // Already GLB — skip conversion
    if (buf.byteLength > MAX_GLB_BYTES) {
      throw new Error(
        `This .glb is ${sizeMB} MB — too large to parse in-browser without crashing. ` +
        `Decimate your mesh (Blender: Decimate modifier, target <200k triangles) and re-export.`
      );
    }
    data = buf;
  } else {
    // Text glTF — convert to GLB entirely via ArrayBuffer (no string decoding)
    // to bypass V8's ~512 MB string limit on large Onshape exports.
    console.log(`[RobotModel] Converting text .gltf (${sizeMB} MB) to GLB in-browser...`);
    try {
      data = gltfToGlb(buf);
    } catch (e: any) {
      throw new Error(
        `Failed to convert .gltf to GLB: ${e?.message ?? e}. ` +
        `The file may be malformed or reference external files. Try re-exporting from your CAD tool.`
      );
    }
    const glbMB = (data.byteLength / (1024 * 1024)).toFixed(1);
    console.log(`[RobotModel] Converted to GLB: ${glbMB} MB`);
    if (data.byteLength > MAX_GLB_BYTES) {
      throw new Error(
        `Converted GLB is ${glbMB} MB — too large. ` +
        `Decimate your mesh in your CAD tool and re-export.`
      );
    }
  }

  let gltf;
  try {
    gltf = await loader.parseAsync(data, '');
  } catch (e: any) {
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
    throw new Error(
      `Could not parse "${file.name}" as glTF/GLB. First bytes: ${hex} ("${ascii}"). ` +
      `Looks like: ${guess}. Parser said: ${e?.message ?? e}. Re-export as glTF-Binary (.glb).`
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
 * Convert a text .gltf (with embedded base64 data URIs) to a binary .glb ArrayBuffer.
 *
 * Works entirely on the raw Uint8Array — never decodes the full file to a JS string,
 * so it bypasses V8's ~512 MB string limit. The strategy:
 *   1. Scan the byte array for data-URI patterns (`"data:…;base64,…"`)
 *   2. Decode each base64 segment directly from bytes into binary chunks
 *   3. Replace each data URI with a short placeholder in-place
 *   4. The resulting (much smaller) byte array can safely be decoded as a string,
 *      parsed as JSON, patched with bufferView references, and packed into GLB.
 */
function gltfToGlb(buf: ArrayBuffer): ArrayBuffer {
  const src = new Uint8Array(buf);

  // Base64 lookup table (ASCII byte → 6-bit value)
  const B64 = new Uint8Array(128);
  const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < B64_CHARS.length; i++) B64[B64_CHARS.charCodeAt(i)] = i;

  // --- Pass 1: scan for data URIs, extract binary, build a stripped copy ---
  // We look for the byte pattern:  "data:   (0x22 0x64 0x61 0x74 0x61 0x3A)
  const MARKER = [0x22, 0x64, 0x61, 0x74, 0x61, 0x3A]; // "data:
  const COMMA = 0x2C; // ,
  const QUOTE = 0x22; // "
  const EQUALS = 0x3D; // =

  interface ExtractedBlob {
    binary: Uint8Array;
    mime: string;
  }

  const blobs: ExtractedBlob[] = [];
  // We'll build the stripped JSON as segments of the original bytes with
  // data-URI regions replaced by a placeholder like "data:__BLOB_0__"
  const segments: Uint8Array[] = [];
  let lastCopyPos = 0;

  for (let i = 0; i < src.length - MARKER.length; i++) {
    // Quick first-byte check before full match
    if (src[i] !== QUOTE || src[i + 1] !== 0x64) continue;

    let match = true;
    for (let m = 0; m < MARKER.length; m++) {
      if (src[i + m] !== MARKER[m]) { match = false; break; }
    }
    if (!match) continue;

    // Found "data: — find the comma after ;base64,
    let commaPos = -1;
    for (let j = i + MARKER.length; j < src.length && j < i + 200; j++) {
      if (src[j] === COMMA) { commaPos = j; break; }
    }
    if (commaPos === -1) continue;

    // Extract MIME type from bytes between "data: and ;base64,"
    // Pattern: data:<mime>;base64,
    const mimeStart = i + 1 + 5; // after "data:
    let mimeEnd = commaPos;
    // Walk back to find ";base64"
    for (let j = commaPos - 1; j > mimeStart; j--) {
      if (src[j] === 0x3B) { mimeEnd = j; break; } // ;
    }
    const mimeBytes = src.slice(mimeStart, mimeEnd);
    const mime = String.fromCharCode(...mimeBytes);

    // Find the closing quote — this is the end of the base64 data
    const b64Start = commaPos + 1;
    let b64End = -1;
    for (let j = b64Start; j < src.length; j++) {
      if (src[j] === QUOTE) { b64End = j; break; }
    }
    if (b64End === -1) continue;

    // Decode base64 directly from bytes
    const b64Len = b64End - b64Start;
    let padding = 0;
    if (b64Len > 0 && src[b64End - 1] === EQUALS) padding++;
    if (b64Len > 1 && src[b64End - 2] === EQUALS) padding++;
    const binLen = (b64Len * 3) / 4 - padding;
    const binary = new Uint8Array(binLen);

    let w = 0;
    for (let j = b64Start; j < b64End; j += 4) {
      const a = B64[src[j]];
      const b = B64[src[j + 1]];
      const c = B64[src[j + 2]];
      const d = B64[src[j + 3]];
      binary[w++] = (a << 2) | (b >> 4);
      if (w < binLen) binary[w++] = ((b & 0xf) << 4) | (c >> 2);
      if (w < binLen) binary[w++] = ((c & 0x3) << 6) | d;
    }

    const blobIdx = blobs.length;
    blobs.push({ binary, mime });

    // Copy everything before this data URI, then insert placeholder
    segments.push(src.slice(lastCopyPos, i));
    const placeholder = new TextEncoder().encode(`"data:__BLOB_${blobIdx}__"`);
    segments.push(placeholder);
    lastCopyPos = b64End + 1; // skip past closing quote

    // Skip past this region so we don't re-match
    i = b64End;
  }

  // Copy remaining bytes
  segments.push(src.slice(lastCopyPos));

  // Combine segments into a single (much smaller) byte array
  const totalStripped = segments.reduce((s, seg) => s + seg.byteLength, 0);
  console.log(`[gltfToGlb] Stripped ${blobs.length} data URIs, JSON reduced to ${(totalStripped / 1e6).toFixed(1)} MB`);
  const stripped = new Uint8Array(totalStripped);
  let pos = 0;
  for (const seg of segments) {
    stripped.set(seg, pos);
    pos += seg.byteLength;
  }

  // Now safe to decode as string — it's tiny without the base64 blobs
  const jsonText = new TextDecoder('utf-8').decode(stripped);
  const gltf = JSON.parse(jsonText);

  // --- Pass 2: build combined BIN chunk and patch JSON references ---
  const binaryChunks: Uint8Array[] = [];
  let binOffset = 0;

  // Process buffers
  const bufferOffsets: number[] = [];
  for (const buffer of gltf.buffers ?? []) {
    const uri: string = buffer.uri ?? '';
    const blobMatch = uri.match(/^data:__BLOB_(\d+)__$/);
    if (blobMatch) {
      const blob = blobs[parseInt(blobMatch[1])];
      bufferOffsets.push(binOffset);
      binaryChunks.push(blob.binary);
      buffer.byteLength = blob.binary.byteLength;
      delete buffer.uri;
      binOffset += blob.binary.byteLength;
      const pad = (4 - (blob.binary.byteLength % 4)) % 4;
      if (pad > 0) { binaryChunks.push(new Uint8Array(pad)); binOffset += pad; }
    } else {
      bufferOffsets.push(binOffset);
    }
  }

  // Merge multiple buffers into one
  if (gltf.buffers && gltf.buffers.length > 1) {
    for (const bv of gltf.bufferViews ?? []) {
      const idx = bv.buffer ?? 0;
      bv.byteOffset = (bv.byteOffset ?? 0) + bufferOffsets[idx];
      bv.buffer = 0;
    }
    gltf.buffers = [{ byteLength: binOffset }];
  } else if (gltf.buffers?.length === 1) {
    gltf.buffers[0].byteLength = binOffset;
  }

  // Process images with data URI placeholders
  for (const img of gltf.images ?? []) {
    const uri: string = img.uri ?? '';
    const blobMatch = uri.match(/^data:__BLOB_(\d+)__$/);
    if (blobMatch) {
      const blob = blobs[parseInt(blobMatch[1])];
      const bvOffset = binOffset;
      binaryChunks.push(blob.binary);
      binOffset += blob.binary.byteLength;
      const pad = (4 - (blob.binary.byteLength % 4)) % 4;
      if (pad > 0) { binaryChunks.push(new Uint8Array(pad)); binOffset += pad; }

      const bvIndex = (gltf.bufferViews ?? []).length;
      gltf.bufferViews = gltf.bufferViews ?? [];
      gltf.bufferViews.push({ buffer: 0, byteOffset: bvOffset, byteLength: blob.binary.byteLength });
      delete img.uri;
      img.bufferView = bvIndex;
      img.mimeType = blob.mime;
    }
  }

  if (gltf.buffers?.length > 0) gltf.buffers[0].byteLength = binOffset;

  // Build combined BIN
  const combinedBin = new Uint8Array(binOffset);
  let wp = 0;
  for (const chunk of binaryChunks) { combinedBin.set(chunk, wp); wp += chunk.byteLength; }

  // Serialize JSON chunk
  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  const jsonChunkLen = jsonBytes.byteLength + jsonPad;

  // Assemble GLB
  const totalLen = 12 + 8 + jsonChunkLen + 8 + combinedBin.byteLength;
  const glb = new ArrayBuffer(totalLen);
  const view = new DataView(glb);
  const out = new Uint8Array(glb);

  view.setUint32(0, 0x46546C67, true);   // glTF magic
  view.setUint32(4, 2, true);             // version 2
  view.setUint32(8, totalLen, true);

  view.setUint32(12, jsonChunkLen, true);
  view.setUint32(16, 0x4E4F534A, true);   // JSON
  out.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i++) out[20 + jsonBytes.byteLength + i] = 0x20;

  const binStart = 20 + jsonChunkLen;
  view.setUint32(binStart, combinedBin.byteLength, true);
  view.setUint32(binStart + 4, 0x004E4942, true); // BIN
  out.set(combinedBin, binStart + 8);

  return glb;
}

/**
 * Flatten the entire scene graph into ONE mesh to minimize draw calls.
 * Strips all attributes except position + normal, then merges everything.
 * Materials are grouped so each unique material = 1 draw call.
 */
function flattenToSingleMesh(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const meshes: THREE.Mesh[] = [];
  root.traverse((o: any) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  if (meshes.length <= 1) return;

  // Collect geometries, keeping only position + normal for compatibility
  const geoms: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  for (const m of meshes) {
    const src = m.geometry as THREE.BufferGeometry;
    const pos = src.getAttribute('position');
    if (!pos) continue;

    const g = new THREE.BufferGeometry();
    const toRoot = new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld);

    // Clone & bake position
    const posClone = pos.clone();
    g.setAttribute('position', posClone);

    // Clone & bake normal if available
    const norm = src.getAttribute('normal');
    if (norm) {
      g.setAttribute('normal', norm.clone());
    } else {
      g.computeVertexNormals();
    }

    // Copy index
    if (src.index) g.setIndex(src.index.clone());

    g.applyMatrix4(toRoot);

    // If determinant is negative (mirrored part), flip winding to fix backface
    if (toRoot.determinant() < 0 && g.index) {
      const idx = g.index.array as Uint32Array | Uint16Array;
      for (let i = 0; i < idx.length; i += 3) {
        const tmp = idx[i];
        idx[i] = idx[i + 2];
        idx[i + 2] = tmp;
      }
    }

    geoms.push(g);
    materials.push((Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material);
  }

  if (geoms.length === 0) return;

  try {
    const merged = BufferGeometryUtils.mergeGeometries(geoms, false);
    if (!merged) return;

    // Use the first material — good enough for a sim
    const mat = materials[0] ?? new THREE.MeshStandardMaterial({ color: 0x888888 });
    const mergedMesh = new THREE.Mesh(merged, mat);

    // Remove all original meshes
    for (const m of meshes) {
      m.removeFromParent();
      m.geometry.dispose();
    }

    root.add(mergedMesh);
    console.log(`[RobotModel] Flattened ${meshes.length} meshes → 1 draw call`);
  } catch (e) {
    console.warn('[RobotModel] Flatten failed, keeping original meshes:', e);
    for (const g of geoms) g.dispose();
  }
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

  // Flatten all meshes into one to minimize draw calls.
  // Safe since `inner` is a clone — original scene untouched.
  flattenToSingleMesh(inner);

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
 * Build a single convex hull from ALL mesh vertices in the model.
 * Previous per-mesh approach froze the browser on CAD exports with hundreds of meshes.
 */
export function buildHulls(transformed: THREE.Group): HullShape[] {
  transformed.updateMatrixWorld(true);

  const root = transformed;
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  // Collect ALL vertices from every mesh into one list
  const allPts: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  transformed.traverse((o: any) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const m = o as THREE.Mesh;
    const geom = m.geometry as THREE.BufferGeometry;
    const posAttr = geom.getAttribute('position');
    if (!posAttr) return;

    const toLocal = new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld);
    // Sample up to 50 verts per mesh to keep total manageable
    const stride = Math.max(1, Math.floor(posAttr.count / 50));
    for (let i = 0; i < posAttr.count; i += stride) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(toLocal);
      allPts.push(v.clone());
    }
  });

  if (allPts.length < 4) return [];

  // Downsample to 500 points max, then build one hull
  const sampled = downsamplePoints(allPts, 500);
  const hull = hullFromPoints(sampled);
  return hull ? [hull] : [];
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
