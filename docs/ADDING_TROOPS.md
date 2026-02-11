# Adding Troops

Troop integration has four parts: definition, icon, renderer, behavior wiring.

## 1) Add troop type + definition

Edit:
- `src/game/config/GameDefinitions.ts`

Do:
1. Add new ID to `TroopType`.
2. Add `TROOP_DEFINITIONS[<id>]` entry.

Typical fields:
- `cost`, `space`, `health`, `damage`, `range`, `speed`
- `movementType` (`ground`, `air`, `ghost`)
- optional `wallTraversalCost`

## 2) Add UI icon

Edit:
- `src/icons/accurate-icons.css`

Add:
- `<troop-id>-icon::before`

Used by:
- `src/components/TrainingModal.tsx`
- `src/components/Hud.tsx`

## 3) Add renderer

Edit:
- `src/game/renderers/TroopRenderer.ts`

Do:
1. Add case in `drawTroopVisual(...)`.
2. Add drawing helper for the troop.

## 4) Wire selection/training lists

Most lists derive from definitions, but some explicit lists exist in:
- `src/App.tsx`

Update explicit unions/lists so TypeScript and UI selection stay valid.

## 5) Add special behavior only if needed

Default combat/path behavior already exists in:
- `src/game/scenes/MainScene.ts`
- `src/game/systems/TargetingSystem.ts`
- `src/game/systems/PathfindingSystem.ts`

If troop needs custom logic, add it in `MainScene.updateCombat(...)` and extend troop type fields in:
- `src/game/types/GameTypes.ts`

## 6) Verify

- Trainable and deployable
- Pathing behavior is correct
- Depth/layering looks correct
- Damage cadence/range matches design
