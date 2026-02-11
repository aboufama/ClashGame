# Architecture

Short map of where things live.

## High-Level Structure

- React app hosts UI and creates Phaser game
- Phaser `MainScene` owns runtime simulation/rendering
- `GameManager` bridges React <-> scene
- `GameBackend` handles local persistence

## Main Files

### App and bridge
- `src/App.tsx`
- `src/game/GameConfig.ts`
- `src/game/GameManager.ts`

### Scene runtime
- `src/game/scenes/MainScene.ts`
- `src/game/scenes/controllers/SceneInputController.ts`

### Game data and persistence
- `src/game/config/GameDefinitions.ts`
- `src/game/data/Models.ts`
- `src/game/backend/GameBackend.ts`

### Rendering
- `src/game/renderers/BuildingRenderer.ts`
- `src/game/renderers/TroopRenderer.ts`
- `src/game/renderers/ObstacleRenderer.ts`
- `src/game/renderers/RubbleRenderer.ts`

### Systems
- `src/game/systems/DepthSystem.ts`
- `src/game/systems/PathfindingSystem.ts`
- `src/game/systems/TargetingSystem.ts`
- `src/game/systems/LootSystem.ts`
- `src/game/systems/ParticleManager.ts`

## Runtime Data Flow

1. React starts Phaser.
2. Scene loads world from backend.
3. Scene runs simulation (resources/combat/pathing).
4. Scene notifies React via `GameManager` callbacks.
5. Persisted actions write through backend.

## Modes

- `HOME`: building and economy loop
- `ATTACK`: enemy world + troop deployment/combat

## Dev Tooling

The asset wizard is separate from gameplay runtime:
- Route: `/dev/studio`
- Component: `src/devtools/DevAssetStudio.tsx`
