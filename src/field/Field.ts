import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GamePieces } from './GamePieces';

// ══════════════════════════════════════════════════════════════
// DECODE 2025-26 — FTC Playing Field
// 144 × 144 in (3.6576 m) interior
// Front wall (audience) = -Z, Back wall (goals) = +Z
// Left wall = -X (blue side), Right wall = +X (red side)
// ══════════════════════════════════════════════════════════════

// ── Dimensions (metres) ──
const IN = 0.0254;
const FIELD_IN = 144;
const FIELD = FIELD_IN * IN;             // 3.6576 m
const HALF  = FIELD / 2;                 // 1.8288 m
const TILE  = 24 * IN;                   // 0.6096 m

const WALL_H = 12 * IN;
const WALL_T = 2 * IN;

// Goals
const GOAL_W = 27 * IN;
const GOAL_D = 27 * IN;
const GOAL_H = 54 * IN;
const GOAL_LIP_H = 38.75 * IN;
// const GOAL_BACKBOARD_H = 15 * IN;  // will use when backboard is added
const GOAL_WALL_T = 1 * IN;

// Classifier / Ramp
const RAMP_LENGTH = 3 * TILE;            // 72 inches from back wall
const RAMP_W = 8 * IN;
const RAMP_RAIL_H = 6 * IN;

// Loading zones
const LOAD_SIZE = 23 * IN;

// Base zones
const BASE_SIZE = 18 * IN;

// Secret tunnels
const TUNNEL_L = 46.5 * IN;
const TUNNEL_W = 6.125 * IN;

// Depots
const DEPOT_L = 30 * IN;

// Spike marks
const SPIKE_L = 10 * IN;

// Obelisk
const OBELISK_H = 23 * IN;
const OBELISK_FACE_W = 11 * IN;

// AprilTag
const TAG_SIZE = 6.5 * IN;

// Tape
const TAPE_W = 1 * IN;
const TAPE_H = 0.004;

export class Field {
  scene: THREE.Scene;
  world: CANNON.World;
  gamePieces: GamePieces;
  meshes: THREE.Object3D[] = [];
  bodies: CANNON.Body[] = [];
  envMap: THREE.Texture | null;

  private elapsedTime = 0;

  constructor(scene: THREE.Scene, world: CANNON.World, envMap: THREE.Texture | null = null) {
    this.scene = scene;
    this.world = world;
    this.envMap = envMap;
    this.gamePieces = new GamePieces(scene, world, envMap);
    this.buildField();
    this.gamePieces.spawnAll();
  }

  private buildField() {
    this.buildPhysicsFloor();
    this.buildPhysicsWalls();
    this.buildFloorTiles();
    this.buildPerimeterWalls();
    this.buildGoals();
    this.buildRamps();
    this.buildLoadingZones();
    this.buildBaseZones();
    this.buildSecretTunnels();
    this.buildLaunchZones();
    this.buildDepots();
    this.buildSpikeMarks();
    this.buildObelisk();
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

  // ─── 6 × 6 FLOOR TILES ───
  private buildFloorTiles() {
    const darkGrey  = new THREE.MeshPhysicalMaterial({ color: 0x555555, roughness: 0.6, metalness: 0.05, clearcoat: 0.08 });
    const lightGrey = new THREE.MeshPhysicalMaterial({ color: 0x666666, roughness: 0.55, metalness: 0.05, clearcoat: 0.1 });
    const tilePlane = new THREE.PlaneGeometry(TILE - 0.002, TILE - 0.002);

    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) {
        const x = -HALF + TILE / 2 + col * TILE;
        const z = -HALF + TILE / 2 + row * TILE;
        const mat = (row + col) % 2 === 0 ? darkGrey : lightGrey;

        const tile = new THREE.Mesh(tilePlane, mat);
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(x, 0.001, z);
        tile.receiveShadow = true;
        this.scene.add(tile);
      }
    }

