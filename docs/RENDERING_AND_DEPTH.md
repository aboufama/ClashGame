# Rendering and Depth (Isometric)

Use this when a building or troop appears in front of the wrong thing.

## Core Rule

Simulation happens in grid space.
Rendering happens in isometric pixel space.

Coordinate helpers:
- `src/game/utils/IsoUtils.ts`

Tile geometry used by scene:
- `tileWidth = 64`
- `tileHeight = 32`

## Depth Source of Truth

All depth values come from:
- `src/game/systems/DepthSystem.ts`

Main functions:
- `depthForGroundPlane()`
- `depthForBuilding(gridX, gridY, type)`
- `depthForTroop(gridX, gridY, type)`

For buildings, depth anchor is the bottom-right tile of the footprint.

## Ground Plane Contract

Ground-level visuals must render below everything else.

How this project handles it:
1. Grass/ground is pre-baked to a render texture.
2. Building base parts are baked onto that texture.
3. Elevated building parts are drawn in runtime pass with normal depth sorting.

Scene methods:
- `MainScene.createIsoGrid()`
- `MainScene.bakeBuildingToGround(...)`
- `MainScene.unbakeBuildingFromGround(...)`

## Renderer Contract (Required)

Building renderers in `src/game/renderers/BuildingRenderer.ts` must support:
- `onlyBase`: draw only ground-plane/base parts
- `skipBase`: skip base parts, draw elevated parts only

Pattern:

```ts
if (!skipBase) {
  // ground-plane/base
}

if (!onlyBase) {
  // elevated geometry
}
```

If this split is not respected, layering bugs return.

## Quick Layering Test

1. Place walls/buildings and a large troop nearby.
2. Check all relative directions.
3. Confirm:
- Floor/base never draws over troops
- Elevated geometry overlaps correctly by depth
