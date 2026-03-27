# FTC Simulator — DECODE 2025-26

## Project Overview
Browser-based FTC (FIRST Tech Challenge) robot simulator for the DECODE 2025-26 season. Users upload OpMode code (Java/JS/TS) and test it on a virtual field with physics.

## Tech Stack
- **Runtime**: Vite + TypeScript
- **3D Rendering**: Three.js
- **Physics**: cannon-es
- **No framework** — vanilla TS, single-page app

## Project Structure
```
src/
  main.ts           — Entry point, landing page → simulator launch
  core/Engine.ts    — Central orchestrator: scene, renderer, physics world, game loop
  field/Field.ts    — Field GLTF loading, physics colliders, sample spawning
  field/GamePieces.ts — (legacy, unused) old procedural ball spawner
  robot/Robot.ts    — Robot chassis, subsystems, GLTF model loading
  camera/CameraController.ts — Follow, freecam, overhead, side camera modes
  input/InputManager.ts — Keyboard + gamepad input
  code-runner/      — User code execution (OpMode runner)
  ui/               — HUD and overlay UI
public/
  models/FieldwithObelisk.gltf — DECODE field + obelisk (GLTF, Z-up, mm units)
  models/blue-goal.gltf        — Blue alliance goal/ramp assembly
  models/red-goal.gltf         — Red alliance goal/ramp assembly
  models/ball-markers.gltf     — Ball spawn position markers (colored)
  models/ball.stl              — Sample ball CAD model (12MB, Z-up, mm units)
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

## Running
```bash
cd FTC-SIM-main
npm install
npm run dev
```

## Notes
- Field models are GLTF with colors. GLTF preserves named scene hierarchy for element separation.
- Season: **DECODE 2025-26** — artifacts are purple and green only (no yellow).
