# FTC Simulator — DECODE 2025-26

## Project Overview
Browser-based FTC (FIRST Tech Challenge) robot simulator for the DECODE 2025-26 season. Users upload OpMode code (Java/JS/TS) and test it on a virtual field with physics.

## Tech Stack
- **Frontend**: Vite + React 19 + TypeScript
- **3D Rendering**: Three.js
- **Physics**: cannon-es
- **Backend**: Spring Boot 3.5 (Java, Gradle) — code compilation & transpilation
- **Backend Dependencies**: JavaParser (AST-based Java→JS transpilation)

## Project Structure
```
src/
  main.tsx          — React entry point
  core/Engine.ts    — Central orchestrator: scene, renderer, physics world, game loop
  field/Field.ts    — Field GLTF loading, physics colliders, sample spawning
  field/GamePieces.ts — (legacy, unused) old procedural ball spawner
  robot/Robot.ts    — Robot chassis, subsystems, GLTF model loading
  camera/CameraController.ts — Follow, freecam, overhead, side camera modes
  input/InputManager.ts — Keyboard + gamepad input
  code-runner/      — User code execution (OpMode runner)
    CodeRunner.ts   — Loads code, tries backend→fallback to local transpiler, executes
    JavaTranspiler.ts — Local regex-based Java→JS transpiler (fallback)
    FtcRuntime.ts   — Mock FTC SDK classes for in-browser execution
    GradleParser.ts — Gradle project file analysis
  api/
    ApiClient.ts    — Backend API client (compile endpoint, health check)
  ui/               — React UI components (LandingPage, SimulatorView, HUD, etc.)
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
- CAD models are in **millimetres** and **Z-up** coordinate system
- Convert to metres: `scale = 0.001`
- Convert to Y-up: `rotation.x = -Math.PI / 2`
- Use `Box3.setFromObject()` after rotation to pin models to ground (y=0)
- Field models use **GLTF** format (supports colors + scene hierarchy)
- Ball visual still uses STL (`ball.stl`) with real CAD dimensions

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
- Robot: mass 14kg

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
