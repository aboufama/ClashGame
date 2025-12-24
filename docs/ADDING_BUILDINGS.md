# Adding Buildings

Buildings are defined in a single source of truth for stats/config, but they touch UI, persistence, rendering, and sometimes combat logic.

## 1) Add the type + definition

Edit:
- `src/game/config/GameDefinitions.ts`

Steps:
1. Add your building ID to `export type BuildingType = ...`.
2. Add a `BUILDING_DEFINITIONS[<id>]` entry.

Notes:
- `width`/`height` are grid footprint sizes (not pixels).
- If the building has levels, set `maxLevel` and add `levels[]` where index `0` is level 1.
- If it is a defense, set `category: 'defense'` and provide `range`, `damage`, `fireRate`.
- If it is a resource producer, set `category: 'resource'` and `productionRate`.

## 2) Add the icon (UI)

Icons are CSS-based and live in:
- `src/icons/accurate-icons.css`

Add a selector using the convention:
- `<id>-icon::before`

Then the UI can render it with:
- `<div className={`icon ${id}-icon`}></div>`

Reference:
- `src/icons/README.md`

## 3) Add the renderer

Implement visuals in:
- `src/game/renderers/BuildingRenderer.ts`

Requirements:
- Use isometric corners computed from `IsoUtils.cartToIso(...)` (see existing renderers).
- Follow the **ground-plane contract** (`skipBase` / `onlyBase`) described in `docs/RENDERING_AND_DEPTH.md`.

## 4) Wire it into the scene

Register the renderer call in:
- `src/game/scenes/MainScene.ts` → `drawBuildingVisuals(...)`

Add a `case '<id>'` and call your renderer.

## 5) Make sure gameplay logic knows about it (only if needed)

### Resource producers
If your building produces resources, update:
- `src/game/scenes/MainScene.ts` → `updateResources(...)`

### Defenses
If your building attacks troops, update:
- `src/game/scenes/MainScene.ts` → `updateCombat(...)`
  - Include it in the `defenses` filter
  - Add a firing handler (a dedicated method like `shootMortarAt(...)`, or fall back to `shootAt(...)`)

Also consider:
- `SceneInputController` manual-fire logic/range checks may need to include your new defense type.

## 6) Persistence / placement rules

Placement and world saving lives in:
- `src/game/backend/GameBackend.ts`

Most buildings require no code changes here beyond adding the definition, because `placeBuilding(...)` uses `BUILDING_DEFINITIONS` for size and `maxCount`.

If you need special behavior (like walls syncing level), follow the existing patterns in:
- `GameBackend.placeBuilding(...)` / `GameBackend.upgradeBuilding(...)`

## 7) Verify

Checklist:
- Can be purchased/placed from the shop (`src/components/BuildingShopModal.tsx` lists from `BUILDING_DEFINITIONS`).
- Can be moved/upgraded (if applicable).
- Has correct depth in all directions (see `docs/RENDERING_AND_DEPTH.md`).
- Doesn’t overlap other buildings (scene + backend both validate positions).

