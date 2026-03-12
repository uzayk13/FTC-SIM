import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { InputManager } from '../input/InputManager';

// Chassis dimensions (meters)
const FRAME_W = 0.440;
const FRAME_D = 0.452;
const CHAN_SIZE = 0.048;
const CHAN_WALL = 0.0025;
const WHEEL_R = 0.048;
const WHEEL_W = 0.038;
const GROUND_CLEAR = WHEEL_R;
const CHASSIS_Y = GROUND_CLEAR + CHAN_SIZE / 2;

// Mechanism heights
const SLIDE_HEIGHT = 0.30;
const TOTAL_HEIGHT = CHAN_SIZE + 0.01 + SLIDE_HEIGHT;

// Drive constants
const MAX_SPEED = 1.57;
const BOOST_MULTIPLIER = 1.5;
const TURN_SPEED = 3.5;
const SHOOT_FORCE = 8;

// Colors (goBILDA palette)
const COL_CHANNEL = 0x1a1a1a;
const COL_PLATE   = 0x2a2a2a;
const COL_MOTOR   = 0xd4a017;
const COL_WHEEL   = 0x111111;
const COL_ROLLER  = 0x555555;
const COL_HUB     = 0x1b1b1b;
const COL_HUB_LED = 0x00cc44;
const COL_INTAKE  = 0x22aa44;
const COL_SLIDE   = 0x333333;
const COL_CLAW    = 0x888888;

interface Projectile {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  life: number;
}

export class Robot {
  scene: THREE.Scene;
  world: CANNON.World;

  chassisMesh!: THREE.Group;
  chassisBody!: CANNON.Body;

  // Intake
  intakeActive = false;
  intakeDirection: 'in' | 'out' | 'off' = 'off';
  intakeMesh!: THREE.Group;
  intakeRollers: THREE.Mesh[] = [];
  heldPiece: THREE.Mesh | null = null;

  // Shooter
  shooterMesh!: THREE.Group;
  shooterAngle = 0.4;
  shooterYaw = 0;
  canShoot = true;
  shootCooldown = 0;
  projectiles: Projectile[] = [];

  // Linear slide
  slideMesh!: THREE.Group;
  slideExtension = 0;

  // Wheels for animation
  private wheels: THREE.Group[] = [];
  private wheelSpeed = 0;

  // State
  initialPos = new THREE.Vector3(0.5, CHASSIS_Y, 1.2);
  speed = 0;
  turnRate = 0;
  boosting = false;
  useCustomModel: boolean;

  telemetry: Record<string, string | number> = {};

  constructor(scene: THREE.Scene, world: CANNON.World, useCustomModel = false) {
    this.scene = scene;
    this.world = world;
    this.useCustomModel = useCustomModel;
    this.build();
  }

  private build() {
    this.chassisMesh = new THREE.Group();
    this.intakeMesh = new THREE.Group();
    this.shooterMesh = new THREE.Group();
    this.slideMesh = new THREE.Group();

    if (this.useCustomModel) {
      this.chassisMesh.add(this.intakeMesh);
      this.chassisMesh.add(this.shooterMesh);
      this.chassisMesh.add(this.slideMesh);
      this.loadCustomModel();
    } else {
      this.buildFrame();
      this.buildWheels();
      this.buildMotors();
      this.buildElectronics();
      this.buildIntake();
      this.buildLinearSlide();
      this.buildShooterArm();

      const light = new THREE.PointLight(0xff6600, 0.3, 0.8);
      light.position.set(0, TOTAL_HEIGHT * 0.6, 0);
      this.chassisMesh.add(light);
    }

    this.chassisMesh.position.copy(this.initialPos);
    this.scene.add(this.chassisMesh);

    // Physics body
    const halfW = FRAME_W / 2;
    const halfH = (CHAN_SIZE + 0.01) / 2;
    const halfD = FRAME_D / 2;
    this.chassisBody = new CANNON.Body({
      mass: 14,
      shape: new CANNON.Box(new CANNON.Vec3(halfW, halfH, halfD)),
      linearDamping: 0.9,
      angularDamping: 0.95,
    });
    this.chassisBody.position.set(this.initialPos.x, this.initialPos.y, this.initialPos.z);
    this.world.addBody(this.chassisBody);
  }

