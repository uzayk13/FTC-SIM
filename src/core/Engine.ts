import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Field } from '../field/Field';
import { Robot } from '../robot/Robot';
import { CameraController } from '../camera/CameraController';
import { InputManager } from '../input/InputManager';
import { CodeRunner } from '../code-runner/CodeRunner';

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  world: CANNON.World;
  camera: THREE.PerspectiveCamera;
  cameraController: CameraController;
  field: Field;
  robot: Robot;
  input: InputManager;
  codeRunner: CodeRunner;

  // Environment map for reflections
  envMap: THREE.Texture | null = null;

  clock = new THREE.Clock();
  fixedTimeStep = 1 / 60;
  maxSubSteps = 3;

  matchTime = 150; // 2:30
  matchRunning = false;
  matchPhase: 'AUTO' | 'TELEOP' | 'ENDGAME' = 'TELEOP';
  redScore = 0;
  blueScore = 0;
  paused = false;

  private _animFrameId = 0;

  constructor(canvas: HTMLCanvasElement, useCustomModel = false) {
    // Renderer — standard forward rendering
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a2a3e);
    this.scene.fog = new THREE.FogExp2(0x2a2a3e, 0.005);

    // Camera
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 300);
    this.camera.position.set(0, 5, 8);

    // Physics world
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.81, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction = 0.5;
    this.world.defaultContactMaterial.restitution = 0.3;

    // Generate HDR environment map for reflections
    this.generateEnvironmentMap();

    // Initialize subsystems
    this.input = new InputManager();
    this.field = new Field(this.scene, this.world, this.envMap);
    this.robot = new Robot(this.scene, this.world, useCustomModel, this.envMap);
    this.cameraController = new CameraController(this.camera, this.renderer.domElement, this.robot);
    this.codeRunner = new CodeRunner(this);

    this.setupLighting();
    this.setupEnvironment();

    window.addEventListener('resize', this.onResize.bind(this));
  }

  private generateEnvironmentMap() {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    const envScene = new THREE.Scene();

    // Gradient sky dome
    const skyGeo = new THREE.SphereGeometry(50, 64, 64);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x0d1b2a) },
        midColor: { value: new THREE.Color(0x1b2838) },
        bottomColor: { value: new THREE.Color(0x2a1a0a) },
        lightDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        lightColor: { value: new THREE.Color(0xffeedd) },
        lightIntensity: { value: 1.5 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform vec3 lightDir;
        uniform vec3 lightColor;
        uniform float lightIntensity;
        varying vec3 vWorldPosition;
        void main() {
          vec3 dir = normalize(vWorldPosition);
          float h = dir.y;

          vec3 color;
          if (h > 0.0) {
            color = mix(midColor, topColor, h);
          } else {
            color = mix(midColor, bottomColor, -h);
          }

          // Sun glow
          float sunDot = max(dot(dir, lightDir), 0.0);
          color += lightColor * pow(sunDot, 64.0) * lightIntensity;
          color += lightColor * pow(sunDot, 8.0) * 0.3;

          // Subtle ambient glow spots (arena lights)
          for (int i = 0; i < 4; i++) {
            vec3 lp = vec3(float(i / 2) * 2.0 - 1.0, 3.0, float(i - i / 2 * 2) * 2.0 - 1.0);
            float d = max(dot(dir, normalize(lp)), 0.0);
            color += vec3(0.8, 0.85, 1.0) * pow(d, 32.0) * 0.5;
          }

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    envScene.add(sky);

    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x111122 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2;
    envScene.add(floor);

    const envRT = pmremGenerator.fromScene(envScene, 0.04);
    this.envMap = envRT.texture;
    this.scene.environment = this.envMap;

    pmremGenerator.dispose();
  }

  private setupLighting() {
    // Ambient
    const ambient = new THREE.AmbientLight(0x808090, 0.8);
    this.scene.add(ambient);

    // Hemisphere
    const hemi = new THREE.HemisphereLight(0xc0d8f0, 0x6a5a4e, 0.6);
    this.scene.add(hemi);

    // Main directional (key light)
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(8, 18, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -12;
    dirLight.shadow.camera.right = 12;
    dirLight.shadow.camera.top = 12;
    dirLight.shadow.camera.bottom = -12;
    dirLight.shadow.bias = -0.00005;
    dirLight.shadow.normalBias = 0.015;
    dirLight.shadow.radius = 2;
    this.scene.add(dirLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0x88aadd, 0.5);
    fillLight.position.set(-6, 10, -4);
    this.scene.add(fillLight);

    // Rim / back light
    const rimLight = new THREE.DirectionalLight(0xffd8a0, 0.4);
    rimLight.position.set(-3, 6, 8);
    this.scene.add(rimLight);

    // Overhead spot lights — no shadow casting (directional handles it)
    const spotPositions: [number, number, number][] = [
      [-3, 12, -3], [3, 12, -3], [-3, 12, 3], [3, 12, 3],
    ];
    for (const [x, y, z] of spotPositions) {
      const spot = new THREE.SpotLight(0xfff8f0, 1.5, 30, Math.PI / 4, 0.4, 0.8);
      spot.position.set(x, y, z);
      spot.target.position.set(0, 0, 0);
      spot.castShadow = false;
      this.scene.add(spot);
      this.scene.add(spot.target);

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshStandardMaterial({
          color: 0xffffee,
          emissive: 0xffffee,
          emissiveIntensity: 2.0,
        })
      );
      bulb.position.set(x, y, z);
      this.scene.add(bulb);
    }

    // Ground bounce light
    const bounceLight = new THREE.PointLight(0x556688, 0.5, 20);
    bounceLight.position.set(0, 0.1, 0);
    this.scene.add(bounceLight);
  }

  private setupEnvironment() {
    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(60, 60);
    const groundMat = new THREE.MeshPhysicalMaterial({
      color: 0x3a3a4a,
      roughness: 0.75,
      metalness: 0.05,
      clearcoat: 0.1,
      clearcoatRoughness: 0.8,
      envMapIntensity: 0.3,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Skybox
    const skyGeo = new THREE.SphereGeometry(100, 64, 64);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x050510) },
        midColor: { value: new THREE.Color(0x0d1b2a) },
        bottomColor: { value: new THREE.Color(0x1b2838) },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          vec3 dir = normalize(vWorldPosition);
          float h = dir.y;
          vec3 color;
          if (h > 0.0) {
            float t = pow(h, 0.6);
            color = mix(midColor, topColor, t);
          } else {
            color = mix(midColor, bottomColor, -h * 2.0);
          }
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
  }

  start() {
    this.clock.start();
    this.loop();
  }

  private loop = () => {
    this._animFrameId = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (!this.paused) {
      // Update match timer
      if (this.matchRunning) {
        this.matchTime -= dt;
        if (this.matchTime <= 0) {
          this.matchTime = 0;
          this.matchRunning = false;
        }
        if (this.matchTime <= 30 && this.matchPhase !== 'ENDGAME') {
          this.matchPhase = 'ENDGAME';
        }
      }

      // Physics
      this.world.step(this.fixedTimeStep, dt, this.maxSubSteps);

      // Input
      this.input.update();

      // Robot — skip manual drive when user code is controlling
      this.robot.update(dt, this.input, this.codeRunner.running);

      // Code runner
      this.codeRunner.update(dt);

      // Camera
      this.cameraController.update(dt);

      // Field
      this.field.update(dt);
    }

    // Render directly
    this.renderer.render(this.scene, this.camera);
  };

  startMatch() {
    this.matchTime = 150;
    this.matchRunning = true;
    this.matchPhase = 'TELEOP';
    this.redScore = 0;
    this.blueScore = 0;
  }

  resetField() {
    this.matchTime = 150;
    this.matchRunning = false;
    this.matchPhase = 'TELEOP';
    this.redScore = 0;
    this.blueScore = 0;
    this.robot.reset();
    this.field.reset();
  }

  togglePause() {
    this.paused = !this.paused;
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    cancelAnimationFrame(this._animFrameId);
    this.renderer.dispose();
    this.input.dispose();
    this.cameraController.dispose();
  }
}
