import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

// ══════════════════════════════════════════════════════════════
// DECODE 2025-26 — FTC Playing Field (STL model)
// 144 × 144 in (3.6576 m) interior
// Front wall (audience) = -Z, Back wall (goals) = +Z
// Left wall = -X (blue side), Right wall = +X (red side)
// ══════════════════════════════════════════════════════════════

const IN = 0.0254;
const FIELD_IN = 144;
const FIELD = FIELD_IN * IN;             // 3.6576 m
const HALF  = FIELD / 2;                 // 1.8288 m
const TILE  = 24 * IN;

const WALL_H = 12 * IN;
const WALL_T = 2 * IN;

const BALL_RADIUS = 2.5 * IN;

const PURPLE = 0x8833aa;
const GREEN  = 0x33aa44;
const YELLOW = 0xf5c542;

type SampleColor = 'purple' | 'green' | 'yellow';

interface Sample {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  color: SampleColor;
  initialPos: THREE.Vector3;
}

export class Field {
  scene: THREE.Scene;
  world: CANNON.World;
  meshes: THREE.Object3D[] = [];
  bodies: CANNON.Body[] = [];
  samples: Sample[] = [];
  envMap: THREE.Texture | null;
  private stlMesh: THREE.Mesh | null = null;
  private ballGeometry: THREE.BufferGeometry | null = null;
  private ballScale = 1;
  private ballRadiusActual = BALL_RADIUS;
  private sampleMaterial = new CANNON.Material('sample');

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
    this.loadSTLField();
    this.loadBallSTL();
  }

  // ─── PHYSICS FLOOR ───
  private buildPhysicsFloor() {
    const gb = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    gb.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(gb);
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

  // ─── STL FIELD MODEL ───
  private loadSTLField() {
    const loader = new STLLoader();
    loader.load(
      '/models/field.stl',
      (geometry) => {
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        const bb = geometry.boundingBox!;
        const size = new THREE.Vector3();
        bb.getSize(size);
        const maxExtent = Math.max(size.x, size.y, size.z);

        const scale = maxExtent > 100 ? 0.001 : 1;

        const material = new THREE.MeshPhysicalMaterial({
          color: 0xcccccc,
          roughness: 0.5,
          metalness: 0.1,
          clearcoat: 0.1,
          envMap: this.envMap,
          envMapIntensity: 0.5,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.setScalar(scale);
        mesh.rotation.x = -Math.PI / 2;

        geometry.computeBoundingBox();
        const bb2 = geometry.boundingBox!;
        const centre = new THREE.Vector3();
        bb2.getCenter(centre);

        mesh.position.set(
          -centre.x * scale,
          -bb2.min.y * scale,
          centre.y * scale,
        );

        mesh.updateMatrixWorld(true);
        const worldBox = new THREE.Box3().setFromObject(mesh);
        mesh.position.y -= worldBox.min.y;

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.meshes.push(mesh);
        this.stlMesh = mesh;

        console.log(
          `[Field] STL loaded — ${(geometry.attributes.position.count / 3) | 0} triangles, ` +
          `scale=${scale}, size=${size.x.toFixed(0)}×${size.y.toFixed(0)}×${size.z.toFixed(0)} (raw units)`
        );
      },
      (progress) => {
        if (progress.total) {
          const pct = ((progress.loaded / progress.total) * 100).toFixed(0);
          console.log(`[Field] Loading STL… ${pct}%`);
        }
      },
      (error) => {
        console.warn('[Field] Could not load STL field model:', error);
      },
    );
  }

  // ─── LOAD BALL STL & SPAWN SAMPLES ───
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

        // CAD is in mm — just convert to metres
        this.ballScale = maxRaw > 100 ? 0.001 : 1;

        // Centre the geometry at origin
        geometry.center();

        // Rotate from Z-up CAD to Y-up Three.js
        geometry.rotateX(-Math.PI / 2);

        this.ballGeometry = geometry;

        // Derive the actual ball radius in metres from the CAD geometry
        this.ballRadiusActual = (maxRaw * this.ballScale) / 2;

        console.log(`[Field] Ball STL loaded — diameter=${(this.ballRadiusActual * 2 * 1000).toFixed(1)}mm, scale=${this.ballScale.toFixed(4)}`);

        this.spawnAllSamples();
      },
      undefined,
      (error) => {
        console.warn('[Field] Could not load ball STL, falling back to spheres:', error);
        this.ballGeometry = null;
        this.spawnAllSamples();
      },
    );
  }

  private spawnAllSamples() {
    const r = this.ballRadiusActual;
    const y = r + 0.005;

    const leftX = -TILE;
    const rightX = TILE;
    const zPositions = [
      -HALF + 1.5 * TILE,
      -HALF + 2.5 * TILE,
      -HALF + 3.5 * TILE,
    ];

    const ballSpacing = r * 2.5;
    for (const sz of zPositions) {
      this.spawnSample(leftX - ballSpacing, y, sz, 'purple');
      this.spawnSample(leftX, y, sz, 'purple');
      this.spawnSample(leftX + ballSpacing, y, sz, 'green');

      this.spawnSample(rightX - ballSpacing, y, sz, 'purple');
      this.spawnSample(rightX, y, sz, 'purple');
      this.spawnSample(rightX + ballSpacing, y, sz, 'green');
    }

    this.spawnSample(0, y, -HALF + 1.5 * TILE, 'yellow');
    this.spawnSample(0, y, -HALF + 2.5 * TILE, 'yellow');
    this.spawnSample(0, y, -HALF + 3.5 * TILE, 'yellow');
  }

  private spawnSample(x: number, y: number, z: number, color: SampleColor) {
    const hexColor = color === 'purple' ? PURPLE : color === 'green' ? GREEN : YELLOW;

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
      // Fallback: plain sphere if STL failed to load
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

    // Physics: sphere collider sized to actual STL
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
  }
}
