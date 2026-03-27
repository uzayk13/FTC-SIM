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
  field/Field.ts    — Field model (STL), physics colliders, sample spawning
  field/GamePieces.ts — (legacy, unused) old procedural ball spawner
  robot/Robot.ts    — Robot chassis, subsystems, GLTF model loading
  camera/CameraController.ts — Follow, freecam, overhead, side camera modes
  input/InputManager.ts — Keyboard + gamepad input
  code-runner/      — User code execution (OpMode runner)
  ui/               — HUD and overlay UI
public/
  models/field.stl  — DECODE field CAD model (181MB, Z-up, mm units)
  models/ball.stl   — Sample ball CAD model (12MB, Z-up, mm units)
```

## Key Conventions

### STL Model Loading
- CAD models are in **millimetres** and **Z-up** coordinate system
- Convert to metres: `scale = 0.001`
- Convert to Y-up: `rotation.x = -Math.PI / 2`
- Use `Box3.setFromObject()` after rotation to pin models to ground (y=0)
- Ball STL uses its real CAD dimensions — no artificial resizing

### Field Architecture
- Visual field comes from the STL model (`/models/field.stl`)
- Physics colliders (floor, walls) are built separately with cannon-es
- Samples (balls) use STL geometry for visuals + cannon-es spheres for physics
- Samples: purple, green, yellow — spawned on spike marks

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
- STL format has no color data. For colored models, export as GLB from CAD source.
- The field STL is 181MB — takes a few seconds to load in browser.
