# Rendering and Depth (Isometric)

This game uses a grid simulation with isometric projection for rendering. If you add buildings/troops, follow the depth + ground-plane rules here or you will eventually get “wall/troop in the wrong layer” bugs.

## Coordinate spaces

- **Grid space**: integer `(gridX, gridY)` (0..`MAP_SIZE-1`), used for simulation.
- **Isometric/screen space**: pixels, used for rendering.

Conversion lives in:
- `src/game/utils/IsoUtils.ts` (`cartToIso`, `isoToCart`)

The scene defines tile geometry:
- `src/game/scenes/MainScene.ts` (`tileWidth = 64`, `tileHeight = 32`)

## Depth ordering (the rule)

Depth is computed centrally in:
- `src/game/systems/DepthSystem.ts`

Key functions:
- `depthForGroundPlane()`: the “always under everything” ground plane depth.
- `depthForBuilding(gridX, gridY, type)`: building depth based on footprint + bias.
- `depthForTroop(gridX, gridY, type)`: troop depth with troop-size bias.

The important concept:
- **Footprint anchor**: buildings use their bottom-right footprint tile (`gridX + width - 1`, `gridY + height - 1`) as the anchor for depth. This matches how isometric overlap actually works for multi-tile objects.

## Ground plane: draw once, always below

`MainScene` pre-renders the entire grass grid into a shared `RenderTexture`:
- `src/game/scenes/MainScene.ts` → `createIsoGrid()`

That texture is placed at:
- `depthForGroundPlane()`

### Baking building bases (ground-plane parts)

To avoid “base renders above troop” issues, building ground-plane visuals are baked onto the ground texture:
- `MainScene.bakeBuildingToGround(b)` draws the building’s base only into a temporary `Graphics`, then stamps it onto the ground `RenderTexture`.
- When moving/removing, `MainScene.unbakeBuildingFromGround(b)` redraws grass tiles over the old footprint.

This is why building renderer functions are expected to support **two passes**:
1. **Base pass**: draw only the ground-plane (floors, borders, footprints).
2. **Dynamic/elevated pass**: draw everything that should participate in depth ordering (walls, towers, roofs, props that should overlap troops).

## Building renderer contract (required for correctness)

When you implement a new building renderer in `src/game/renderers/BuildingRenderer.ts`, structure it like this:

- `skipBase`: if `true`, do not draw anything that belongs on the ground plane.
- `onlyBase`: if `true`, draw only the ground plane and return (do not draw height).

Pattern:

```ts
const g = baseGraphics || graphics; // optional, some renderers draw base to g

if (!skipBase) {
  // draw footprint / floor / border (ground-plane)
}

if (!onlyBase) {
  // draw walls / roof / props (elevated, should depth-sort)
}
```

`MainScene` calls your renderer in these modes:
- Bake pass: `onlyBase = true` (stamped onto the ground `RenderTexture`)
- Runtime pass: `skipBase = true` (draw elevated parts to the building’s `Graphics` at `depthForBuilding(...)`)

If you don’t follow this contract, you’ll reintroduce the original layering bug (bases rendering over troops/walls).

## How to sanity-check layering

When testing any new/changed renderer:
- Place a wall and a large troop near it (golem/davinci tank) in all relative positions (NW/NE/SW/SE).
- Verify:
  - ground-plane parts (floors, borders, decals) never draw above troops/walls
  - elevated parts (wall height, towers, props) respect depth and overlap correctly

