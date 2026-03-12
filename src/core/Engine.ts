import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Field } from '../field/Field';
import { Robot } from '../robot/Robot';
import { CameraController } from '../camera/CameraController';
import { InputManager } from '../input/InputManager';
import { UIManager } from '../ui/UIManager';
import { CodeRunner } from '../code-runner/CodeRunner';

// Screen-space reflections / color grading shader
const ColorGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignetteStrength: { value: 0.35 },
    saturation: { value: 1.15 },
    contrast: { value: 1.08 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float vignetteStrength;
    uniform float saturation;
    uniform float contrast;
    varying vec2 vUv;

    vec3 adjustSaturation(vec3 color, float sat) {
      float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
      return mix(vec3(grey), color, sat);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;

      // Contrast
      color = (color - 0.5) * contrast + 0.5;

      // Saturation
      color = adjustSaturation(color, saturation);

      // Vignette
      vec2 uv = vUv * (1.0 - vUv.yx);
      float vig = uv.x * uv.y * 15.0;
      vig = pow(vig, vignetteStrength);
      color *= vig;

      // Subtle chromatic aberration
      float caStrength = 0.002;
      float r = texture2D(tDiffuse, vUv + vec2(caStrength, 0.0)).r;
      float b = texture2D(tDiffuse, vUv - vec2(caStrength, 0.0)).b;
      color.r = mix(color.r, r, 0.5);
      color.b = mix(color.b, b, 0.5);

      gl_FragColor = vec4(color, texel.a);
    }
  `,
};

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  world: CANNON.World;
  camera: THREE.PerspectiveCamera;
  cameraController: CameraController;
  field: Field;
  robot: Robot;
  input: InputManager;
  ui: UIManager;
  codeRunner: CodeRunner;

  // Post-processing
  composer!: EffectComposer;
  bloomPass!: UnrealBloomPass;

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
    // Renderer — 4K / native resolution, HDR pipeline
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // SMAA handles AA in post
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Full native pixel ratio — 4K on retina/HiDPI displays
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a18);
    this.scene.fog = new THREE.FogExp2(0x0a0a18, 0.012);

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
    this.ui = new UIManager(this);
    this.codeRunner = new CodeRunner(this);

    this.setupLighting();
    this.setupEnvironment();
    this.setupPostProcessing();

    window.addEventListener('resize', this.onResize.bind(this));
  }

  private generateEnvironmentMap() {
    // Create a procedural HDR environment using a cube render target
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    // Build a mini scene for the environment
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
        lightIntensity: { value: 3.0 },
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

          // Sky gradient
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

    // Arena-like floor reflection
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
    // Ambient — subtle fill
    const ambient = new THREE.AmbientLight(0x303050, 0.4);
    this.scene.add(ambient);

    // Hemisphere — sky/ground color bleed
    const hemi = new THREE.HemisphereLight(0x8ec8f0, 0x362a1e, 0.6);
    this.scene.add(hemi);

    // Main directional (key light) — warm, high quality shadows
    const dirLight = new THREE.DirectionalLight(0xfff0dd, 2.0);
    dirLight.position.set(8, 18, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(4096, 4096);
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

    // Fill light — cool blue
    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.5);
    fillLight.position.set(-6, 10, -4);
    this.scene.add(fillLight);

    // Rim / back light — gives edge definition
    const rimLight = new THREE.DirectionalLight(0xffc880, 0.4);
    rimLight.position.set(-3, 6, 8);
    this.scene.add(rimLight);

    // Overhead spot lights (arena lights) — with shadows on two of them
    const spotPositions: [number, number, number, boolean][] = [
      [-3, 12, -3, true], [3, 12, -3, false], [-3, 12, 3, false], [3, 12, 3, true],
    ];
    for (const [x, y, z, castShadow] of spotPositions) {
      const spot = new THREE.SpotLight(0xfff8f0, 1.2, 25, Math.PI / 5, 0.6, 1.2);
      spot.position.set(x, y, z);
      spot.target.position.set(0, 0, 0);
      spot.castShadow = castShadow;
      if (castShadow) {
        spot.shadow.mapSize.set(2048, 2048);
        spot.shadow.bias = -0.0001;
      }
      this.scene.add(spot);
      this.scene.add(spot.target);

      // Visible light cone / lens flare effect using emissive sphere
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 16, 16),
        new THREE.MeshStandardMaterial({
          color: 0xffffee,
          emissive: 0xffffee,
          emissiveIntensity: 5.0,
        })
      );
      bulb.position.set(x, y, z);
      this.scene.add(bulb);
    }

    // Ground bounce light
    const bounceLight = new THREE.PointLight(0x334466, 0.3, 15);
    bounceLight.position.set(0, 0.1, 0);
    this.scene.add(bounceLight);
  }

  private setupEnvironment() {
    // Ground plane — polished concrete look
    const groundGeo = new THREE.PlaneGeometry(60, 60);
    const groundMat = new THREE.MeshPhysicalMaterial({
      color: 0x1a1a28,
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

    // Skybox — richer gradient with stars
    const skyGeo = new THREE.SphereGeometry(100, 64, 64);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x050510) },
        midColor: { value: new THREE.Color(0x0d1b2a) },
        bottomColor: { value: new THREE.Color(0x1b2838) },
        time: { value: 0 },
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
        uniform float time;
        varying vec3 vWorldPosition;

        // Simple hash for star positions
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
          vec3 dir = normalize(vWorldPosition);
          float h = dir.y;

          // Rich gradient
          vec3 color;
          if (h > 0.0) {
            float t = pow(h, 0.6);
            color = mix(midColor, topColor, t);
          } else {
            color = mix(midColor, bottomColor, -h * 2.0);
          }

          // Stars (only above horizon)
          if (h > 0.05) {
            vec2 starUv = dir.xz / (h + 0.1) * 20.0;
            float star = hash(floor(starUv));
            if (star > 0.985) {
              float brightness = (star - 0.985) / 0.015;
              float twinkle = sin(time * 2.0 + star * 100.0) * 0.3 + 0.7;
              color += vec3(brightness * twinkle * 0.8);
            }
          }

          // Nebula-like color zones
          float n1 = sin(dir.x * 3.0 + dir.z * 2.0) * 0.5 + 0.5;
          float n2 = cos(dir.z * 4.0 - dir.x * 1.5) * 0.5 + 0.5;
          color += vec3(0.02, 0.0, 0.04) * n1 * max(h, 0.0);
          color += vec3(0.0, 0.01, 0.03) * n2 * max(h, 0.0);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    (sky as any)._skyMat = skyMat; // ref for animation
    this.scene.add(sky);
    (this as any)._skyMesh = sky;

    // Atmospheric particles (dust motes in arena lights)
    this.addAtmosphericParticles();
  }

  private addAtmosphericParticles() {
    const count = 800;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 1] = Math.random() * 8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 12;
      sizes[i] = Math.random() * 3 + 1;
      opacities[i] = Math.random() * 0.4 + 0.1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      color: 0xccccdd,
      size: 0.02,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const particles = new THREE.Points(geo, mat);
    (this as any)._dustParticles = particles;
    this.scene.add(particles);
  }

  private setupPostProcessing() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const pixelRatio = this.renderer.getPixelRatio();

    this.composer = new EffectComposer(this.renderer);

    // Main render pass
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Bloom — HDR glow on emissive surfaces (LEDs, lights)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x * pixelRatio, size.y * pixelRatio),
      0.4,  // strength
      0.6,  // radius
      0.85  // threshold
    );
    this.composer.addPass(this.bloomPass);

    // SMAA — high quality anti-aliasing (replaces native MSAA)
    const smaaPass = new SMAAPass(
      size.x * pixelRatio,
      size.y * pixelRatio
    );
    this.composer.addPass(smaaPass);

    // Color grading + vignette
    const colorGradingPass = new ShaderPass(ColorGradingShader);
    this.composer.addPass(colorGradingPass);
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

      // Robot
      this.robot.update(dt, this.input);

      // Code runner
      this.codeRunner.update(dt);

      // Camera
      this.cameraController.update(dt);

      // Field
      this.field.update(dt);
    }

    // UI
    this.ui.update();

    // Animate sky
    const skyMesh = (this as any)._skyMesh;
    if (skyMesh?._skyMat) {
      skyMesh._skyMat.uniforms.time.value = this.clock.elapsedTime;
    }

    // Animate dust particles
    const dust = (this as any)._dustParticles as THREE.Points | undefined;
    if (dust) {
      const posArr = dust.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < posArr.length; i += 3) {
        posArr[i + 1] += Math.sin(this.clock.elapsedTime * 0.3 + i) * 0.0003;
        posArr[i] += Math.cos(this.clock.elapsedTime * 0.2 + i * 0.5) * 0.0002;
        if (posArr[i + 1] > 8) posArr[i + 1] = 0;
      }
      dust.geometry.attributes.position.needsUpdate = true;
    }

    // Render via post-processing pipeline
    this.composer.render();
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
    this.composer.setSize(w, h);
    const pixelRatio = this.renderer.getPixelRatio();
    this.bloomPass.setSize(w * pixelRatio, h * pixelRatio);
  }

  dispose() {
    cancelAnimationFrame(this._animFrameId);
    this.renderer.dispose();
    this.input.dispose();
    this.cameraController.dispose();
  }
}
