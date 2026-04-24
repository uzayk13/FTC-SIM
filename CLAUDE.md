# FTC Simulator — DECODE 2025-26

## Project Overview
Browser-based FTC (FIRST Tech Challenge) robot simulator for the DECODE 2025-26 season. Users upload OpMode code (Java/JS/TS) and test it on a virtual field with physics.

## Tech Stack
- **Frontend**: Vite + React 19 + TypeScript
- **3D Rendering**: Three.js
- **Physics**: cannon-es
- **Syntax highlighting**: Prism.js (Java/Kotlin/JS/TS/JSON/XML/Groovy/properties/markdown) — used by the in-app code viewer
- **Backend**: Spring Boot 3.5 (Java, Gradle) — code compilation & transpilation
- **Backend Dependencies**: JavaParser (AST-based Java→JS transpilation)
- **Required JDK**: 21+ for backend (Microsoft OpenJDK 21 at `C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot` on dev machine; system PATH may still point at JDK 8, so set `JAVA_HOME` for that shell when starting Gradle)

## Project Structure
```
src/
  main.tsx          — React entry point
  core/Engine.ts    — Central orchestrator: scene, renderer, physics world, game loop
  field/Field.ts    — Field GLTF loading, physics colliders, sample spawning
  field/GamePieces.ts — (legacy, unused) old procedural ball spawner
  robot/
    Robot.ts        — Robot chassis, subsystems. Branches on `uploadedModel`: either builds the default goBILDA chassis (sphere-compound collider) or adds the uploaded GLTF group + multi-hull convex colliders.
    RobotModel.ts   — Client-side GLB/glTF uploader. `parseGLBFile(File)` sniffs magic bytes, decodes text glTF ourselves (to surface BOM/encoding errors clearly), rejects non-self-contained .gltf (`"uri":` refs) and >200MB text / >500MB binary files. `buildTransformedGroup()` applies user rotX/Y/Z + scaleMult to a fresh clone. `buildHulls()` walks the scene graph, converts each mesh's local-space vertices into a `CANNON.ConvexPolyhedron` via three.js `ConvexHull`, caps verts at 28 per hull by re-hulling a strided subset, re-centers verts on their centroid so the centroid becomes the shape offset. DRACO decompression wired via gstatic CDN.
  camera/CameraController.ts — Follow, freecam, overhead, side camera modes
  input/
    InputManager.ts — Keyboard + gamepad input. Recomposes gamepad1/2 every frame from physical reading + keyboard via the active Keymap.
    Keymap.ts       — Keymap types, default mapping (mirrors legacy hardcoded keys), localStorage persistence (`ftc-sim-keymap-v1`), reserved-keys list (F, 1/2/3, H, Esc), displayKey helper.
  code-runner/      — User code execution (OpMode runner)
    CodeRunner.ts   — Loads code, tries backend→fallback to local transpiler, executes
    JavaTranspiler.ts — Local regex-based Java→JS transpiler (fallback)
    FtcRuntime.ts   — Mock FTC SDK classes for in-browser execution
    GradleParser.ts — Gradle project file analysis
    GamepadUsageScanner.ts — Scans uploaded .java/.kt files for gamepad1/2.<field> references; returns per-field usage sites for the mapping modal.
  api/
    ApiClient.ts    — Backend API client (compile endpoint, health check)
  ui/               — React UI components
    App.tsx               — Top-level view router: 'landing' | 'mapping' | 'simulator' | 'code' | 'modelviewer'. Owns `loadedFiles`, `robotModel: UploadedRobotModel | null`, `keymap` state (session-scoped — no persistence beyond localStorage keymap).
    LandingPage.tsx       — Upload UI with three cards: code files, GitHub import, and optional Robot CAD Model (.glb / .gltf). "Launch Simulator" + "View Code" buttons; "View / Adjust Model" button appears when a CAD model is loaded. Launch is gated on loadedFiles.length > 0 only — CAD model is optional.
    ControlsMappingModal.tsx — Shown between Landing and Simulator. Lists code-derived gamepad inputs and lets the user rebind keys. On Start, filters the keymap to only the `(gamepad, field)` pairs found by `GamepadUsageScanner` — unreferenced fields are unbound so their keys do nothing in-sim. Full (unfiltered) keymap is still saved to localStorage so customizations for unused fields persist across runs.
    ModelViewer.tsx       — Preview page for the uploaded CAD model. Three.js scene with OrbitControls, grid (0.1m cells), axes helper. Side panel: ±90° snap-rotate buttons per axis, 0.5×–2× scale slider (on top of auto-fit). Writes updated rotX/Y/Z/scaleMult back to App state via `onUpdate` on every change.
    CodeViewer.tsx        — Read-only VS Code–style file browser (collapsible tree + Prism-highlighted pane, draggable splitter)
    ControlsPanel.tsx     — In-sim panel; shows code-derived bindings (not hardcoded), plus static camera/other controls
    SimulatorView.tsx, HUD.tsx, Toolbar.tsx, Telemetry.tsx, CodeStatus.tsx, GamepadIndicator.tsx
public/
  models/FieldwithObelisk.gltf — DECODE field + obelisk (GLTF, Z-up, mm units)
  models/blue-goal.gltf        — Blue alliance goal/ramp assembly
  models/red-goal.gltf         — Red alliance goal/ramp assembly
  models/ball-markers.gltf     — Ball spawn position markers (colored)
  models/ball.stl              — Sample ball CAD model (12MB, Z-up, mm units)
backend/
  build.gradle      — Spring Boot project config
  src/main/java/com/ftcsimmer/
    FtcSimmerBackendApplication.java — Spring Boot entry point
    config/CorsConfig.java           — CORS for dev server
    controller/CompileController.java — REST endpoints (/api/compile, /api/health)
    service/
      JavaCompilerService.java       — In-memory javax.tools compilation + validation
      JavaTranspilerService.java     — JavaParser AST-based Java→JS transpilation
    model/                           — Request/response DTOs
  src/main/resources/
    application.yml                  — Server config (port 8080)
    ftc-stubs/                       — Minimal FTC SDK/FTCLib Java stubs for compilation
```

