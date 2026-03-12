import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// DECODE 2025-26 Game Pieces
// Exact layout matching official reference image
// 24 Purple, 12 Green spheres

interface Artifact {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  color: 'green' | 'purple';
  initialPos: THREE.Vector3;
}

const FIELD_SIZE = 3.6576;
const HALF = FIELD_SIZE / 2;
const ARTIFACT_RADIUS = 0.0635;

const PURPLE = 0x8833aa;
const GREEN = 0x33aa44;

export class GamePieces {
  scene: THREE.Scene;
  world: CANNON.World;
  pieces: Artifact[] = [];

  private artifactMaterial = new CANNON.Material('artifact');

  constructor(scene: THREE.Scene, world: CANNON.World) {
    this.scene = scene;
    this.world = world;
    const contactMat = new CANNON.ContactMaterial(
      this.artifactMaterial,
      this.artifactMaterial,
      { friction: 0.3, restitution: 0.5 }
    );
    this.world.addContactMaterial(contactMat);
  }

  spawnAll() {
    const y = ARTIFACT_RADIUS + 0.02;

    // LEFT SIDE SPIKES (-X) [Purple, Purple, Green]
    const leftZ = [-0.5, 0.05, 0.6];
    for (const z of leftZ) {
      this.spawn(-1.15, y, z, 'purple');
      this.spawn(-1.0, y, z, 'purple');
      this.spawn(-0.85, y, z, 'green');
    }

    // RIGHT SIDE SPIKES (+X) [Green, Purple, Purple]
    const rightZ = [-0.5, 0.05, 0.6];
    for (const z of rightZ) {
      this.spawn(0.85, y, z, 'green');
      this.spawn(1.0, y, z, 'purple');
      this.spawn(1.15, y, z, 'purple');
    }

    // FRONT CORNER LOAD ZONES (inside field)
    // Left
    this.spawn(-HALF + 0.45, y, HALF - 0.2, 'purple');
    this.spawn(-HALF + 0.3, y, HALF - 0.2, 'green');
    this.spawn(-HALF + 0.15, y, HALF - 0.2, 'purple');

    // Right
    this.spawn(HALF - 0.45, y, HALF - 0.2, 'purple');
    this.spawn(HALF - 0.3, y, HALF - 0.2, 'green');
    this.spawn(HALF - 0.15, y, HALF - 0.2, 'purple');

    // HUMAN PLAYER BOXES (outside field walls)
    // Left Box (4 Purple, 2 Green)
    const lBoxX = -HALF - 0.35;
    const boxZ = HALF - 0.4;
    this.spawn(lBoxX - 0.1, y, boxZ - 0.1, 'purple');
    this.spawn(lBoxX + 0.1, y, boxZ - 0.1, 'purple');
    this.spawn(lBoxX, y, boxZ, 'green');
    this.spawn(lBoxX - 0.1, y, boxZ + 0.1, 'purple');
    this.spawn(lBoxX + 0.1, y, boxZ + 0.1, 'purple');
    this.spawn(lBoxX + 0.2, y, boxZ, 'green');

    // Right Box (4 Purple, 2 Green)
    const rBoxX = HALF + 0.35;
    this.spawn(rBoxX - 0.1, y, boxZ - 0.1, 'purple');
    this.spawn(rBoxX + 0.1, y, boxZ - 0.1, 'purple');
    this.spawn(rBoxX, y, boxZ, 'green');
    this.spawn(rBoxX - 0.1, y, boxZ + 0.1, 'purple');
    this.spawn(rBoxX + 0.1, y, boxZ + 0.1, 'purple');
    this.spawn(rBoxX + 0.2, y, boxZ, 'green');
  }

  private spawn(x: number, y: number, z: number, color: 'green' | 'purple') {
    const hexColor = color === 'green' ? GREEN : PURPLE;
    const geo = new THREE.SphereGeometry(ARTIFACT_RADIUS, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: hexColor, roughness: 0.2, metalness: 0.1, emissive: hexColor, emissiveIntensity: 0.1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.scene.add(mesh);

    const body = new CANNON.Body({
      mass: 0.08, shape: new CANNON.Sphere(ARTIFACT_RADIUS), material: this.artifactMaterial, linearDamping: 0.5, angularDamping: 0.5
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
      p.body.velocity.setZero(); p.body.angularVelocity.setZero();
      p.body.quaternion.set(0, 0, 0, 1);
      p.mesh.position.copy(p.initialPos); p.mesh.quaternion.set(0, 0, 0, 1);
    }
  }

  getPiecesNear(pos: THREE.Vector3, radius: number): Artifact[] {
    return this.pieces.filter(p => {
      const dx = p.mesh.position.x - pos.x;
      const dz = p.mesh.position.z - pos.z;
      return Math.sqrt(dx * dx + dz * dz) < radius;
    });
  }
}
