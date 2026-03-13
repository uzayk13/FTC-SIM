import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GamePieces } from './GamePieces';

// DECODE 2025-26 field — fully procedural geometry matching Field.stl
const FIELD_SIZE = 3.6576;
const HALF = FIELD_SIZE / 2;
const WALL_HEIGHT = 0.325;
const WALL_THICKNESS = 0.05;

// Scale factor: STL field walls at ±1.8 → game coords ±HALF
const S = HALF / 1.8;

// Obelisk dimensions
const OBELISK_BASE = 0.12;
const OBELISK_TOP = 0.06;
const OBELISK_HEIGHT = 0.60;

// Scoring zone
const ZONE_SIZE = 0.50;

// Ascent structure (from STL measurements, scaled)
const ASCENT_LOW_BAR_Y = 0.45 * S;
const ASCENT_HIGH_BAR_Y = 0.73 * S;
const ASCENT_POST_HEIGHT = 1.37 * S;
const ASCENT_BAR_RADIUS = 0.02;
const ASCENT_INNER_X = 1.6 * S;     // inner post X positions
const ASCENT_FRONT_Z = 1.0 * S;     // front edge of ascent zone
const ASCENT_BACK_Z = HALF;         // back edge = field wall

// Inner divider walls
const DIVIDER_X = 1.3 * S;

export class Field {
  scene: THREE.Scene;
  world: CANNON.World;
  gamePieces: GamePieces;
  meshes: THREE.Object3D[] = [];
  bodies: CANNON.Body[] = [];
  envMap: THREE.Texture | null;