## Key Conventions

### Model Loading
- Built-in CAD models are in **millimetres** and **Z-up** coordinate system
- Convert to metres: `scale = 0.001`
- Convert to Y-up: `rotation.x = -Math.PI / 2`
- Use `Box3.setFromObject()` after rotation to pin models to ground (y=0)
- Field models use **GLTF** format (supports colors + scene hierarchy)
- Ball visual still uses STL (`ball.stl`) with real CAD dimensions

### Robot CAD Upload (user-provided)
- Optional `.glb` / `.gltf` upload on the landing page. Parsed entirely client-side via `GLTFLoader` (no backend round-trip).
- Auto-fit scale = `FRAME_W / max(modelSize.x, modelSize.z)` so the model's horizontal footprint matches the default chassis (~0.44 m). User can adjust on top with the ModelViewer's scale slider (0.5×–2×).
- Orientation is user-controlled via ±90° snap-rotate buttons on X/Y/Z in the ModelViewer. No auto up-axis detection — defaults assume Y-up (three.js native) since that's what most glTF exporters produce.
- **Multi-hull physics**: one `CANNON.ConvexPolyhedron` per GLTF mesh node (uses the scene graph from CAD). Falls back to a single bbox-sized `CANNON.Box` if hull construction fails. Vertices are extracted in the transformed group's local space, then re-centered on each hull's centroid so the centroid becomes the shape's `addShape` offset. Vertex count is capped at 28 per hull by strided re-hulling.
- Size limits: 200 MB for text `.gltf`, 500 MB for binary `.glb` (V8 string cap is ~512 MB). Text `.gltf` with external `"uri":` references is rejected — users must re-export as self-contained `.glb`.
- DRACO decompression is wired (gstatic CDN decoder) so Draco-compressed `.glb` files produced by `gltf-transform` or Blender work out of the box.
- Onshape's default glTF export at "Fine" resolution can exceed 700 MB even with simple assemblies. Users should re-export at "Coarse" or decimate via Blender / `gltf-transform simplify --ratio 0.1`.
- When a robot model is uploaded, `Robot.ts` skips the procedural goBILDA chassis build (and its wheel animation). The custom `Robot.gltf` path in `public/` and the old `useCustomModel` checkbox have been removed — the uploaded model supersedes them.

### Field Architecture
- Field is split into separate GLTF models for physics separation:
  - `FieldwithObelisk.gltf` — field base, perimeter, obelisk (static)
  - `blue-goal.gltf` / `red-goal.gltf` — goal ramp assemblies (separate for physics)
  - `ball-markers.gltf` — marker meshes defining ball spawn positions + colors
