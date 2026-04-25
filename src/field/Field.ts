import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ══════════════════════════════════════════════════════════════
// DECODE 2025-26 — FTC Playing Field (GLTF models)
//
// Coordinate mapping (Onshape Z-up → Three.js Y-up):
//   rotation.x = -π/2  →  (x, y, z) → (x, z, -y)
//   So: CAD +Y (back wall) → Three.js -Z
//       CAD +Z (up)        → Three.js +Y
//       CAD +X (red side)  → Three.js +X
//
// Field convention after rotation:
//   -Z = back wall (goals), +Z = front (audience)
//   -X = blue side (left),  +X = red side (right)
// ══════════════════════════════════════════════════════════════

const IN = 0.0254;
const FIELD_IN = 144;
const FIELD = FIELD_IN * IN;             // 3.6576 m
const HALF  = FIELD / 2;                 // 1.8288 m

const WALL_H = 12 * IN;
const WALL_T = 2 * IN;

const BALL_RADIUS = 2.5 * IN;

const PURPLE = 0x8833aa;
const GREEN  = 0x33aa44;

type SampleColor = 'purple' | 'green';

interface Sample {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  color: SampleColor;
  initialPos: THREE.Vector3;
}

export interface FieldElement {
  mesh: THREE.Object3D;
  body: CANNON.Body | null;
  type: string;
  initialPos: THREE.Vector3;
  initialQuat: THREE.Quaternion;
}

export class Field {
  scene: THREE.Scene;
  world: CANNON.World;
  meshes: THREE.Object3D[] = [];
  bodies: CANNON.Body[] = [];
  samples: Sample[] = [];
  fieldElements: FieldElement[] = [];
  envMap: THREE.Texture | null;
  private ballGeometry: THREE.BufferGeometry | null = null;
  private ballScale = 1;
  private ballRadiusActual = BALL_RADIUS;
  private sampleMaterial = new CANNON.Material('sample');
  private ballSpawnPoints: { pos: THREE.Vector3; color: SampleColor }[] = [];

  // Ground offset computed from field model — applied to all models
  private groundOffset = 0;
  private groundOffsetReady = false;
  private pendingCallbacks: (() => void)[] = [];

  private elapsedTime = 0;

  constructor(scene: THREE.Scene, world: CANNON.World, envMap: THREE.Texture | null = null) {
    this.scene = scene;
    this.world = world;
    this.envMap = envMap;

    const contact = new CANNON.ContactMaterial(
      this.sampleMaterial, this.sampleMaterial,
      { friction: 0.3, restitution: 0.5 }
    );
    this.world.addContactMaterial(contact);

    this.buildField();
  }

  private buildField() {
    this.buildPhysicsFloor();
    this.buildPhysicsWalls();
    this.loadFieldGLTF();
    this.loadGoalGLTF('blue');
    this.loadGoalGLTF('red');
    this.loadBallMarkers();
    this.loadBallSTL();
  }

  // ─── Execute callback when ground offset is ready ───
  private whenGroundReady(cb: () => void) {
    if (this.groundOffsetReady) {
      cb();
    } else {
      this.pendingCallbacks.push(cb);
    }
  }

  private flushPending() {
    for (const cb of this.pendingCallbacks) cb();
    this.pendingCallbacks = [];
  }

  private physicsFloor!: CANNON.Body;

  // ─── PHYSICS FLOOR ───
  private buildPhysicsFloor() {
    this.physicsFloor = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    this.physicsFloor.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(this.physicsFloor);
  }

  // Raise physics floor to match visual tile surface
  private updatePhysicsFloorHeight() {
    if (this.physicsFloor && this.groundOffset > 0) {
      this.physicsFloor.position.set(0, this.groundOffset, 0);
    }
  }

