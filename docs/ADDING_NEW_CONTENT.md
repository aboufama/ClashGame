
# Adding New Content to Isometric Clash

This guide explains how to add new Buildings, Troops, and Obstacles to the game using the modular system.

## System Overview

The game logic is separated into three main parts:
1.  **Definitions** (`src/game/config/GameDefinitions.ts`): The "Database" of stats, costs, and properties.
2.  **Renderers** (`src/game/renderers/`): The visual representation logic.
3.  **Scene Logic** (`src/game/scenes/MainScene.ts`): The game loop, input handling, and state management.

## 1. Adding a New Building

To add a new building (e.g., "Wizard Tower"):

### Step 1: Define the Type
Open `src/game/config/GameDefinitions.ts` and add your building ID to `BuildingType`.

```typescript
export type BuildingType = 
    | 'town_hall' 
    // ...
    | 'wizard_tower'; // Add this
```

### Step 2: Add Stats
In the same file, add the entry to `BUILDING_DEFINITIONS`.

```typescript
wizard_tower: {
    id: 'wizard_tower',
    name: 'Wizard Tower',
    cost: 1000,
    desc: 'Deals splash damage to ground and air.',
    width: 2,
    height: 2,
    maxHealth: 800,
    range: 6,
    category: 'defense',
    maxCount: 2,
    fireRate: 1500,
    damage: 40,
    maxLevel: 3,
    // ... level stats
},
```

### Step 3: Implement Rendering
Open `src/game/renderers/BuildingRenderer.ts`. Add a static method for your building.

```typescript
static drawWizardTower(graphics: Phaser.GameObjects.Graphics, gridX: number, gridY: number, time: number, alpha: number, tint: number | null) {
    const info = BUILDING_DEFINITIONS['wizard_tower'];
    const center = IsoUtils.cartToIso(gridX + info.width / 2, gridY + info.height / 2);
    
    // ... Drawing logic using graphics ...
    // Use IsoUtils.cartToIso to convert grid coordinates to screen positions
}
```

### Step 4: Register in MainScene
Open `src/game/scenes/MainScene.ts` and find `drawBuildingVisuals`. Add your case:

```typescript
case 'wizard_tower':
    BuildingRenderer.drawWizardTower(graphics, gridX, gridY, this.time.now, alpha, tint);
    break;
```

---

## 2. Adding a New Troop

### Step 1: Define the Type
In `GameDefinitions.ts`, add to `TroopType`.

```typescript
export type TroopType =
    | 'warrior' | 'archer' | 'giant' | 'ward' | 'recursion'
    | 'ram' | 'stormmage' | 'golem' | 'sharpshooter' | 'mobilemortar'
    | 'newtroopname'; // Add here
```

### Step 2: Add Stats
In `GameDefinitions.ts`, add to `TROOP_DEFINITIONS`.

```typescript
newtroopname: { 
    id: 'newtroopname', 
    name: 'New Troop', 
    cost: 100, 
    space: 5, 
    desc: 'Description here.', 
    health: 500, 
    range: 1.0, 
    damage: 25, 
    speed: 0.002, 
    color: 0xff0000,
    // Optional special properties:
    // targetPriority: 'defense',
    // wallDamageMultiplier: 4,
    // chainCount: 4,
    // healRadius: 7.0,
}
```

### Step 3: Update GameTypes.ts
Add the troop to the `Troop` interface type union in `src/game/types/GameTypes.ts`:

```typescript
type: 'warrior' | 'archer' | ... | 'newtroopname';
```

### Step 4: Implement Rendering
In `src/game/renderers/TroopRenderer.ts`:

1. Add the troop to the `drawTroopVisual` function signature type union
2. Add a case in the switch statement
3. Create a new `drawNewTroopName` static method with the visual logic

```typescript
case 'newtroopname':
    TroopRenderer.drawNewTroopName(graphics, isPlayer, isMoving);
    break;
```

### Step 5: Wire Up the UI (App.tsx)
In `src/App.tsx`, update these 4 locations:

1. **Army State** (~line 45):
```typescript
const [army, setArmy] = useState({ ..., newtroopname: 0 });
```

2. **Selected Troop Type** (~line 47):
```typescript
const [selectedTroopType, setSelectedTroopType] = useState<'warrior' | ... | 'newtroopname'>('warrior');
```

3. **Available Troops Array** (~line 107-108):
```typescript
const availableTroops: Array<'warrior' | ... | 'newtroopname'> =
    ['warrior', ..., 'newtroopname'];
```

4. **Train Troop Handler** (~line 266):
```typescript
const handleTrainTroop = (type: 'warrior' | ... | 'newtroopname') => {
```

### Step 6: Add CSS Icon
In `src/accurate-icons.css`, add a pixel art icon:

```css
/* NEW TROOP NAME - Description */
.newtroopname-icon::before {
    content: '';
    position: absolute;
    width: 2px;
    height: 2px;
    background: #YOURCOLOR;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    box-shadow:
        /* Pixel art here using box-shadow */
        0 -10px #COLOR, ...;
}
```

### Step 7: Death Animation (Optional)
For special death effects (like leaving debris), add handling in `MainScene.ts` in the `destroyTroop` method:

```typescript
if (t.type === 'newtroopname') {
    // Custom death animation
    return;
}
```

### Step 8: Enable Frame-by-Frame Animation (Required for animated troops)
If your troop has animations (spinning, walking, etc.), you MUST add it to the redraw list in `MainScene.ts`:

Find `updateTroops` method (~line 3158) and add your troop to the animation check:

```typescript
if ((troop.type === 'warrior' || ... || troop.type === 'newtroopname') && troop.health > 0) {
```

Without this, your troop's `isMoving` animations will not play!

