# Adding Troops

Troops require: a definition (stats), a renderer (visual), UI plumbing (training + selection), and sometimes special behavior in the scene update loop.

## 1) Add the type + definition

Edit:
- `src/game/config/GameDefinitions.ts`

Steps:
1. Add your troop ID to `export type TroopType = ...`.
2. Add a `TROOP_DEFINITIONS[<id>]` entry (`cost`, `space`, `health`, `damage`, `range`, `speed`, etc).

Movement / pathfinding controls:
- `movementType: 'ground' | 'air' | 'ghost'`
- `wallTraversalCost` (lower = more willing to pass through walls)

## 2) Add the icon (UI)

Add a CSS icon class in:
- `src/icons/accurate-icons.css` (`<id>-icon::before`)

UI uses those IDs directly:
- `src/components/TrainingModal.tsx` (training grid + queue icons)
- `src/components/Hud.tsx` (battle bar troop icons)

## 3) Add the renderer

Implement visuals in:
- `src/game/renderers/TroopRenderer.ts`

Steps:
1. Add a new `case '<id>'` in `drawTroopVisual(...)`.
2. Add a `draw<YourTroop>(...)` helper (follow style of existing troops).

## 4) Make it selectable/trainable in UI

Most UI lists come from definitions:
- `src/App.tsx` builds `troopList` from `TROOP_DEFINITIONS` (and filters out internal-only troops like `romanwarrior`).

However, a few places use explicit troop unions/lists (TypeScript + ordering):
- `src/App.tsx`: `army` state shape and `selectedTroopType` union
- `src/App.tsx`: `availableTroops` array used to choose the first deployable troop in ATTACK

When you add a troop, update those lists so TypeScript and UI selection stay consistent.

## 5) Behavior (default vs special-case)

The core combat loop is in:
- `src/game/scenes/MainScene.ts` → `updateCombat(...)`

Default behavior:
- Target selection: `TargetingSystem.findTarget(...)` (`src/game/systems/TargetingSystem.ts`)
- Pathfinding: `PathfindingSystem.findPath(...)` (`src/game/systems/PathfindingSystem.ts`)
- Attack cadence: `Troop.attackDelay` and `Troop.lastAttackTime`

If your troop is “normal” (simple melee/ranged), the existing logic may already work by just configuring stats.

If your troop needs special behavior (chain lightning, splitting, AoE slams, setup states):
- Add any extra state fields to `src/game/types/GameTypes.ts` (`Troop` interface).
- Implement the special-case inside `MainScene.updateCombat(...)` (search for existing special types like `stormmage`, `recursion`, `phalanx`, `golem`, `mobilemortar`).

## 6) Verify

Checklist:
- Can be trained (capacity + cost behave correctly).
- Deploys in ATTACK mode via the battle bar.
- Moves around buildings/walls as expected (ground vs air/ghost).
- Renders at correct depth relative to walls/buildings (large troops are the usual stress test).