  // ─── CUSTOM MODEL LOADING ───
  private loadCustomModel() {
    const overlay = document.createElement('div');
    overlay.id = 'model-loading-overlay';
    overlay.innerHTML = `
      <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);
        display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;
        font-family:monospace;color:#fff;">
        <div style="font-size:18px;margin-bottom:16px;">Loading Robot Model...</div>
        <div style="width:300px;height:20px;background:#333;border-radius:10px;overflow:hidden;">
          <div id="model-load-bar" style="width:0%;height:100%;background:#00cc44;transition:width 0.2s;"></div>
        </div>
        <div id="model-load-text" style="margin-top:10px;font-size:14px;color:#aaa;">0%</div>
      </div>
    `;
    document.body.appendChild(overlay);

    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    loader.setDRACOLoader(dracoLoader);

    loader.load('/Robot.gltf', (gltf) => {
      overlay.remove();
      const model = gltf.scene;

      const bbox = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      bbox.getSize(size);

      const maxHorizontal = Math.max(size.x, size.z);
      const scale = FRAME_W / maxHorizontal;
      model.scale.setScalar(scale);

      const scaledBox = new THREE.Box3().setFromObject(model);
      const scaledCenter = new THREE.Vector3();
      scaledBox.getCenter(scaledCenter);

      model.position.set(
        -scaledCenter.x,
        -scaledBox.min.y - CHAN_SIZE / 2,
        -scaledCenter.z,
      );

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.chassisMesh.add(model);
    },
    (progress) => {
      const bar = document.getElementById('model-load-bar');
      const text = document.getElementById('model-load-text');
      if (progress.total > 0) {
        const pct = ((progress.loaded / progress.total) * 100).toFixed(0);
        if (bar) bar.style.width = pct + '%';
        if (text) text.textContent = `${pct}% (${(progress.loaded / 1e6).toFixed(1)} / ${(progress.total / 1e6).toFixed(1)} MB)`;
      } else {
        if (text) text.textContent = `${(progress.loaded / 1e6).toFixed(1)} MB loaded...`;
      }
    },
    (error) => {
      overlay.remove();
      console.error('Failed to load Robot model:', error);
    });
  }

  // ─── FRAME: goBILDA U-Channel rails ───
  private buildFrame() {
    const chanMat = new THREE.MeshStandardMaterial({
      color: COL_CHANNEL, roughness: 0.35, metalness: 0.7,
    });
    const plateMat = new THREE.MeshStandardMaterial({
      color: COL_PLATE, roughness: 0.5, metalness: 0.5,
    });

    const makeChannel = (length: number, axis: 'x' | 'z'): THREE.Group => {
      const g = new THREE.Group();
      const isX = axis === 'x';
      const lx = isX ? length : CHAN_SIZE;
      const lz = isX ? CHAN_SIZE : length;

      const bottom = new THREE.Mesh(
        new THREE.BoxGeometry(lx, CHAN_WALL, lz), chanMat
      );
      bottom.position.y = -CHAN_SIZE / 2 + CHAN_WALL / 2;
      bottom.castShadow = true;
      bottom.receiveShadow = true;
      g.add(bottom);

      for (const sign of [-1, 1]) {
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(
            isX ? length : CHAN_WALL, CHAN_SIZE, isX ? CHAN_WALL : length
          ), chanMat
        );
        if (isX) {
          wall.position.z = sign * (CHAN_SIZE / 2 - CHAN_WALL / 2);
        } else {
          wall.position.x = sign * (CHAN_SIZE / 2 - CHAN_WALL / 2);
        }
        wall.castShadow = true;
        g.add(wall);
      }
      return g;
    };

    for (const side of [-1, 1]) {
      const chan = makeChannel(FRAME_D, 'z');
      chan.position.set(side * (FRAME_W / 2 - CHAN_SIZE / 2), 0, 0);
      this.chassisMesh.add(chan);
    }

    for (const end of [-1, 1]) {
      const chan = makeChannel(FRAME_W - CHAN_SIZE * 2, 'x');
      chan.position.set(0, 0, end * (FRAME_D / 2 - CHAN_SIZE / 2));
      this.chassisMesh.add(chan);
    }

    const brace = makeChannel(FRAME_W - CHAN_SIZE * 2, 'x');
    brace.position.set(0, 0, 0);
    this.chassisMesh.add(brace);

