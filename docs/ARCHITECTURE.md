# Architecture

This project is a Vite + React UI wrapped around a Phaser scene that runs the game simulation and rendering.

## High-level data flow

1. `src/App.tsx` (React) creates the Phaser game (`src/game/GameConfig.ts`) and renders UI (HUD + modals).
2. `src/game/GameManager.ts` is the bridge:
   - React registers UI callbacks (e.g. `addGold`, `setGameMode`, `onBuildingSelected`).
   - `MainScene` registers scene commands (e.g. `startAttack`, `selectBuilding`, `upgradeSelectedBuilding`).
3. `src/game/scenes/MainScene.ts` is the single Phaser scene:
   - Owns the authoritative runtime state: buildings, troops, obstacles, combat state, camera.
   - Calls modular “systems” for specific logic (pathfinding, targeting, loot, depth).
4. `src/game/backend/GameBackend.ts` is the local-only persistence layer:
   - Stores the player world in `localStorage`.
   - Enemy worlds are generated on demand and treated as ephemeral (not saved).

## Core modules

### Config / Definitions
- `src/game/config/GameDefinitions.ts`
  - `BuildingType`, `TroopType`, `ObstacleType`
  - `BUILDING_DEFINITIONS`, `TROOP_DEFINITIONS`, `OBSTACLE_DEFINITIONS`
  - `getBuildingStats(type, level)` merges level stats into base definitions

### Persistence / Models
- `src/game/data/Models.ts`
  - `SerializedWorld`, `SerializedBuilding`, `SerializedObstacle`
- `src/game/backend/GameBackend.ts`
  - `createWorld/getWorld/saveWorld`
  - `placeBuilding/moveBuilding/upgradeBuilding/removeBuilding`
  - Enemy world generation (`generateEnemyWorld`) is local and not persisted

### Scene (gameplay + rendering)
- `src/game/scenes/MainScene.ts`
  - Scene lifecycle: `create()` sets up camera, input, ground rendering, UI bridge.
  - State arrays: `buildings`, `troops`, `obstacles`, `rubble`.
  - Simulation: resource ticks (HOME mode), combat loop (ATTACK mode), unit spawning, destruction/loot.
  - Rendering: creates `Graphics` objects for buildings/troops and updates them as needed.

### Input controller
- `src/game/scenes/controllers/SceneInputController.ts`
  - Owns pointer handling (drag camera, click selection, placement, troop deploy during ATTACK).
  - Calls into `Backend` for persisted actions (move/upgrade).
  - Notifies React via `gameManager.onBuildingSelected(...)`, etc.

### Renderers
- `src/game/renderers/BuildingRenderer.ts`: draws building visuals into a `Phaser.GameObjects.Graphics`.
- `src/game/renderers/TroopRenderer.ts`: draws troop visuals.
- `src/game/renderers/ObstacleRenderer.ts`, `src/game/renderers/RubbleRenderer.ts`: environment visuals.

### Systems
- `src/game/systems/DepthSystem.ts`
  - Single source of truth for isometric depth ordering (buildings vs troops vs obstacles).
- `src/game/systems/PathfindingSystem.ts`
  - A* on a cost grid (walls may be traversable with high cost; air/ghost bypass obstacles).
- `src/game/systems/TargetingSystem.ts`
  - Picks the nearest valid enemy building (with optional target priorities).
- `src/game/systems/LootSystem.ts`
  - Calculates per-building loot amounts for raids.
- `src/game/systems/ParticleManager.ts`
  - Pooled `Graphics` objects for effects to avoid GC spikes.

## UI + icons

### UI components
- `src/components/*`: HUD, shop/training modals, settings, battle results, debug overlay.
- These components mostly derive lists from `BUILDING_DEFINITIONS` / `TROOP_DEFINITIONS` and communicate actions back through `gameManager`.

### Icons (easy to extend)
- `src/icons/*` contains all CSS-based pixel icons.
- `src/icons/README.md` explains the naming convention and how to add new icons.

## Game modes

- `HOME`: base building, resource production, no enemy troops.
- `ATTACK`: enemy world loaded/generated; deployment zone rules apply; combat + loot tracking.