### Step 9: Attack Logic (Required for ranged/special attacks)
For troops with projectiles or special attacks, add handling in the combat section of `updateCombat` in `MainScene.ts` (search for `// ATTACK LOGIC`, around line 1280):

```typescript
} else if (troop.type === 'newtroopname') {
    // Your custom attack effect
    // Create projectiles, deal damage, etc.
    const troopPos = IsoUtils.cartToIso(troop.gridX, troop.gridY);
    // ... projectile logic ...
    troop.target.health -= stats.damage;
    this.updateHealthBar(troop.target);
    if (troop.target.health <= 0) {
        this.destroyBuilding(troop.target);
        troop.target = null;
    }
}
```

### Step 10: Special Logic (Optional)
If the troop has special behavior (like jumping walls or healing), update `MainScene.ts` in:
*   `updateTroops`: For movement/pathfinding logic.
*   `updateCombat`: For attack logic.

## 3. Utils

Use `src/game/utils/IsoUtils.ts` for coordinate conversions:
*   `cartToIso(gridX, gridY)`: Grid -> Screen (Isometric)
*   `isoToCart(screenX, screenY)`: Screen -> Grid

---

## 4. Advanced Tips (Learned from Da Vinci Tank Implementation)

### Isometric Layering
When drawing 3D-looking objects in isometric view:
*   **Back elements appear on top** due to draw order - only draw FRONT halves of rings/bands to avoid overlap
*   Use `Math.sin(angle) > -0.2` to check if an element is on the front side
*   For ellipse rings, draw only the front arc (0 to PI) instead of full strokeEllipse
*   Rivets, slits, and decorations should only appear on the visible (front) portion

```typescript
// Only draw elements on FRONT side of rotating object:
if (Math.sin(angle) > -0.2) {
    // Draw this element
}
```

### Rotation and Animation
*   **Symmetric objects look the same at any rotation** - to make rotation visible, add asymmetric elements (different colored cannon, marking, etc.)
*   Use `troop.facingAngle` to store rotation state across frames
*   For smooth animated rotation, use a tween with `onUpdate` callback:

```typescript
const rotationTarget = { angle: currentAngle };
this.tweens.add({
    targets: rotationTarget,
    angle: newAngle,
    duration: 200,
    onUpdate: () => {
        troop.facingAngle = rotationTarget.angle;
        this.redrawTroopWithMovement(troop, false);
    }
});
```

### Projectile/Cannon Mechanics
*   **Snap firing angle to cannon positions**: `Math.round(angleToTarget / (Math.PI / 4)) * (Math.PI / 4)` snaps to nearest 45°
*   **Separate muzzle from ball positions**: Muzzle flash appears closer to unit, cannonball starts farther out
*   **Depth for upward shots**: When shooting upward (toward top of screen), set depth LOWER so projectiles go behind the unit

```typescript
const isShootingUp = firingAngle < 0 || firingAngle > Math.PI;
const ballDepth = isShootingUp ? 5000 : 25000;
```

### Vehicle/Unit Movement Effects
For vehicles with exhaust or movement trails:

```typescript
// Exhaust smoke when moving (add in updateTroops after redrawTroopWithMovement)
if (troop.type === 'vehicle' && isActuallyMoving && Math.random() < 0.15) {
    const pos = IsoUtils.cartToIso(troop.gridX, troop.gridY);
    const backAngle = (troop.facingAngle || 0) + Math.PI;  // Opposite direction
    const smoke = this.add.graphics();
    smoke.fillStyle(0x1a1a1a, 0.7);  // Dark black
    smoke.fillCircle(0, 0, 5);
    smoke.setPosition(pos.x + Math.cos(backAngle) * 20, pos.y - 5);
    smoke.setDepth(5000);  // Behind unit
    this.tweens.add({
        targets: smoke,
        scale: 2.5, alpha: 0, y: pos.y - 30,
        duration: 800,
        onComplete: () => smoke.destroy()
    });
}
```

### Death Transitions
To avoid abrupt visual changes on death, use smoke bursts:

```typescript
// Smoke burst to cover transition
for (let i = 0; i < 8; i++) {
    const smoke = this.add.graphics();
    smoke.fillStyle(0x1a1a1a, 0.85);
    smoke.fillCircle(0, 0, 15);
    smoke.setPosition(pos.x + (Math.random() - 0.5) * 40, pos.y - 10);
    smoke.setDepth(30000);
    this.tweens.add({
        targets: smoke,
        scale: 2.5, alpha: 0, y: pos.y - 50,
        duration: 1200,
        delay: i * 50,  // Staggered
        onComplete: () => smoke.destroy()
    });
}
// Create husk/debris AFTER smoke starts
this.time.delayedCall(100, () => {
    // Draw deactivated/dead state
});
```

### Fire-Then-Rotate Pattern
For units that fire then rotate to next cannon:

```typescript
// 1. Fire projectile
// 2. Delay, then animate rotation
this.time.delayedCall(150, () => {
    // Animate rotation after shot
    const rotationTarget = { angle: currentAngle };
    this.tweens.add({
        targets: rotationTarget,
        angle: currentAngle + Math.PI / 4,  // 45 degrees
        duration: 200,
        onUpdate: () => {
            troop.facingAngle = rotationTarget.angle;
            this.redrawTroopWithMovement(troop, false);
        }
    });
});
```

---

## Design Philosophy

*   **Keep MainScene Clean**: Move strictly visual code to Renderers.
*   **Centralize Stats**: Never hardcode damage or range in the code; use `GameDefinitions.ts`.
*   **Use Tweens for Animations**: They handle timing, easing, and cleanup automatically.
*   **Consider Isometric Perspective**: Always account for the flattened Y axis (multiply Y by 0.5 for isometric).
*   **Depth Management**: Objects higher on screen (lower Y) should have lower depth to appear "behind".