    const topPlate = new THREE.Mesh(
      new THREE.BoxGeometry(FRAME_W - 0.06, 0.003, FRAME_D - 0.06), plateMat
    );
    topPlate.position.y = CHAN_SIZE / 2 + 0.0015;
    topPlate.receiveShadow = true;
    this.chassisMesh.add(topPlate);

    const holeMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a, roughness: 0.9, metalness: 0.1,
    });
    const holeGeo = new THREE.CircleGeometry(0.002, 6);
    for (let x = -0.15; x <= 0.15; x += 0.008) {
      for (let z = -0.15; z <= 0.15; z += 0.008) {
        if (Math.random() > 0.7) continue;
        const hole = new THREE.Mesh(holeGeo, holeMat);
        hole.rotation.x = -Math.PI / 2;
        hole.position.set(x, CHAN_SIZE / 2 + 0.004, z);
        this.chassisMesh.add(hole);
      }
    }
  }

  // ─── WHEELS: 96mm Mecanum with rollers ───
  private buildWheels() {
    const hubMat = new THREE.MeshStandardMaterial({
      color: COL_WHEEL, roughness: 0.7, metalness: 0.4,
    });
    const rollerMat = new THREE.MeshStandardMaterial({
      color: COL_ROLLER, roughness: 0.6, metalness: 0.2,
    });
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x333333, roughness: 0.3, metalness: 0.8,
    });

    const positions: [number, number, number, boolean][] = [
      [-FRAME_W / 2 - WHEEL_W / 2 + 0.005, -CHAN_SIZE / 2, -FRAME_D / 2 + 0.06, false],
      [ FRAME_W / 2 + WHEEL_W / 2 - 0.005, -CHAN_SIZE / 2, -FRAME_D / 2 + 0.06, true],
      [-FRAME_W / 2 - WHEEL_W / 2 + 0.005, -CHAN_SIZE / 2,  FRAME_D / 2 - 0.06, true],
      [ FRAME_W / 2 + WHEEL_W / 2 - 0.005, -CHAN_SIZE / 2,  FRAME_D / 2 - 0.06, false],
    ];

    for (const [wx, wy, wz, rightSlant] of positions) {
      const wheelGroup = new THREE.Group();

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_R * 0.55, WHEEL_R * 0.55, WHEEL_W * 0.8, 16), hubMat
      );
      hub.rotation.z = Math.PI / 2;
      hub.castShadow = true;
      wheelGroup.add(hub);

      for (const s of [-1, 1]) {
        const plate = new THREE.Mesh(
          new THREE.CylinderGeometry(WHEEL_R * 0.85, WHEEL_R * 0.85, 0.002, 16), plateMat
        );
        plate.rotation.z = Math.PI / 2;
        plate.position.x = s * WHEEL_W / 2 * 0.9;
        wheelGroup.add(plate);
      }

      const ROLLER_COUNT = 10;
      const rollerR = WHEEL_R * 0.18;
      const rollerLen = WHEEL_W * 0.7;
      const rollerGeo = new THREE.CylinderGeometry(rollerR, rollerR, rollerLen, 8);

      for (let i = 0; i < ROLLER_COUNT; i++) {
        const angle = (i / ROLLER_COUNT) * Math.PI * 2;
        const roller = new THREE.Mesh(rollerGeo, rollerMat);

        const ry = Math.cos(angle) * WHEEL_R * 0.78;
        const rz = Math.sin(angle) * WHEEL_R * 0.78;
        roller.position.set(0, ry, rz);

        const slantAngle = rightSlant ? Math.PI / 4 : -Math.PI / 4;
        roller.rotation.set(0, slantAngle, Math.PI / 2);
        roller.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), angle);
        roller.rotation.x += angle;

        roller.castShadow = true;
        wheelGroup.add(roller);
      }

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(WHEEL_R * 0.82, 0.003, 8, 24), hubMat
      );
      ring.rotation.y = Math.PI / 2;
      wheelGroup.add(ring);

      wheelGroup.position.set(wx, wy, wz);
      this.chassisMesh.add(wheelGroup);
      this.wheels.push(wheelGroup);
    }
  }

  // ─── MOTORS: goBILDA 5203 Yellow Jacket ───
  private buildMotors() {
    const motorBodyMat = new THREE.MeshStandardMaterial({
      color: COL_MOTOR, roughness: 0.4, metalness: 0.3,
    });
    const motorEndMat = new THREE.MeshStandardMaterial({
      color: 0x222222, roughness: 0.5, metalness: 0.6,
    });
    const gearMat = new THREE.MeshStandardMaterial({
      color: 0x888888, roughness: 0.2, metalness: 0.9,
    });

    const motorPositions: [number, number, number, number][] = [
      [-FRAME_W / 2 + CHAN_SIZE + 0.02, -0.005, -FRAME_D / 2 + 0.06,  0],
      [ FRAME_W / 2 - CHAN_SIZE - 0.02, -0.005, -FRAME_D / 2 + 0.06,  Math.PI],
      [-FRAME_W / 2 + CHAN_SIZE + 0.02, -0.005,  FRAME_D / 2 - 0.06,  0],
      [ FRAME_W / 2 - CHAN_SIZE - 0.02, -0.005,  FRAME_D / 2 - 0.06,  Math.PI],
    ];

    for (const [mx, my, mz, rot] of motorPositions) {
      const motorGroup = new THREE.Group();

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0185, 0.0185, 0.055, 12), motorBodyMat
      );
      body.rotation.z = Math.PI / 2;
      body.castShadow = true;
      motorGroup.add(body);

      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0185, 0.016, 0.015, 12), motorEndMat
      );
      cap.rotation.z = Math.PI / 2;
      cap.position.x = 0.035;
      motorGroup.add(cap);

      const gear = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.006, 12), gearMat
      );
      gear.rotation.z = Math.PI / 2;
      gear.position.x = -0.03;
      motorGroup.add(gear);

      motorGroup.position.set(mx, my, mz);
      motorGroup.rotation.y = rot;
      this.chassisMesh.add(motorGroup);
    }
  }

  // ─── ELECTRONICS: REV Control Hub + Battery ───
  private buildElectronics() {
    const hubGroup = new THREE.Group();
    const hubBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.110, 0.030, 0.075),
      new THREE.MeshStandardMaterial({ color: COL_HUB, roughness: 0.6, metalness: 0.3 })
    );
    hubBody.castShadow = true;
    hubGroup.add(hubBody);

    const hubLed = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.004, 0.003),
      new THREE.MeshStandardMaterial({
        color: COL_HUB_LED, emissive: COL_HUB_LED, emissiveIntensity: 1.5,
      })
    );
    hubLed.position.set(0, 0.017, -0.035);
    hubGroup.add(hubLed);

    const label = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.001, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x225533, roughness: 0.8 })
    );
    label.position.set(0, 0.016, 0);
    hubGroup.add(label);

    hubGroup.position.set(0.04, CHAN_SIZE / 2 + 0.003 + 0.015, -0.05);
    this.chassisMesh.add(hubGroup);

    const battery = new THREE.Mesh(
      new THREE.BoxGeometry(0.140, 0.035, 0.050),
      new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.7, metalness: 0.2 })
    );
    battery.position.set(-0.04, CHAN_SIZE / 2 + 0.003 + 0.0175, 0.08);
    battery.castShadow = true;
    this.chassisMesh.add(battery);

    const batLabel = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.001, 0.025),
      new THREE.MeshStandardMaterial({ color: 0x4488cc, roughness: 0.9 })
    );
    batLabel.position.set(-0.04, CHAN_SIZE / 2 + 0.003 + 0.036, 0.08);
    this.chassisMesh.add(batLabel);

    const pwrSwitch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.005, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 0.4,
      })
    );
    pwrSwitch.position.set(FRAME_W / 2 - CHAN_SIZE - 0.01, CHAN_SIZE / 2 + 0.005, -0.12);
    this.chassisMesh.add(pwrSwitch);
  }

  // ─── INTAKE: Front roller mechanism ───
  private buildIntake() {
    this.intakeMesh = new THREE.Group();

    const intakeW = FRAME_W * 0.75;
    const rollerR = 0.015;

    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(intakeW, 0.025, 0.05),
      new THREE.MeshStandardMaterial({ color: COL_CHANNEL, roughness: 0.4, metalness: 0.5 })
    );
    housing.castShadow = true;
    this.intakeMesh.add(housing);

    const rollerMat = new THREE.MeshStandardMaterial({
      color: COL_INTAKE, roughness: 0.5, metalness: 0.2,
    });
    const rollerGeo = new THREE.CylinderGeometry(rollerR, rollerR, intakeW, 12);

    for (let i = 0; i < 2; i++) {
      const roller = new THREE.Mesh(rollerGeo, rollerMat);
      roller.rotation.z = Math.PI / 2;
      roller.position.set(0, -0.005, (i - 0.5) * 0.025);
      roller.castShadow = true;
      this.intakeMesh.add(roller);
      this.intakeRollers.push(roller);
    }

    const flapMat = new THREE.MeshStandardMaterial({ color: 0x228833, roughness: 0.8 });
    for (let x = -intakeW / 2 + 0.02; x < intakeW / 2; x += 0.035) {
      for (let row = 0; row < 2; row++) {
        const flap = new THREE.Mesh(
          new THREE.BoxGeometry(0.015, 0.025, 0.003), flapMat
        );
        flap.position.set(x, -0.018, (row - 0.5) * 0.025);
        this.intakeMesh.add(flap);
      }
    }

    this.intakeMesh.position.set(0, -CHAN_SIZE / 4, -FRAME_D / 2 - 0.025);
    this.chassisMesh.add(this.intakeMesh);
  }

  // ─── LINEAR SLIDE: goBILDA Viper-Slide style ───
  private buildLinearSlide() {
    this.slideMesh = new THREE.Group();

    const slideMat = new THREE.MeshStandardMaterial({
      color: COL_SLIDE, roughness: 0.25, metalness: 0.8,
    });

    const railGeo = new THREE.BoxGeometry(0.025, SLIDE_HEIGHT, 0.025);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, slideMat);
      rail.position.set(side * 0.06, SLIDE_HEIGHT / 2, 0);
      rail.castShadow = true;
      this.slideMesh.add(rail);

      const groove = new THREE.Mesh(
        new THREE.BoxGeometry(0.003, SLIDE_HEIGHT, 0.028),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })
      );
      groove.position.copy(rail.position);
      this.slideMesh.add(groove);
    }

    for (let y = 0.04; y < SLIDE_HEIGHT; y += 0.08) {
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.004, 0.02), slideMat
      );
      brace.position.set(0, y, 0);
      this.slideMesh.add(brace);
    }

    const carriage = new THREE.Mesh(
      new THREE.BoxGeometry(0.10, 0.03, 0.035),
      new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.6 })
    );
    carriage.position.set(0, 0.05, 0);
    carriage.castShadow = true;
    this.slideMesh.add(carriage);

    const string = new THREE.Mesh(
      new THREE.BoxGeometry(0.001, SLIDE_HEIGHT * 0.9, 0.001),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.9 })
    );
    string.position.set(0.04, SLIDE_HEIGHT * 0.45, 0.015);
    this.slideMesh.add(string);

    this.slideMesh.position.set(0, CHAN_SIZE / 2 + 0.003, 0.10);
    this.chassisMesh.add(this.slideMesh);
  }

  // ─── SHOOTER/ARM: Claw at top of slide ───
  private buildShooterArm() {
    this.shooterMesh = new THREE.Group();

    const pivotBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: COL_SLIDE, roughness: 0.3, metalness: 0.7 })
    );
    pivotBase.rotation.z = Math.PI / 2;
    pivotBase.castShadow = true;
    this.shooterMesh.add(pivotBase);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.12, 0.015),
      new THREE.MeshStandardMaterial({ color: COL_CHANNEL, roughness: 0.3, metalness: 0.6 })
    );
    arm.position.set(0, 0.06, 0);
    arm.castShadow = true;
    this.shooterMesh.add(arm);

    const clawBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.015, 0.03),
      new THREE.MeshStandardMaterial({ color: COL_CLAW, roughness: 0.3, metalness: 0.7 })
    );
    clawBase.position.set(0, 0.125, 0);
    clawBase.castShadow = true;
    this.shooterMesh.add(clawBase);

    for (const side of [-1, 1]) {
      const finger = new THREE.Mesh(
        new THREE.BoxGeometry(0.005, 0.04, 0.025),
        new THREE.MeshStandardMaterial({ color: COL_CLAW, roughness: 0.3, metalness: 0.7 })
      );
      finger.position.set(side * 0.025, 0.145, 0);
      finger.castShadow = true;
      this.shooterMesh.add(finger);

      const tip = new THREE.Mesh(
        new THREE.BoxGeometry(0.006, 0.015, 0.028),
        new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 })
      );
      tip.position.set(side * 0.025, 0.17, 0);
      this.shooterMesh.add(tip);
    }

    const servo = new THREE.Mesh(
      new THREE.BoxGeometry(0.023, 0.012, 0.024),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.4 })
    );
    servo.position.set(0, 0.115, -0.02);
    this.shooterMesh.add(servo);

    const launcher = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.012, 0.06, 8),
      new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.2, metalness: 0.8 })
    );
    launcher.position.set(0, 0.155, -0.035);
    launcher.rotation.x = Math.PI / 4;
    launcher.castShadow = true;
    this.shooterMesh.add(launcher);

    const tipGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 0.5,
      })
    );
    tipGlow.position.set(0, 0.175, -0.055);
    this.shooterMesh.add(tipGlow);

    this.shooterMesh.position.set(0, CHAN_SIZE / 2 + 0.003 + 0.05, 0.10);
    this.chassisMesh.add(this.shooterMesh);
  }

  // ─────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────
  update(dt: number, input: InputManager) {
    // Shooting cooldown
    if (this.shootCooldown > 0) {
      this.shootCooldown -= dt;
      if (this.shootCooldown <= 0) this.canShoot = true;
    }

    // Drive
    const forward = input.getAxis('forward');
    const strafe = input.getAxis('strafe');
    const turn = input.getAxis('turn');
    this.boosting = input.isPressed('boost');

    const speedMult = this.boosting ? MAX_SPEED * BOOST_MULTIPLIER : MAX_SPEED;

    const quat = this.chassisBody.quaternion;
    const fwd = new CANNON.Vec3(0, 0, -1);
    const right = new CANNON.Vec3(1, 0, 0);
    quat.vmult(fwd, fwd);
    quat.vmult(right, right);

    const vx = fwd.x * forward * speedMult + right.x * strafe * speedMult;
    const vz = fwd.z * forward * speedMult + right.z * strafe * speedMult;
    this.chassisBody.velocity.x = vx;
    this.chassisBody.velocity.z = vz;

    // Keep upright + apply turn
    this.chassisBody.quaternion.setFromAxisAngle(
      new CANNON.Vec3(0, 1, 0),
      this.getYaw() + turn * TURN_SPEED * dt
    );

    // Sync mesh ← physics
    this.chassisMesh.position.copy(this.chassisBody.position as unknown as THREE.Vector3);
    this.chassisMesh.quaternion.copy(this.chassisBody.quaternion as unknown as THREE.Quaternion);

    // Animate wheels (basic mode only)
    if (!this.useCustomModel) {
      this.wheelSpeed = Math.sqrt(vx * vx + vz * vz) / WHEEL_R;
      for (const wheel of this.wheels) {
        const hub = wheel.children[0];
        if (hub) {
          hub.rotation.x += this.wheelSpeed * dt * (forward >= 0 ? 1 : -1);
        }
      }

      // Animate intake rollers
      if (this.intakeDirection !== 'off') {
        const dir = this.intakeDirection === 'in' ? 1 : -1;
        for (const roller of this.intakeRollers) {
          roller.rotation.x += dir * 15 * dt;
        }
      }
    }

    // Shooter control
    const shooterPitch = input.getAxis('shooterPitch');
    const shooterYaw = input.getAxis('shooterYaw');
    this.shooterAngle = THREE.MathUtils.clamp(
      this.shooterAngle + shooterPitch * 2 * dt,
      -0.3, 1.2
    );
    this.shooterYaw += shooterYaw * 2 * dt;

    this.shooterMesh.rotation.y = this.shooterYaw;
    this.shooterMesh.rotation.x = -this.shooterAngle * 0.5;

    // Shoot
    if (input.isPressed('shoot') && this.canShoot) {
      this.shoot();
    }

    // Intake
    if (input.isPressed('intakeIn')) {
      this.intakeIn();
    } else if (input.isPressed('intakeOut')) {
      this.intakeOut();
    } else {
      this.intakeDirection = 'off';
    }

    // Projectiles
    this.updateProjectiles(dt);

    // Telemetry
    const pos = this.chassisMesh.position;
    const vel = this.chassisBody.velocity;
    this.telemetry = {
      'X': pos.x.toFixed(2),
      'Y': pos.y.toFixed(2),
      'Z': pos.z.toFixed(2),
      'Heading': (THREE.MathUtils.radToDeg(this.getYaw()) % 360).toFixed(1) + '\u00B0',
      'Speed': Math.sqrt(vel.x ** 2 + vel.z ** 2).toFixed(2) + ' m/s',
      'Arm Angle': THREE.MathUtils.radToDeg(this.shooterAngle).toFixed(1) + '\u00B0',
      'Intake': this.intakeDirection,
      'Boost': this.boosting ? 'ON' : 'OFF',
    };
  }

  private getYaw(): number {
    const euler = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion(
        this.chassisBody.quaternion.x,
        this.chassisBody.quaternion.y,
        this.chassisBody.quaternion.z,
        this.chassisBody.quaternion.w
      ),
      'YXZ'
    );
    return euler.y;
  }

  // ─── SHOOTING ───
  shoot() {
    if (!this.canShoot) return;
    this.canShoot = false;
    this.shootCooldown = 0.5;

    const radius = 0.0635;
    const isPurple = Math.random() > 0.33;
    const hexColor = isPurple ? 0x8833aa : 0x33aa44;

    const geo = new THREE.SphereGeometry(radius, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: hexColor, emissive: hexColor, emissiveIntensity: 0.3,
      roughness: 0.25, metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;

    const robotPos = this.chassisMesh.position.clone();
    const robotQuat = this.chassisMesh.quaternion.clone();

    const dir = new THREE.Vector3(0, Math.sin(this.shooterAngle), -Math.cos(this.shooterAngle));
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.shooterYaw);
    dir.applyQuaternion(robotQuat);
    dir.normalize();

    const spawnPos = robotPos.clone().add(dir.clone().multiplyScalar(0.25));
    spawnPos.y += CHAN_SIZE + 0.15;
    mesh.position.copy(spawnPos);
    this.scene.add(mesh);

    const body = new CANNON.Body({
      mass: 0.08,
      shape: new CANNON.Sphere(radius),
      linearDamping: 0.15,
    });
    body.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
    body.velocity.set(dir.x * SHOOT_FORCE, dir.y * SHOOT_FORCE, dir.z * SHOOT_FORCE);
    this.world.addBody(body);

    this.projectiles.push({ mesh, body, life: 8 });
  }

  intakeIn() {
    this.intakeDirection = 'in';
    this.intakeActive = true;
  }

  intakeOut() {
    this.intakeDirection = 'out';
    this.intakeActive = true;
  }

  stopAll() {
    this.intakeDirection = 'off';
    this.intakeActive = false;
    this.chassisBody.velocity.setZero();
    this.chassisBody.angularVelocity.setZero();
  }

  setDrivePower(forward: number, turn: number) {
    const quat = this.chassisBody.quaternion;
    const fwd = new CANNON.Vec3(0, 0, -1);
    quat.vmult(fwd, fwd);

    this.chassisBody.velocity.x = fwd.x * forward * MAX_SPEED;
    this.chassisBody.velocity.z = fwd.z * forward * MAX_SPEED;
    this.chassisBody.quaternion.setFromAxisAngle(
      new CANNON.Vec3(0, 1, 0),
      this.getYaw() + turn * TURN_SPEED * 0.016
    );
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.mesh.position.copy(p.body.position as unknown as THREE.Vector3);
      p.mesh.quaternion.copy(p.body.quaternion as unknown as THREE.Quaternion);

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.world.removeBody(p.body);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  reset() {
    this.chassisBody.position.set(this.initialPos.x, this.initialPos.y, this.initialPos.z);
    this.chassisBody.velocity.setZero();
    this.chassisBody.angularVelocity.setZero();
    this.chassisBody.quaternion.set(0, 0, 0, 1);
    this.chassisMesh.position.copy(this.initialPos);
    this.chassisMesh.quaternion.set(0, 0, 0, 1);
    this.shooterAngle = 0.4;
    this.shooterYaw = 0;

    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
      this.world.removeBody(p.body);
    }
    this.projectiles = [];
  }

  getPosition(): THREE.Vector3 {
    return this.chassisMesh.position.clone();
  }

  getQuaternion(): THREE.Quaternion {
    return this.chassisMesh.quaternion.clone();
  }
}
