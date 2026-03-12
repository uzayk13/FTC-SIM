import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GamePieces } from './GamePieces';

// DECODE 2025-26 field — matched perfectly to official reference image
// Goals on back wall, ramps parallel to side walls, single centered obelisk, etc.
const FIELD_SIZE = 3.6576;
const HALF = FIELD_SIZE / 2;
const WALL_HEIGHT = 0.3;
const TILE_SIZE = FIELD_SIZE / 6;
const IN = 0.0254;

export class Field {
  scene: THREE.Scene;
  world: CANNON.World;
  gamePieces: GamePieces;
  meshes: THREE.Object3D[] = [];
  bodies: CANNON.Body[] = [];
  envMap: THREE.Texture | null;

  constructor(scene: THREE.Scene, world: CANNON.World, envMap: THREE.Texture | null = null) {
    this.scene = scene;
    this.world = world;
    this.envMap = envMap;
    this.gamePieces = new GamePieces(scene, world, envMap);
    this.buildField();
    this.gamePieces.spawnAll();
  }

  private buildField() {
    this.buildFloor();
    this.buildWalls();
    this.buildPerimeterLEDs();

    // Blue goal on the left (-X), Red goal on the right (+X)
    this.buildGoalLeft(-HALF + 0.4, -HALF, 0x0066cc);
    this.buildGoalRight(HALF - 0.4, -HALF, 0xcc2222);

    this.buildObelisk();
    this.buildTapeLines();
    this.buildBoxesAndZones();
  }

