# MainScene.ts Organization & Extension Guide

This document outlines the structure of `src/game/scenes/MainScene.ts` and provides a standard pipeline for adding new content (buildings, troops, defenses, levels) to the game.

## 1. File Structure Overview

`MainScene.ts` is the core game scene handling the isometric view, logic, input, and rendering. It is organized into the following rough sections:

### A. Imports & Definitions
- **Imports**: Phaser, Backend, Models, LootSystem.
- **Local Interfaces**: `PlacedBuilding`, `Troop`, `PlacedObstacle`.
- **Global Constants**: `TROOP_STATS` (legacy), `PixelatePipeline` (shader).

### B. Class State Properties
- **Scene Config**: `tileWidth`, `tileHeight`, `mapSize`.
- **Game State**: `buildings`, `troops`, `obstacles`, `rubble`.
- **Input State**: `selectedBuildingType`, `selectedInWorld`, `isDragging`, `dragStartCam`.
- **Combat State**: `mode` ('HOME' | 'ATTACK'), `initialEnemyBuildings`, `destroyedBuildings`.

### C. Lifecycle Methods
1.  **`create()`**: Initializes camera, shaders, input listeners (`onPointerDown/Move/Up`), grid, and UI. Loads the base (`loadSavedBase`).
2.  **`update(time, delta)`**: The main game loop. Calls sub-systems:
    *   `handleCameraMovement`
    *   `updateCombat` & `updateManualFire`
    *   `updateTroops` & `updateResources`
    *   `updateBuildingAnimations` (Idle animations)

### D. Sub-Systems (Logic)
- **Input Handling**: `onPointerDown`, `onPointerMove`, `onPointerUp`. Handles dragging (pan) and clicking (select/place).
- **Placement Logic**: `placeBuilding`, `isPositionValid`, `cancelPlacement`.
- **Combat Logic**: `spawnTroop`, `startAttack`, `checkBattleEnd`.
- **Visual Effects**: `playUpgradeEffect`, `createSmokeEffect`, `createExplosion`.

### E. Drawing & Rendering (The "Visuals" Section)
- **`drawBuildingVisuals`**: The master dispatcher that calls specific draw methods based on building type.
- **Specific Draw Methods**: `drawTownHall`, `drawCannon`, `drawWall`, `drawBarracks`, etc.
    *   These methods use explicit `Phaser.GameObjects.Graphics` commands to draw isometric shapes.
    *   They handle **Level Variations** (e.g., `if (level >= 2) ...`).

---

## 2. Pipeline: How to Add New Content

### A. Adding a New Building/Defense

1.  **Define Stats**:
    *   Open `src/game/config/GameDefinitions.ts`.
    *   Add your new ID to `BuildingType` type definition.
    *   Add a new entry in `BUILDING_DEFINITIONS` with properties (size, cost, health, `category: 'defense'`).

2.  **Implement Drawing**:
    *   In `MainScene.ts`, create a new private method: `drawMyNewBuilding(graphics, c1, c2, c3, c4, center, alpha, tint, building)`.
    *   Use the standard isometric coordinates (`c1`..`c4` are the 4 corners of the footprint) to draw walls/roofs.
    *   **Standardization**: Use `0x5a4a3a` range for stone/wood foundations to match the art style.

3.  **Register Drawing**:
    *   In `MainScene.ts`, find the `drawBuildingVisuals` method.
    *   Add a `case 'my_new_building':` to the switch statement and call your new draw method.

4.  **Add Interaction (If Defense)**:
    *   If it shoots, add logic to `updateManualFire` in `MainScene.ts`.
    *   Create a shooting method (e.g., `shootMyDefenseAt(building, target)`).
    *   Add projectile logic/animation using `tweens`.

### B. Adding a New Level to an Existing Building

1.  **Update Stats**:
    *   Open `src/game/config/GameDefinitions.ts`.
    *   Find the building in `BUILDING_DEFINITIONS`.
    *   Add a new entry to the `levels` array with the new HP, damage, cost, etc.

2.  **Update Visuals**:
    *   In `MainScene.ts`, go to the specific draw method (e.g., `drawCannon`).
    *   Retrieve the level: `const level = building?.level ?? 1;`.
    *   Add conditional logic for visual upgrades (e.g., `if (level >= 3) { // draw golden rim }`).
    *   **Goal**: Ensure the upgrade looks visually distinct (gold/gem accents, darker stone, extra spikes).

### C. Adding a New Troop

1.  **Define Stats**:
    *   **Main**: Open `src/game/config/GameDefinitions.ts` and add the new ID to `TroopType` and definition to `TROOP_DEFINITIONS`.
    *   **Legacy Sync**: Currently, `MainScene.ts` (lines ~90) has a local `TROOP_STATS` constant. **You must also add the stats here** until the file is fully refactored to use the config import.

2.  **Drawing Logic**:
    *   Troops are currently drawn using simple shapes/colors in `spawnTroop`.
    *   Ensure the `TROOP_STATS` definition includes a distinct `color`.

3.  **AI & Behavior**:
    *   In `MainScene.ts` inside `updateTroops`:
        *   Default behavior is "move to closest defense/building and attack".
        *   If your troop has special AI (e.g., jumps walls, targets only defenses), add a condition:
            ```typescript
            if (troop.type === 'my_new_troop') {
                // Custom logic
            }
            ```

## 3. Best Practices

*   **Modularity**: Keep the `drawX` methods self-contained. Do not mix logic updates inside draw methods.
*   **Coordinates**: Always use `cartToIso` for converting logical grid (x,y) to screen drawing positions.
*   **Colors**: Reuse the existing palette (Dark Navy Background `#141824`, Stone `#7a6a5a`, Wood `#5d4e37`) to maintain visual consistency.
*   **Effects**: Use `playUpgradeEffect` for level-ups. Use `createExplosion` for destruction.