  // ─── PHYSICS WALLS ───
  private buildPhysicsWalls() {
    const defs = [
      { p: [0, WALL_H / 2, -HALF], s: [HALF + WALL_T, WALL_H / 2, WALL_T / 2] },
      { p: [0, WALL_H / 2,  HALF], s: [HALF + WALL_T, WALL_H / 2, WALL_T / 2] },
      { p: [-HALF, WALL_H / 2, 0], s: [WALL_T / 2, WALL_H / 2, HALF + WALL_T] },
      { p: [ HALF, WALL_H / 2, 0], s: [WALL_T / 2, WALL_H / 2, HALF + WALL_T] },
    ];
    for (const w of defs) {
      const b = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(w.s[0], w.s[1], w.s[2])),
      });
      b.position.set(w.p[0], w.p[1], w.p[2]);
      this.world.addBody(b);
      this.bodies.push(b);
    }
  }

  // ─── Create decimated trimesh collider from merged geometry ───
  // Keeps every Nth triangle to stay under maxTris for performance.
  // Surface-only — no false interior collision.
  private createTrimeshCollider(mergedGroup: THREE.Group, maxTris = 5000): CANNON.Body {
    const body = new CANNON.Body({ type: CANNON.Body.STATIC });

    // First pass: count total triangles
    let totalTris = 0;
    mergedGroup.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const geo = (child as THREE.Mesh).geometry;
      const pos = geo.attributes.position;
      if (!pos) return;
      totalTris += geo.index ? geo.index.count / 3 : pos.count / 3;
    });

    const step = Math.max(1, Math.ceil(totalTris / maxTris));

    // Second pass: collect decimated triangles
    const verts: number[] = [];
    const indices: number[] = [];

    mergedGroup.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const geo = (child as THREE.Mesh).geometry;
      const pos = geo.attributes.position;
      if (!pos) return;

      if (geo.index) {
        const idx = geo.index.array;
        for (let i = 0; i < idx.length; i += 3 * step) {
          if (i + 2 >= idx.length) break;
          const base = verts.length / 3;
          for (const vi of [idx[i], idx[i + 1], idx[i + 2]]) {
            verts.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
          }
          indices.push(base, base + 1, base + 2);
        }
      } else {
        for (let i = 0; i < pos.count; i += 3 * step) {
          if (i + 2 >= pos.count) break;
          const base = verts.length / 3;
          for (const vi of [i, i + 1, i + 2]) {
            verts.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
          }
          indices.push(base, base + 1, base + 2);
        }
      }
    });

    if (verts.length >= 9) {
      const trimesh = new CANNON.Trimesh(verts, indices);
      body.addShape(trimesh);
      body.position.set(
        mergedGroup.position.x,
        mergedGroup.position.y,
        mergedGroup.position.z,
      );
      this.world.addBody(body);
      this.bodies.push(body);
      console.log(`[Field] Trimesh: ${indices.length / 3} tris (decimated from ${totalTris})`);
    }
    return body;
  }

  // ══════════════════════════════════════════════════════════════
  // GLTF MERGE UTILITY
  // Onshape exports have thousands of primitives (screws, rivets).
  // Merging by material reduces draw calls from ~43,000 to ~20.
  // ══════════════════════════════════════════════════════════════
  private mergeGLTFByMaterial(root: THREE.Group, options: { correctColors?: boolean; filterNodes?: boolean } = {}): THREE.Group {
    root.updateMatrixWorld(true);
    const { correctColors = false, filterNodes = false } = options;

    // Group geometries by material color key
    const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();

    root.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;

      // Filter out unwanted nodes (AprilTags, stickers, under-tile disks)
      if (filterNodes) {
        let node: THREE.Object3D | null = child;
        let skip = false;
        while (node) {
          if (/april|sticker|tag|under\s*tile\s*disk|molded.*disk/i.test(node.name)) { skip = true; break; }
          node = node.parent;
        }
        if (skip) return;
      }

      const mesh = child as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const geometry = mesh.geometry;

      if (!geometry || !geometry.attributes.position) return;

      // For multi-material meshes with groups, split by group
      if (materials.length > 1 && geometry.groups.length > 0) {
        for (const group of geometry.groups) {
          const mat = materials[group.materialIndex ?? 0];
          const subGeo = this.extractGroup(geometry, group);
          if (!subGeo) continue;
          subGeo.applyMatrix4(mesh.matrixWorld);
          this.addToGroup(groups, mat, subGeo, correctColors);
        }
      } else {
        const mat = materials[0];
        const geo = geometry.clone();
        geo.applyMatrix4(mesh.matrixWorld);
        this.addToGroup(groups, mat, geo, correctColors);
      }
    });

    // Merge each material group into a single mesh
    const result = new THREE.Group();
    let totalDrawCalls = 0;
    for (const [, { mat, geos }] of groups) {
      if (geos.length === 0) continue;

      // Ensure all geometries have the same attributes
      const attrNames = new Set<string>();
      for (const g of geos) {
        for (const name of Object.keys(g.attributes)) attrNames.add(name);
      }
      // Remove attributes not present in all geometries
      for (const g of geos) {
        for (const name of attrNames) {
          if (!g.attributes[name]) {
            // Remove this attribute from all geos to keep consistent
            for (const g2 of geos) g2.deleteAttribute(name);
            attrNames.delete(name);
            break;
          }
        }
      }

      const merged = mergeGeometries(geos, false);
      if (!merged) continue;

      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = true;
      result.add(mesh);
      totalDrawCalls++;
    }

    console.log(`[Field] Merged: ${totalDrawCalls} draw calls`);
    return result;
  }

  private extractGroup(geometry: THREE.BufferGeometry, group: { start: number; count: number; materialIndex?: number }): THREE.BufferGeometry | null {
    const geo = new THREE.BufferGeometry();
    const index = geometry.index;

    if (index) {
      const indices = index.array.slice(group.start, group.start + group.count);
      // Remap indices to be contiguous
      const usedVerts = new Set<number>();
      for (const idx of indices) usedVerts.add(idx);
      const sortedVerts = Array.from(usedVerts).sort((a, b) => a - b);
      const remap = new Map<number, number>();
      sortedVerts.forEach((v, i) => remap.set(v, i));

      const newIndices = new Uint32Array(indices.length);
      for (let i = 0; i < indices.length; i++) {
        newIndices[i] = remap.get(indices[i])!;
      }
      geo.setIndex(new THREE.BufferAttribute(newIndices, 1));

      // Copy vertex attributes for used vertices only
      for (const [name, attr] of Object.entries(geometry.attributes)) {
        const srcArr = (attr as THREE.BufferAttribute).array;
        const itemSize = (attr as THREE.BufferAttribute).itemSize;
        const dstArr = new Float32Array(sortedVerts.length * itemSize);
        for (let i = 0; i < sortedVerts.length; i++) {
          const srcIdx = sortedVerts[i] * itemSize;
          const dstIdx = i * itemSize;
          for (let j = 0; j < itemSize; j++) {
            dstArr[dstIdx + j] = srcArr[srcIdx + j];
          }
        }
        geo.setAttribute(name, new THREE.BufferAttribute(dstArr, itemSize));
      }
    } else {
      // Non-indexed: slice position data
      for (const [name, attr] of Object.entries(geometry.attributes)) {
        const srcArr = (attr as THREE.BufferAttribute).array;
        const itemSize = (attr as THREE.BufferAttribute).itemSize;
        const sliced = srcArr.slice(group.start * itemSize, (group.start + group.count) * itemSize);
        geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(sliced), itemSize));
      }
    }

    return geo;
  }

  private addToGroup(
    groups: Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>,
    mat: THREE.Material,
    geo: THREE.BufferGeometry,
    correctColors = false,
  ) {
    const stdMat = mat as THREE.MeshStandardMaterial;
    const c = stdMat.color || new THREE.Color(1, 1, 1);
    const a = stdMat.opacity ?? 1;

    // Color corrections for field model
    let correctedColor = c.clone();
    if (correctColors) {
      // Swap red ↔ blue (tape lines are on wrong sides in the CAD orientation)
      if (c.r > 0.9 && c.g < 0.1 && c.b < 0.1) {
        // Pure red → blue
        correctedColor = new THREE.Color(0x0044ff);
      } else if (c.b > 0.9 && c.r < 0.1 && c.g < 0.1) {
        // Pure blue → red
        correctedColor = new THREE.Color(0xff1111);
      }
      // Darken light gray tiles (baseColor > 0.85 in all channels)
      else if (c.r > 0.85 && c.g > 0.85 && c.b > 0.85 && a > 0.9) {
        correctedColor = new THREE.Color(c.r * 0.30, c.g * 0.30, c.b * 0.30);
      }
    }

    const key = `${correctedColor.r.toFixed(3)},${correctedColor.g.toFixed(3)},${correctedColor.b.toFixed(3)},${a.toFixed(3)}`;

    if (!groups.has(key)) {
      const clonedMat = mat.clone();
      (clonedMat as THREE.MeshStandardMaterial).color = correctedColor;
      if (a < 0.99) {
        (clonedMat as THREE.MeshStandardMaterial).transparent = true;
        (clonedMat as THREE.MeshStandardMaterial).opacity = a;
      }
      groups.set(key, { mat: clonedMat, geos: [] });
    }
    groups.get(key)!.geos.push(geo);
  }

  // ══════════════════════════════════════════════════════════════
  // MODEL LOADING
  // ══════════════════════════════════════════════════════════════

  // ─── FIELD (floor, obelisk, perimeter) ───
  private loadFieldGLTF() {
    const loader = new GLTFLoader();
    loader.load(
      '/models/FieldwithObelisk.gltf',
      (gltf) => {
        const raw = gltf.scene;

        // Rotate Z-up → Y-up (Onshape is metres, Z-up)
        raw.rotation.x = -Math.PI / 2;
        raw.updateMatrixWorld(true);

        // Merge by material — swap red/blue, darken tiles
        const merged = this.mergeGLTFByMaterial(raw, { correctColors: true });

        // Compute ground offset from bounding box
        const box = new THREE.Box3().setFromObject(merged);
        this.groundOffset = -box.min.y;
        this.groundOffsetReady = true;

        merged.position.y = this.groundOffset;
        this.scene.add(merged);
        this.meshes.push(merged);

        // Move physics floor up to match visual tile surface
        this.updatePhysicsFloorHeight();

        console.log(`[Field] Field loaded, groundOffset=${this.groundOffset.toFixed(4)}`);
        console.log(`[Field] Field bbox: X[${box.min.x.toFixed(2)}, ${box.max.x.toFixed(2)}] Z[${box.min.z.toFixed(2)}, ${box.max.z.toFixed(2)}]`);

        this.flushPending();
      },
      undefined,
      (error) => console.warn('[Field] Could not load field GLTF:', error),
    );
  }

  // ─── GOALS (blue/red ramp assemblies — standalone exports) ───
  private loadGoalGLTF(side: 'blue' | 'red') {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    loader.setDRACOLoader(draco);
    loader.load(
      `/models/${side}-goal.glb`,
      (gltf) => {
        const raw = gltf.scene;

        this.whenGroundReady(() => {
          // Rotate Z-up → Y-up
          raw.rotation.x = -Math.PI / 2;
          raw.updateMatrixWorld(true);

          // Merge by material, filter AprilTags + under-tile disks
          const merged = this.mergeGLTFByMaterial(raw, { filterNodes: true });
          merged.position.y = this.groundOffset;

          // Compute bounding box to align with field walls
          merged.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(merged);

          // Position goals at back corners with gap from perimeter walls.
          // Gap prevents visual overlap and physics jitter.
          const GAP = WALL_T + 0.01; // wall thickness + 1cm clearance
          if (side === 'blue') {
            merged.position.x += (-HALF + GAP - box.min.x);
          } else {
            merged.position.x += (HALF - GAP - box.max.x);
          }
          // Push forward slightly so back face doesn't clip the back wall
          merged.position.z += (-HALF + GAP - box.min.z);

          this.scene.add(merged);

          // Create accurate compound convex hull collider for the goal
          const goalBody = this.createTrimeshCollider(merged);

          this.fieldElements.push({
            mesh: merged,
            body: goalBody,
            type: `${side}_goal`,
            initialPos: merged.position.clone(),
            initialQuat: merged.quaternion.clone(),
          });

          merged.updateMatrixWorld(true);
          const goalBox = new THREE.Box3().setFromObject(merged);
          console.log(`[Field] ${side} goal loaded — X[${goalBox.min.x.toFixed(2)}, ${goalBox.max.x.toFixed(2)}] Z[${goalBox.min.z.toFixed(2)}, ${goalBox.max.z.toFixed(2)}]`);
        });
      },
      undefined,
      (error) => console.warn(`[Field] Could not load ${side} goal:`, error),
    );
  }

  // ─── BALL MARKERS (positions + colors only — NOT rendered) ───
  private loadBallMarkers() {
    const loader = new GLTFLoader();
    loader.load(
      '/models/ball-markers.gltf',
      (gltf) => {
        const raw = gltf.scene;

        this.whenGroundReady(() => {
          // Same rotation + offset as field (shared assembly origin)
          raw.rotation.x = -Math.PI / 2;
          raw.position.y = this.groundOffset;
          raw.updateMatrixWorld(true);

          // Extract positions + colors from mesh materials
          raw.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh) return;
            const mesh = child as THREE.Mesh;

            const worldPos = new THREE.Vector3();
            mesh.getWorldPosition(worldPos);

            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (!mat?.color) return;

            const color = this.detectSampleColor(mat.color);
            if (!color) return;

            this.ballSpawnPoints.push({ pos: worldPos, color });
          });

          // Deduplicate nearby points
          this.ballSpawnPoints = this.deduplicateSpawns(this.ballSpawnPoints);

          const purpleCount = this.ballSpawnPoints.filter(s => s.color === 'purple').length;
          const greenCount = this.ballSpawnPoints.filter(s => s.color === 'green').length;
          console.log(`[Field] Ball markers: ${this.ballSpawnPoints.length} spawns (${purpleCount} purple, ${greenCount} green)`);

          // NOT added to scene — just data
          this.trySpawnSamples();
        });
      },
      undefined,
      (error) => console.warn('[Field] Could not load ball markers:', error),
    );
  }

  // ─── COLOR DETECTION ───
  private detectSampleColor(color: THREE.Color): SampleColor | null {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    const hDeg = hsl.h * 360;

    // Purple: hue ~270-290 (Onshape material ≈ #9107ff)
    if (hDeg > 240 && hDeg < 320 && hsl.s > 0.3) return 'purple';
    // Green: hue ~100-160 (Onshape material ≈ #00c000)
    if (hDeg > 80 && hDeg < 180 && hsl.s > 0.3) return 'green';

    return null;
  }

  // ─── DEDUPLICATE NEARBY SPAWNS ───
  private deduplicateSpawns(spawns: { pos: THREE.Vector3; color: SampleColor }[]) {
    const threshold = 0.005; // 5mm
    const result: { pos: THREE.Vector3; color: SampleColor }[] = [];

    for (const sp of spawns) {
      const duplicate = result.some(
        (r) => r.pos.distanceTo(sp.pos) < threshold && r.color === sp.color
      );
      if (!duplicate) {
        result.push(sp);
      }
    }
    return result;
  }

  // ─── BALL STL (visual geometry) ───
  private loadBallSTL() {
    const loader = new STLLoader();
    loader.load(
      '/models/ball.stl',
      (geometry) => {
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        const bb = geometry.boundingBox!;
        const size = new THREE.Vector3();
        bb.getSize(size);
        const maxRaw = Math.max(size.x, size.y, size.z);

        this.ballScale = maxRaw > 100 ? 0.001 : 1;
        geometry.center();
        geometry.rotateX(-Math.PI / 2);
        this.ballGeometry = geometry;
        this.ballRadiusActual = (maxRaw * this.ballScale) / 2;

        console.log(`[Field] Ball STL — diameter=${(this.ballRadiusActual * 2 * 1000).toFixed(1)}mm`);
        this.trySpawnSamples();
      },
      undefined,
      (error) => {
        console.warn('[Field] Ball STL failed, using spheres:', error);
        this.ballGeometry = null;
        this.trySpawnSamples();
      },
    );
  }

  // ─── SPAWN SAMPLES ───
  private _samplesSpawned = false;
  private trySpawnSamples() {
    if (this._samplesSpawned) return;
    if (this.ballSpawnPoints.length === 0) return;

    this._samplesSpawned = true;

    for (const sp of this.ballSpawnPoints) {
      const y = Math.max(sp.pos.y, this.ballRadiusActual + 0.005);
      this.spawnSample(sp.pos.x, y, sp.pos.z, sp.color);
    }

    console.log(`[Field] Spawned ${this.samples.length} samples`);
  }

  private spawnSample(x: number, y: number, z: number, color: SampleColor) {
    const hexColor = color === 'purple' ? PURPLE : GREEN;

    let mesh: THREE.Mesh;

    if (this.ballGeometry) {
      const geo = this.ballGeometry.clone();
      const mat = new THREE.MeshPhysicalMaterial({
        color: hexColor,
        roughness: 0.35,
        metalness: 0.05,
        emissive: hexColor,
        emissiveIntensity: 0.06,
        clearcoat: 0.4,
        clearcoatRoughness: 0.2,
        envMapIntensity: 0.7,
      });
      mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(this.ballScale);
    } else {
      const geo = new THREE.SphereGeometry(BALL_RADIUS, 24, 24);
      const mat = new THREE.MeshPhysicalMaterial({
        color: hexColor,
        roughness: 0.35,
        metalness: 0.05,
        emissive: hexColor,
        emissiveIntensity: 0.06,
        clearcoat: 0.4,
        clearcoatRoughness: 0.2,
        envMapIntensity: 0.7,
      });
      mesh = new THREE.Mesh(geo, mat);
    }

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const shape = new CANNON.Sphere(this.ballRadiusActual);
    const body = new CANNON.Body({
      mass: 0.05,
      shape,
      material: this.sampleMaterial,
      linearDamping: 0.4,
      angularDamping: 0.4,
    });
    body.position.set(x, y, z);
    this.world.addBody(body);

    this.samples.push({ mesh, body, color, initialPos: new THREE.Vector3(x, y, z) });
  }

  // ─── UPDATE ───
  update(_dt: number) {
    this.elapsedTime += _dt;
    for (const s of this.samples) {
      s.mesh.position.copy(s.body.position as unknown as THREE.Vector3);
      s.mesh.quaternion.copy(s.body.quaternion as unknown as THREE.Quaternion);
    }
    for (const el of this.fieldElements) {
      if (el.body) {
        el.mesh.position.copy(el.body.position as unknown as THREE.Vector3);
        el.mesh.quaternion.copy(el.body.quaternion as unknown as THREE.Quaternion);
      }
    }
  }

  reset() {
    for (const s of this.samples) {
      s.body.position.set(s.initialPos.x, s.initialPos.y, s.initialPos.z);
      s.body.velocity.setZero();
      s.body.angularVelocity.setZero();
      s.body.quaternion.set(0, 0, 0, 1);
      s.mesh.position.copy(s.initialPos);
      s.mesh.rotation.set(0, 0, 0);
    }
    for (const el of this.fieldElements) {
      el.mesh.position.copy(el.initialPos);
      el.mesh.quaternion.copy(el.initialQuat);
      if (el.body) {
        el.body.position.set(el.initialPos.x, el.initialPos.y, el.initialPos.z);
        el.body.velocity.setZero();
        el.body.angularVelocity.setZero();
        el.body.quaternion.set(el.initialQuat.x, el.initialQuat.y, el.initialQuat.z, el.initialQuat.w);
      }
    }
  }
}