  private buildFloor() {
    const mats = [
      new THREE.MeshPhysicalMaterial({ color: 0x444444, roughness: 0.7, metalness: 0.05, clearcoat: 0.15, clearcoatRoughness: 0.6, envMapIntensity: 0.4 }),
      new THREE.MeshPhysicalMaterial({ color: 0x3a3a3a, roughness: 0.7, metalness: 0.05, clearcoat: 0.15, clearcoatRoughness: 0.6, envMapIntensity: 0.4 }),
    ];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE - 0.005, 0.02, TILE_SIZE - 0.005), mats[(i + j) % 2]);
        t.position.set(-HALF + TILE_SIZE * (i + 0.5), 0.01, -HALF + TILE_SIZE * (j + 0.5));
        t.receiveShadow = true;
        this.scene.add(t);
        this.meshes.push(t);
      }
    }
    const gb = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    gb.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(gb);
  }

  private buildWalls() {
    // Transparent polycarbonate walls — physically-based glass
    const wm = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.92,
      opacity: 0.15,
      transparent: true,
      roughness: 0.05,
      metalness: 0.0,
      ior: 1.5,
      thickness: 0.005,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide
    });

    // Solid frame bars — brushed aluminum
    const fm = new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.9, clearcoat: 0.3, clearcoatRoughness: 0.4 });

    const ws = [
      { p: [0, WALL_HEIGHT / 2, -HALF], s: [FIELD_SIZE, WALL_HEIGHT, 0.01] },
      { p: [0, WALL_HEIGHT / 2, HALF], s: [FIELD_SIZE, WALL_HEIGHT, 0.01] },
      { p: [-HALF, WALL_HEIGHT / 2, 0], s: [0.01, WALL_HEIGHT, FIELD_SIZE] },
      { p: [HALF, WALL_HEIGHT / 2, 0], s: [0.01, WALL_HEIGHT, FIELD_SIZE] },
    ];

    for (const w of ws) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w.s[0], w.s[1], w.s[2]), wm);
      m.position.set(w.p[0], w.p[1], w.p[2]);
      this.scene.add(m); this.meshes.push(m);

      const b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(w.s[0] / 2 + 0.05, w.s[1] / 2, w.s[2] / 2 + 0.05)) });
      b.position.set(w.p[0], w.p[1], w.p[2]);
      this.world.addBody(b);
    }

    // Top frames
    for (const w of ws) {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(w.s[0] === 0.01 ? 0.03 : w.s[0] + 0.04, 0.03, w.s[2] === 0.01 ? 0.03 : w.s[2] + 0.04),
        fm
      );
      frame.position.set(w.p[0], WALL_HEIGHT + 0.015, w.p[2]);
      this.scene.add(frame);
    }
  }

  private buildPerimeterLEDs() {
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x6633ff, emissive: 0x6633ff, emissiveIntensity: 4.0, transparent: true, opacity: 0.9 });
    const segs = [
      { p: [0, 0.015, -HALF + 0.015], s: [FIELD_SIZE, 0.01, 0.01] },
      { p: [0, 0.015, HALF - 0.015], s: [FIELD_SIZE, 0.01, 0.01] },
      { p: [-HALF + 0.015, 0.015, 0], s: [0.01, 0.01, FIELD_SIZE] },
      { p: [HALF - 0.015, 0.015, 0], s: [0.01, 0.01, FIELD_SIZE] },
    ];
    for (const s of segs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.s[0], s.s[1], s.s[2]), ledMat);
      m.position.set(s.p[0], s.p[1], s.p[2]);
      this.scene.add(m);
    }
  }

  // Large Blue Goal on the Left
  private buildGoalLeft(cx: number, cz: number, color: number) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);

    const goalW = 26 * IN;
    const lipH = 38.75 * IN;
    const bbH = 15 * IN;
    const totalH = lipH + bbH;

    // Angled front face
    const panelShape = new THREE.Shape();
    panelShape.moveTo(-goalW / 2, 0);
    panelShape.lineTo(goalW / 2 + 0.3, 0);
    panelShape.lineTo(goalW / 2, totalH);
    panelShape.lineTo(-goalW / 2, totalH);
    panelShape.closePath();
    const panelGeo = new THREE.ExtrudeGeometry(panelShape, { depth: 0.02, bevelEnabled: false });
    const panelMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(0, 0, 0);
    g.add(panel);

    // AprilTag Logo
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
    tag.position.set(0, lipH + 0.1, 0.025);
    g.add(tag);

    // Ramp along the left wall
    const rampW = 8 * IN;
    const rampL = 40 * IN;
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampW, 0.02, rampL), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.5, transparent: true, opacity: 0.8 }));
    ramp.position.set(-goalW / 2 + rampW / 2, lipH * 0.4, rampL / 2 + 0.1);
    ramp.rotation.x = -Math.PI / 8; // sloping down towards front
    g.add(ramp);

    // Ramp side rails (aluminum)
    const railMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    for (const sx of [-rampW / 2, rampW / 2]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, rampL, 8), railMat);
      rail.position.set(-goalW / 2 + rampW / 2 + sx, lipH * 0.4 + 0.05, rampL / 2 + 0.1);
      rail.rotation.x = -Math.PI / 8;
      g.add(rail);
    }

    // Aluminum support legs for ramp
    const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, lipH * 0.2, 8), railMat);
    leg1.position.set(-goalW / 2 + rampW / 2 - 0.05, lipH * 0.1, rampL - 0.1);
    g.add(leg1);
    const leg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, lipH * 0.2, 8), railMat);
    leg2.position.set(-goalW / 2 + rampW / 2 + 0.05, lipH * 0.1, rampL - 0.1);
    g.add(leg2);

    this.scene.add(g);

    // Physics collider
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(goalW / 2 + 0.15, totalH / 2, 0.05)),
    });
    body.position.set(cx, totalH / 2, cz + 0.02);
    this.world.addBody(body);
  }

  // Large Red Goal on the Right
  private buildGoalRight(cx: number, cz: number, color: number) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);

    const goalW = 26 * IN;
    const lipH = 38.75 * IN;
    const bbH = 15 * IN;
    const totalH = lipH + bbH;

    // Angled front face (mirrored)
    const panelShape = new THREE.Shape();
    panelShape.moveTo(goalW / 2, 0);
    panelShape.lineTo(-goalW / 2 - 0.3, 0);
    panelShape.lineTo(-goalW / 2, totalH);
    panelShape.lineTo(goalW / 2, totalH);
    panelShape.closePath();
    const panelGeo = new THREE.ExtrudeGeometry(panelShape, { depth: 0.02, bevelEnabled: false });
    const panelMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(0, 0, 0);
    g.add(panel);

    // AprilTag Logo
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
    tag.position.set(0, lipH + 0.1, 0.025);
    g.add(tag);

    // Ramp along the right wall
    const rampW = 8 * IN;
    const rampL = 40 * IN;
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampW, 0.02, rampL), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.5, transparent: true, opacity: 0.8 }));
    ramp.position.set(goalW / 2 - rampW / 2, lipH * 0.4, rampL / 2 + 0.1);
    ramp.rotation.x = -Math.PI / 8; // sloping down
    g.add(ramp);

    // Ramp side rails
    const railMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    for (const sx of [-rampW / 2, rampW / 2]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, rampL, 8), railMat);
      rail.position.set(goalW / 2 - rampW / 2 + sx, lipH * 0.4 + 0.05, rampL / 2 + 0.1);
      rail.rotation.x = -Math.PI / 8;
      g.add(rail);
    }

    // Aluminum support legs
    const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, lipH * 0.2, 8), railMat);
    leg1.position.set(goalW / 2 - rampW / 2 - 0.05, lipH * 0.1, rampL - 0.1);
    g.add(leg1);
    const leg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, lipH * 0.2, 8), railMat);
    leg2.position.set(goalW / 2 - rampW / 2 + 0.05, lipH * 0.1, rampL - 0.1);
    g.add(leg2);

    this.scene.add(g);

    // Physics collider
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(goalW / 2 + 0.15, totalH / 2, 0.05)),
    });
    body.position.set(cx, totalH / 2, cz + 0.02);
    this.world.addBody(body);
  }

  private buildObelisk() {
    const h = 23 * IN;
    const faceW = 11 * IN;
    const r = faceW / Math.sqrt(3);

    const tri = new THREE.Shape();
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3 - Math.PI / 2;
      if (i === 0) tri.moveTo(r * Math.cos(a), r * Math.sin(a));
      else tri.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    tri.closePath();

    const geo = new THREE.ExtrudeGeometry(tri, { depth: h, bevelEnabled: false });
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.1 }); // White obelisk
    const mesh = new THREE.Mesh(geo, mat);
    // Centered behind the back wall glass
    mesh.position.set(0, 0, -HALF - 0.15);
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = true;
    this.scene.add(mesh); this.meshes.push(mesh);

    // AprilTag Logo
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 }));
    tag.position.set(0, h * 0.6, -HALF - 0.15 + r + 0.005);
    this.scene.add(tag);
  }

  private buildTapeLines() {
    const tm = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const w = 0.02;

    // Diamond / V-lines in the center
    // Left side V-lines
    const l1 = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.003, w), tm);
    l1.position.set(-0.85, 0.025, -0.3); l1.rotation.y = -Math.PI / 5.5;
    this.scene.add(l1);

    const l2 = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.003, w), tm);
    l2.position.set(-0.85, 0.025, 0.3); l2.rotation.y = Math.PI / 5.5;
    this.scene.add(l2);

    // Right side V-lines
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.003, w), tm);
    r1.position.set(0.85, 0.025, -0.3); r1.rotation.y = Math.PI / 5.5;
    this.scene.add(r1);

    const r2 = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.003, w), tm);
    r2.position.set(0.85, 0.025, 0.3); r2.rotation.y = -Math.PI / 5.5;
    this.scene.add(r2);

    // Side alliance tape lines
    // Red on left, Blue on right from mid-field to front
    const redMat = new THREE.MeshBasicMaterial({ color: 0xcc2222 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2255cc });

    // Left (Red) line
    const rl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.003, HALF), redMat);
    rl.position.set(-HALF + 0.3, 0.026, HALF / 2);
    this.scene.add(rl);

    // Right (Blue) line
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.003, HALF), blueMat);
    bl.position.set(HALF - 0.3, 0.026, HALF / 2);
    this.scene.add(bl);
  }

  private buildBoxesAndZones() {
    const sz = 18 * IN;
    const tw = 0.02;

    // LEFT = RED ZONE | RIGHT = BLUE ZONE
    const redBoxMat = new THREE.MeshBasicMaterial({ color: 0xcc2222 });
    const cxR = -1.0; const czR = 0.6;
    for (const e of [
      { p: [cxR, 0.025, czR - sz / 2], s: [sz, 0.003, tw] }, { p: [cxR, 0.025, czR + sz / 2], s: [sz, 0.003, tw] },
      { p: [cxR - sz / 2, 0.025, czR], s: [tw, 0.003, sz] }, { p: [cxR + sz / 2, 0.025, czR], s: [tw, 0.003, sz] },
    ]) {
      const tape = new THREE.Mesh(new THREE.BoxGeometry(e.s[0], e.s[1], e.s[2]), redBoxMat);
      tape.position.set(e.p[0], e.p[1], e.p[2]); this.scene.add(tape);
    }

    // Right = BLUE ZONE
    const blueBoxMat = new THREE.MeshBasicMaterial({ color: 0x2255cc });
    const cxB = 1.0; const czB = 0.6;
    for (const e of [
      { p: [cxB, 0.025, czB - sz / 2], s: [sz, 0.003, tw] }, { p: [cxB, 0.025, czB + sz / 2], s: [sz, 0.003, tw] },
      { p: [cxB - sz / 2, 0.025, czB], s: [tw, 0.003, sz] }, { p: [cxB + sz / 2, 0.025, czB], s: [tw, 0.003, sz] },
    ]) {
      const tape = new THREE.Mesh(new THREE.BoxGeometry(e.s[0], e.s[1], e.s[2]), blueBoxMat);
      tape.position.set(e.p[0], e.p[1], e.p[2]); this.scene.add(tape);
    }

    // Corner loading boxes (white L shapes)
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const cz = HALF - 0.45;
    const cxL = -HALF + 0.45;
    const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.003, tw), whiteMat);
    l1.position.set(cxL - 0.15, 0.025, cz); this.scene.add(l1);
    const l2 = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.003, 0.3), whiteMat);
    l2.position.set(cxL, 0.025, cz + 0.15); this.scene.add(l2);

    const cxR2 = HALF - 0.45;
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.003, tw), whiteMat);
    r1.position.set(cxR2 + 0.15, 0.025, cz); this.scene.add(r1);
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.003, 0.3), whiteMat);
    r2.position.set(cxR2, 0.025, cz + 0.15); this.scene.add(r2);

    // HUMAN PLAYER BOXES (outside field walls)
    const hpboxm = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const box1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.4), hpboxm);
    box1.position.set(-HALF - 0.35, 0.025, HALF - 0.4);
    this.scene.add(box1);

    const box2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.4), hpboxm);
    box2.position.set(HALF + 0.35, 0.025, HALF - 0.4);
    this.scene.add(box2);
  }

  update(dt: number) { this.gamePieces.update(dt); }
  reset() { this.gamePieces.reset(); }
}