  // Animated elements
  private obeliskGlows: THREE.Mesh[] = [];
  private zoneRings: THREE.Mesh[] = [];
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
    this.buildFloorSurface();
    this.buildVisibleWalls();
    this.buildInnerDividers();
    this.buildSpikeMarks();
    this.buildAscentStructure();
    this.buildObelisks();
    this.buildScoringZones();
    this.buildSubmersible();
  }

  // ─── PHYSICS FLOOR (invisible) ───
  private buildPhysicsFloor() {
    const gb = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    gb.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(gb);
  }

  // ─── PHYSICS WALLS (invisible) ───
  private buildPhysicsWalls() {
    const ws = [
      { p: [0, WALL_HEIGHT / 2, -HALF], s: [FIELD_SIZE / 2 + 0.05, WALL_HEIGHT / 2, 0.05] },
      { p: [0, WALL_HEIGHT / 2, HALF], s: [FIELD_SIZE / 2 + 0.05, WALL_HEIGHT / 2, 0.05] },
      { p: [-HALF, WALL_HEIGHT / 2, 0], s: [0.05, WALL_HEIGHT / 2, FIELD_SIZE / 2 + 0.05] },
      { p: [HALF, WALL_HEIGHT / 2, 0], s: [0.05, WALL_HEIGHT / 2, FIELD_SIZE / 2 + 0.05] },
    ];

    for (const w of ws) {
      const b = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(w.s[0], w.s[1], w.s[2])),
      });
      b.position.set(w.p[0], w.p[1], w.p[2]);
      this.world.addBody(b);
      this.bodies.push(b);
    }
  }

  // ─── FLOOR SURFACE ───
  private buildFloorSurface() {
    const floorMat = new THREE.MeshPhysicalMaterial({
      color: 0x666666,
      roughness: 0.55,
      metalness: 0.05,
      clearcoat: 0.1,
      envMapIntensity: 0.3,
    });

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE),
      floorMat
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.001;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.meshes.push(floor);

    // Tile grid lines (24x24 foam tiles, each ~15.24cm / 6 inches)
    const tileCount = 24;
    const tileSize = FIELD_SIZE / tileCount;
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
    const lineWidth = 0.004;
    const lineHeight = 0.001;

    for (let i = 1; i < tileCount; i++) {
      const offset = -HALF + i * tileSize;

      // Lines along X
      const hLine = new THREE.Mesh(
        new THREE.BoxGeometry(FIELD_SIZE, lineHeight, lineWidth),
        lineMat
      );
      hLine.position.set(0, 0.002, offset);
      this.scene.add(hLine);

      // Lines along Z
      const vLine = new THREE.Mesh(
        new THREE.BoxGeometry(lineWidth, lineHeight, FIELD_SIZE),
        lineMat
      );
      vLine.position.set(offset, 0.002, 0);
      this.scene.add(vLine);
    }
  }

  // ─── VISIBLE PERIMETER WALLS ───
  private buildVisibleWalls() {
    const wallMat = new THREE.MeshPhysicalMaterial({
      color: 0x888888,
      roughness: 0.4,
      metalness: 0.15,
      clearcoat: 0.25,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.5,
      side: THREE.DoubleSide,
    });

    const railMat = new THREE.MeshPhysicalMaterial({
      color: 0x999999,
      roughness: 0.25,
      metalness: 0.3,
      clearcoat: 0.4,
      envMapIntensity: 0.6,
    });

    const railHeight = 0.02;
    const railOverhang = 0.01;

    // Wall definitions: [posX, posZ, sizeX, sizeZ]
    const walls: [number, number, number, number][] = [
      [0, -HALF, FIELD_SIZE + WALL_THICKNESS, WALL_THICKNESS],  // back
      [0, HALF, FIELD_SIZE + WALL_THICKNESS, WALL_THICKNESS],   // front
      [-HALF, 0, WALL_THICKNESS, FIELD_SIZE],                   // left
      [HALF, 0, WALL_THICKNESS, FIELD_SIZE],                    // right
    ];

    for (const [wx, wz, wsX, wsZ] of walls) {
      // Main wall panel
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(wsX, WALL_HEIGHT, wsZ),
        wallMat
      );
      wall.position.set(wx, WALL_HEIGHT / 2, wz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
      this.meshes.push(wall);

      // Top rail
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(wsX + railOverhang * 2, railHeight, wsZ + railOverhang * 2),
        railMat
      );
      rail.position.set(wx, WALL_HEIGHT + railHeight / 2, wz);
      rail.castShadow = true;
      this.scene.add(rail);
      this.meshes.push(rail);
    }

    // Corner brackets
    const bracketMat = new THREE.MeshPhysicalMaterial({
      color: 0x777777,
      roughness: 0.35,
      metalness: 0.2,
      clearcoat: 0.3,
    });
    const bracketSize = 0.08;
    const corners: [number, number][] = [
      [-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF],
    ];
    for (const [cx, cz] of corners) {
      const bracket = new THREE.Mesh(
        new THREE.BoxGeometry(bracketSize, WALL_HEIGHT + 0.01, bracketSize),
        bracketMat
      );
      bracket.position.set(cx, WALL_HEIGHT / 2, cz);
      bracket.castShadow = true;
      this.scene.add(bracket);
      this.meshes.push(bracket);
    }
  }

  // ─── INNER DIVIDER WALLS (spike mark barriers at X = ±DIVIDER_X) ───
  private buildInnerDividers() {
    const dividerMat = new THREE.MeshPhysicalMaterial({
      color: 0x888888,
      roughness: 0.4,
      metalness: 0.15,
      clearcoat: 0.25,
      envMapIntensity: 0.5,
      side: THREE.DoubleSide,
    });

    const dividerLength = FIELD_SIZE * 0.75;

    for (const sign of [-1, 1]) {
      const divider = new THREE.Mesh(
        new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, dividerLength),
        dividerMat
      );
      divider.position.set(sign * DIVIDER_X, WALL_HEIGHT / 2, 0);
      divider.castShadow = true;
      divider.receiveShadow = true;
      this.scene.add(divider);
      this.meshes.push(divider);

      // Top rail on divider
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(WALL_THICKNESS + 0.02, 0.015, dividerLength),
        new THREE.MeshPhysicalMaterial({
          color: 0x999999,
          roughness: 0.25,
          metalness: 0.3,
          clearcoat: 0.4,
        })
      );
      rail.position.set(sign * DIVIDER_X, WALL_HEIGHT + 0.0075, 0);
      this.scene.add(rail);
      this.meshes.push(rail);

      // Physics body for divider
      const body = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(WALL_THICKNESS / 2, WALL_HEIGHT / 2, dividerLength / 2)),
      });
      body.position.set(sign * DIVIDER_X, WALL_HEIGHT / 2, 0);
      this.world.addBody(body);
      this.bodies.push(body);
    }
  }

  // ─── SPIKE MARKS: Colored tape lines on the floor ───
  private buildSpikeMarks() {
    const tapeWidth = 0.025;
    const tapeLength = 0.20 * S;
    const tapeHeight = 0.003;

    // Spike rows at Z positions (from STL: Y = -0.9, -0.3, +0.3 → game Z)
    const spikeZs = [-0.9 * S, -0.3 * S, 0.3 * S];
    // X range between inner dividers and outer walls
    const spikeXCenter = (DIVIDER_X + HALF) / 2;

    const purpleMat = new THREE.MeshStandardMaterial({
      color: 0x8833aa,
      emissive: 0x8833aa,
      emissiveIntensity: 0.15,
    });
    const greenMat = new THREE.MeshStandardMaterial({
      color: 0x33aa44,
      emissive: 0x33aa44,
      emissiveIntensity: 0.15,
    });

    for (const sz of spikeZs) {
      for (const sideX of [-1, 1]) {
        const mat = sideX < 0 ? purpleMat : greenMat;

        // Horizontal tape line
        const tape = new THREE.Mesh(
          new THREE.BoxGeometry(tapeLength, tapeHeight, tapeWidth),
          mat
        );
        tape.position.set(sideX * spikeXCenter, 0.003, sz);
        tape.receiveShadow = true;
        this.scene.add(tape);
        this.meshes.push(tape);
      }
    }
  }

  // ─── ASCENT STRUCTURE: Posts, bars, and frame on +Z side ───
  private buildAscentStructure() {
    const group = new THREE.Group();

    const barMat = new THREE.MeshPhysicalMaterial({
      color: 0xcccccc,
      roughness: 0.1,
      metalness: 0.95,
      clearcoat: 0.7,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.0,
    });

    const postMat = new THREE.MeshPhysicalMaterial({
      color: 0x555555,
      roughness: 0.25,
      metalness: 0.85,
      clearcoat: 0.4,
      envMapIntensity: 0.6,
    });

    const tallPostMat = new THREE.MeshPhysicalMaterial({
      color: 0x666666,
      roughness: 0.2,
      metalness: 0.9,
      clearcoat: 0.5,
      envMapIntensity: 0.7,
    });

    // Post positions: inner posts at X=±ASCENT_INNER_X, wall posts at X=±HALF
    const postXs = [-ASCENT_INNER_X, ASCENT_INNER_X];
    const postZs = [ASCENT_FRONT_Z, ASCENT_BACK_Z];

    // Vertical posts at the 4 inner corners of the ascent zone
    for (const px of postXs) {
      for (const pz of postZs) {
        // Short post up to high bar level
        const postHeight = ASCENT_HIGH_BAR_Y + 0.05;
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.03, postHeight, 12),
          postMat
        );
        post.position.set(px, postHeight / 2, pz);
        post.castShadow = true;
        group.add(post);

        // Base plate
        const plate = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.008, 0.08),
          postMat
        );
        plate.position.set(px, 0.004, pz);
        group.add(plate);
      }
    }

    // Tall corner towers at the back corners of the ascent zone
    const towerXs = [-ASCENT_INNER_X, ASCENT_INNER_X, -1.2 * S, 1.2 * S];
    for (const tx of towerXs) {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.025, ASCENT_POST_HEIGHT, 12),
        tallPostMat
      );
      tower.position.set(tx, ASCENT_POST_HEIGHT / 2, ASCENT_BACK_Z);
      tower.castShadow = true;
      group.add(tower);

      // Cap on tall tower
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 10, 10),
        barMat
      );
      cap.position.set(tx, ASCENT_POST_HEIGHT, ASCENT_BACK_Z);
      group.add(cap);
    }

    // Also tall posts at the wall-mounted positions
    for (const wallX of [-HALF, HALF]) {
      for (const tz of [ASCENT_FRONT_Z, ASCENT_BACK_Z]) {
        const wallPost = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.025, ASCENT_HIGH_BAR_Y + 0.05, 10),
          postMat
        );
        wallPost.position.set(wallX, (ASCENT_HIGH_BAR_Y + 0.05) / 2, tz);
        wallPost.castShadow = true;
        group.add(wallPost);
      }
    }

    // Horizontal bars at two heights, running along Z from ASCENT_FRONT_Z to ASCENT_BACK_Z
    const barSpanZ = ASCENT_BACK_Z - ASCENT_FRONT_Z;
    const barCenterZ = (ASCENT_FRONT_Z + ASCENT_BACK_Z) / 2;
    const barHeights = [ASCENT_LOW_BAR_Y, ASCENT_HIGH_BAR_Y];

    for (const bh of barHeights) {
      for (const bx of postXs) {
        // Bar running front-to-back
        const bar = new THREE.Mesh(
          new THREE.CylinderGeometry(ASCENT_BAR_RADIUS, ASCENT_BAR_RADIUS, barSpanZ, 16),
          barMat
        );
        bar.rotation.x = Math.PI / 2;
        bar.position.set(bx, bh, barCenterZ);
        bar.castShadow = true;
        group.add(bar);

        // End caps
        for (const endZ of [ASCENT_FRONT_Z, ASCENT_BACK_Z]) {
          const cap = new THREE.Mesh(
            new THREE.SphereGeometry(ASCENT_BAR_RADIUS * 1.3, 10, 10),
            barMat
          );
          cap.position.set(bx, bh, endZ);
          group.add(cap);
        }

        // Physics collider for bar
        const barBody = new CANNON.Body({
          type: CANNON.Body.STATIC,
          shape: new CANNON.Box(new CANNON.Vec3(ASCENT_BAR_RADIUS, ASCENT_BAR_RADIUS, barSpanZ / 2)),
        });
        barBody.position.set(bx, bh, barCenterZ);
        this.world.addBody(barBody);
        this.bodies.push(barBody);
      }
    }

    // Cross-bars connecting left and right sides at front and back
    const crossSpanX = ASCENT_INNER_X * 2;
    for (const bh of barHeights) {
      for (const cz of postZs) {
        const crossBar = new THREE.Mesh(
          new THREE.CylinderGeometry(ASCENT_BAR_RADIUS * 0.8, ASCENT_BAR_RADIUS * 0.8, crossSpanX, 12),
          barMat
        );
        crossBar.rotation.z = Math.PI / 2;
        crossBar.position.set(0, bh, cz);
        crossBar.castShadow = true;
        group.add(crossBar);

        // Physics for cross-bar
        const crossBody = new CANNON.Body({
          type: CANNON.Body.STATIC,
          shape: new CANNON.Box(new CANNON.Vec3(crossSpanX / 2, ASCENT_BAR_RADIUS, ASCENT_BAR_RADIUS)),
        });
        crossBody.position.set(0, bh, cz);
        this.world.addBody(crossBody);
        this.bodies.push(crossBody);
      }
    }

    this.scene.add(group);
    this.meshes.push(group);
  }

  // ─── OBELISKS: 4 tapered pillars at symmetric field positions ───
  private buildObelisks() {
    const obeliskPositions: [number, number, number][] = [
      [-0.90, 0, -0.90],  // back-left
      [ 0.90, 0, -0.90],  // back-right
      [-0.90, 0,  0.90],  // front-left
      [ 0.90, 0,  0.90],  // front-right
    ];

    const obeliskColors: number[] = [
      0x6644cc, // purple tint
      0x6644cc,
      0x22aa55, // green tint
      0x22aa55,
    ];

    for (let i = 0; i < obeliskPositions.length; i++) {
      const [ox, , oz] = obeliskPositions[i];
      const color = obeliskColors[i];
      this.buildSingleObelisk(ox, oz, color);
    }
  }

  private buildSingleObelisk(x: number, z: number, accentColor: number) {
    const group = new THREE.Group();

    // Main obelisk body — tapered box (custom geometry)
    const geo = new THREE.CylinderGeometry(OBELISK_TOP / 2, OBELISK_BASE / 2, OBELISK_HEIGHT, 4);
    geo.rotateY(Math.PI / 4); // align edges with field axes
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x2a2a2a,
      roughness: 0.2,
      metalness: 0.7,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
      envMapIntensity: 0.8,
    });
    const obelisk = new THREE.Mesh(geo, mat);
    obelisk.position.y = OBELISK_HEIGHT / 2;
    obelisk.castShadow = true;
    obelisk.receiveShadow = true;
    group.add(obelisk);

    // Accent stripe running up the obelisk
    const stripeGeo = new THREE.BoxGeometry(0.008, OBELISK_HEIGHT * 0.85, OBELISK_BASE * 0.6);
    const stripeMat = new THREE.MeshPhysicalMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.3,
      roughness: 0.3,
      metalness: 0.5,
      clearcoat: 0.8,
      envMapIntensity: 0.6,
    });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(OBELISK_BASE / 2 * 0.7, OBELISK_HEIGHT / 2, 0);
    group.add(stripe);

    // Second stripe on perpendicular face
    const stripe2 = new THREE.Mesh(stripeGeo, stripeMat);
    stripe2.rotation.y = Math.PI / 2;
    stripe2.position.set(0, OBELISK_HEIGHT / 2, OBELISK_BASE / 2 * 0.7);
    group.add(stripe2);

    // Glowing cap on top
    const capGeo = new THREE.CylinderGeometry(OBELISK_TOP / 2 + 0.005, OBELISK_TOP / 2 + 0.01, 0.03, 4);
    capGeo.rotateY(Math.PI / 4);
    const capMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 1.2,
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = OBELISK_HEIGHT + 0.015;
    group.add(cap);
    this.obeliskGlows.push(cap);

    // Point light at the top for local glow
    const glow = new THREE.PointLight(accentColor, 0.6, 1.2);
    glow.position.y = OBELISK_HEIGHT + 0.05;
    group.add(glow);

    // Base pedestal
    const baseMat = new THREE.MeshPhysicalMaterial({
      color: 0x444444,
      roughness: 0.3,
      metalness: 0.8,
      clearcoat: 0.4,
      envMapIntensity: 0.5,
    });
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(OBELISK_BASE + 0.04, 0.025, OBELISK_BASE + 0.04),
      baseMat
    );
    base.position.y = 0.0125;
    base.receiveShadow = true;
    group.add(base);

    group.position.set(x, 0, z);
    this.scene.add(group);
    this.meshes.push(group);

    // Physics body for the obelisk
    const halfBase = OBELISK_BASE / 2;
    const halfH = OBELISK_HEIGHT / 2;
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(halfBase, halfH, halfBase)),
    });
    body.position.set(x, halfH, z);
    this.world.addBody(body);
    this.bodies.push(body);
  }

  // ─── SCORING ZONES: Illuminated target areas on the floor ───
  private buildScoringZones() {
    const zonePositions: [number, number, number][] = [
      [0, 0.005, -HALF + 0.50],   // back center
      [0, 0.005,  HALF - 0.50],   // front center
      [-HALF + 0.50, 0.005, 0],   // left center
      [ HALF - 0.50, 0.005, 0],   // right center
    ];

    const zoneColors: number[] = [0x6644cc, 0x6644cc, 0x22aa55, 0x22aa55];

    for (let i = 0; i < zonePositions.length; i++) {
      const [zx, zy, zz] = zonePositions[i];
      const color = zoneColors[i];

      // Outer ring
      const ringGeo = new THREE.RingGeometry(ZONE_SIZE / 2 - 0.02, ZONE_SIZE / 2, 32);
      const ringMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.5,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(zx, zy, zz);
      this.scene.add(ring);
      this.meshes.push(ring);
      this.zoneRings.push(ring);

      // Inner circle (translucent fill)
      const innerGeo = new THREE.CircleGeometry(ZONE_SIZE / 2 - 0.03, 32);
      const innerMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.15,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.2,
      });
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.rotation.x = -Math.PI / 2;
      inner.position.set(zx, zy - 0.001, zz);
      this.scene.add(inner);
      this.meshes.push(inner);

      // Center marker dot
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.03, 16),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: color,
          emissiveIntensity: 0.8,
          side: THREE.DoubleSide,
        })
      );
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(zx, zy + 0.001, zz);
      this.scene.add(dot);
      this.meshes.push(dot);
    }
  }

  // ─── SUBMERSIBLE: Central scoring structure ───
  private buildSubmersible() {
    const group = new THREE.Group();
    const subW = 0.60;
    const subD = 0.60;
    const subH = 0.10;

    // Raised platform
    const platformMat = new THREE.MeshPhysicalMaterial({
      color: 0x334455,
      roughness: 0.3,
      metalness: 0.6,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
      envMapIntensity: 0.7,
    });
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(subW, subH, subD),
      platformMat
    );
    platform.position.y = subH / 2;
    platform.receiveShadow = true;
    platform.castShadow = true;
    group.add(platform);

    // Edge trim (colored border around the platform)
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xffaa00,
      emissiveIntensity: 0.3,
    });
    const trimThickness = 0.015;

    // Front and back trims
    for (const sign of [-1, 1]) {
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(subW + trimThickness * 2, subH + 0.005, trimThickness),
        trimMat
      );
      trim.position.set(0, subH / 2, sign * (subD / 2 + trimThickness / 2));
      group.add(trim);
    }
    // Left and right trims
    for (const sign of [-1, 1]) {
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(trimThickness, subH + 0.005, subD),
        trimMat
      );
      trim.position.set(sign * (subW / 2 + trimThickness / 2), subH / 2, 0);
      group.add(trim);
    }

    // Basket/net area on top (wire-frame look)
    const basketMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const basket = new THREE.Mesh(
      new THREE.BoxGeometry(subW * 0.7, 0.08, subD * 0.7),
      basketMat
    );
    basket.position.y = subH + 0.04;
    group.add(basket);

    // Corner posts on the submersible
    const postMat = new THREE.MeshPhysicalMaterial({
      color: 0x666666,
      roughness: 0.15,
      metalness: 0.9,
      clearcoat: 0.5,
      envMapIntensity: 0.8,
    });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.015, subH + 0.12, 8),
          postMat
        );
        post.position.set(sx * subW / 2, (subH + 0.12) / 2, sz * subD / 2);
        post.castShadow = true;
        group.add(post);

        // Small glowing top on each post
        const topBall = new THREE.Mesh(
          new THREE.SphereGeometry(0.02, 12, 12),
          new THREE.MeshStandardMaterial({
            color: 0xffaa00,
            emissive: 0xffaa00,
            emissiveIntensity: 0.8,
          })
        );
        topBall.position.set(sx * subW / 2, subH + 0.12 + 0.02, sz * subD / 2);
        group.add(topBall);
      }
    }

    group.position.set(0, 0, 0); // center of field
    this.scene.add(group);
    this.meshes.push(group);

    // Physics body for the submersible platform
    const subBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(subW / 2, subH / 2, subD / 2)),
    });
    subBody.position.set(0, subH / 2, 0);
    this.world.addBody(subBody);
    this.bodies.push(subBody);
  }

  update(dt: number) {
    this.elapsedTime += dt;
    this.gamePieces.update(dt);

    // Pulse obelisk glow caps
    for (const cap of this.obeliskGlows) {
      const mat = cap.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.8 + Math.sin(this.elapsedTime * 2.5) * 0.4;
    }

    // Pulse scoring zone rings
    for (const ring of this.zoneRings) {
      const mat = ring.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.3 + Math.sin(this.elapsedTime * 1.8 + 1.0) * 0.2;
    }
  }

  reset() { this.gamePieces.reset(); }
}