- Physics colliders (floor, walls) are built separately with cannon-es
- Ball spawn positions are read from `ball-markers.gltf` node positions
- Ball colors detected from marker material: purple (#9107ff) or green (#00c000)
- Samples: **purple and green only** (DECODE season — no yellow)
- Each goal is stored as a `FieldElement` with a `body: null` placeholder for future physics

### Physics
- Fixed timestep: 1/60s, max 3 substeps
- Samples: mass 0.05kg, friction 0.3, restitution 0.5, damping 0.4
- Robot: mass 14kg (total body mass — distributed across hulls by cannon-es when multiple shapes are attached)
- Default chassis collider: 5 spheres (4 corners + center) at radius 0.04m — sufficient for floor + wall contact without sphere-trimesh complexity
- Uploaded CAD collider: one `ConvexPolyhedron` per GLTF mesh node, with per-hull centroid offsets. See "Robot CAD Upload" above.

### Input & Keymap
- All gamepad fields (`gamepad1.*` and `gamepad2.*`) are user-rebindable. The mapping modal opens when the user clicks **Launch Simulator** and only lists fields the uploaded code actually references (scanned by `GamepadUsageScanner`).
- `defaultKeymap()` in `Keymap.ts` is the source of truth for default bindings — it intentionally mirrors the *old* hardcoded keys so existing users feel no change: WS for `left_stick_y`, AD for `left_stick_x`, EQ for `right_stick_x`, Space=A, Shift=B, ZX=bumpers, arrows=dpad, R=X, F=Y. `gamepad2` defaults to fully unbound.
- Keymaps persist in `localStorage` under `ftc-sim-keymap-v1`.
- `RESERVED_KEYS` (`KeyF`, `Digit1/2/3`, `KeyH`, `Escape`) cannot be assigned to gamepad fields — they're for camera/UI/sim-only controls.
- `InputManager.compose()` rebuilds `gamepad1`/`gamepad2` every frame from a fresh physical poll + the current keyboard set, so released keys snap back to rest the next frame (no sticky state).
- The legacy `getAxis('forward'|'strafe'|'turn'|'shooterPitch'|'shooterYaw')` and `isPressed('shoot'|'intakeIn'|'intakeOut'|'boost')` methods now read from the keymap-driven `gamepad1.*` state, so manual driving (when no OpMode is running) follows the user's bindings too. `isPressed('reset'|'freecam'|'cam1'|'cam2'|'cam3')` still reads raw keys (sim-only).
- **Keymap filtering at launch**: `ControlsMappingModal.handleStart` passes a keymap *filtered to referenced fields only* (via `filterKeymapToUsage`) to the Engine. Fields the uploaded code doesn't reference stay unbound, so pressing their would-be keys does nothing in-sim. The unfiltered keymap is still saved to localStorage so rebindings for unused fields survive across sessions. Net effect: uploading code with no `gamepad1.*` references at all means no keybinds drive the robot (the old behavior where WASD always worked is gone).
- The Engine is constructed once per SimulatorView mount with the active keymap. Changing bindings requires returning to the landing page and re-launching — HMR doesn't reinitialize the engine.

### Coordinate System
- Field: 144×144 inches (3.6576m), centred at origin
- Front wall (audience) = -Z, Back wall (goals) = +Z
- Left wall (blue) = -X, Right wall (red) = +X

### Backend Architecture
- **Hybrid model**: backend compiles & transpiles Java → JS; frontend executes JS client-side
- No user code is ever executed on the backend — only compiled and transpiled
- Frontend falls back to local regex transpiler (`JavaTranspiler.ts`) if backend is unreachable
- Compilation uses `--release 17` (FTC Android target), `-proc:none` (no annotation processors)
- 10-second compilation timeout, max 50 files, max 512KB request size
- FTC SDK stubs (signatures only) in `backend/src/main/resources/ftc-stubs/` enable type resolution
- Vite dev server proxies `/api` → `http://localhost:8080`

### API Endpoints
- `POST /api/compile` — `{ files: [{path, content}], mode: "validate"|"transpile" }` → compiled JS + metadata
- `GET /api/health` — `{ status: "ok", jdkVersion: "..." }`

## Running
```bash
# Frontend
npm install
npm run dev

# Backend (requires JDK 21+)
cd backend
./gradlew bootRun
```
Both servers needed for full functionality; frontend works standalone with local transpiler fallback.

## Notes
- Field models are GLTF with colors. GLTF preserves named scene hierarchy for element separation.
- Season: **DECODE 2025-26** — artifacts are purple and green only (no yellow).
- Backend Gradle uses Groovy DSL (not Kotlin DSL) due to JDK 25 compatibility issue with Kotlin parser.