    // Tile seam lines
    const seamMat = new THREE.MeshBasicMaterial({ color: 0x3a3a3a });
    for (let i = 1; i < 6; i++) {
      const offset = -HALF + i * TILE;
      const hLine = new THREE.Mesh(new THREE.BoxGeometry(FIELD, 0.001, 0.003), seamMat);
      hLine.position.set(0, 0.002, offset);
      this.scene.add(hLine);
      const vLine = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.001, FIELD), seamMat);
      vLine.position.set(offset, 0.002, 0);
      this.scene.add(vLine);
    }
  }

  // ─── PERIMETER WALLS ───
  private buildPerimeterWalls() {
    const wallMat = new THREE.MeshPhysicalMaterial({
      color: 0x888888, roughness: 0.4, metalness: 0.15,
      clearcoat: 0.25, side: THREE.DoubleSide,
      transparent: true, opacity: 0.3,
    });
    const railMat = new THREE.MeshPhysicalMaterial({
      color: 0x999999, roughness: 0.25, metalness: 0.3, clearcoat: 0.4,
      transparent: true, opacity: 0.3,
    });
    const railH = 0.02;
    const railOver = 0.008;

    const walls: [number, number, number, number][] = [
      [0, -HALF, FIELD + WALL_T, WALL_T],
      [0,  HALF, FIELD + WALL_T, WALL_T],
      [-HALF, 0, WALL_T, FIELD],
      [ HALF, 0, WALL_T, FIELD],
    ];

    for (const [wx, wz, sx, sz] of walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, WALL_H, sz), wallMat);
      wall.position.set(wx, WALL_H / 2, wz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
      this.meshes.push(wall);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(sx + railOver * 2, railH, sz + railOver * 2), railMat);
      rail.position.set(wx, WALL_H + railH / 2, wz);
      rail.castShadow = true;
      this.scene.add(rail);
    }

    // Corner brackets
    const bracketMat = new THREE.MeshPhysicalMaterial({ color: 0x777777, roughness: 0.35, metalness: 0.2, clearcoat: 0.3, transparent: true, opacity: 0.3 });
    const bSz = 0.06;
    for (const cx of [-HALF, HALF]) {
      for (const cz of [-HALF, HALF]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(bSz, WALL_H + 0.01, bSz), bracketMat);
        b.position.set(cx, WALL_H / 2, cz);
        b.castShadow = true;
        this.scene.add(b);
      }
    }
  }

  // ─── GOALS (Blue back-left, Red back-right) ───
  // Simple tall colored panels in back corners with AprilTags
  private buildGoals() {
    // Blue goal: back-left corner, faces along back wall toward +X
    this.buildGoal(-HALF + GOAL_D / 2, HALF - GOAL_W / 2, 'blue', Math.PI / 2, false);
    // Red goal: back-right corner, faces along back wall toward -X
    this.buildGoal(HALF - GOAL_D / 2, HALF - GOAL_W / 2, 'red', -Math.PI / 2, true);
  }

  private buildGoal(x: number, z: number, alliance: 'red' | 'blue', rotY: number, mirrorPeak: boolean) {
    const group = new THREE.Group();
    const color = alliance === 'red' ? 0xcc2222 : 0x2244cc;
    const colorLight = alliance === 'red' ? 0xff4444 : 0x4466ff;
    const T = GOAL_WALL_T;
    const H = GOAL_H;

    const goalMat = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.4, metalness: 0.3, clearcoat: 0.3,
    });

    const lipH = GOAL_LIP_H;  // 38.75" — height at adjacent/front corners
    const peakH = H;           // 54" — height at arena (backmost) corner

    // Peak side: x=-W/2 for blue, x=+W/2 for red (mirrored so peak lands in arena corner)
    const peakX = mirrorPeak ? GOAL_W / 2 : -GOAL_W / 2;
    const lipX  = mirrorPeak ? -GOAL_W / 2 : GOAL_W / 2;

    // Slant wall on the peak side (runs along depth, peaks at z=-D/2)
    const slantSideShape = new THREE.Shape();
    slantSideShape.moveTo(-GOAL_D / 2, 0);
    slantSideShape.lineTo(GOAL_D / 2, 0);
    slantSideShape.lineTo(GOAL_D / 2, peakH);
    slantSideShape.lineTo(-GOAL_D / 2, lipH);
    slantSideShape.closePath();
    const slantSideGeo = new THREE.ExtrudeGeometry(slantSideShape, { depth: T, bevelEnabled: false });
    const slantSideMesh = new THREE.Mesh(slantSideGeo, goalMat);
    slantSideMesh.rotation.y = Math.PI / 2;
    slantSideMesh.position.set(peakX, 0, 0);
    slantSideMesh.castShadow = true;
    group.add(slantSideMesh);

    // Front wall (SLANT): at z=-D/2, peaks at peakX side, slopes to lip at lipX side
    const frontShape = new THREE.Shape();
    if (mirrorPeak) {
      frontShape.moveTo(-GOAL_W / 2, 0);
      frontShape.lineTo(GOAL_W / 2, 0);
      frontShape.lineTo(GOAL_W / 2, peakH);   // peak at +W/2
      frontShape.lineTo(-GOAL_W / 2, lipH);    // lip at -W/2
    } else {
      frontShape.moveTo(-GOAL_W / 2, 0);
      frontShape.lineTo(GOAL_W / 2, 0);
      frontShape.lineTo(GOAL_W / 2, lipH);     // lip at +W/2
      frontShape.lineTo(-GOAL_W / 2, peakH);   // peak at -W/2
    }
    frontShape.closePath();
    const frontGeo = new THREE.ExtrudeGeometry(frontShape, { depth: T, bevelEnabled: false });
    const frontMesh = new THREE.Mesh(frontGeo, goalMat);
    frontMesh.position.set(0, 0, -GOAL_D / 2);
    frontMesh.castShadow = true;
    group.add(frontMesh);

    // Flat wall on the lip side, flat top at lipH
    group.add(this.makeBox(lipX, lipH / 2, 0, T, lipH, GOAL_D, goalMat));

    // Back wall (HORIZONTAL): inner side, flat top at lipH
    group.add(this.makeBox(0, lipH / 2, GOAL_D / 2, GOAL_W, lipH, T, goalMat));

    // AprilTag on front face (centered, 9.25" up)
    this.addAprilTag(group, 0, 9.25 * IN, GOAL_D / 2 + 0.002, 0, TAG_SIZE);

    // Glow light
    const glow = new THREE.PointLight(colorLight, 1.5, 3);
    glow.position.set(0, H + 4 * IN, 0);
    group.add(glow);

    group.rotation.y = rotY;
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.meshes.push(group);

    // Physics colliders — individual walls so interior is hollow (balls can enter from top)
    const wallDefs = [
      // Peak-side wall
      { lx: peakX, lz: 0, hw: T / 2, hh: peakH / 2, hd: GOAL_D / 2, cy: peakH / 2 },
      // Lip-side wall
      { lx: lipX, lz: 0, hw: T / 2, hh: lipH / 2, hd: GOAL_D / 2, cy: lipH / 2 },
      // Front wall (z=-D/2)
      { lx: 0, lz: -GOAL_D / 2, hw: GOAL_W / 2, hh: lipH / 2, hd: T / 2, cy: lipH / 2 },
      // Back wall (z=+D/2)
      { lx: 0, lz: GOAL_D / 2, hw: GOAL_W / 2, hh: lipH / 2, hd: T / 2, cy: lipH / 2 },
    ];
    for (const w of wallDefs) {
      const wallBody = new CANNON.Body({ type: CANNON.Body.STATIC });
      wallBody.addShape(new CANNON.Box(new CANNON.Vec3(w.hw, w.hh, w.hd)));
      // Rotate local position by group rotation
      const cosR = Math.cos(rotY);
      const sinR = Math.sin(rotY);
      const wx = w.lx * cosR + w.lz * sinR;
      const wz = -w.lx * sinR + w.lz * cosR;
      wallBody.position.set(x + wx, w.cy, z + wz);
      wallBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotY);
      this.world.addBody(wallBody);
      this.bodies.push(wallBody);
    }
  }

  // ─── CLASSIFIER RAMPS (along side walls from goals toward front) ───
  private buildRamps() {
    const rampMat = new THREE.MeshPhysicalMaterial({
      color: 0x994444, roughness: 0.5, metalness: 0.4, clearcoat: 0.3,
    });
    const railMat = new THREE.MeshPhysicalMaterial({
      color: 0x555555, roughness: 0.3, metalness: 0.7, clearcoat: 0.4,
    });

    // Blue ramp along left wall (-X side)
    // Runs from back wall (HALF) toward front, ending at HALF - RAMP_LENGTH
    const rampEndZ = HALF - RAMP_LENGTH;

    for (const side of [-1, 1] as const) {
      const sideX = side * (HALF - RAMP_W / 2);
      const rampCenterZ = HALF - RAMP_LENGTH / 2;

      // Ramp floor (slightly angled — higher at goal end)
      const rampFloor = new THREE.Mesh(
        new THREE.BoxGeometry(RAMP_W, RAMP_RAIL_H * 0.3, RAMP_LENGTH),
        rampMat
      );
      rampFloor.position.set(sideX, RAMP_RAIL_H * 0.15, rampCenterZ);
      rampFloor.castShadow = true;
      rampFloor.receiveShadow = true;
      this.scene.add(rampFloor);

      // Inner rail (facing field center)
      const innerX = side * (HALF - RAMP_W);
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.01, RAMP_RAIL_H, RAMP_LENGTH),
        railMat
      );
      rail.position.set(innerX, RAMP_RAIL_H / 2, rampCenterZ);
      rail.castShadow = true;
      this.scene.add(rail);

      // End cap at front end of ramp
      const endCap = new THREE.Mesh(
        new THREE.BoxGeometry(RAMP_W, RAMP_RAIL_H, 0.01),
        railMat
      );
      endCap.position.set(sideX, RAMP_RAIL_H / 2, rampEndZ);
      this.scene.add(endCap);

      // Gate (small mechanism at end of ramp)
      const gateMat = new THREE.MeshPhysicalMaterial({
        color: 0x333333, roughness: 0.3, metalness: 0.8, clearcoat: 0.5,
      });
      const gate = new THREE.Mesh(
        new THREE.BoxGeometry(RAMP_W * 0.8, 5.5 * IN, 2 * IN),
        gateMat
      );
      gate.position.set(sideX, 5.5 * IN / 2, rampEndZ + 1 * IN);
      this.scene.add(gate);

      // Physics collider for ramp
      const body = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(RAMP_W / 2, RAMP_RAIL_H / 2, RAMP_LENGTH / 2)),
      });
      body.position.set(sideX, RAMP_RAIL_H / 2, rampCenterZ);
      this.world.addBody(body);
      this.bodies.push(body);
    }
  }

  // ─── LOADING ZONES (front corners, white tape) ───
  private buildLoadingZones() {
    // Red loading zone: front-left corner (-X, -Z)
    this.buildTapeZone(-HALF + LOAD_SIZE / 2, -HALF + LOAD_SIZE / 2, LOAD_SIZE, 0xffffff, 'LOAD');
    // Blue loading zone: front-right corner (+X, -Z)
    this.buildTapeZone(HALF - LOAD_SIZE / 2, -HALF + LOAD_SIZE / 2, LOAD_SIZE, 0xffffff, 'LOAD');
  }

  // ─── BASE ZONES (front area, alliance-colored tape) ───
  private buildBaseZones() {
    // Red base zone: near seam W,1 (front-left area)
    // Seam W is 2nd from left = -HALF + 2*TILE, Seam 1 is front = -HALF + 1*TILE
    // Base zone is adjacent to these seams, so its corner is at the seam intersection
    const redBaseX = -HALF + 2 * TILE - BASE_SIZE / 2;
    const redBaseZ = -HALF + TILE - BASE_SIZE / 2;
    this.buildTapeZone(redBaseX, redBaseZ, BASE_SIZE, 0xcc2222, 'BASE');

    // Blue base zone: near seam Y,1 (front-right area)
    // Seam Y is 4th from left = -HALF + 4*TILE
    const blueBaseX = -HALF + 4 * TILE + BASE_SIZE / 2;
    const blueBaseZ = -HALF + TILE - BASE_SIZE / 2;
    this.buildTapeZone(blueBaseX, blueBaseZ, BASE_SIZE, 0x2244cc, 'BASE');
  }

  // ─── SECRET TUNNELS (connect ramp ends to loading zones) ───
  private buildSecretTunnels() {
    const rampEndZ = HALF - RAMP_LENGTH;
    const tunnelMat = new THREE.MeshStandardMaterial({
      color: 0xcc2222, emissive: 0xcc2222, emissiveIntensity: 0.15,
    });
    const tunnelMatBlue = new THREE.MeshStandardMaterial({
      color: 0x2244cc, emissive: 0x2244cc, emissiveIntensity: 0.15,
    });

    // Red secret tunnel: along left wall (-X), from ramp end toward front
    // Runs from rampEndZ toward loading zone at -HALF + LOAD_SIZE
    const tunnelStartZ = rampEndZ;
    const tunnelEndZ = tunnelStartZ - TUNNEL_L;
    const tunnelCenterZ = (tunnelStartZ + tunnelEndZ) / 2;

    // Left side (red tunnel)
    for (const edge of [-1, 1]) {
      const tape = new THREE.Mesh(
        new THREE.BoxGeometry(TAPE_W, TAPE_H, TUNNEL_L), tunnelMat
      );
      tape.position.set(-HALF + TUNNEL_W / 2 + edge * TUNNEL_W / 2, TAPE_H / 2, tunnelCenterZ);
      this.scene.add(tape);
    }

    // Right side (blue tunnel)
    for (const edge of [-1, 1]) {
      const tape = new THREE.Mesh(
        new THREE.BoxGeometry(TAPE_W, TAPE_H, TUNNEL_L), tunnelMatBlue
      );
      tape.position.set(HALF - TUNNEL_W / 2 - edge * TUNNEL_W / 2, TAPE_H / 2, tunnelCenterZ);
      this.scene.add(tape);
    }

    // Translucent fills
    const fillMatRed = new THREE.MeshStandardMaterial({
      color: 0xcc2222, transparent: true, opacity: 0.08, side: THREE.DoubleSide,
    });
    const fillRed = new THREE.Mesh(new THREE.PlaneGeometry(TUNNEL_W, TUNNEL_L), fillMatRed);
    fillRed.rotation.x = -Math.PI / 2;
    fillRed.position.set(-HALF + TUNNEL_W / 2, 0.003, tunnelCenterZ);
    this.scene.add(fillRed);

    const fillMatBlue = new THREE.MeshStandardMaterial({
      color: 0x2244cc, transparent: true, opacity: 0.08, side: THREE.DoubleSide,
    });
    const fillBlue = new THREE.Mesh(new THREE.PlaneGeometry(TUNNEL_W, TUNNEL_L), fillMatBlue);
    fillBlue.rotation.x = -Math.PI / 2;
    fillBlue.position.set(HALF - TUNNEL_W / 2, 0.003, tunnelCenterZ);
    this.scene.add(fillBlue);
  }

  // ─── LAUNCH ZONES (white tape boundaries) ───
  private buildLaunchZones() {
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.2,
    });

    // Back launch zone: full width x 3 tiles deep, at goal side
    const backZ = HALF - 1.5 * TILE;
    const backFrontZ = HALF - 3 * TILE;
    // Front edge line
    this.scene.add(this.makeBox(0, TAPE_H / 2, backFrontZ, FIELD, TAPE_H, TAPE_W, whiteMat));

    // Front launch zone: 2 tiles wide x 1 tile deep, centered at audience side
    const frontCenterZ = -HALF + 0.5 * TILE;
    const frontW = 2 * TILE;
    // Left line
    this.scene.add(this.makeBox(-frontW / 2, TAPE_H / 2, frontCenterZ, TAPE_W, TAPE_H, TILE, whiteMat));
    // Right line
    this.scene.add(this.makeBox(frontW / 2, TAPE_H / 2, frontCenterZ, TAPE_W, TAPE_H, TILE, whiteMat));
    // Back line (away from audience)
    this.scene.add(this.makeBox(0, TAPE_H / 2, -HALF + TILE, frontW, TAPE_H, TAPE_W, whiteMat));

    // Translucent fills for launch zones
    const fillMat = new THREE.MeshStandardMaterial({
      color: 0xcccc44, emissive: 0xcccc44, emissiveIntensity: 0.05,
      transparent: true, opacity: 0.06, side: THREE.DoubleSide,
    });
    // Back launch zone fill
    const backFill = new THREE.Mesh(new THREE.PlaneGeometry(FIELD, 3 * TILE), fillMat);
    backFill.rotation.x = -Math.PI / 2;
    backFill.position.set(0, 0.003, backZ);
    this.scene.add(backFill);

    // Front launch zone fill
    const frontFill = new THREE.Mesh(new THREE.PlaneGeometry(frontW, TILE), fillMat);
    frontFill.rotation.x = -Math.PI / 2;
    frontFill.position.set(0, 0.003, frontCenterZ);
    this.scene.add(frontFill);
  }

  // ─── DEPOTS (white tape at base of each goal) ───
  private buildDepots() {
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3,
    });

    // Blue depot at base of blue goal (back-left)
    this.scene.add(this.makeBox(-HALF + GOAL_D + DEPOT_L / 2, TAPE_H / 2, HALF - GOAL_WALL_T / 2, DEPOT_L, TAPE_H, TAPE_W, whiteMat));

    // Red depot at base of red goal (back-right)
    this.scene.add(this.makeBox(HALF - GOAL_D - DEPOT_L / 2, TAPE_H / 2, HALF - GOAL_WALL_T / 2, DEPOT_L, TAPE_H, TAPE_W, whiteMat));
  }

  // ─── SPIKE MARKS (6 white tape marks) ───
  private buildSpikeMarks() {
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25,
    });

    // 6 spike marks arranged in two columns of 3
    // Left column (between tiles 2-4, X ~ -1 tile from center)
    // Right column (between tiles 2-4, X ~ +1 tile from center)
    const leftX = -TILE;
    const rightX = TILE;
    const zPositions = [
      -HALF + 1.5 * TILE,   // row 2
      -HALF + 2.5 * TILE,   // row 3
      -HALF + 3.5 * TILE,   // row 4
    ];

    for (const sz of zPositions) {
      // Left spike mark (horizontal line)
      this.scene.add(this.makeBox(leftX, TAPE_H / 2, sz, SPIKE_L, TAPE_H, TAPE_W, whiteMat));
      // Right spike mark
      this.scene.add(this.makeBox(rightX, TAPE_H / 2, sz, SPIKE_L, TAPE_H, TAPE_W, whiteMat));
    }
  }

  // ─── OBELISK (triangular prism, outside back wall) ───
  // 23" tall, 11" wide faces, equilateral triangle cross-section
  // 3 faces with motifs: GPP, PGP, PPG (G=green, P=purple)
  // AprilTags IDs 21, 22, 23
  private buildObelisk() {
    const group = new THREE.Group();
    const side = OBELISK_FACE_W;          // 11"
    const inradius = side / (2 * Math.sqrt(3));  // distance from center to face

    // Solid triangular prism body using CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)
    // circumradius = side / sqrt(3)
    const circumR = side / Math.sqrt(3);
    const bodyGeo = new THREE.CylinderGeometry(circumR, circumR, OBELISK_H, 3);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x2a2a2a, roughness: 0.35, metalness: 0.5, clearcoat: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = OBELISK_H / 2;
    // Rotate so one face points toward -Z (toward field)
    body.rotation.y = Math.PI / 6;
    group.add(body);

    // Motif patterns: 3 circles per face (G=green, P=purple)
    const motifs: [number, number, number][] = [
      [0x33aa44, 0x8833aa, 0x8833aa],  // GPP — Tag 21
      [0x8833aa, 0x33aa44, 0x8833aa],  // PGP — Tag 22
      [0x8833aa, 0x8833aa, 0x33aa44],  // PPG — Tag 23
    ];

    // 3 face angles: after body rotation of PI/6, faces point at these angles
    const faceAngles = [
      Math.PI / 6 + Math.PI,            // face 0: toward -Z (field-facing)
      Math.PI / 6 + Math.PI + 2 * Math.PI / 3,  // face 1: toward +X
      Math.PI / 6 + Math.PI - 2 * Math.PI / 3,  // face 2: toward -X
    ];

    const circleR = 1.2 * IN;  // radius of each motif dot
    const circleGeo = new THREE.CircleGeometry(circleR, 16);
    const dotSpacing = side / 3.5;

    for (let i = 0; i < 3; i++) {
      const ang = faceAngles[i];
      // Normal pointing outward from face
      const nx = Math.sin(ang);
      const nz = Math.cos(ang);
      // Face center position (at inradius distance from center)
      const fx = nx * (inradius + 0.002);
      const fz = nz * (inradius + 0.002);
      // Tangent direction (along face, horizontal)
      const tx = Math.cos(ang);
      const tz = -Math.sin(ang);

      // 3 colored dots side by side
      for (let d = 0; d < 3; d++) {
        const offset = (d - 1) * dotSpacing;
        const dotMat = new THREE.MeshPhysicalMaterial({
          color: motifs[i][d],
          emissive: motifs[i][d],
          emissiveIntensity: 0.2,
          roughness: 0.4,
        });
        const dot = new THREE.Mesh(circleGeo, dotMat);
        dot.position.set(
          fx + tx * offset,
          OBELISK_H * 0.6,
          fz + tz * offset
        );
        dot.rotation.y = ang + Math.PI;
        group.add(dot);
      }

      // AprilTag below the dots
      const tagOffset = 0.003;
      const tagGrp = new THREE.Group();
      const tagSz = TAG_SIZE * 0.7;

      const borderMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.15,
      });
      tagGrp.add(new THREE.Mesh(new THREE.PlaneGeometry(tagSz * 1.25, tagSz * 1.25), borderMat));

      const cellSz = tagSz / 4;
      const bk = new THREE.MeshStandardMaterial({ color: 0x111111 });
      const wh = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
      const pat = [[1,0,1,0],[0,1,0,1],[1,1,0,0],[0,0,1,1]];
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const cell = new THREE.Mesh(
            new THREE.PlaneGeometry(cellSz * 0.9, cellSz * 0.9),
            pat[r][c] ? bk : wh
          );
          cell.position.set((c - 1.5) * cellSz, (1.5 - r) * cellSz, 0.001);
          tagGrp.add(cell);
        }
      }
      tagGrp.position.set(
        fx + nx * tagOffset,
        OBELISK_H * 0.25,
        fz + nz * tagOffset
      );
      tagGrp.rotation.y = ang + Math.PI;
      group.add(tagGrp);
    }

    // Position: centered on back wall, outside perimeter
    group.position.set(0, 0, HALF + WALL_T + inradius + 3 * IN);
    this.scene.add(group);
    this.meshes.push(group);
  }

  // ─── TAPE ZONE HELPER ───
  private buildTapeZone(cx: number, cz: number, size: number, color: number, _label: string) {
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.25,
    });

    // Border tapes (4 edges)
    this.scene.add(this.makeBox(cx, TAPE_H / 2, cz - size / 2, size, TAPE_H, TAPE_W, mat));
    this.scene.add(this.makeBox(cx, TAPE_H / 2, cz + size / 2, size, TAPE_H, TAPE_W, mat));
    this.scene.add(this.makeBox(cx - size / 2, TAPE_H / 2, cz, TAPE_W, TAPE_H, size, mat));
    this.scene.add(this.makeBox(cx + size / 2, TAPE_H / 2, cz, TAPE_W, TAPE_H, size, mat));

    // Translucent fill
    const fillMat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.08,
      transparent: true, opacity: 0.12, side: THREE.DoubleSide,
    });
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(size, size), fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(cx, 0.003, cz);
    this.scene.add(fill);
  }

  // ─── APRILTAG HELPER ───
  private addAprilTag(parent: THREE.Object3D, x: number, y: number, z: number, rotY: number, size: number) {
    const group = new THREE.Group();

    const borderMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.1 });
    const border = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.3, size * 1.3), borderMat);
    group.add(border);

    const cellSize = size / 4;
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    const pattern = [
      [1, 0, 1, 0],
      [0, 1, 0, 1],
      [1, 1, 0, 0],
      [0, 0, 1, 1],
    ];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const cell = new THREE.Mesh(
          new THREE.PlaneGeometry(cellSize * 0.95, cellSize * 0.95),
          pattern[r][c] ? blackMat : whiteMat
        );
        cell.position.set((c - 1.5) * cellSize, (1.5 - r) * cellSize, 0.001);
        group.add(cell);
      }
    }

    group.rotation.y = rotY;
    group.position.set(x, y, z);
    parent.add(group);
  }

  // ─── GEOMETRY HELPERS ───
  private makeBox(x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // ─── UPDATE ───
  update(dt: number) {
    this.elapsedTime += dt;
    this.gamePieces.update(dt);
  }

  reset() {
    this.gamePieces.reset();
  }
}
