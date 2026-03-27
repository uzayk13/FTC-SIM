import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ══════════════════════════════════════════════════════════════
// DECODE 2025-26 — Samples (5″ polypropylene balls)
// Purple (high-value) and Green (low-value)
// Placed on spike marks on the field
// ══════════════════════════════════════════════════════════════

const IN = 0.0254;
const FIELD = 144 * IN;
const HALF  = FIELD / 2;
const TILE  = 24 * IN;

// Sample dimensions (5″ nominal diameter)
const BALL_RADIUS = 2.5 * IN;

// Colours
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

export class GamePieces {
  scene: THREE.Scene;
  world: CANNON.World;
  pieces: Sample[] = [];
  envMap: THREE.Texture | null;

  private sampleMaterial = new CANNON.Material('sample');

  constructor(scene: THREE.Scene, world: CANNON.World, envMap: THREE.Texture | null = null) {
    this.scene = scene;
    this.world = world;
    this.envMap = envMap;

    // Sample-to-sample contact
    const sampleContact = new CANNON.ContactMaterial(
      this.sampleMaterial, this.sampleMaterial,
      { friction: 0.3, restitution: 0.5 }
    );
    this.world.addContactMaterial(sampleContact);
  }

  spawnAll() {
    const y = BALL_RADIUS + 0.005;

    // ── Spike-mark samples ──
    // 6 spike marks: 2 columns × 3 rows
    const leftX = -TILE;
    const rightX = TILE;
    const zPositions = [
      -HALF + 1.5 * TILE,
      -HALF + 2.5 * TILE,
      -HALF + 3.5 * TILE,
    ];

    const ballSpacing = BALL_RADIUS * 2.5;
    for (const sz of zPositions) {
      // Left spike marks: 2 purple + 1 green
      this.spawn(leftX - ballSpacing, y, sz, 'purple');
      this.spawn(leftX, y, sz, 'purple');
      this.spawn(leftX + ballSpacing, y, sz, 'green');

      // Right spike marks: 2 purple + 1 green
      this.spawn(rightX - ballSpacing, y, sz, 'purple');
      this.spawn(rightX, y, sz, 'purple');
      this.spawn(rightX + ballSpacing, y, sz, 'green');
    }

    // ── Yellow (neutral) samples on the centre line ──
    this.spawn(0, y, -HALF + 1.5 * TILE, 'yellow');
    this.spawn(0, y, -HALF + 2.5 * TILE, 'yellow');
    this.spawn(0, y, -HALF + 3.5 * TILE, 'yellow');
  }

  private spawn(x: number, y: number, z: number, color: SampleColor) {
    const hexColor = color === 'purple' ? PURPLE : color === 'green' ? GREEN : YELLOW;

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
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const shape = new CANNON.Sphere(BALL_RADIUS);
    const body = new CANNON.Body({
      mass: 0.05,
      shape,
      material: this.sampleMaterial,
      linearDamping: 0.4,
      angularDamping: 0.4,
    });
    body.position.set(x, y, z);
    this.world.addBody(body);

    this.pieces.push({ mesh, body, color, initialPos: new THREE.Vector3(x, y, z) });
  }

  update(_dt: number) {
    for (const p of this.pieces) {
      p.mesh.position.copy(p.body.position as unknown as THREE.Vector3);
      p.mesh.quaternion.copy(p.body.quaternion as unknown as THREE.Quaternion);
    }
  }

  reset() {
    for (const p of this.pieces) {
      p.body.position.set(p.initialPos.x, p.initialPos.y, p.initialPos.z);
      p.body.velocity.setZero();
      p.body.angularVelocity.setZero();
      p.body.quaternion.set(0, 0, 0, 1);
      p.mesh.position.copy(p.initialPos);
      p.mesh.rotation.set(0, 0, 0);
    }
  }

  getPiecesNear(pos: THREE.Vector3, radius: number): Sample[] {
    return this.pieces.filter(p => {
      const dx = p.mesh.position.x - pos.x;
      const dz = p.mesh.position.z - pos.z;
      return Math.sqrt(dx * dx + dz * dz) < radius;
    });
  }
}
