
import Phaser from 'phaser';
import { Backend } from '../backend/GameBackend';
import type { SerializedBuilding } from '../data/Models';
import { BUILDING_DEFINITIONS, OBSTACLE_DEFINITIONS, getBuildingStats, type BuildingType, type ObstacleType } from '../config/GameDefinitions';
import { LootSystem } from '../systems/LootSystem';

const BUILDINGS = BUILDING_DEFINITIONS as any;
const OBSTACLES = OBSTACLE_DEFINITIONS as any;





interface PlacedBuilding {
    id: string;
    type: string;
    level: number; // Added level property
    gridX: number;
    gridY: number;
    graphics: Phaser.GameObjects.Graphics;
    barrelGraphics?: Phaser.GameObjects.Graphics;
    healthBar: Phaser.GameObjects.Graphics;
    health: number;
    maxHealth: number;
    owner: 'PLAYER' | 'ENEMY';
    loot?: { gold: number, elixir: number };
    // Ballista-specific properties
    ballistaAngle?: number;        // Current angle in radians (0 = facing right/east)
    ballistaTargetAngle?: number;  // Target angle to smoothly rotate towards
    ballistaStringTension?: number; // 0 = relaxed, 1 = fully drawn back
    ballistaBoltLoaded?: boolean;   // Whether a bolt is ready to fire
    lastFireTime?: number;
    isFiring?: boolean;
    // Idle swivel for rotating defenses
    idleSwiveTime?: number;        // Time accumulator for idle swivel
    idleTargetAngle?: number;      // Random idle target angle
    // Cannon barrel recoil (0-1, 0 = normal, 1 = full recoil)
    cannonRecoilOffset?: number;
    // Prism Tower - Continuous laser properties
    prismTarget?: Troop;           // Current target being lasered
    prismLaserGraphics?: Phaser.GameObjects.Graphics; // The continuous laser beam
    prismLaserCore?: Phaser.GameObjects.Graphics;     // Inner core of laser
    prismChargingUp?: boolean;     // Whether it's charging up
    prismChargeTime?: number;      // When charging started
    // Range indicator
    rangeIndicator?: Phaser.GameObjects.Graphics;
    prismTrailLastPos?: { x: number, y: number }; // Track last scorch position for connected trail
    lastTrailTime?: number;     // For specialized smoke trails
    lastSmokeTime?: number;     // For defensive smoke effects
    baseGraphics?: Phaser.GameObjects.Graphics; // Separate graphics for ground-level base (prevents clipping)
}

interface Troop {
    id: string;
    type: 'warrior' | 'archer' | 'giant' | 'ward' | 'recursion' | 'chronoswarm';
    gameObject: Phaser.GameObjects.Graphics;
    healthBar: Phaser.GameObjects.Graphics;
    gridX: number;
    gridY: number;
    health: number;
    maxHealth: number;
    owner: 'PLAYER' | 'ENEMY';
    lastAttackTime: number;
    attackDelay: number;
    speedMult: number;
    hasTakenDamage: boolean;
    facingAngle: number;
    path?: Phaser.Math.Vector2[]; // Path of grid coordinates to follow
    lastPathTime?: number;
    nextPathTime?: number;
    target: any; // PlacedBuilding | Troop | null
    // Special troop properties
    recursionGen?: number; // For recursion (0 = original, 1 = first split, 2 = final)
}

interface PlacedObstacle {
    id: string;
    type: ObstacleType;
    gridX: number;
    gridY: number;
    graphics: Phaser.GameObjects.Graphics;
    animOffset: number; // For subtle idle animations
}


const TROOP_STATS = {
    warrior: { health: 100, range: 0.8, damage: 10, speed: 0.003, color: 0xffff00, space: 1 },
    archer: { health: 50, range: 4.5, damage: 14.0, speed: 0.0025, color: 0x00ffff, space: 1 },
    giant: { health: 500, range: 0.8, damage: 20, speed: 0.001, color: 0xff8800, space: 5 },
    ward: { health: 300, range: 5.0, damage: 9, speed: 0.0015, color: 0x00ff88, space: 3, healRadius: 7.0, healAmount: 5 },
    // Novel units
    recursion: { health: 120, range: 0.8, damage: 8, speed: 0.0025, color: 0x00ffaa, space: 3 }, // Splits into 2 on death (max 2 generations)
    chronoswarm: { health: 50, range: 1.5, damage: 5, speed: 0.004, color: 0xffcc00, space: 2, boostRadius: 4.0, boostAmount: 1.5 } // 50% speed boost to nearby allies
};




export type GameMode = 'HOME' | 'ATTACK';

const fragShader = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uSize;
uniform float uZoom;
uniform vec2 uScroll;
varying vec2 outTexCoord;

void main()
{
    if (uSize <= 1.0) {
        gl_FragColor = texture2D(uMainSampler, outTexCoord);
    } else {
        // 1. Convert screen UV to logical world coordinates
        // outTexCoord is [0, 1]. uResolution is [width, height] in screen pixels.
        vec2 worldPos = (outTexCoord * uResolution) / uZoom + uScroll;
        
        // 2. Snap the world position to the logical 'LO-FI' grid
        // This makes the pixelation 'stick' to world objects.
        vec2 snappedWorldPos = floor(worldPos / uSize) * uSize;
        
        // 3. To prevent shimmering, we MUST sample from the center of the world-pixel
        snappedWorldPos += uSize * 0.5;
        
        // 4. Project the snapped world position back to the source buffer's pixel coordinates
        vec2 sourcePixelPos = (snappedWorldPos - uScroll) * uZoom;
        
        // 5. STABILITY STEP: Snap the source sampling position to the source texture's pixel grid.
        // This prevents the GPU from interpolating between pixels as the camera moves sub-pixel.
        vec2 crispSourcePos = floor(sourcePixelPos) + 0.5;
        
        // 6. Convert back to UV for sampling
        vec2 sampleUV = crispSourcePos / uResolution;
        
        // Clamp to avoid sampling outside texture bounds
        sampleUV = clamp(sampleUV, 1.5 / uResolution, 1.0 - 1.5 / uResolution);
        
        gl_FragColor = texture2D(uMainSampler, sampleUV);
    }
}
`;

class PixelatePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
    static size: number = 1.0;
    static zoom: number = 1.0;
    static scroll: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

    constructor(game: Phaser.Game) {
        super({
            game,
            fragShader,
            name: 'Pixelate'
        });
    }
    onPreRender() {
        this.set1f('uSize', PixelatePipeline.size);
        this.set1f('uZoom', PixelatePipeline.zoom);
        this.set2f('uScroll', PixelatePipeline.scroll.x, PixelatePipeline.scroll.y);
        this.set2f('uResolution', this.renderer.width, this.renderer.height);
    }
}


export class MainScene extends Phaser.Scene {
    private tileWidth = 64;
    private tileHeight = 32;
    private mapSize = 25;
    private buildings: PlacedBuilding[] = [];
    private rubble: { gridX: number; gridY: number; width: number; height: number; graphics: Phaser.GameObjects.Graphics; createdAt: number }[] = [];
    private obstacles: PlacedObstacle[] = [];
    private troops: Troop[] = [];
    private ghostBuilding!: Phaser.GameObjects.Graphics;
    private deploymentGraphics!: Phaser.GameObjects.Graphics;
    private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;

    private selectedBuildingType: string | null = null;
    private selectedInWorld: PlacedBuilding | null = null;
    private isMoving = false;
    private isDragging = false;
    private dragOrigin: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private hoverGrid: Phaser.Math.Vector2 = new Phaser.Math.Vector2(-100, -100);

    private mode: GameMode = 'HOME';

    // Combat stuff
    private resourceInterval = 2000;
    private lastResourceUpdate = 0;

    // Battle stats tracking
    private initialEnemyBuildings = 0;
    private lastDeployTime = 0;
    private lastGrassGrowTime = 0;

    private destroyedBuildings = 0;
    private goldLooted = 0;
    private elixirLooted = 0;
    private hasDeployed = false;
    private raidEndScheduled = false; // Prevent multiple end calls

    // Range indicator for clicked buildings in attack mode
    private attackModeSelectedBuilding: PlacedBuilding | null = null;

    // Manual firing interactions
    private isManualFiring = false;
    private selectionGraphics!: Phaser.GameObjects.Graphics;

    private cameraSensitivity = 1.0;


    constructor() {
        super('MainScene');
    }

    preload() { }

    create() {
        this.cameras.main.setBackgroundColor('#2d2d2d');
        this.cameras.main.setZoom(1);

        // Register and apply pixelation pipeline
        const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
        if (renderer.pipelines) {
            if (!renderer.pipelines.has('Pixelate')) {
                renderer.pipelines.addPostPipeline('Pixelate', PixelatePipeline);
            }
            this.cameras.main.setPostPipeline('Pixelate');
        }

        (window as any).setPixelation = (size: number) => {
            PixelatePipeline.size = size;
        };

        (window as any).setSensitivity = (val: number) => {
            this.cameraSensitivity = val;
        };

        // Initialize at 1.5
        PixelatePipeline.size = 1.5;

        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);

        this.input.on('wheel', (_pointer: any, _gameObjects: any, _deltaX: number, deltaY: number, _deltaZ: number) => {
            const newZoom = this.cameras.main.zoom - deltaY * 0.002;
            this.cameras.main.setZoom(Phaser.Math.Clamp(newZoom, 0.3, 3));
        });

        this.createIsoGrid();
        this.createUI();

        this.selectionGraphics = this.add.graphics();
        this.ghostBuilding = this.add.graphics();
        this.ghostBuilding.setVisible(false);

        this.deploymentGraphics = this.add.graphics();
        this.deploymentGraphics.setVisible(false);

        if (this.input.keyboard) {
            this.cursorKeys = this.input.keyboard.createCursorKeys();
            this.input.keyboard.on('keydown-ESC', () => {
                this.cancelPlacement();
            });
            this.input.keyboard.on('keydown-R', () => {
                if (confirm('Reset village layout?')) {
                    this.resetVillage();
                }
            });
        }

        this.input.on('gameout', () => {
            if (this.selectedBuildingType || this.isMoving) {
                this.cancelPlacement();
            }
        });

        // Right-click to cancel building placement/movement
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.rightButtonDown()) {
                if (this.selectedBuildingType || this.isMoving) {
                    this.cancelPlacement();
                }
            }
        });

        // Try to load saved base, otherwise place default
        if (!this.loadSavedBase()) {
            this.placeDefaultVillage();
        }
        this.centerCamera();
    }

    private centerCamera() {
        const centerGrid = this.mapSize / 2;
        const pos = this.cartToIso(centerGrid, centerGrid);
        this.cameras.main.centerOn(pos.x, pos.y);
    }

    private cancelPlacement() {
        this.selectedBuildingType = null;
        this.isMoving = false;
        this.ghostBuilding.clear();
        this.ghostBuilding.setVisible(false);
        this.selectedInWorld = null;
        this.clearBuildingRangeIndicator();
        (window as any).onPlacementCancelled?.();
    }

    update(time: number, delta: number) {
        PixelatePipeline.zoom = this.cameras.main.zoom;
        PixelatePipeline.scroll.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
        // Auto-end raid if all troops dead and no reserves
        if (this.mode === 'ATTACK' && this.hasDeployed) {
            const army = (window as any).getArmy ? (window as any).getArmy() : {};
            const remaining = Object.values(army).reduce((a: number, b: any) => a + (typeof b === 'number' ? b : 0), 0) as number;
            const liveTroops = this.troops.filter(t => t.health > 0).length;

            if (remaining === 0 && liveTroops === 0 && !this.raidEndScheduled) {
                this.raidEndScheduled = true;
                // Give player 2 seconds to see final state before auto-ending
                this.time.delayedCall(2000, () => {
                    if ((window as any).onRaidEnded) {
                        (window as any).onRaidEnded(this.goldLooted, this.elixirLooted);
                    }
                });
            }
        }
        this.handleCameraMovement(delta);
        this.updateCombat(time);
        this.updateTroops(delta);
        this.updateResources(time);
        this.updateSelectionHighlight();
        this.updateDeploymentHighlight();
        this.updateBuildingAnimations(time);
        this.updateObstacleAnimations(time);
        this.growGrass(time);
        this.updateRubbleAnimations(time);
        this.updateTooltip();

        // Manual firing loop for HOME mode interactions
        if (this.mode === 'HOME' && this.isManualFiring && this.selectedInWorld) {
            this.updateManualFire(time);
        }
    }

    private updateManualFire(time: number) {
        const def = this.selectedInWorld;
        if (!def || !BUILDINGS[def.type] || BUILDINGS[def.type].category !== 'defense') return;

        const stats = BUILDINGS[def.type];
        const interval = stats.fireRate || 2000;

        // Initial delay setup if not set (first shot is instant-ish)
        if (def.lastFireTime === undefined) {
            def.lastFireTime = -99999; // Ensure ready immediately
        }

        if (time < (def as any).lastFireTime + interval) return;

        def.lastFireTime = time;

        // Get target position
        const pointer = this.input.activePointer;
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const cardPos = this.isoToCart(worldPoint.x, worldPoint.y);

        // CREATE DUMMY TARGET
        const dummyTarget = {
            gridX: cardPos.x,
            gridY: cardPos.y,
            id: 'dummy_target',
            type: 'warrior',
            health: 100,
            owner: 'ENEMY'
        } as Troop;

        // Trigger shot
        if (def.type === 'cannon') this.shootAt(def, dummyTarget);
        else if (def.type === 'ballista') this.shootBallistaAt(def, dummyTarget);
        else if (def.type === 'xbow') this.shootXBowAt(def, dummyTarget);
        else if (def.type === 'mortar') this.shootMortarAt(def, dummyTarget);
        else if (def.type === 'tesla') this.shootTeslaAt(def, dummyTarget);
        else if (def.type === 'magmavent') this.shootMagmaEruption(def);
        else if (def.type === 'prism') this.shootPrismContinuousLaser(def, dummyTarget, time);
    }

    private updateBuildingAnimations(_time: number) {
        // Redraw all buildings for idle animations
        this.buildings.forEach(b => {
            if (b.owner === 'PLAYER' || this.mode === 'ATTACK') {
                // Smoothly interpolate ballista, xbow, and cannon angle towards target
                // OR towards mouse if selected in HOME mode
                let targetAngle = b.ballistaTargetAngle;

                if (this.mode === 'HOME' && this.selectedInWorld === b &&
                    (b.type === 'ballista' || b.type === 'xbow' || b.type === 'cannon')) {
                    const info = BUILDINGS[b.type];
                    const center = this.cartToIso(b.gridX + info.width / 2, b.gridY + info.height / 2);
                    const pointer = this.input.activePointer;
                    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
                    targetAngle = Math.atan2(worldPoint.y - (center.y - 14), worldPoint.x - center.x);
                }

                if ((b.type === 'ballista' || b.type === 'xbow' || b.type === 'cannon') && targetAngle !== undefined) {
                    const currentAngle = b.ballistaAngle ?? 0;

                    // Calculate shortest rotation direction
                    let diff = targetAngle - currentAngle;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;

                    // Smooth rotation (adjust speed as needed)
                    const rotationSpeed = 0.15;
                    if (Math.abs(diff) > 0.01) {
                        b.ballistaAngle = currentAngle + diff * rotationSpeed;
                    } else {
                        b.ballistaAngle = targetAngle;
                    }
                }

                // === IDLE SWIVEL for rotating defenses ===
                // When not firing, slowly swivel to random angles for life
                if ((b.type === 'ballista' || b.type === 'xbow' || b.type === 'cannon') && !b.isFiring) {
                    // Initialize idle behavior
                    if (b.idleSwiveTime === undefined) {
                        b.idleSwiveTime = Math.random() * 5000; // Random start offset
                        b.idleTargetAngle = Math.random() * Math.PI * 2;
                    }

                    b.idleSwiveTime += 16; // Approximate frame time

                    // Change idle target angle every 3-6 seconds
                    const idleChangeInterval = 3000 + Math.random() * 3000;
                    if (b.idleSwiveTime > idleChangeInterval) {
                        b.idleSwiveTime = 0;
                        // Small random angle change (not full rotation)
                        const currentIdle = b.idleTargetAngle ?? 0;
                        b.idleTargetAngle = currentIdle + (Math.random() - 0.5) * Math.PI * 0.5;
                    }

                    // Only apply idle swivel if no combat target
                    if (b.ballistaTargetAngle === undefined && b.idleTargetAngle !== undefined) {
                        const currentAngle = b.ballistaAngle ?? 0;
                        let diff = b.idleTargetAngle - currentAngle;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        while (diff < -Math.PI) diff += Math.PI * 2;

                        // Very slow idle rotation
                        const idleRotationSpeed = 0.02;
                        if (Math.abs(diff) > 0.01) {
                            b.ballistaAngle = currentAngle + diff * idleRotationSpeed;
                        } else {
                            b.ballistaAngle = b.idleTargetAngle;
                        }
                    }
                }

                // Transparency near cursor (ghost building)
                let alpha = 1;
                if (this.mode === 'HOME' && this.selectedBuildingType) {
                    const dist = Phaser.Math.Distance.Between(b.gridX, b.gridY, this.hoverGrid.x, this.hoverGrid.y);
                    if (dist < 4) alpha = 0.4;
                }

                // All buildings now have animations for a lively feel
                b.graphics.clear();
                b.baseGraphics?.clear();
                this.drawBuildingVisuals(b.graphics, b.gridX, b.gridY, b.type, alpha, null, b, b.baseGraphics);

                // MAGMA VENT: Constant thin black smoke trail
                if (b.type === 'magmavent') {
                    if (this.time.now > (b.lastTrailTime || 0) + 150) {
                        this.createSmokeTrailEffect(b.gridX + 1.5, b.gridY + 1.5);
                        b.lastTrailTime = this.time.now;
                    }
                }
            }
        });
    }

    private createSmokeTrailEffect(gridX: number, gridY: number) {
        const pos = this.cartToIso(gridX, gridY);
        const smoke = this.add.graphics();
        smoke.fillStyle(0x111111, 0.5); // Darker, slightly transparent black
        const size = 3 + Math.random() * 2;
        smoke.fillRect(-size / 2, -size / 2, size, size);
        smoke.setPosition(pos.x, pos.y - 25);
        smoke.setDepth(29999);

        this.tweens.add({
            targets: smoke,
            x: pos.x + (Math.random() - 0.5) * 5,
            y: pos.y - 120 - Math.random() * 50,
            alpha: 0,
            angle: Math.random() * 360,
            scale: 2.5,
            duration: 2000 + Math.random() * 1000,
            onComplete: () => smoke.destroy()
        });
    }


    // Persistent state is now managed by Backend service automatically on modification

    private loadSavedBase(): boolean {
        // Load player home world from Backend
        let world = Backend.getWorld('player_home');

        // If world doesn't exist, create it (empty)
        if (!world) {
            world = Backend.createWorld('player_home', 'PLAYER');
        }

        // If newly created or empty, return false to trigger default village placement
        if (world.buildings.length === 0) return false;

        this.buildings = []; // Clear current
        world.buildings.forEach(b => {
            this.instantiateBuilding(b, 'PLAYER');
        });

        // Load obstacles from backend, or spawn some if none exist
        this.obstacles = [];
        if (world.obstacles && world.obstacles.length > 0) {
            world.obstacles.forEach(o => {
                this.placeObstacle(o.gridX, o.gridY, o.type);
            });
        } else {
            // Existing base has no obstacles - spawn some!
            this.spawnRandomObstacles(12);
        }

        const campCount = this.buildings.filter(b => b.type === 'army_camp').length;
        (window as any).refreshCampCapacity?.(campCount);
        return true;
    }


    private createIsoGrid() {
        const graphics = this.add.graphics();
        graphics.setDepth(-1);

        // Draw all tiles with lush grass variation
        for (let x = 0; x < this.mapSize; x++) {
            for (let y = 0; y < this.mapSize; y++) {
                this.drawIsoTile(graphics, x, y);
            }
        }
    }

    private drawIsoTile(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
        const pos = this.cartToIso(x, y);
        const halfW = this.tileWidth / 2;
        const halfH = this.tileHeight / 2;

        // CoC-style grass colors with natural variation
        const baseColors = [0x4a9c3d, 0x52a844, 0x48943a, 0x5bb34d, 0x4fa041];
        const colorIndex = (x * 7 + y * 13) % baseColors.length;
        const baseColor = baseColors[colorIndex];

        // Subtle checkerboard pattern
        const tileColor = (x + y) % 2 === 0
            ? Phaser.Display.Color.IntegerToColor(baseColor).brighten(5).color
            : Phaser.Display.Color.IntegerToColor(baseColor).darken(3).color;

        const points = [
            new Phaser.Math.Vector2(pos.x, pos.y),           // Top
            new Phaser.Math.Vector2(pos.x + halfW, pos.y + halfH), // Right
            new Phaser.Math.Vector2(pos.x, pos.y + this.tileHeight), // Bottom
            new Phaser.Math.Vector2(pos.x - halfW, pos.y + halfH)  // Left
        ];

        // Main tile fill
        graphics.fillStyle(tileColor, 1);
        graphics.fillPoints(points, true);

        // Top-left highlight edge (sun direction)
        graphics.lineStyle(1, 0xffffff, 0.15);
        graphics.lineBetween(points[3].x, points[3].y, points[0].x, points[0].y);
        graphics.lineBetween(points[0].x, points[0].y, points[1].x, points[1].y);

        // Bottom-right shadow edge
        graphics.lineStyle(1, 0x000000, 0.12);
        graphics.lineBetween(points[1].x, points[1].y, points[2].x, points[2].y);
        graphics.lineBetween(points[2].x, points[2].y, points[3].x, points[3].y);

        // Occasional grass detail (small darker spots)
        if ((x * 3 + y * 5) % 7 === 0) {
            const detailColor = Phaser.Display.Color.IntegerToColor(baseColor).darken(15).color;
            graphics.fillStyle(detailColor, 0.4);
            graphics.fillCircle(pos.x + (Math.sin(x * y) * 5), pos.y + halfH + (Math.cos(x * y) * 3), 2);
        }
    }

    private instantiateBuilding(data: SerializedBuilding, owner: 'PLAYER' | 'ENEMY') {
        const { gridX, gridY, type, id, level = 1 } = data;
        const info = BUILDINGS[type];
        if (!info) return;

        // Calculate stats based on level
        const stats = getBuildingStats(type as BuildingType, level);

        const graphics = this.add.graphics();
        const baseGraphics = this.add.graphics();
        baseGraphics.setDepth(1); // Ensure base is ALWAYS at the bottom
        this.drawBuildingVisuals(graphics, gridX, gridY, type, 1, null, undefined, baseGraphics);

        // Building depth: use the bottom-most grid coordinate (gridX+width + gridY+height)
        const depth = (gridX + info.width) + (gridY + info.height);
        graphics.setDepth(depth * 10);

        const building: PlacedBuilding = {
            id, type, gridX, gridY, level, graphics, baseGraphics,
            healthBar: this.add.graphics(),
            health: stats.maxHealth || 100,
            maxHealth: stats.maxHealth || 100,
            owner
        };

        // Initialize cannon angle
        if (type === 'cannon') {
            building.ballistaAngle = Math.PI / 4; // Default facing bottom-right
        }

        this.buildings.push(building);
        this.updateHealthBar(building);

        if (type === 'army_camp') {
            const campCount = this.buildings.filter(b => b.type === 'army_camp').length;
            (window as any).refreshCampCapacity?.(campCount);
        }

        return building;
    }

    private placeBuilding(gridX: number, gridY: number, type: string, owner: 'PLAYER' | 'ENEMY' = 'PLAYER'): boolean {
        // Remove any obstacles that overlap with this building
        const info = BUILDINGS[type];
        if (info) {
            this.removeOverlappingObstacles(gridX, gridY, info.width, info.height);
        }

        if (owner === 'PLAYER') {
            // Backend Validation & Placement
            const data = Backend.placeBuilding('player_home', type as BuildingType, gridX, gridY);
            if (data) {
                this.instantiateBuilding(data, 'PLAYER');
                (window as any).onBuildingPlaced?.(type);
                return true;
            }
        } else {
            // For Enemy (Manual placement, e.g. from old generators if still used)
            // We create a temp serialized object
            const data: SerializedBuilding = {
                id: Phaser.Utils.String.UUID(),
                type: type as BuildingType,
                gridX, gridY, level: 1
            };
            this.instantiateBuilding(data, 'ENEMY');
            return true;
        }
        return false;
    }

    private removeOverlappingObstacles(gridX: number, gridY: number, width: number, height: number) {
        const toRemove: string[] = [];

        for (const o of this.obstacles) {
            const oInfo = OBSTACLES[o.type];
            // Check overlap
            const overlapX = Math.max(0, Math.min(gridX + width, o.gridX + oInfo.width) - Math.max(gridX, o.gridX));
            const overlapY = Math.max(0, Math.min(gridY + height, o.gridY + oInfo.height) - Math.max(gridY, o.gridY));
            if (overlapX > 0 && overlapY > 0) {
                toRemove.push(o.id);
            }
        }

        // Remove overlapping obstacles
        toRemove.forEach(id => this.removeObstacle(id));
    }





    private isPositionValid(gridX: number, gridY: number, type: string, buildingToIgnore: string | null = null): boolean {
        const info = BUILDINGS[type];
        if (gridX < 0 || gridY < 0 || gridX + info.width > this.mapSize || gridY + info.height > this.mapSize) {
            return false;
        }
        for (const b of this.buildings) {
            if (b.id === buildingToIgnore) continue;
            const bInfo = BUILDINGS[b.type];
            const overlapX = Math.max(0, Math.min(gridX + info.width, b.gridX + bInfo.width) - Math.max(gridX, b.gridX));
            const overlapY = Math.max(0, Math.min(gridY + info.height, b.gridY + bInfo.height) - Math.max(gridY, b.gridY));
            if (overlapX > 0 && overlapY > 0) return false;
        }
        return true;
    }

    private drawBuildingVisuals(graphics: Phaser.GameObjects.Graphics, gridX: number, gridY: number, type: string, alpha: number = 1, tint: number | null = null, building?: PlacedBuilding, baseGraphics?: Phaser.GameObjects.Graphics) {
        const info = BUILDINGS[type];
        const c1 = this.cartToIso(gridX, gridY);
        const c2 = this.cartToIso(gridX + info.width, gridY);
        const c3 = this.cartToIso(gridX + info.width, gridY + info.height);
        const c4 = this.cartToIso(gridX, gridY + info.height);
        const center = this.cartToIso(gridX + info.width / 2, gridY + info.height / 2);

        // Building-specific premium visuals
        switch (type) {
            case 'town_hall':
                this.drawTownHall(graphics, c1, c2, c3, c4, center, alpha, tint, baseGraphics);
                break;
            case 'barracks':
                this.drawBarracks(graphics, c1, c2, c3, c4, center, alpha, tint);
                break;
            case 'cannon':
                // Use level-based rendering for cannon
                if (building && building.level >= 4) {
                    this.drawCannonLevel4(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                } else if (building && building.level === 3) {
                    this.drawCannonLevel3(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                } else if (building && building.level === 2) {
                    this.drawCannonLevel2(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                } else {
                    this.drawCannon(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                }
                break;
            case 'ballista':
                if (building && building.level >= 2) {
                    this.drawBallistaLevel2(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                } else {
                    this.drawBallista(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                }
                break;
            case 'mine':
                this.drawGoldMine(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                break;
            case 'elixir_collector':
                this.drawElixirCollector(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                break;
            case 'mortar':
                this.drawMortar(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                break;
            case 'tesla':
                this.drawTeslaCoil(graphics, c1, c2, c3, c4, center, alpha, tint);
                break;
            case 'wall':
                this.drawWall(graphics, center, gridX, gridY, alpha, tint, building);
                break;
            case 'army_camp':
                this.drawArmyCamp(graphics, c1, c2, c3, c4, center, alpha, tint, baseGraphics);
                break;
            case 'xbow':
                if (building && building.level >= 2) {
                    this.drawXBowLevel2(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                } else {
                    this.drawXBow(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                }
                break;
            case 'prism':
                this.drawPrismTower(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                break;
            case 'magmavent':
                this.drawMagmaVent(graphics, c1, c2, c3, c4, center, alpha, tint, building, baseGraphics);
                break;
            case 'dragons_breath':
                this.drawDragonsBreath(graphics, c1, c2, c3, c4, center, alpha, tint, building, baseGraphics);
                break;

            default:
                this.drawGenericBuilding(graphics, c1, c2, c3, c4, center, info, alpha, tint);
        }
    }

    private drawTownHall(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, baseGraphics?: Phaser.GameObjects.Graphics) {
        const time = this.time.now;
        const g = baseGraphics || graphics; // Draw floor on baseGraphics

        const height = 65;
        const t1 = new Phaser.Math.Vector2(c1.x, c1.y - height);
        const t2 = new Phaser.Math.Vector2(c2.x, c2.y - height);
        const t3 = new Phaser.Math.Vector2(c3.x, c3.y - height);
        const t4 = new Phaser.Math.Vector2(c4.x, c4.y - height);

        // === ORNATE STONE FOUNDATION ===
        g.fillStyle(tint ?? 0x7a6a5a, alpha);
        g.fillPoints([c1, c2, c3, c4], true);

        // Foundation borders
        g.lineStyle(2, 0x5a4a3a, alpha);
        g.strokePoints([c1, c2, c3, c4], true, true);

        // Red carpet leading to door
        g.fillStyle(0xaa2222, alpha);
        g.fillCircle(center.x, center.y, 10);

        // Foundation stone texture (moved to baseGraphics)
        g.fillStyle(0x6a5a4a, alpha * 0.4);
        for (let i = 0; i < 6; i++) {
            const px = center.x + Math.sin(i * 2.3) * 20;
            const py = center.y + Math.cos(i * 1.7) * 12;
            g.fillCircle(px, py, 3 + Math.sin(i) * 1.5);
        }

        // === MAGNIFICENT WALLS ===
        // Right wall (shadow side) - clean surface
        graphics.fillStyle(tint ?? 0x5a4a3a, alpha);
        graphics.fillPoints([c2, c3, t3, t2], true);

        // Left wall (lit side) - clean surface
        graphics.fillStyle(tint ?? 0x8a7a6a, alpha);
        graphics.fillPoints([c3, c4, t4, t3], true);

        // Wall edges
        graphics.lineStyle(2, 0x3a2a1a, 0.5 * alpha);
        graphics.strokePoints([c2, c3, t3, t2], true, true);
        graphics.strokePoints([c3, c4, t4, t3], true, true);

        // === ARCHED WINDOWS WITH WARM GLOW (ISOMETRIC) ===
        // Window glow
        const windowGlow = 0.6 + Math.sin(time / 300) * 0.15;

        // Calculate wall directions for isometric window placement
        // Right wall goes from c2 to c3
        const rightWallDirX = (c3.x - c2.x);
        const rightWallDirY = (c3.y - c2.y);
        // Left wall goes from c3 to c4
        const leftWallDirX = (c4.x - c3.x);
        const leftWallDirY = (c4.y - c3.y);

        // Right wall windows (isometric parallelograms)
        for (let i = 0; i < 2; i++) {
            const t = 0.3 + i * 0.4; // Position along wall
            const baseX = c2.x + rightWallDirX * t;
            const baseY = c2.y + rightWallDirY * t - height * 0.5;
            // Window frame (isometric parallelogram)
            const wh = 14; // window height
            // Skew factor based on wall angle
            const skewX = rightWallDirX * 0.08;
            const skewY = rightWallDirY * 0.08;
            graphics.fillStyle(0x3a2a1a, alpha);
            graphics.beginPath();
            graphics.moveTo(baseX - skewX * 2, baseY - wh / 2);
            graphics.lineTo(baseX + skewX * 2, baseY - wh / 2 + skewY * 4);
            graphics.lineTo(baseX + skewX * 2, baseY + wh / 2 + skewY * 4);
            graphics.lineTo(baseX - skewX * 2, baseY + wh / 2);
            graphics.closePath();
            graphics.fillPath();
            // Warm light (inner glow)
            graphics.fillStyle(0xffdd88, alpha * windowGlow);
            graphics.beginPath();
            graphics.moveTo(baseX - skewX * 1.5, baseY - wh / 2 + 2);
            graphics.lineTo(baseX + skewX * 1.5, baseY - wh / 2 + 2 + skewY * 3);
            graphics.lineTo(baseX + skewX * 1.5, baseY + wh / 2 - 2 + skewY * 3);
            graphics.lineTo(baseX - skewX * 1.5, baseY + wh / 2 - 2);
            graphics.closePath();
            graphics.fillPath();
        }

        // Left wall windows (isometric parallelograms)
        for (let i = 0; i < 2; i++) {
            const t = 0.3 + i * 0.4; // Position along wall
            const baseX = c3.x + leftWallDirX * t;
            const baseY = c3.y + leftWallDirY * t - height * 0.5;
            // Window frame (isometric parallelogram)
            const wh = 14; // window height
            // Skew factor based on wall angle
            const skewX = leftWallDirX * 0.08;
            const skewY = leftWallDirY * 0.08;
            graphics.fillStyle(0x3a2a1a, alpha);
            graphics.beginPath();
            graphics.moveTo(baseX - skewX * 2, baseY - wh / 2);
            graphics.lineTo(baseX + skewX * 2, baseY - wh / 2 + skewY * 4);
            graphics.lineTo(baseX + skewX * 2, baseY + wh / 2 + skewY * 4);
            graphics.lineTo(baseX - skewX * 2, baseY + wh / 2);
            graphics.closePath();
            graphics.fillPath();
            // Warm light (inner glow)
            graphics.fillStyle(0xffdd88, alpha * windowGlow);
            graphics.beginPath();
            graphics.moveTo(baseX - skewX * 1.5, baseY - wh / 2 + 2);
            graphics.lineTo(baseX + skewX * 1.5, baseY - wh / 2 + 2 + skewY * 3);
            graphics.lineTo(baseX + skewX * 1.5, baseY + wh / 2 - 2 + skewY * 3);
            graphics.lineTo(baseX - skewX * 1.5, baseY + wh / 2 - 2);
            graphics.closePath();
            graphics.fillPath();
        }

        // === DECORATIVE CORNER TOWERS ===
        const towerHeight = 25;
        const towerPositions = [
            { x: c1.x + 8, y: c1.y - 5 },
            { x: c4.x - 8, y: c4.y - 5 }
        ];

        for (const pos of towerPositions) {
            // Tower body
            graphics.fillStyle(0x6a5a4a, alpha);
            graphics.fillRect(pos.x - 6, pos.y - height - towerHeight, 12, height + towerHeight);
            graphics.lineStyle(1, 0x4a3a2a, alpha);
            graphics.strokeRect(pos.x - 6, pos.y - height - towerHeight, 12, height + towerHeight);

            // Tower cone roof
            graphics.fillStyle(0xb84c4c, alpha);
            graphics.beginPath();
            graphics.moveTo(pos.x, pos.y - height - towerHeight - 15);
            graphics.lineTo(pos.x - 8, pos.y - height - towerHeight);
            graphics.lineTo(pos.x + 8, pos.y - height - towerHeight);
            graphics.closePath();
            graphics.fillPath();

            // Roof highlight
            graphics.lineStyle(1, 0xd85c5c, alpha * 0.5);
            graphics.lineBetween(pos.x, pos.y - height - towerHeight - 15, pos.x + 8, pos.y - height - towerHeight);

            // Tower window
            graphics.fillStyle(0xffdd88, alpha * windowGlow);
            graphics.fillCircle(pos.x, pos.y - height - 10, 4);
        }

        // === MAGNIFICENT ROOF ===
        // Multi-layered roof
        const roofColor = tint ?? 0xc86444;

        // Base roof layer
        graphics.fillStyle(roofColor, alpha);
        graphics.fillPoints([t1, t2, t3, t4], true);

        // Roof peak structure
        const peakHeight = 20;
        const peak = new Phaser.Math.Vector2(center.x, center.y - height - peakHeight);

        graphics.fillStyle(0xb85434, alpha);
        graphics.fillTriangle(t1.x, t1.y, t2.x, t2.y, peak.x, peak.y);
        graphics.fillStyle(0x983424, alpha);
        graphics.fillTriangle(t2.x, t2.y, t3.x, t3.y, peak.x, peak.y);
        graphics.fillTriangle(t3.x, t3.y, t4.x, t4.y, peak.x, peak.y);
        graphics.fillStyle(0xc86444, alpha);
        graphics.fillTriangle(t4.x, t4.y, t1.x, t1.y, peak.x, peak.y);

        // Roof edge trim
        graphics.lineStyle(2, 0xd4a04a, alpha);
        graphics.lineBetween(t1.x, t1.y, t2.x, t2.y);
        graphics.lineBetween(t1.x, t1.y, t4.x, t4.y);

        // Peak edges
        graphics.lineStyle(1, 0xffd700, alpha * 0.8);
        graphics.lineBetween(t1.x, t1.y, peak.x, peak.y);
        graphics.lineBetween(t4.x, t4.y, peak.x, peak.y);

        // === GLOWING GOLDEN DOME ===
        const domeGlow = 0.8 + Math.sin(time / 400) * 0.2;

        // Dome base
        graphics.fillStyle(0xffd700, alpha * domeGlow);
        graphics.fillCircle(peak.x, peak.y - 5, 10);
        graphics.fillStyle(0xffe866, alpha * domeGlow);
        graphics.fillCircle(peak.x, peak.y - 7, 7);
        graphics.fillStyle(0xffffaa, alpha * domeGlow * 0.8);
        graphics.fillCircle(peak.x - 2, peak.y - 9, 3);

        // Dome glow aura
        graphics.fillStyle(0xffd700, alpha * 0.2 * domeGlow);
        graphics.fillCircle(peak.x, peak.y - 5, 16);

        // Crown on dome
        graphics.fillStyle(0xffd700, alpha);
        graphics.beginPath();
        graphics.moveTo(peak.x, peak.y - 20);
        graphics.lineTo(peak.x - 4, peak.y - 14);
        graphics.lineTo(peak.x - 2, peak.y - 14);
        graphics.lineTo(peak.x - 2, peak.y - 16);
        graphics.lineTo(peak.x, peak.y - 18);
        graphics.lineTo(peak.x + 2, peak.y - 16);
        graphics.lineTo(peak.x + 2, peak.y - 14);
        graphics.lineTo(peak.x + 4, peak.y - 14);
        graphics.closePath();
        graphics.fillPath();

        // === ROYAL BANNERS ===
        const flagWave = Math.sin(time / 120) * 4;
        const flagWave2 = Math.sin(time / 130 + 1) * 4;

        // Left banner
        graphics.fillStyle(0x5d4e37, alpha);
        graphics.fillRect(c1.x + 15, c1.y - height - 25, 2, 30);
        graphics.fillStyle(0x2244aa, alpha);
        graphics.beginPath();
        graphics.moveTo(c1.x + 17, c1.y - height - 25);
        graphics.lineTo(c1.x + 32 + flagWave, c1.y - height - 20);
        graphics.lineTo(c1.x + 30 + flagWave * 0.8, c1.y - height - 10);
        graphics.lineTo(c1.x + 17, c1.y - height - 5);
        graphics.closePath();
        graphics.fillPath();
        // Banner emblem
        graphics.fillStyle(0xffd700, alpha * 0.8);
        graphics.fillCircle(c1.x + 23 + flagWave * 0.5, c1.y - height - 15, 4);

        // Right banner
        graphics.fillStyle(0x5d4e37, alpha);
        graphics.fillRect(c4.x - 17, c4.y - height - 25, 2, 30);
        graphics.fillStyle(0x2244aa, alpha);
        graphics.beginPath();
        graphics.moveTo(c4.x - 15, c4.y - height - 25);
        graphics.lineTo(c4.x - 30 - flagWave2, c4.y - height - 20);
        graphics.lineTo(c4.x - 28 - flagWave2 * 0.8, c4.y - height - 10);
        graphics.lineTo(c4.x - 15, c4.y - height - 5);
        graphics.closePath();
        graphics.fillPath();
        graphics.fillStyle(0xffd700, alpha * 0.8);
        graphics.fillCircle(c4.x - 23 - flagWave2 * 0.5, c4.y - height - 15, 4);

        // === MAGICAL FLOATING PARTICLES ===
        for (let i = 0; i < 4; i++) {
            const particleAngle = (time / 800 + i * 1.57) % (Math.PI * 2);
            const particleDist = 25 + Math.sin(time / 200 + i) * 5;
            const particleX = peak.x + Math.cos(particleAngle) * particleDist;
            const particleY = peak.y - 15 + Math.sin(particleAngle) * particleDist * 0.4 - Math.sin(time / 300 + i) * 5;
            const particleAlpha = 0.4 + Math.sin(time / 100 + i * 2) * 0.3;

            graphics.fillStyle(0xffdd88, alpha * particleAlpha);
            graphics.fillCircle(particleX, particleY, 2);
            graphics.fillStyle(0xffffcc, alpha * particleAlpha * 0.5);
            graphics.fillCircle(particleX, particleY - 1, 1);
        }
    }


    private drawBarracks(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null) {
        const wallHeight = 28;

        // Wall top corners
        const t1 = new Phaser.Math.Vector2(c1.x, c1.y - wallHeight);
        const t2 = new Phaser.Math.Vector2(c2.x, c2.y - wallHeight);
        const t3 = new Phaser.Math.Vector2(c3.x, c3.y - wallHeight);
        const t4 = new Phaser.Math.Vector2(c4.x, c4.y - wallHeight);

        // === STONE FOUNDATION ===
        graphics.fillStyle(tint ?? 0x7a6a5a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);

        // Foundation texture
        graphics.fillStyle(0x6a5a4a, alpha * 0.4);
        graphics.fillCircle(center.x - 8, center.y + 3, 3);
        graphics.fillCircle(center.x + 6, center.y + 5, 2);

        // === WALLS (proper isometric 3D) ===
        // Right wall (shadow side - SE facing)
        graphics.fillStyle(tint ?? 0x8b3030, alpha);
        graphics.fillPoints([c2, c3, t3, t2], true);

        // Left wall (lit side - SW facing)
        graphics.fillStyle(tint ?? 0xa04040, alpha);
        graphics.fillPoints([c3, c4, t4, t3], true);

        // Wall edge outlines
        graphics.lineStyle(1, 0x4a1a1a, 0.6 * alpha);
        graphics.lineBetween(c2.x, c2.y, t2.x, t2.y);
        graphics.lineBetween(c3.x, c3.y, t3.x, t3.y);
        graphics.lineBetween(c4.x, c4.y, t4.x, t4.y);

        // === DOORWAY (on front-facing wall - SW wall between c3 and c4) ===
        // Door must follow isometric angle of the wall
        const doorHeight = 16;

        // Wall direction vector (c3 to c4)
        const wallDirX = (c4.x - c3.x);
        const wallDirY = (c4.y - c3.y);
        const wallLen = Math.sqrt(wallDirX * wallDirX + wallDirY * wallDirY);
        const normX = wallDirX / wallLen;
        const normY = wallDirY / wallLen;

        // Door center on the wall
        const doorCenterX = (c3.x + c4.x) / 2;
        const doorCenterY = (c3.y + c4.y) / 2;
        const doorHalfWidth = 10;

        // Bottom corners of door (on wall line)
        const dbl = { x: doorCenterX - normX * doorHalfWidth, y: doorCenterY - normY * doorHalfWidth };
        const dbr = { x: doorCenterX + normX * doorHalfWidth, y: doorCenterY + normY * doorHalfWidth };
        // Top corners (straight up in screen space)
        const dtl = { x: dbl.x, y: dbl.y - doorHeight };
        const dtr = { x: dbr.x, y: dbr.y - doorHeight };

        // Door opening (dark interior)
        graphics.fillStyle(0x1a0a0a, alpha);
        graphics.fillPoints([
            new Phaser.Math.Vector2(dbl.x, dbl.y),
            new Phaser.Math.Vector2(dbr.x, dbr.y),
            new Phaser.Math.Vector2(dtr.x, dtr.y),
            new Phaser.Math.Vector2(dtl.x, dtl.y)
        ], true);

        // Door frame
        graphics.lineStyle(2, 0x5d4e37, alpha);
        graphics.lineBetween(dbl.x, dbl.y, dtl.x, dtl.y);
        graphics.lineBetween(dbr.x, dbr.y, dtr.x, dtr.y);
        graphics.lineBetween(dtl.x, dtl.y, dtr.x, dtr.y);

        // === ISOMETRIC ROOF ===
        const roofHeight = 18;
        const roofOverhang = 4;

        // Roof base corners (with overhang)
        const r1 = new Phaser.Math.Vector2(t1.x, t1.y - roofOverhang);
        const r2 = new Phaser.Math.Vector2(t2.x + roofOverhang, t2.y);
        const r3 = new Phaser.Math.Vector2(t3.x, t3.y + roofOverhang);
        const r4 = new Phaser.Math.Vector2(t4.x - roofOverhang, t4.y);

        // Roof peak (ridge line along the isometric axis)
        const peakFront = new Phaser.Math.Vector2(center.x + 10, center.y - wallHeight - roofHeight + 5);
        const peakBack = new Phaser.Math.Vector2(center.x - 10, center.y - wallHeight - roofHeight - 5);

        // Roof panels (4 triangular sections for pitched roof)
        // Back-left panel (darkest)
        graphics.fillStyle(0x3a2515, alpha);
        graphics.fillTriangle(r1.x, r1.y, r4.x, r4.y, peakBack.x, peakBack.y);

        // Back-right panel
        graphics.fillStyle(0x4a3020, alpha);
        graphics.fillTriangle(r1.x, r1.y, r2.x, r2.y, peakBack.x, peakBack.y);

        // Front-right panel (medium)
        graphics.fillStyle(0x5a3a25, alpha);
        graphics.fillTriangle(r2.x, r2.y, r3.x, r3.y, peakFront.x, peakFront.y);
        graphics.fillTriangle(r2.x, r2.y, peakBack.x, peakBack.y, peakFront.x, peakFront.y);

        // Front-left panel (lightest)
        graphics.fillStyle(0x6a4a30, alpha);
        graphics.fillTriangle(r3.x, r3.y, r4.x, r4.y, peakFront.x, peakFront.y);
        graphics.fillTriangle(r4.x, r4.y, peakBack.x, peakBack.y, peakFront.x, peakFront.y);

        // Roof ridge line
        graphics.lineStyle(2, 0x2a1510, alpha);
        graphics.lineBetween(peakBack.x, peakBack.y, peakFront.x, peakFront.y);

        // Roof edge highlights
        graphics.lineStyle(1, 0x7a5a40, alpha * 0.6);
        graphics.lineBetween(r3.x, r3.y, peakFront.x, peakFront.y);
        graphics.lineBetween(r4.x, r4.y, peakFront.x, peakFront.y);

    }


    // === BEAUTIFUL ARTSY ROTATING CANNON ===
    private drawCannon(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding) {
        // Get the rotation angle from building (same system as ballista/xbow)
        const angle = building?.ballistaAngle ?? Math.PI / 4; // Default facing bottom-right (isometric forward)
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // === STONE FOUNDATION PLATFORM ===
        // Main stone base (isometric diamond)
        graphics.fillStyle(tint ?? 0x7a7a7a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);

        // Stone texture - lighter edges for 3D effect
        graphics.lineStyle(2, 0x9a9a9a, alpha * 0.8);
        graphics.lineBetween(c1.x, c1.y, c2.x, c2.y);
        graphics.lineBetween(c1.x, c1.y, c4.x, c4.y);
        graphics.lineStyle(2, 0x4a4a4a, alpha * 0.8);
        graphics.lineBetween(c2.x, c2.y, c3.x, c3.y);
        graphics.lineBetween(c3.x, c3.y, c4.x, c4.y);

        // Stone decorative details
        graphics.fillStyle(0x6a6a6a, alpha * 0.6);
        graphics.fillCircle(center.x - 10, center.y + 6, 3);
        graphics.fillCircle(center.x + 8, center.y + 4, 2);

        // === WOODEN ROTATING BASE (Isometric ellipse) ===
        const baseRadiusX = 22;
        const baseRadiusY = 13; // Squashed for isometric view
        const baseY = center.y - 3;

        // Wood shadow underneath
        graphics.fillStyle(0x1a1008, alpha * 0.5);
        graphics.fillEllipse(center.x + 2, baseY + 4, baseRadiusX, baseRadiusY);

        // Main wooden base
        graphics.fillStyle(0x5a4030, alpha);
        graphics.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

        // Wood grain rings
        graphics.lineStyle(2, 0x4a3020, alpha * 0.6);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX - 4, baseRadiusY - 2);
        graphics.lineStyle(1, 0x3a2515, alpha * 0.4);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX - 8, baseRadiusY - 5);

        // Metal reinforcement ring on wooden base
        graphics.lineStyle(3, 0x444444, alpha);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
        graphics.lineStyle(1, 0x666666, alpha * 0.6);
        graphics.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);



        // === ROTATING CANNON BARREL ===
        const barrelHeight = -14; // Height above base
        const barrelLength = 28;  // Length of barrel
        const barrelWidth = 10;   // Thickness

        // Apply recoil offset (pulls barrel back in opposite direction of firing)
        const recoilAmount = (building?.cannonRecoilOffset ?? 0) * 8; // Max 8 pixels recoil
        const recoilOffsetX = -cos * recoilAmount;
        const recoilOffsetY = -sin * 0.5 * recoilAmount;

        // Calculate barrel end position based on angle (with recoil)
        const barrelTipX = center.x + cos * barrelLength + recoilOffsetX;
        const barrelTipY = center.y + barrelHeight + sin * 0.5 * barrelLength + recoilOffsetY;

        // Barrel shadow on ground
        graphics.fillStyle(0x1a1a1a, alpha * 0.3);
        graphics.fillEllipse(center.x + cos * (barrelLength * 0.5) + 3, center.y + 4, barrelLength * 0.6, 5);

        // === BARREL CARRIAGE (holds the barrel) ===
        // Two side supports from the rotating base
        const supportOffsetX = -sin * 8;
        const supportOffsetY = cos * 4;

        // Left support
        graphics.fillStyle(0x4a3525, alpha);
        graphics.beginPath();
        graphics.moveTo(center.x - supportOffsetX, baseY - supportOffsetY);
        graphics.lineTo(center.x - supportOffsetX * 0.5, center.y + barrelHeight + 4);
        graphics.lineTo(center.x + cos * 5 - supportOffsetX * 0.5, center.y + barrelHeight + sin * 2.5 + 4);
        graphics.lineTo(center.x + cos * 5, center.y + barrelHeight + sin * 2.5);
        graphics.closePath();
        graphics.fillPath();

        // Right support
        graphics.fillStyle(0x3a2515, alpha);
        graphics.beginPath();
        graphics.moveTo(center.x + supportOffsetX, baseY + supportOffsetY);
        graphics.lineTo(center.x + supportOffsetX * 0.5, center.y + barrelHeight + 4);
        graphics.lineTo(center.x + cos * 5 + supportOffsetX * 0.5, center.y + barrelHeight + sin * 2.5 + 4);
        graphics.lineTo(center.x + cos * 5, center.y + barrelHeight + sin * 2.5);
        graphics.closePath();
        graphics.fillPath();

        // === CONDITIONAL RENDER ORDER ===
        // If pointing down (sin >= 0), barrel is in front, so draw pivot FIRST (behind barrel)
        // If pointing up (sin < 0), barrel is behind, so draw pivot LAST (on top of barrel)

        const drawPivot = () => {
            // === CENTRAL PIVOT MECHANISM ===
            const pivotX = center.x + recoilOffsetX;
            const pivotY = center.y + barrelHeight + 3 + recoilOffsetY;

            graphics.fillStyle(0x333333, alpha);
            graphics.fillCircle(pivotX, pivotY, 8);
            graphics.fillStyle(0x444444, alpha);
            graphics.fillCircle(pivotX, pivotY, 6);
            graphics.fillStyle(0x555555, alpha);
            graphics.fillCircle(pivotX, pivotY, 4);
            graphics.fillStyle(0x666666, alpha * 0.7);
            graphics.fillCircle(pivotX - 1, pivotY - 1, 2);
        };

        if (sin >= 0) drawPivot();

        // === BARREL BASE ===
        // Large reinforced base where barrel meets carriage (with recoil)
        // Moved here to be BEHIND the barrel body
        const baseJointX = center.x + cos * 3 + recoilOffsetX;
        const baseJointY = center.y + barrelHeight + sin * 1.5 + recoilOffsetY;
        graphics.fillStyle(0x555555, alpha);
        graphics.fillEllipse(baseJointX, baseJointY, 14, 8);
        graphics.fillStyle(0x444444, alpha);
        graphics.fillEllipse(baseJointX, baseJointY, 10, 6);
        graphics.fillStyle(0x333333, alpha);
        graphics.fillEllipse(baseJointX, baseJointY, 6, 4);

        // === MAIN BARREL BODY ===
        // Draw the barrel as multiple layers for depth
        // Barrel base point (with recoil)
        const barrelBaseX = center.x + recoilOffsetX;
        const barrelBaseY = center.y + barrelHeight + recoilOffsetY;

        // Barrel outer shadow
        graphics.lineStyle(barrelWidth + 4, 0x1a1a1a, alpha);
        graphics.lineBetween(barrelBaseX, barrelBaseY + 2, barrelTipX, barrelTipY + 2);

        // Barrel main body - dark iron
        graphics.lineStyle(barrelWidth, 0x2a2a2a, alpha);
        graphics.lineBetween(barrelBaseX, barrelBaseY, barrelTipX, barrelTipY);

        // Barrel highlight strip (top)
        graphics.lineStyle(barrelWidth - 4, 0x3a3a3a, alpha);
        graphics.lineBetween(center.x, center.y + barrelHeight - 1, barrelTipX, barrelTipY - 1);

        // Bright highlight
        graphics.lineStyle(2, 0x5a5a5a, alpha * 0.8);
        graphics.lineBetween(barrelBaseX, barrelBaseY - 2, barrelTipX, barrelTipY - 2);

        // === DECORATIVE BARREL BANDS (iron) ===
        const bands = [0.15, 0.4, 0.7, 0.9];
        for (const t of bands) {
            const bandX = center.x + cos * barrelLength * t + recoilOffsetX;
            const bandY = center.y + barrelHeight + sin * 0.5 * barrelLength * t + recoilOffsetY;

            // Iron bands
            graphics.fillStyle(0x4a4a4a, alpha);
            graphics.fillEllipse(bandX, bandY, 7, 4);
            graphics.fillStyle(0x5a5a5a, alpha * 0.6);
            graphics.fillCircle(bandX - 1, bandY - 1, 1.5);
            graphics.lineStyle(1, 0x333333, alpha);
            graphics.strokeEllipse(bandX, bandY, 7, 4);
        }

        // Barrel Base moved before barrel body


        // Muzzle removed - barrel just ends with the line strokes

        // If pointing up (sin < 0), draw pivot LAST (on top of barrel)
        if (sin < 0) drawPivot();
    }

    private drawCannonLevel2(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding) {
        // LEVEL 2 CANNON: Reinforced single barrel with iron plating and copper accents
        const angle = building?.ballistaAngle ?? Math.PI / 4;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // === REINFORCED STONE FOUNDATION ===
        graphics.fillStyle(tint ?? 0x6a6a6a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);

        // Iron corner brackets
        graphics.lineStyle(2, 0x555555, alpha * 0.9);
        graphics.lineBetween(c1.x, c1.y, c2.x, c2.y);
        graphics.lineBetween(c1.x, c1.y, c4.x, c4.y);
        graphics.lineStyle(2, 0x3a3a3a, alpha * 0.8);
        graphics.lineBetween(c2.x, c2.y, c3.x, c3.y);
        graphics.lineBetween(c3.x, c3.y, c4.x, c4.y);

        // Corner rivets (iron)
        graphics.fillStyle(0x666666, alpha * 0.9);
        graphics.fillCircle(c1.x, c1.y, 2.5);
        graphics.fillCircle(c2.x, c2.y, 2);
        graphics.fillCircle(c3.x, c3.y, 2);
        graphics.fillCircle(c4.x, c4.y, 2);

        // === WOODEN ROTATING BASE WITH IRON REINFORCEMENT ===
        const baseRadiusX = 23;
        const baseRadiusY = 13.5;
        const baseY = center.y - 3;

        // Shadow underneath
        graphics.fillStyle(0x1a1008, alpha * 0.5);
        graphics.fillEllipse(center.x + 2, baseY + 4, baseRadiusX, baseRadiusY);

        // Main wooden base (darker, treated wood)
        graphics.fillStyle(0x4a3525, alpha);
        graphics.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

        // Wood grain rings
        graphics.lineStyle(2, 0x3a2515, alpha * 0.6);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX - 4, baseRadiusY - 2);
        graphics.lineStyle(1, 0x2a1a0a, alpha * 0.4);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX - 8, baseRadiusY - 5);

        // Heavy iron reinforcement ring
        graphics.lineStyle(4, 0x3a3a3a, alpha);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
        graphics.lineStyle(2, 0x555555, alpha * 0.6);
        graphics.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);

        // === BIGGER REINFORCED BARREL ===
        const barrelHeight = -14;
        const barrelLength = 30;  // Longer barrel
        const barrelWidth = 12;   // Thicker barrel

        // Recoil
        const recoilAmount = (building?.cannonRecoilOffset ?? 0) * 9;
        const recoilOffsetX = -cos * recoilAmount;
        const recoilOffsetY = -sin * 0.5 * recoilAmount;

        const barrelTipX = center.x + cos * barrelLength + recoilOffsetX;
        const barrelTipY = center.y + barrelHeight + sin * 0.5 * barrelLength + recoilOffsetY;

        // Barrel shadow
        graphics.fillStyle(0x1a1a1a, alpha * 0.35);
        graphics.fillEllipse(center.x + cos * (barrelLength * 0.5) + 3, center.y + 5, barrelLength * 0.65, 5);

        // === BARREL CARRIAGE (heavier supports) ===
        const supportOffsetX = -sin * 9;
        const supportOffsetY = cos * 4.5;

        // Left support
        graphics.fillStyle(0x3a2a1a, alpha);
        graphics.beginPath();
        graphics.moveTo(center.x - supportOffsetX, baseY - supportOffsetY);
        graphics.lineTo(center.x - supportOffsetX * 0.5, center.y + barrelHeight + 5);
        graphics.lineTo(center.x + cos * 6 - supportOffsetX * 0.5, center.y + barrelHeight + sin * 3 + 5);
        graphics.lineTo(center.x + cos * 6, center.y + barrelHeight + sin * 3);
        graphics.closePath();
        graphics.fillPath();

        // Right support
        graphics.fillStyle(0x2a1a0a, alpha);
        graphics.beginPath();
        graphics.moveTo(center.x + supportOffsetX, baseY + supportOffsetY);
        graphics.lineTo(center.x + supportOffsetX * 0.5, center.y + barrelHeight + 5);
        graphics.lineTo(center.x + cos * 6 + supportOffsetX * 0.5, center.y + barrelHeight + sin * 3 + 5);
        graphics.lineTo(center.x + cos * 6, center.y + barrelHeight + sin * 3);
        graphics.closePath();
        graphics.fillPath();

        // === CENTRAL PIVOT (reinforced) ===
        const drawPivot = () => {
            const pivotX = center.x + recoilOffsetX;
            const pivotY = center.y + barrelHeight + 3 + recoilOffsetY;

            graphics.fillStyle(0x2a2a2a, alpha);
            graphics.fillCircle(pivotX, pivotY, 9);
            graphics.fillStyle(0x3a3a3a, alpha);
            graphics.fillCircle(pivotX, pivotY, 7);
            graphics.fillStyle(0x4a4a4a, alpha);
            graphics.fillCircle(pivotX, pivotY, 5);
            // Copper accent
            graphics.fillStyle(0xb87333, alpha * 0.8);
            graphics.fillCircle(pivotX - 1, pivotY - 1, 2.5);
        };

        if (sin >= 0) drawPivot();

        // === BARREL BASE JOINT ===
        const baseJointX = center.x + cos * 3 + recoilOffsetX;
        const baseJointY = center.y + barrelHeight + sin * 1.5 + recoilOffsetY;
        graphics.fillStyle(0x4a4a4a, alpha);
        graphics.fillEllipse(baseJointX, baseJointY, 15, 9);
        graphics.fillStyle(0x3a3a3a, alpha);
        graphics.fillEllipse(baseJointX, baseJointY, 11, 7);
        graphics.fillStyle(0x2a2a2a, alpha);
        graphics.fillEllipse(baseJointX, baseJointY, 7, 4);

        // === MAIN BARREL BODY (reinforced) ===
        const barrelBaseX = center.x + recoilOffsetX;
        const barrelBaseY = center.y + barrelHeight + recoilOffsetY;

        // Barrel outer shadow
        graphics.lineStyle(barrelWidth + 4, 0x1a1a1a, alpha);
        graphics.lineBetween(barrelBaseX, barrelBaseY + 2, barrelTipX, barrelTipY + 2);

        // Barrel main body - dark iron
        graphics.lineStyle(barrelWidth, 0x2a2a2a, alpha);
        graphics.lineBetween(barrelBaseX, barrelBaseY, barrelTipX, barrelTipY);

        // Barrel highlight strip
        graphics.lineStyle(barrelWidth - 4, 0x3a3a3a, alpha);
        graphics.lineBetween(barrelBaseX, barrelBaseY - 1, barrelTipX, barrelTipY - 1);

        // Bright highlight
        graphics.lineStyle(2, 0x5a5a5a, alpha * 0.85);
        graphics.lineBetween(barrelBaseX, barrelBaseY - 2, barrelTipX, barrelTipY - 2);

        // === IRON BANDS (heavier than level 1) ===
        const bands = [0.12, 0.35, 0.58, 0.82];
        for (const t of bands) {
            const bandX = center.x + cos * barrelLength * t + recoilOffsetX;
            const bandY = center.y + barrelHeight + sin * 0.5 * barrelLength * t + recoilOffsetY;

            // Iron bands with copper rivets
            graphics.fillStyle(0x3a3a3a, alpha);
            graphics.fillEllipse(bandX, bandY, 8, 4.5);
            graphics.fillStyle(0xb87333, alpha * 0.7);
            graphics.fillCircle(bandX - 2, bandY - 1, 1.5);
            graphics.fillCircle(bandX + 2, bandY + 1, 1.5);
            graphics.lineStyle(1, 0x2a2a2a, alpha);
            graphics.strokeEllipse(bandX, bandY, 8, 4.5);
        }

        if (sin < 0) drawPivot();
    }

    private drawCannonLevel3(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding) {
        // LEVEL 3 CANNON: Fortified single-barrel with armor plating and steel reinforcements
        const angle = building?.ballistaAngle ?? Math.PI / 4;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // === ARMORED STEEL FOUNDATION ===
        // Dark steel base with reinforced edges (isometric diamond)
        graphics.fillStyle(tint ?? 0x3a3a4a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);

        // Steel trim edges with subtle blue tint
        graphics.lineStyle(3, 0x4a4a5a, alpha * 0.9);
        graphics.lineBetween(c1.x, c1.y, c2.x, c2.y);
        graphics.lineBetween(c1.x, c1.y, c4.x, c4.y);
        graphics.lineStyle(2, 0x2a2a3a, alpha * 0.8);
        graphics.lineBetween(c2.x, c2.y, c3.x, c3.y);
        graphics.lineBetween(c3.x, c3.y, c4.x, c4.y);

        // Steel corner bolts
        graphics.fillStyle(0x606070, alpha * 0.9);
        graphics.fillCircle(c1.x, c1.y, 3);
        graphics.fillCircle(c2.x, c2.y, 2.5);
        graphics.fillCircle(c3.x, c3.y, 2.5);
        graphics.fillCircle(c4.x, c4.y, 2.5);
        // Bolt highlights
        graphics.fillStyle(0x808090, alpha * 0.6);
        graphics.fillCircle(c1.x - 1, c1.y - 1, 1.5);

        // === HEAVY ROTATING BASE ===
        const baseRadiusX = 22;
        const baseRadiusY = 13;
        const baseY = center.y - 3;

        // Shadow underneath
        graphics.fillStyle(0x1a1a1a, alpha * 0.5);
        graphics.fillEllipse(center.x + 2, baseY + 5, baseRadiusX + 2, baseRadiusY + 1);

        // Main armored base - dark steel
        graphics.fillStyle(0x3a3a4a, alpha);
        graphics.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

        // Inner steel ring
        graphics.lineStyle(3, 0x2a2a3a, alpha * 0.8);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX - 4, baseRadiusY - 2);

        // Armor plates visible on base (wedge sections)
        graphics.fillStyle(0x4a4a5a, alpha * 0.6);
        graphics.beginPath();
        graphics.arc(center.x - 8, baseY, 8, -0.5, 0.8, false);
        graphics.fillPath();
        graphics.beginPath();
        graphics.arc(center.x + 8, baseY, 8, 2.3, 3.6, false);
        graphics.fillPath();

        // Heavy outer ring
        graphics.lineStyle(4, 0x4a4a5a, alpha);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
        graphics.lineStyle(2, 0x5a5a6a, alpha * 0.5);
        graphics.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);

        // === FORTIFIED BARREL SETUP ===
        const barrelHeight = -12;
        const barrelLength = 28;
        const barrelWidth = 12;  // Thicker fortified barrel

        // Recoil animation
        const recoilAmount = (building?.cannonRecoilOffset ?? 0) * 10;
        const recoilOffsetX = -cos * recoilAmount;
        const recoilOffsetY = -sin * 0.5 * recoilAmount;

        // Barrel tip position
        const barrelTipX = center.x + cos * barrelLength + recoilOffsetX;
        const barrelTipY = center.y + barrelHeight + sin * 0.5 * barrelLength + recoilOffsetY;

        // Barrel shadow on ground
        graphics.fillStyle(0x1a1a1a, alpha * 0.4);
        graphics.fillEllipse(center.x + cos * (barrelLength * 0.5) + 3, center.y + 5, barrelLength * 0.7, 6);

        // === ARMORED BARREL CARRIAGE ===
        const supportOffsetX = -sin * 10;
        const supportOffsetY = cos * 5;

        // Left support (heavy steel)
        graphics.fillStyle(0x3a3a4a, alpha);
        graphics.beginPath();
        graphics.moveTo(center.x - supportOffsetX, baseY - supportOffsetY);
        graphics.lineTo(center.x - supportOffsetX * 0.5, center.y + barrelHeight + 5);
        graphics.lineTo(center.x + cos * 5 - supportOffsetX * 0.5, center.y + barrelHeight + sin * 2.5 + 5);
        graphics.lineTo(center.x + cos * 5, center.y + barrelHeight + sin * 2.5);
        graphics.closePath();
        graphics.fillPath();

        // Right support (slightly darker)
        graphics.fillStyle(0x2a2a3a, alpha);
        graphics.beginPath();
        graphics.moveTo(center.x + supportOffsetX, baseY + supportOffsetY);
        graphics.lineTo(center.x + supportOffsetX * 0.5, center.y + barrelHeight + 5);
        graphics.lineTo(center.x + cos * 5 + supportOffsetX * 0.5, center.y + barrelHeight + sin * 2.5 + 5);
        graphics.lineTo(center.x + cos * 5, center.y + barrelHeight + sin * 2.5);
        graphics.closePath();
        graphics.fillPath();

        // Steel bolts on supports
        graphics.fillStyle(0x5a5a6a, alpha * 0.8);
        graphics.fillCircle(center.x - supportOffsetX * 0.7, baseY - supportOffsetY * 0.7 - 3, 2);
        graphics.fillCircle(center.x + supportOffsetX * 0.7, baseY + supportOffsetY * 0.7 - 3, 2);

        // === CENTRAL PIVOT MECHANISM ===
        const drawPivot = () => {
            const pivotX = center.x + recoilOffsetX;
            const pivotY = center.y + barrelHeight + 4 + recoilOffsetY;

            // Heavy steel pivot
            graphics.fillStyle(0x2a2a2a, alpha);
            graphics.fillCircle(pivotX, pivotY, 9);
            graphics.fillStyle(0x3a3a4a, alpha);
            graphics.fillCircle(pivotX, pivotY, 7);
            // Steel center
            graphics.fillStyle(0x5a5a6a, alpha);
            graphics.fillCircle(pivotX, pivotY, 4);
            graphics.fillStyle(0x6a6a7a, alpha * 0.8);
            graphics.fillCircle(pivotX - 1, pivotY - 1, 2);
        };

        if (sin >= 0) drawPivot();

        // === BARREL BASE JOINT ===
        const baseJointX = center.x + cos * 3 + recoilOffsetX;
        const baseJointY = center.y + barrelHeight + sin * 1.5 + recoilOffsetY;
        graphics.fillStyle(0x4a4a5a, alpha);
        graphics.fillEllipse(baseJointX, baseJointY, 14, 9);
        graphics.fillStyle(0x3a3a4a, alpha * 0.8);
        graphics.fillEllipse(baseJointX, baseJointY, 10, 6);

        // === FORTIFIED BARREL ===
        const barrelBaseX = center.x + recoilOffsetX;
        const barrelBaseY = center.y + barrelHeight + recoilOffsetY;

        // Barrel outer shadow
        graphics.lineStyle(barrelWidth + 3, 0x1a1a1a, alpha);
        graphics.lineBetween(barrelBaseX, barrelBaseY + 2, barrelTipX, barrelTipY + 2);

        // Barrel main body - dark steel
        graphics.lineStyle(barrelWidth, 0x3a3a4a, alpha);
        graphics.lineBetween(barrelBaseX, barrelBaseY, barrelTipX, barrelTipY);

        // Barrel secondary layer
        graphics.lineStyle(barrelWidth - 2, 0x4a4a5a, alpha);
        graphics.lineBetween(barrelBaseX, barrelBaseY - 1, barrelTipX, barrelTipY - 1);

        // Barrel highlight strip
        graphics.lineStyle(3, 0x5a5a6a, alpha * 0.9);
        graphics.lineBetween(barrelBaseX, barrelBaseY - 3, barrelTipX, barrelTipY - 3);

        // === ARMOR REINFORCEMENT BANDS ===
        const bands = [0.15, 0.35, 0.55, 0.75];
        for (let i = 0; i < bands.length; i++) {
            const t = bands[i];
            const bandX = barrelBaseX + cos * barrelLength * t;
            const bandY = barrelBaseY + sin * 0.5 * barrelLength * t;

            // Steel reinforcement bands
            graphics.fillStyle(0x4a4a5a, alpha);
            graphics.fillEllipse(bandX, bandY, 9, 5);
            // Highlight on bands
            graphics.fillStyle(0x6a6a7a, alpha * 0.6);
            graphics.fillCircle(bandX - 2, bandY - 1, 2);
            graphics.lineStyle(1, 0x2a2a3a, alpha);
            graphics.strokeEllipse(bandX, bandY, 9, 5);

            // Small rivets on bands
            if (i % 2 === 0) {
                graphics.fillStyle(0x5a5a6a, alpha * 0.7);
                graphics.fillCircle(bandX - 3, bandY, 1.5);
                graphics.fillCircle(bandX + 3, bandY, 1.5);
            }
        }

        // === MUZZLE SHROUD ===
        const muzzleX = barrelTipX;
        const muzzleY = barrelTipY;

        // Heavy muzzle ring
        graphics.fillStyle(0x4a4a5a, alpha);
        graphics.fillEllipse(muzzleX, muzzleY, 8, 5);
        graphics.fillStyle(0x5a5a6a, alpha);
        graphics.fillEllipse(muzzleX, muzzleY, 6, 4);

        // Dark bore
        graphics.fillStyle(0x1a1a1a, alpha);
        graphics.fillEllipse(muzzleX + cos * 2, muzzleY + sin, 4, 2.5);

        if (sin < 0) drawPivot();
    }

    private drawCannonLevel4(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding) {
        // LEVEL 4 CANNON: Dual-barrel reinforced cannon with gold/brass accents and glowing effects
        const angle = building?.ballistaAngle ?? Math.PI / 4;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // === REINFORCED STEEL FOUNDATION ===
        // Dark steel base with gold trim (isometric diamond)
        graphics.fillStyle(tint ?? 0x4a4a5a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);

        // Gold trim edges for premium look
        graphics.lineStyle(3, 0xb8860b, alpha * 0.9);
        graphics.lineBetween(c1.x, c1.y, c2.x, c2.y);
        graphics.lineBetween(c1.x, c1.y, c4.x, c4.y);
        graphics.lineStyle(2, 0x8b6914, alpha * 0.8);
        graphics.lineBetween(c2.x, c2.y, c3.x, c3.y);
        graphics.lineBetween(c3.x, c3.y, c4.x, c4.y);

        // Decorative corner rivets (gold)
        graphics.fillStyle(0xffd700, alpha * 0.9);
        graphics.fillCircle(c1.x, c1.y, 3);
        graphics.fillCircle(c2.x, c2.y, 2);
        graphics.fillCircle(c3.x, c3.y, 2);
        graphics.fillCircle(c4.x, c4.y, 2);

        // === REINFORCED ROTATING BASE ===
        const baseRadiusX = 24;
        const baseRadiusY = 14;
        const baseY = center.y - 3;

        // Shadow underneath
        graphics.fillStyle(0x1a1008, alpha * 0.5);
        graphics.fillEllipse(center.x + 2, baseY + 5, baseRadiusX + 2, baseRadiusY + 1);

        // Main reinforced steel base with dark blue tint
        graphics.fillStyle(0x3a3a4a, alpha);
        graphics.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

        // Inner steel ring
        graphics.lineStyle(3, 0x2a2a3a, alpha * 0.8);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX - 5, baseRadiusY - 3);

        // Glowing energy ring (orange/red for heat effect)
        graphics.lineStyle(2, 0xff6600, alpha * 0.6);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX - 8, baseRadiusY - 5);
        graphics.lineStyle(1, 0xff9900, alpha * 0.4);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX - 9, baseRadiusY - 6);

        // Gold reinforcement outer ring
        graphics.lineStyle(4, 0xb8860b, alpha);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
        graphics.lineStyle(2, 0xffd700, alpha * 0.5);
        graphics.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);

        // === DUAL BARREL SETUP ===
        const barrelHeight = -14;
        const barrelLength = 30;  // Slightly longer barrels
        const barrelWidth = 8;    // Slightly thinner for dual setup
        const barrelSpacing = 5;  // Distance between the two barrels

        // Recoil animation
        const recoilAmount = (building?.cannonRecoilOffset ?? 0) * 10;
        const recoilOffsetX = -cos * recoilAmount;
        const recoilOffsetY = -sin * 0.5 * recoilAmount;

        // Barrel perpendicular offset for dual barrels
        const perpX = -sin * barrelSpacing;
        const perpY = cos * 0.5 * barrelSpacing;

        // Both barrel tip positions
        const barrelTip1X = center.x + cos * barrelLength + recoilOffsetX + perpX;
        const barrelTip1Y = center.y + barrelHeight + sin * 0.5 * barrelLength + recoilOffsetY + perpY;
        const barrelTip2X = center.x + cos * barrelLength + recoilOffsetX - perpX;
        const barrelTip2Y = center.y + barrelHeight + sin * 0.5 * barrelLength + recoilOffsetY - perpY;

        // Barrel shadow on ground
        graphics.fillStyle(0x1a1a1a, alpha * 0.4);
        graphics.fillEllipse(center.x + cos * (barrelLength * 0.5) + 3, center.y + 5, barrelLength * 0.7, 6);

        // === REINFORCED BARREL CARRIAGE ===
        const supportOffsetX = -sin * 10;
        const supportOffsetY = cos * 5;

        // Left support (reinforced steel)
        graphics.fillStyle(0x3a3a4a, alpha);
        graphics.beginPath();
        graphics.moveTo(center.x - supportOffsetX, baseY - supportOffsetY);
        graphics.lineTo(center.x - supportOffsetX * 0.5, center.y + barrelHeight + 5);
        graphics.lineTo(center.x + cos * 6 - supportOffsetX * 0.5, center.y + barrelHeight + sin * 3 + 5);
        graphics.lineTo(center.x + cos * 6, center.y + barrelHeight + sin * 3);
        graphics.closePath();
        graphics.fillPath();

        // Right support
        graphics.fillStyle(0x2a2a3a, alpha);
        graphics.beginPath();
        graphics.moveTo(center.x + supportOffsetX, baseY + supportOffsetY);
        graphics.lineTo(center.x + supportOffsetX * 0.5, center.y + barrelHeight + 5);
        graphics.lineTo(center.x + cos * 6 + supportOffsetX * 0.5, center.y + barrelHeight + sin * 3 + 5);
        graphics.lineTo(center.x + cos * 6, center.y + barrelHeight + sin * 3);
        graphics.closePath();
        graphics.fillPath();

        // Gold trim on supports
        graphics.lineStyle(1, 0xb8860b, alpha * 0.7);
        graphics.lineBetween(center.x - supportOffsetX, baseY - supportOffsetY, center.x + cos * 6, center.y + barrelHeight + sin * 3);
        graphics.lineBetween(center.x + supportOffsetX, baseY + supportOffsetY, center.x + cos * 6, center.y + barrelHeight + sin * 3);

        // === CENTRAL PIVOT MECHANISM (ENHANCED) ===
        const drawPivot = () => {
            const pivotX = center.x + recoilOffsetX;
            const pivotY = center.y + barrelHeight + 4 + recoilOffsetY;

            // Larger reinforced pivot
            graphics.fillStyle(0x2a2a2a, alpha);
            graphics.fillCircle(pivotX, pivotY, 10);
            graphics.fillStyle(0x3a3a4a, alpha);
            graphics.fillCircle(pivotX, pivotY, 8);
            // Gold center accent
            graphics.fillStyle(0xb8860b, alpha);
            graphics.fillCircle(pivotX, pivotY, 5);
            graphics.fillStyle(0xffd700, alpha * 0.8);
            graphics.fillCircle(pivotX - 1, pivotY - 1, 3);
            // Glowing core
            graphics.fillStyle(0xff6600, alpha * 0.5);
            graphics.fillCircle(pivotX, pivotY, 2);
        };

        if (sin >= 0) drawPivot();

        // === BARREL BASE JOINT (REINFORCED) ===
        const baseJointX = center.x + cos * 4 + recoilOffsetX;
        const baseJointY = center.y + barrelHeight + sin * 2 + recoilOffsetY;
        graphics.fillStyle(0x4a4a5a, alpha);
        graphics.fillEllipse(baseJointX, baseJointY, 16, 10);
        graphics.fillStyle(0xb8860b, alpha * 0.8);
        graphics.fillEllipse(baseJointX, baseJointY, 12, 7);
        graphics.fillStyle(0x3a3a4a, alpha);
        graphics.fillEllipse(baseJointX, baseJointY, 8, 5);

        // === DUAL BARRELS ===
        const drawBarrel = (tipX: number, tipY: number, offsetX: number, offsetY: number) => {
            const barrelBaseX = center.x + recoilOffsetX + offsetX;
            const barrelBaseY = center.y + barrelHeight + recoilOffsetY + offsetY;

            // Barrel outer shadow
            graphics.lineStyle(barrelWidth + 3, 0x1a1a1a, alpha);
            graphics.lineBetween(barrelBaseX, barrelBaseY + 2, tipX, tipY + 2);

            // Barrel main body - dark steel with blue tint
            graphics.lineStyle(barrelWidth, 0x2a2a3a, alpha);
            graphics.lineBetween(barrelBaseX, barrelBaseY, tipX, tipY);

            // Barrel highlight strip
            graphics.lineStyle(barrelWidth - 3, 0x3a3a4a, alpha);
            graphics.lineBetween(barrelBaseX, barrelBaseY - 1, tipX, tipY - 1);

            // Bright highlight
            graphics.lineStyle(2, 0x5a5a6a, alpha * 0.9);
            graphics.lineBetween(barrelBaseX, barrelBaseY - 2, tipX, tipY - 2);

            // === GOLD DECORATIVE BANDS ===
            const bands = [0.2, 0.5, 0.8];
            for (const t of bands) {
                const bandX = barrelBaseX + cos * barrelLength * t;
                const bandY = barrelBaseY + sin * 0.5 * barrelLength * t;

                // Gold bands with subtle depth
                graphics.fillStyle(0xb8860b, alpha);
                graphics.fillEllipse(bandX, bandY, 6, 3.5);
                graphics.fillStyle(0xffd700, alpha * 0.7);
                graphics.fillCircle(bandX - 1, bandY - 1, 1.5);
                graphics.lineStyle(1, 0x8b6914, alpha);
                graphics.strokeEllipse(bandX, bandY, 6, 3.5);
            }
        };

        // Draw both barrels
        drawBarrel(barrelTip1X, barrelTip1Y, perpX, perpY);
        drawBarrel(barrelTip2X, barrelTip2Y, -perpX, -perpY);

        // === CONNECTING BRACE BETWEEN BARRELS ===
        const braceT = 0.35;
        const brace1X = center.x + cos * barrelLength * braceT + recoilOffsetX + perpX;
        const brace1Y = center.y + barrelHeight + sin * 0.5 * barrelLength * braceT + recoilOffsetY + perpY;
        const brace2X = center.x + cos * barrelLength * braceT + recoilOffsetX - perpX;
        const brace2Y = center.y + barrelHeight + sin * 0.5 * barrelLength * braceT + recoilOffsetY - perpY;

        graphics.lineStyle(3, 0x3a3a4a, alpha);
        graphics.lineBetween(brace1X, brace1Y, brace2X, brace2Y);
        graphics.lineStyle(1, 0xb8860b, alpha * 0.8);
        graphics.lineBetween(brace1X, brace1Y, brace2X, brace2Y);

        if (sin < 0) drawPivot();
    }

    private drawBallista(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding) {
        // Get ballista state from building if provided
        const angle = building?.ballistaAngle ?? 0; // Default facing right
        const stringTension = building?.ballistaStringTension ?? 0; // 0 = relaxed, 1 = fully drawn
        const boltLoaded = building?.ballistaBoltLoaded ?? true;

        // === STONE FOUNDATION PLATFORM ===
        // Raised stone base with depth
        const baseHeight = 6;

        // Side faces of the platform (isometric 3D effect)
        graphics.fillStyle(0x4a4a4a, alpha);
        graphics.beginPath();
        graphics.moveTo(c2.x, c2.y);
        graphics.lineTo(c3.x, c3.y);
        graphics.lineTo(c3.x, c3.y + baseHeight);
        graphics.lineTo(c2.x, c2.y + baseHeight);
        graphics.closePath();
        graphics.fillPath();

        graphics.fillStyle(0x3a3a3a, alpha);
        graphics.beginPath();
        graphics.moveTo(c3.x, c3.y);
        graphics.lineTo(c4.x, c4.y);
        graphics.lineTo(c4.x, c4.y + baseHeight);
        graphics.lineTo(c3.x, c3.y + baseHeight);
        graphics.closePath();
        graphics.fillPath();

        // Top face
        graphics.fillStyle(tint ?? 0x5a5a5a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);

        // Stone block lines
        graphics.lineStyle(1, 0x4a4a4a, alpha * 0.5);
        const midX = (c1.x + c3.x) / 2;
        const midY = (c1.y + c3.y) / 2;
        graphics.lineBetween(c1.x, c1.y, c3.x, c3.y);
        graphics.lineBetween(c2.x, c2.y, c4.x, c4.y);

        // Border
        graphics.lineStyle(2, 0x3a3a3a, 0.6 * alpha);
        graphics.strokePoints([c1, c2, c3, c4], true, true);

        // === WOODEN ROTATING PLATFORM ===
        const baseRadiusX = 22;
        const baseRadiusY = 13;
        const baseY = center.y - 4;

        // Shadow under platform
        graphics.fillStyle(0x1a1a1a, alpha * 0.4);
        graphics.fillEllipse(center.x + 2, baseY + 4, baseRadiusX, baseRadiusY);

        // Main wooden platform
        graphics.fillStyle(0x5a4030, alpha);
        graphics.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

        // Wood plank lines (radial pattern)
        graphics.lineStyle(1, 0x3a2515, alpha * 0.5);
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI;
            const x1 = center.x + Math.cos(ang) * (baseRadiusX - 2);
            const y1 = baseY + Math.sin(ang) * (baseRadiusY - 1);
            const x2 = center.x - Math.cos(ang) * (baseRadiusX - 2);
            const y2 = baseY - Math.sin(ang) * (baseRadiusY - 1);
            graphics.lineBetween(x1, y1, x2, y2);
        }

        // Iron outer ring
        graphics.lineStyle(3, 0x4a4a4a, alpha);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
        graphics.lineStyle(1, 0x606060, alpha * 0.6);
        graphics.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);

        // Iron rivets around edge
        graphics.fillStyle(0x555555, alpha);
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const rx = center.x + Math.cos(ang) * (baseRadiusX - 3);
            const ry = baseY + Math.sin(ang) * (baseRadiusY - 2);
            graphics.fillCircle(rx, ry, 2);
        }

        // Calculate rotation for the crossbow mechanism
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // === CENTRAL PIVOT MECHANISM ===
        // Heavy dark grey pivot hub on the wooden platform
        graphics.fillStyle(0x2a2a2a, alpha);
        graphics.fillCircle(center.x, baseY, 8);
        graphics.fillStyle(0x3a3a3a, alpha);
        graphics.fillCircle(center.x, baseY - 1, 6);
        graphics.fillStyle(0x444444, alpha);
        graphics.fillCircle(center.x, baseY - 2, 4);
        // Highlight
        graphics.fillStyle(0x606060, alpha * 0.6);
        graphics.fillCircle(center.x - 1, baseY - 3, 2);

        // === MASSIVE CROSSBOW ARMS ===
        const armLength = 28; // Much bigger arms
        const armWidth = 5;   // Thicker arms
        const bowHeight = -16; // Higher mounting point

        // Arm tip positions (perpendicular to firing direction)
        const leftArmX = center.x + (-sin) * armLength;
        const leftArmY = center.y + bowHeight + (cos * 0.5) * armLength;
        const rightArmX = center.x + (sin) * armLength;
        const rightArmY = center.y + bowHeight + (-cos * 0.5) * armLength;

        // Draw curved bow arms with multiple layers for depth
        // Outer shadow
        graphics.lineStyle(armWidth + 3, 0x2a1a10, alpha);
        graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
        graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

        // Main wooden arm
        graphics.lineStyle(armWidth + 1, 0x5a3520, alpha);
        graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
        graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

        // Wood highlight
        graphics.lineStyle(armWidth - 1, 0x7a5540, alpha);
        graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
        graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

        // Center wood grain
        graphics.lineStyle(2, 0x6a4530, alpha);
        graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
        graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

        // Metal reinforcement bands on arms
        const bandDist1 = 0.3;
        const bandDist2 = 0.6;
        const bandDist3 = 0.85;

        for (const dist of [bandDist1, bandDist2, bandDist3]) {
            const leftBandX = center.x + (-sin) * armLength * dist;
            const leftBandY = center.y + bowHeight + (cos * 0.5) * armLength * dist;
            const rightBandX = center.x + (sin) * armLength * dist;
            const rightBandY = center.y + bowHeight + (-cos * 0.5) * armLength * dist;

            graphics.fillStyle(0x555555, alpha);
            graphics.fillCircle(leftBandX, leftBandY, 3);
            graphics.fillCircle(rightBandX, rightBandY, 3);
            graphics.fillStyle(0x777777, alpha * 0.5);
            graphics.fillCircle(leftBandX - 0.5, leftBandY - 0.5, 1.5);
            graphics.fillCircle(rightBandX - 0.5, rightBandY - 0.5, 1.5);
        }

        // Large metal arm tips with hooks for string
        graphics.fillStyle(0x3a3a3a, alpha);
        graphics.fillCircle(leftArmX, leftArmY, 5);
        graphics.fillCircle(rightArmX, rightArmY, 5);
        graphics.fillStyle(0x555555, alpha);
        graphics.fillCircle(leftArmX, leftArmY, 3);
        graphics.fillCircle(rightArmX, rightArmY, 3);
        graphics.fillStyle(0x888888, alpha * 0.5);
        graphics.fillCircle(leftArmX - 1, leftArmY - 1, 1.5);
        graphics.fillCircle(rightArmX - 1, rightArmY - 1, 1.5);

        // Calculate bowstring position (needed for bolt placement)
        const stringPullback = stringTension * 16;
        const stringCenterX = center.x + cos * (-stringPullback);
        const stringCenterY = center.y + bowHeight + sin * 0.5 * (-stringPullback);

        // === MAIN RAIL/STOCK ===
        const railLength = 28;
        const railEndX = center.x + cos * railLength;
        const railEndY = center.y + bowHeight + sin * 0.5 * railLength;
        const railBackX = center.x + cos * (-12);
        const railBackY = center.y + bowHeight + sin * 0.5 * (-12);

        // Draw thick wooden rail
        graphics.lineStyle(10, 0x2a1a10, alpha);
        graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);
        graphics.lineStyle(8, 0x3a2515, alpha);
        graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);
        graphics.lineStyle(5, 0x4a3520, alpha);
        graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);

        // Rail groove for bolt
        graphics.lineStyle(2, 0x2a1a10, alpha * 0.7);
        graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);

        // Metal reinforcement plates on rail
        const plateDist = 0.4;
        const plateX = center.x + cos * railLength * plateDist;
        const plateY = center.y + bowHeight + sin * 0.5 * railLength * plateDist;
        graphics.fillStyle(0x444444, alpha);
        graphics.fillRect(plateX - 4, plateY - 2, 8, 4);
        graphics.fillStyle(0x666666, alpha * 0.5);
        graphics.fillRect(plateX - 3, plateY - 1, 6, 2);

        // === BOLT ===
        if (boltLoaded) {
            const boltLength = 24;
            const boltStartX = stringCenterX;
            const boltStartY = stringCenterY;
            const boltEndX = boltStartX + cos * boltLength;
            const boltEndY = boltStartY + sin * 0.5 * boltLength;

            // Narrower bolt shaft
            graphics.lineStyle(3, 0x4a3a25, alpha);
            graphics.lineBetween(boltStartX, boltStartY, boltEndX, boltEndY);
            graphics.lineStyle(2, 0x5d4e37, alpha);
            graphics.lineBetween(boltStartX, boltStartY, boltEndX, boltEndY);
            graphics.lineStyle(1, 0x7d6e57, alpha);
            graphics.lineBetween(boltStartX, boltStartY, boltEndX, boltEndY);

            // Arrowhead (smaller)
            const headLength = 8;
            const headWidth = 4;
            const headTipX = boltEndX + cos * headLength;
            const headTipY = boltEndY + sin * 0.5 * headLength;

            graphics.fillStyle(0x2a2a2a, alpha);
            graphics.beginPath();
            graphics.moveTo(headTipX, headTipY);
            graphics.lineTo(boltEndX + (-sin) * headWidth, boltEndY + (cos * 0.5) * headWidth);
            graphics.lineTo(boltEndX + (sin) * headWidth, boltEndY + (-cos * 0.5) * headWidth);
            graphics.closePath();
            graphics.fillPath();

            // Metal shine on head
            graphics.fillStyle(0x555555, alpha * 0.6);
            graphics.beginPath();
            graphics.moveTo(headTipX, headTipY);
            graphics.lineTo(boltEndX + (-sin) * headWidth * 0.5, boltEndY + (cos * 0.5) * headWidth * 0.5);
            graphics.lineTo(boltEndX, boltEndY);
            graphics.closePath();
            graphics.fillPath();

            // Smaller fletching
            const fletchX = boltStartX + cos * 3;
            const fletchY = boltStartY + sin * 0.5 * 3;
            graphics.fillStyle(0xcc2222, alpha);
            graphics.beginPath();
            graphics.moveTo(fletchX, fletchY);
            graphics.lineTo(fletchX + (-sin) * 5, fletchY + (cos * 0.5) * 5 - 3);
            graphics.lineTo(boltStartX + cos * 8, boltStartY + sin * 0.5 * 8);
            graphics.closePath();
            graphics.fillPath();
            graphics.beginPath();
            graphics.moveTo(fletchX, fletchY);
            graphics.lineTo(fletchX + (sin) * 5, fletchY + (-cos * 0.5) * 5 - 3);
            graphics.lineTo(boltStartX + cos * 8, boltStartY + sin * 0.5 * 8);
            graphics.closePath();
            graphics.fillPath();
        }

        // === BOWSTRING (rendered on top of bolt) ===
        graphics.lineStyle(3, 0x888888, alpha);
        graphics.lineBetween(leftArmX, leftArmY, stringCenterX, stringCenterY);
        graphics.lineBetween(rightArmX, rightArmY, stringCenterX, stringCenterY);
        graphics.lineStyle(2, 0xaaaaaa, alpha);
        graphics.lineBetween(leftArmX, leftArmY, stringCenterX, stringCenterY);
        graphics.lineBetween(rightArmX, rightArmY, stringCenterX, stringCenterY);

        // String tension glow when drawn
        if (stringTension > 0.3) {
            graphics.lineStyle(4, 0xffffff, alpha * 0.15 * stringTension);
            graphics.lineBetween(leftArmX, leftArmY, stringCenterX, stringCenterY);
            graphics.lineBetween(rightArmX, rightArmY, stringCenterX, stringCenterY);
        }

    }

    private drawBallistaLevel2(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding) {
        // LEVEL 2 BALLISTA: Reinforced with bronze accents and improved mechanism
        const angle = building?.ballistaAngle ?? 0;
        const stringTension = building?.ballistaStringTension ?? 0;
        const boltLoaded = building?.ballistaBoltLoaded ?? true;

        // === REINFORCED STONE FOUNDATION ===
        const baseHeight = 8; // Taller base

        // Side faces with stone texture
        graphics.fillStyle(0x4a4a4a, alpha);
        graphics.beginPath();
        graphics.moveTo(c2.x, c2.y);
        graphics.lineTo(c3.x, c3.y);
        graphics.lineTo(c3.x, c3.y + baseHeight);
        graphics.lineTo(c2.x, c2.y + baseHeight);
        graphics.closePath();
        graphics.fillPath();

        graphics.fillStyle(0x3a3a3a, alpha);
        graphics.beginPath();
        graphics.moveTo(c3.x, c3.y);
        graphics.lineTo(c4.x, c4.y);
        graphics.lineTo(c4.x, c4.y + baseHeight);
        graphics.lineTo(c3.x, c3.y + baseHeight);
        graphics.closePath();
        graphics.fillPath();

        // Top face with improved stone
        graphics.fillStyle(tint ?? 0x606060, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);

        // Stone block pattern
        graphics.lineStyle(1, 0x4a4a4a, alpha * 0.6);
        graphics.lineBetween(c1.x, c1.y, c3.x, c3.y);
        graphics.lineBetween(c2.x, c2.y, c4.x, c4.y);
        // Additional cross pattern
        const mid12 = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
        const mid34 = { x: (c3.x + c4.x) / 2, y: (c3.y + c4.y) / 2 };
        graphics.lineBetween(mid12.x, mid12.y, mid34.x, mid34.y);

        // Dark grey corner accents
        graphics.fillStyle(0x444444, alpha * 0.8);
        graphics.fillCircle(c1.x, c1.y, 3);
        graphics.fillCircle(c2.x, c2.y, 2.5);
        graphics.fillCircle(c3.x, c3.y, 2.5);
        graphics.fillCircle(c4.x, c4.y, 2.5);

        // Border
        graphics.lineStyle(2, 0x3a3a3a, 0.7 * alpha);
        graphics.strokePoints([c1, c2, c3, c4], true, true);

        // === REINFORCED WOODEN PLATFORM ===
        const baseRadiusX = 24;
        const baseRadiusY = 14;
        const baseY = center.y - 5;

        // Shadow
        graphics.fillStyle(0x1a1a1a, alpha * 0.4);
        graphics.fillEllipse(center.x + 2, baseY + 5, baseRadiusX, baseRadiusY);

        // Main platform - darker wood
        graphics.fillStyle(0x4a3525, alpha);
        graphics.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

        // Wood planks
        graphics.lineStyle(1, 0x2a1a10, alpha * 0.5);
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI;
            const x1 = center.x + Math.cos(ang) * (baseRadiusX - 2);
            const y1 = baseY + Math.sin(ang) * (baseRadiusY - 1);
            const x2 = center.x - Math.cos(ang) * (baseRadiusX - 2);
            const y2 = baseY - Math.sin(ang) * (baseRadiusY - 1);
            graphics.lineBetween(x1, y1, x2, y2);
        }

        // Dark grey outer ring
        graphics.lineStyle(4, 0x3a3a3a, alpha);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
        graphics.lineStyle(2, 0x555555, alpha * 0.5);
        graphics.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);

        // Dark grey rivets
        graphics.fillStyle(0x444444, alpha);
        for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI * 2;
            const rx = center.x + Math.cos(ang) * (baseRadiusX - 3);
            const ry = baseY + Math.sin(ang) * (baseRadiusY - 2);
            graphics.fillCircle(rx, ry, 2.5);
            graphics.fillStyle(0x666666, alpha * 0.5);
            graphics.fillCircle(rx - 0.5, ry - 0.5, 1);
            graphics.fillStyle(0x444444, alpha);
        }

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // === DARK GREY PIVOT MECHANISM ===
        graphics.fillStyle(0x2a2a2a, alpha);
        graphics.fillCircle(center.x, baseY, 10);
        graphics.fillStyle(0x3a3a3a, alpha);
        graphics.fillCircle(center.x, baseY - 1, 7);
        graphics.fillStyle(0x444444, alpha);
        graphics.fillCircle(center.x, baseY - 2, 4);
        graphics.fillStyle(0x666666, alpha * 0.5);
        graphics.fillCircle(center.x - 1, baseY - 3, 2);

        // === REINFORCED CROSSBOW ARMS ===
        const armLength = 30;
        const armWidth = 6;
        const bowHeight = -18;

        const leftArmX = center.x + (-sin) * armLength;
        const leftArmY = center.y + bowHeight + (cos * 0.5) * armLength;
        const rightArmX = center.x + (sin) * armLength;
        const rightArmY = center.y + bowHeight + (-cos * 0.5) * armLength;

        // Outer shadow
        graphics.lineStyle(armWidth + 4, 0x1a0a05, alpha);
        graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
        graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

        // Dark wood arm
        graphics.lineStyle(armWidth + 2, 0x3a2515, alpha);
        graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
        graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

        // Wood core
        graphics.lineStyle(armWidth, 0x5a3520, alpha);
        graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
        graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

        // Wood highlight
        graphics.lineStyle(3, 0x6a4530, alpha);
        graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
        graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

        // Dark grey reinforcement bands
        const bandDist1 = 0.25;
        const bandDist2 = 0.5;
        const bandDist3 = 0.75;

        for (const dist of [bandDist1, bandDist2, bandDist3]) {
            const leftBandX = center.x + (-sin) * armLength * dist;
            const leftBandY = center.y + bowHeight + (cos * 0.5) * armLength * dist;
            const rightBandX = center.x + (sin) * armLength * dist;
            const rightBandY = center.y + bowHeight + (-cos * 0.5) * armLength * dist;

            graphics.fillStyle(0x333333, alpha);
            graphics.fillCircle(leftBandX, leftBandY, 4);
            graphics.fillCircle(rightBandX, rightBandY, 4);
            graphics.fillStyle(0x555555, alpha * 0.6);
            graphics.fillCircle(leftBandX - 0.5, leftBandY - 0.5, 2);
            graphics.fillCircle(rightBandX - 0.5, rightBandY - 0.5, 2);
        }

        // Dark grey arm tips
        graphics.fillStyle(0x2a2a2a, alpha);
        graphics.fillCircle(leftArmX, leftArmY, 6);
        graphics.fillCircle(rightArmX, rightArmY, 6);
        graphics.fillStyle(0x444444, alpha);
        graphics.fillCircle(leftArmX, leftArmY, 4);
        graphics.fillCircle(rightArmX, rightArmY, 4);
        graphics.fillStyle(0x666666, alpha * 0.6);
        graphics.fillCircle(leftArmX - 1, leftArmY - 1, 2);
        graphics.fillCircle(rightArmX - 1, rightArmY - 1, 2);

        // String position
        const stringPullback = stringTension * 18;
        const stringCenterX = center.x + cos * (-stringPullback);
        const stringCenterY = center.y + bowHeight + sin * 0.5 * (-stringPullback);

        // === REINFORCED RAIL ===
        const railLength = 30;
        const railEndX = center.x + cos * railLength;
        const railEndY = center.y + bowHeight + sin * 0.5 * railLength;
        const railBackX = center.x + cos * (-14);
        const railBackY = center.y + bowHeight + sin * 0.5 * (-14);

        graphics.lineStyle(12, 0x1a0a05, alpha);
        graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);
        graphics.lineStyle(10, 0x2a1510, alpha);
        graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);
        graphics.lineStyle(6, 0x3a2515, alpha);
        graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);
        graphics.lineStyle(2, 0x1a0a05, alpha * 0.7);
        graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);

        // Dark grey rail plates
        for (const t of [0.3, 0.6]) {
            const plateX = center.x + cos * railLength * t;
            const plateY = center.y + bowHeight + sin * 0.5 * railLength * t;
            graphics.fillStyle(0x444444, alpha);
            graphics.fillEllipse(plateX, plateY, 5, 3);
            graphics.fillStyle(0x666666, alpha * 0.5);
            graphics.fillCircle(plateX - 1, plateY - 1, 1.5);
        }

        // === BOLT ===
        if (boltLoaded) {
            const boltLength = 26;
            const boltStartX = stringCenterX;
            const boltStartY = stringCenterY;
            const boltEndX = boltStartX + cos * boltLength;
            const boltEndY = boltStartY + sin * 0.5 * boltLength;

            graphics.lineStyle(4, 0x3a2a15, alpha);
            graphics.lineBetween(boltStartX, boltStartY, boltEndX, boltEndY);
            graphics.lineStyle(2, 0x5d4e37, alpha);
            graphics.lineBetween(boltStartX, boltStartY, boltEndX, boltEndY);

            // Arrowhead
            const headLength = 10;
            const headWidth = 5;
            const headTipX = boltEndX + cos * headLength;
            const headTipY = boltEndY + sin * 0.5 * headLength;

            graphics.fillStyle(0x2a2a2a, alpha);
            graphics.beginPath();
            graphics.moveTo(headTipX, headTipY);
            graphics.lineTo(boltEndX + (-sin) * headWidth, boltEndY + (cos * 0.5) * headWidth);
            graphics.lineTo(boltEndX + (sin) * headWidth, boltEndY + (-cos * 0.5) * headWidth);
            graphics.closePath();
            graphics.fillPath();

            graphics.fillStyle(0x555555, alpha * 0.6);
            graphics.beginPath();
            graphics.moveTo(headTipX, headTipY);
            graphics.lineTo(boltEndX + (-sin) * headWidth * 0.4, boltEndY + (cos * 0.5) * headWidth * 0.4);
            graphics.lineTo(boltEndX, boltEndY);
            graphics.closePath();
            graphics.fillPath();

            // Dark grey fletching
            const fletchX = boltStartX + cos * 3;
            const fletchY = boltStartY + sin * 0.5 * 3;
            graphics.fillStyle(0x444444, alpha);
            graphics.beginPath();
            graphics.moveTo(fletchX, fletchY);
            graphics.lineTo(fletchX + (-sin) * 6, fletchY + (cos * 0.5) * 6 - 3);
            graphics.lineTo(boltStartX + cos * 9, boltStartY + sin * 0.5 * 9);
            graphics.closePath();
            graphics.fillPath();
            graphics.beginPath();
            graphics.moveTo(fletchX, fletchY);
            graphics.lineTo(fletchX + (sin) * 6, fletchY + (-cos * 0.5) * 6 - 3);
            graphics.lineTo(boltStartX + cos * 9, boltStartY + sin * 0.5 * 9);
            graphics.closePath();
            graphics.fillPath();
        }

        // === BOWSTRING ===
        graphics.lineStyle(3, 0x888888, alpha);
        graphics.lineBetween(leftArmX, leftArmY, stringCenterX, stringCenterY);
        graphics.lineBetween(rightArmX, rightArmY, stringCenterX, stringCenterY);
        graphics.lineStyle(2, 0xbbbbbb, alpha);
        graphics.lineBetween(leftArmX, leftArmY, stringCenterX, stringCenterY);
        graphics.lineBetween(rightArmX, rightArmY, stringCenterX, stringCenterY);

        if (stringTension > 0.3) {
            graphics.lineStyle(5, 0xffffff, alpha * 0.2 * stringTension);
            graphics.lineBetween(leftArmX, leftArmY, stringCenterX, stringCenterY);
            graphics.lineBetween(rightArmX, rightArmY, stringCenterX, stringCenterY);
        }

    }

    private drawXBow(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding) {
        // X-Bow state
        const angle = building?.ballistaAngle ?? 0;
        const stringTension = building?.ballistaStringTension ?? 0;
        const time = this.time.now;

        // Calculate rotation
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const heightOffset = -18; // Height above ground

        // === HEAVY FORTIFIED STONE BASE ===
        const baseHeight = 8;

        // Side faces (isometric depth)
        graphics.fillStyle(0x5a5a5a, alpha);
        graphics.beginPath();
        graphics.moveTo(c2.x, c2.y);
        graphics.lineTo(c3.x, c3.y);
        graphics.lineTo(c3.x, c3.y + baseHeight);
        graphics.lineTo(c2.x, c2.y + baseHeight);
        graphics.closePath();
        graphics.fillPath();

        graphics.fillStyle(0x4a4a4a, alpha);
        graphics.beginPath();
        graphics.moveTo(c3.x, c3.y);
        graphics.lineTo(c4.x, c4.y);
        graphics.lineTo(c4.x, c4.y + baseHeight);
        graphics.lineTo(c3.x, c3.y + baseHeight);
        graphics.closePath();
        graphics.fillPath();

        // Top face
        graphics.fillStyle(tint ?? 0x6a6a6a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);

        // Stone block pattern
        graphics.lineStyle(1, 0x5a5a5a, alpha * 0.5);
        graphics.lineBetween(c1.x, c1.y, c3.x, c3.y);
        graphics.lineBetween(c2.x, c2.y, c4.x, c4.y);

        // Border
        graphics.lineStyle(2, 0x4a4a4a, 0.7 * alpha);
        graphics.strokePoints([c1, c2, c3, c4], true, true);

        // === METAL ROTATING PLATFORM ===
        const baseRadiusX = 24;
        const baseRadiusY = 14;
        const baseY = center.y - 4;

        // Shadow
        graphics.fillStyle(0x1a1a1a, alpha * 0.4);
        graphics.fillEllipse(center.x + 2, baseY + 4, baseRadiusX, baseRadiusY);

        // Dark metal platform
        graphics.fillStyle(0x3a3a4a, alpha);
        graphics.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

        // Metal segment lines
        graphics.lineStyle(1, 0x2a2a3a, alpha * 0.6);
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const x1 = center.x + Math.cos(ang) * (baseRadiusX - 2);
            const y1 = baseY + Math.sin(ang) * (baseRadiusY - 1);
            graphics.lineBetween(center.x, baseY, x1, y1);
        }

        // Outer ring
        graphics.lineStyle(3, 0x4a4a5a, alpha);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
        graphics.lineStyle(1, 0x5a5a6a, alpha * 0.6);
        graphics.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);

        // Bolts
        graphics.fillStyle(0x555560, alpha);
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const rx = center.x + Math.cos(ang) * (baseRadiusX - 3);
            const ry = baseY + Math.sin(ang) * (baseRadiusY - 2);
            graphics.fillCircle(rx, ry, 2);
        }

        // === CENTRAL PIVOT MECHANISM ===
        graphics.fillStyle(0x2a2a3a, alpha);
        graphics.fillCircle(center.x, baseY, 8);
        graphics.fillStyle(0x3a3a4a, alpha);
        graphics.fillCircle(center.x, baseY - 1, 6);
        graphics.fillStyle(0x4a4a5a, alpha);
        graphics.fillCircle(center.x, baseY - 2, 4);
        graphics.fillStyle(0x5a5a6a, alpha * 0.6);
        graphics.fillCircle(center.x - 1, baseY - 3, 2);

        // === CROSSBOW BODY ===
        // Define Front (Tip) and Back (Stock) relative to center using angle
        // Front is +d along angle
        const frontX = center.x + cos * 20;
        const frontY = center.y + heightOffset + sin * 0.5 * 20;
        const backX = center.x + cos * -20;
        const backY = center.y + heightOffset + sin * 0.5 * -20;

        // Draw Stock/Rail
        graphics.lineStyle(10, 0x3a2515, alpha);
        graphics.lineBetween(backX, backY, frontX, frontY);
        // Highlight
        graphics.lineStyle(6, 0x5a3520, alpha);
        graphics.lineBetween(backX, backY, frontX, frontY);

        // === ARMS (Mounted at Front) ===
        // Arms extend perpendicular to aim
        const armSpan = 30;
        const armX = -sin * armSpan;
        const armY = cos * 0.5 * armSpan;

        // Mount point slightly behind tip
        const mountX = center.x + cos * 15;
        const mountY = center.y + heightOffset + sin * 0.5 * 15;

        const lArmX = mountX + armX;
        const lArmY = mountY + armY;
        const rArmX = mountX - armX;
        const rArmY = mountY - armY;

        graphics.lineStyle(5, 0x4a2a10, alpha);
        graphics.lineBetween(mountX, mountY, lArmX, lArmY);
        graphics.lineBetween(mountX, mountY, rArmX, rArmY);

        // Tips
        graphics.fillStyle(0x888888, alpha);
        graphics.fillCircle(lArmX, lArmY, 3);
        graphics.fillCircle(rArmX, rArmY, 3);

        // === STRING (Single) ===
        // Connects tips to Nock. Nock moves with tension.
        const pull = stringTension * 12; // 0 to 12px back
        // Resting nock position (mid-rail) -> Pulled back (near stock)
        // Resting: -5. Pulled: -17.
        const nockOffset = -5 - pull;
        const nockX = center.x + cos * nockOffset;
        const nockY = center.y + heightOffset + sin * 0.5 * nockOffset;

        graphics.lineStyle(1.5, 0xdddddd, alpha); // Thin string
        graphics.lineBetween(lArmX, lArmY, nockX, nockY);
        graphics.lineBetween(rArmX, rArmY, nockX, nockY);

        // === BOLT (If loaded) ===
        if (stringTension > 0.1) {
            const boltTipX = frontX;
            const boltTipY = frontY;
            graphics.lineStyle(2, 0xffff00, alpha);
            graphics.lineBetween(nockX, nockY, boltTipX, boltTipY);
        }

        // Firing Glow
        const firingGlow = 0.3 + Math.sin(time / 50) * 0.2;
        graphics.fillStyle(0xff8844, alpha * firingGlow);
        graphics.fillCircle(frontX, frontY, 4);
    }

    private drawXBowLevel2(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding) {
        // LEVEL 2 X-BOW: Enhanced with purple/magenta accents and energy effects
        const angle = building?.ballistaAngle ?? 0;
        const stringTension = building?.ballistaStringTension ?? 0;
        const time = this.time.now;

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const heightOffset = -20; // Slightly higher

        // === ENHANCED FORTIFIED BASE ===
        const baseHeight = 10;

        // Side faces with purple tint
        graphics.fillStyle(0x5a5a6a, alpha);
        graphics.beginPath();
        graphics.moveTo(c2.x, c2.y);
        graphics.lineTo(c3.x, c3.y);
        graphics.lineTo(c3.x, c3.y + baseHeight);
        graphics.lineTo(c2.x, c2.y + baseHeight);
        graphics.closePath();
        graphics.fillPath();

        graphics.fillStyle(0x4a4a5a, alpha);
        graphics.beginPath();
        graphics.moveTo(c3.x, c3.y);
        graphics.lineTo(c4.x, c4.y);
        graphics.lineTo(c4.x, c4.y + baseHeight);
        graphics.lineTo(c3.x, c3.y + baseHeight);
        graphics.closePath();
        graphics.fillPath();

        // Top face
        graphics.fillStyle(tint ?? 0x6a6a7a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);

        // Stone pattern
        graphics.lineStyle(1, 0x5a5a6a, alpha * 0.5);
        graphics.lineBetween(c1.x, c1.y, c3.x, c3.y);
        graphics.lineBetween(c2.x, c2.y, c4.x, c4.y);
        const mid12 = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
        const mid34 = { x: (c3.x + c4.x) / 2, y: (c3.y + c4.y) / 2 };
        graphics.lineBetween(mid12.x, mid12.y, mid34.x, mid34.y);

        // Dark grey corner accents
        graphics.fillStyle(0x444444, alpha * 0.9);
        graphics.fillCircle(c1.x, c1.y, 4);
        graphics.fillCircle(c2.x, c2.y, 3);
        graphics.fillCircle(c3.x, c3.y, 3);
        graphics.fillCircle(c4.x, c4.y, 3);
        // Subtle grey glow
        graphics.fillStyle(0x666666, alpha * 0.4);
        graphics.fillCircle(c1.x, c1.y, 6);

        graphics.lineStyle(2, 0x4a4a5a, 0.7 * alpha);
        graphics.strokePoints([c1, c2, c3, c4], true, true);

        // === ENHANCED METAL PLATFORM ===
        const baseRadiusX = 26;
        const baseRadiusY = 15;
        const baseY = center.y - 5;

        // Shadow
        graphics.fillStyle(0x1a1a2a, alpha * 0.4);
        graphics.fillEllipse(center.x + 2, baseY + 5, baseRadiusX, baseRadiusY);

        // Dark grey metal platform
        graphics.fillStyle(0x333333, alpha);
        graphics.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

        // Geometric pattern
        graphics.lineStyle(1, 0x444444, alpha * 0.4);
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2 + time / 2000;
            const x1 = center.x + Math.cos(ang) * (baseRadiusX - 2);
            const y1 = baseY + Math.sin(ang) * (baseRadiusY - 1);
            graphics.lineBetween(center.x, baseY, x1, y1);
        }

        // Dark grey outer ring
        graphics.lineStyle(4, 0x3a3a3a, alpha);
        graphics.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
        graphics.lineStyle(2, 0x555555, alpha * 0.5);
        graphics.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);

        // Dark grey rivets
        graphics.fillStyle(0x444444, alpha);
        for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI * 2;
            const rx = center.x + Math.cos(ang) * (baseRadiusX - 3);
            const ry = baseY + Math.sin(ang) * (baseRadiusY - 2);
            graphics.fillCircle(rx, ry, 2.5);
            graphics.fillStyle(0x666666, alpha * 0.5);
            graphics.fillCircle(rx - 0.5, ry - 0.5, 1);
            graphics.fillStyle(0x444444, alpha);
        }

        // === ENHANCED DARK GREY PIVOT ===
        graphics.fillStyle(0x2a2a2a, alpha);
        graphics.fillCircle(center.x, baseY, 10);
        graphics.fillStyle(0x3a3a3a, alpha);
        graphics.fillCircle(center.x, baseY - 1, 7);
        graphics.fillStyle(0x444444, alpha);
        graphics.fillCircle(center.x, baseY - 2, 4);
        // Core highlight
        graphics.fillStyle(0x666666, alpha * 0.6);
        graphics.fillCircle(center.x, baseY - 2, 2);

        // === ENHANCED CROSSBOW BODY ===
        const frontX = center.x + cos * 22;
        const frontY = center.y + heightOffset + sin * 0.5 * 22;
        const backX = center.x + cos * -22;
        const backY = center.y + heightOffset + sin * 0.5 * -22;

        // Enhanced rail
        graphics.lineStyle(12, 0x2a2a3a, alpha);
        graphics.lineBetween(backX, backY, frontX, frontY);
        graphics.lineStyle(8, 0x333333, alpha);
        graphics.lineBetween(backX, backY, frontX, frontY);
        graphics.lineStyle(4, 0x444444, alpha);
        graphics.lineBetween(backX, backY, frontX, frontY);

        // Dark grey line along rail
        graphics.lineStyle(2, 0x444444, alpha * 0.7);
        graphics.lineBetween(backX, backY, frontX, frontY);

        // === ENHANCED ARMS ===
        const armSpan = 34;
        const armX = -sin * armSpan;
        const armY = cos * 0.5 * armSpan;

        const mountX = center.x + cos * 17;
        const mountY = center.y + heightOffset + sin * 0.5 * 17;

        const lArmX = mountX + armX;
        const lArmY = mountY + armY;
        const rArmX = mountX - armX;
        const rArmY = mountY - armY;

        // Shadow
        graphics.lineStyle(7, 0x1a1a2a, alpha);
        graphics.lineBetween(mountX, mountY, lArmX, lArmY);
        graphics.lineBetween(mountX, mountY, rArmX, rArmY);

        // Dark arms
        graphics.lineStyle(5, 0x333333, alpha);
        graphics.lineBetween(mountX, mountY, lArmX, lArmY);
        graphics.lineBetween(mountX, mountY, rArmX, rArmY);

        // Arm highlights
        graphics.lineStyle(3, 0x444444, alpha);
        graphics.lineBetween(mountX, mountY, lArmX, lArmY);
        graphics.lineBetween(mountX, mountY, rArmX, rArmY);

        // Dark grey tips
        graphics.fillStyle(0x2a2a2a, alpha);
        graphics.fillCircle(lArmX, lArmY, 5);
        graphics.fillCircle(rArmX, rArmY, 5);
        graphics.fillStyle(0x444444, alpha);
        graphics.fillCircle(lArmX, lArmY, 3);
        graphics.fillCircle(rArmX, rArmY, 3);
        graphics.fillStyle(0x666666, alpha * 0.6);
        graphics.fillCircle(lArmX - 0.5, lArmY - 0.5, 1.5);
        graphics.fillCircle(rArmX - 0.5, rArmY - 0.5, 1.5);

        // === ENERGY STRING ===
        const pull = stringTension * 14;
        const nockOffset = -6 - pull;
        const nockX = center.x + cos * nockOffset;
        const nockY = center.y + heightOffset + sin * 0.5 * nockOffset;

        // Reinforced string effect
        graphics.lineStyle(2, 0x555555, alpha);
        graphics.lineBetween(lArmX, lArmY, nockX, nockY);
        graphics.lineBetween(rArmX, rArmY, nockX, nockY);
        graphics.lineStyle(1, 0x777777, alpha * 0.7);
        graphics.lineBetween(lArmX, lArmY, nockX, nockY);
        graphics.lineBetween(rArmX, rArmY, nockX, nockY);

        // Reinforced bolt
        if (stringTension > 0.1) {
            const boltTipX = frontX;
            const boltTipY = frontY;
            graphics.lineStyle(4, 0x333333, alpha * 0.5);
            graphics.lineBetween(nockX, nockY, boltTipX, boltTipY);
            graphics.lineStyle(2, 0x555555, alpha);
            graphics.lineBetween(nockX, nockY, boltTipX, boltTipY);
            graphics.lineStyle(1, 0x777777, alpha * 0.8);
            graphics.lineBetween(nockX, nockY, boltTipX, boltTipY);
        }

        // Subtle firing effect
        const firingGlow = 0.2 + Math.sin(time / 60) * 0.1;
        graphics.fillStyle(0x666666, alpha * firingGlow * 0.5);
        graphics.fillCircle(frontX, frontY, 8);
        graphics.fillStyle(0x888888, alpha * firingGlow);
        graphics.fillCircle(frontX, frontY, 5);
    }

    private drawGoldMine(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding) {
        const time = this.time.now;
        const isLevel2 = building && building.level >= 2;

        // === ROCKY GROUND BASE ===
        graphics.fillStyle(tint ?? (isLevel2 ? 0x7a6a5a : 0x6b5a4a), alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);
        graphics.lineStyle(isLevel2 ? 2 : 1, isLevel2 ? 0x8b7355 : 0x4a3a2a, 0.6 * alpha);
        graphics.strokePoints([c1, c2, c3, c4], true, true);

        // Level 2: Gold-trimmed corners
        if (isLevel2) {
            graphics.fillStyle(0xdaa520, alpha * 0.8);
            graphics.fillCircle(c1.x, c1.y, 3);
            graphics.fillCircle(c2.x, c2.y, 2);
            graphics.fillCircle(c3.x, c3.y, 2);
            graphics.fillCircle(c4.x, c4.y, 2);
        }

        // Scattered rocks/dirt texture
        graphics.fillStyle(0x5a4a3a, alpha * 0.6);
        graphics.fillCircle(center.x - 15, center.y + 6, 5);
        graphics.fillCircle(center.x + 12, center.y + 4, 4);
        graphics.fillCircle(center.x - 8, center.y + 10, 3);
        graphics.fillStyle(0x7a6a5a, alpha * 0.4);
        graphics.fillCircle(center.x + 5, center.y + 8, 3);

        // === MINE SHAFT ENTRANCE (dark tunnel) ===
        // Entrance frame - wooden supports
        graphics.fillStyle(0x3a2a1a, alpha);
        graphics.fillRect(center.x - 12, center.y - 8, 4, 16);
        graphics.fillRect(center.x + 8, center.y - 8, 4, 16);

        // Entrance top beam
        graphics.fillStyle(0x4a3a2a, alpha);
        graphics.fillRect(center.x - 14, center.y - 12, 28, 5);
        graphics.fillStyle(0x5a4a3a, alpha);
        graphics.fillRect(center.x - 13, center.y - 11, 26, 2);

        // Dark tunnel interior
        graphics.fillStyle(0x1a1a1a, alpha);
        graphics.fillRect(center.x - 8, center.y - 6, 16, 14);
        graphics.fillStyle(0x0a0a0a, alpha);
        graphics.fillRect(center.x - 6, center.y - 4, 12, 10);

        // === MINE CART TRACKS ===
        graphics.lineStyle(2, 0x555555, alpha);
        graphics.lineBetween(center.x - 6, center.y + 8, center.x + 20, center.y + 2);
        graphics.lineBetween(center.x - 2, center.y + 10, center.x + 24, center.y + 4);

        // Track ties
        graphics.fillStyle(0x3a2a1a, alpha);
        for (let i = 0; i < 4; i++) {
            const tx = center.x - 4 + i * 7;
            const ty = center.y + 9 - i * 1.5;
            graphics.fillRect(tx, ty, 6, 2);
        }

        // === ANIMATED MINE CART ===
        const cartCycle = (time / 2000) % 1;
        const cartInTunnel = cartCycle < 0.3 || cartCycle > 0.8;

        if (!cartInTunnel) {
            const cartProgress = (cartCycle - 0.3) / 0.5; // 0 to 1 while visible
            const cartX = center.x - 4 + cartProgress * 16;
            const cartY = center.y + 6 - cartProgress * 3;

            // Cart body
            graphics.fillStyle(0x5a5a5a, alpha);
            graphics.fillRect(cartX - 6, cartY - 8, 12, 8);
            graphics.fillStyle(0x4a4a4a, alpha);
            graphics.fillRect(cartX - 5, cartY - 7, 10, 6);

            // Gold ore in cart
            graphics.fillStyle(0xffd700, alpha);
            graphics.fillCircle(cartX - 2, cartY - 6, 3);
            graphics.fillCircle(cartX + 2, cartY - 5, 2);
            graphics.fillCircle(cartX, cartY - 8, 2);

            // Cart wheels
            graphics.fillStyle(0x333333, alpha);
            graphics.fillCircle(cartX - 4, cartY, 2);
            graphics.fillCircle(cartX + 4, cartY, 2);
        }

        // === HEADFRAME TOWER ===
        // Main support beams (A-frame)
        graphics.fillStyle(0x4a3a2a, alpha);
        graphics.fillRect(center.x - 20, center.y - 35, 4, 40);
        graphics.fillRect(center.x - 6, center.y - 35, 4, 40);

        // Cross beams
        graphics.fillStyle(0x5a4a3a, alpha);
        graphics.fillRect(center.x - 21, center.y - 30, 20, 3);
        graphics.fillRect(center.x - 21, center.y - 18, 20, 3);

        // Diagonal bracing
        graphics.lineStyle(2, 0x4a3a2a, alpha);
        graphics.lineBetween(center.x - 19, center.y - 28, center.x - 5, center.y - 16);
        graphics.lineBetween(center.x - 19, center.y - 16, center.x - 5, center.y - 28);

        // Pulley wheel at top
        graphics.fillStyle(0x555555, alpha);
        graphics.fillCircle(center.x - 13, center.y - 38, 5);
        graphics.fillStyle(0x666666, alpha);
        graphics.fillCircle(center.x - 13, center.y - 38, 3);

        // Animated wheel rotation
        const wheelAngle = time / 400;
        graphics.lineStyle(1, 0x444444, alpha);
        for (let i = 0; i < 4; i++) {
            const a = wheelAngle + (i / 4) * Math.PI * 2;
            graphics.lineBetween(
                center.x - 13 + Math.cos(a) * 4,
                center.y - 38 + Math.sin(a) * 4,
                center.x - 13 - Math.cos(a) * 4,
                center.y - 38 - Math.sin(a) * 4
            );
        }

        // Rope from pulley
        graphics.lineStyle(1, 0x8b7355, alpha);
        graphics.lineBetween(center.x - 13, center.y - 33, center.x - 13, center.y - 5);

        // === GOLD ORE PILES ===
        // Large pile
        graphics.fillStyle(0x8b7355, alpha);
        graphics.fillCircle(center.x + 18, center.y - 2, isLevel2 ? 10 : 8);
        graphics.fillCircle(center.x + 22, center.y + 2, isLevel2 ? 8 : 6);

        // Level 2: Extra gold pile
        if (isLevel2) {
            graphics.fillStyle(0x9b8365, alpha);
            graphics.fillCircle(center.x + 26, center.y - 1, 5);
        }

        // Gold chunks in pile (more for level 2)
        graphics.fillStyle(0xffd700, alpha);
        graphics.fillCircle(center.x + 16, center.y - 4, isLevel2 ? 4 : 3);
        graphics.fillCircle(center.x + 20, center.y - 1, isLevel2 ? 5 : 4);
        graphics.fillCircle(center.x + 24, center.y + 1, isLevel2 ? 3 : 2);
        graphics.fillCircle(center.x + 18, center.y, isLevel2 ? 3 : 2);

        // Level 2: Extra gold chunks
        if (isLevel2) {
            graphics.fillCircle(center.x + 26, center.y - 2, 3);
            graphics.fillCircle(center.x + 14, center.y - 2, 2);
            graphics.fillCircle(center.x + 22, center.y - 3, 2);
        }

        // Sparkling gold highlights (animated) - more sparkles for level 2
        const sparkle1 = 0.5 + Math.sin(time / 150) * 0.5;
        const sparkle2 = 0.5 + Math.sin(time / 180 + 1) * 0.5;
        const sparkle3 = 0.5 + Math.sin(time / 200 + 2) * 0.5;

        graphics.fillStyle(0xffff88, alpha * sparkle1);
        graphics.fillCircle(center.x + 17, center.y - 5, isLevel2 ? 2 : 1.5);
        graphics.fillStyle(0xffff88, alpha * sparkle2);
        graphics.fillCircle(center.x + 21, center.y - 2, isLevel2 ? 2 : 1.5);
        graphics.fillStyle(0xffffaa, alpha * sparkle3);
        graphics.fillCircle(center.x + 19, center.y - 3, isLevel2 ? 1.5 : 1);

        // Level 2: Extra sparkles
        if (isLevel2) {
            const sparkle4 = 0.5 + Math.sin(time / 120 + 3) * 0.5;
            const sparkle5 = 0.5 + Math.sin(time / 160 + 4) * 0.5;
            graphics.fillStyle(0xffff66, alpha * sparkle4);
            graphics.fillCircle(center.x + 25, center.y - 1, 1.5);
            graphics.fillStyle(0xffffcc, alpha * sparkle5);
            graphics.fillCircle(center.x + 15, center.y - 3, 1);
        }

        // === LANTERNS ===
        // Left lantern on post
        graphics.fillStyle(0x4a3a2a, alpha);
        graphics.fillRect(center.x - 24, center.y - 5, 2, 12);

        // Lantern glow (animated flicker)
        const flicker = 0.7 + Math.sin(time / 80) * 0.3;
        graphics.fillStyle(0xff8800, alpha * flicker);
        graphics.fillCircle(center.x - 23, center.y - 8, 3);
        graphics.fillStyle(0xffcc44, alpha * flicker * 0.8);
        graphics.fillCircle(center.x - 23, center.y - 9, 2);

        // Small gold coin/nugget detail near entrance
        graphics.fillStyle(0xffd700, alpha);
        graphics.fillCircle(center.x + 6, center.y + 5, 2);
        graphics.fillCircle(center.x + 3, center.y + 7, 1.5);
    }

    private drawElixirCollector(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding) {
        // Purple/pink theme for elixir
        const isLevel2 = building && building.level >= 2;
        const purpleDark = tint ?? (isLevel2 ? 0x7c4493 : 0x6c3483);
        const purpleMid = tint ?? (isLevel2 ? 0x9e54bd : 0x8e44ad);
        const purpleLight = tint ?? (isLevel2 ? 0xb579cd : 0xa569bd);

        // Stone base (enhanced for level 2)
        graphics.fillStyle(isLevel2 ? 0x6a6a6a : 0x5a5a5a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);
        graphics.lineStyle(isLevel2 ? 2 : 1, isLevel2 ? 0x9b59b6 : 0x3a3a3a, 0.5 * alpha);
        graphics.strokePoints([c1, c2, c3, c4], true, true);

        // Level 2: Purple-trimmed corners
        if (isLevel2) {
            graphics.fillStyle(0xbb8fce, alpha * 0.8);
            graphics.fillCircle(c1.x, c1.y, 3);
            graphics.fillCircle(c2.x, c2.y, 2);
            graphics.fillCircle(c3.x, c3.y, 2);
            graphics.fillCircle(c4.x, c4.y, 2);
        }

        // Elixir tank (glass container) - larger for level 2
        const tankHeight = isLevel2 ? 34 : 30;
        const tankWidth = isLevel2 ? 20 : 18;

        // Tank back (darker)
        graphics.fillStyle(purpleDark, alpha * 0.8);
        graphics.fillEllipse(center.x, center.y - 5, tankWidth, tankWidth * 0.5);

        // Tank body (glass effect)
        graphics.fillStyle(purpleMid, alpha * 0.7);
        graphics.fillRect(center.x - tankWidth / 2, center.y - 5 - tankHeight, tankWidth, tankHeight);

        // Tank shine (glass reflection)
        graphics.fillStyle(0xffffff, (isLevel2 ? 0.25 : 0.2) * alpha);
        graphics.fillRect(center.x - tankWidth / 2 + 3, center.y - 5 - tankHeight + 3, isLevel2 ? 5 : 4, tankHeight - 6);

        // Level 2: Secondary shine
        if (isLevel2) {
            graphics.fillStyle(0xffffff, 0.15 * alpha);
            graphics.fillRect(center.x + tankWidth / 2 - 6, center.y - 5 - tankHeight + 5, 2, tankHeight - 10);
        }

        // Tank top cap
        graphics.fillStyle(purpleLight, alpha);
        graphics.fillEllipse(center.x, center.y - 5 - tankHeight, tankWidth, tankWidth * 0.5);

        // Level 2: Glowing rim
        if (isLevel2) {
            graphics.lineStyle(2, 0xd7bde2, alpha * 0.6);
            graphics.strokeEllipse(center.x, center.y - 5 - tankHeight, tankWidth - 2, (tankWidth - 2) * 0.5);
        }

        // Pump mechanism on top
        const time = this.time.now / 300;
        const pumpOffset = Math.sin(time) * (isLevel2 ? 4 : 3);

        // Pump base (reinforced for level 2)
        graphics.fillStyle(isLevel2 ? 0x5a5a5a : 0x4a4a4a, alpha);
        graphics.fillRect(center.x - 4, center.y - tankHeight - 20, 8, 10);

        // Level 2: Metal bands on pump
        if (isLevel2) {
            graphics.fillStyle(0x9b59b6, alpha * 0.7);
            graphics.fillRect(center.x - 5, center.y - tankHeight - 20, 10, 2);
            graphics.fillRect(center.x - 5, center.y - tankHeight - 12, 10, 2);
        }

        // Pump piston (animated up/down)
        graphics.fillStyle(isLevel2 ? 0x777777 : 0x666666, alpha);
        graphics.fillRect(center.x - 2, center.y - tankHeight - 25 + pumpOffset, 4, 8);

        // Pump handle
        graphics.lineStyle(2, isLevel2 ? 0x666666 : 0x555555, alpha);
        graphics.lineBetween(center.x, center.y - tankHeight - 25 + pumpOffset, center.x + 10, center.y - tankHeight - 20 + pumpOffset * 0.5);

        // Elixir bubbles (animated) - more bubbles for level 2
        const bubbleTime = this.time.now / 200;
        const bubbleCount = isLevel2 ? 5 : 3;
        for (let i = 0; i < bubbleCount; i++) {
            const bubbleY = ((bubbleTime + i * (isLevel2 ? 0.35 : 0.5)) % 1) * tankHeight;
            const bubbleX = Math.sin(bubbleTime * 2 + i) * (isLevel2 ? 5 : 4);
            graphics.fillStyle(0xd7bde2, (isLevel2 ? 0.7 : 0.6) * alpha);
            graphics.fillCircle(center.x + bubbleX, center.y - 5 - bubbleY, isLevel2 ? 2.5 : 2);
        }

        // Level 2: Glowing elixir particles
        if (isLevel2) {
            const glowTime = this.time.now / 150;
            for (let i = 0; i < 3; i++) {
                const glow = 0.3 + Math.sin(glowTime + i * 2) * 0.3;
                const px = center.x + Math.sin(glowTime * 0.5 + i * 2.5) * 6;
                const py = center.y - 5 - tankHeight * 0.5 + Math.cos(glowTime * 0.3 + i) * 8;
                graphics.fillStyle(0xe8daef, alpha * glow);
                graphics.fillCircle(px, py, 1.5);
            }
        }

        // Wooden supports (reinforced for level 2)
        graphics.fillStyle(isLevel2 ? 0x6d5e47 : 0x5d4e37, alpha);
        graphics.fillRect(center.x - tankWidth / 2 - 3, center.y - 5, isLevel2 ? 4 : 3, 8);
        graphics.fillRect(center.x + tankWidth / 2 - (isLevel2 ? 1 : 0), center.y - 5, isLevel2 ? 4 : 3, 8);

        // Level 2: Metal reinforcement bands on supports
        if (isLevel2) {
            graphics.fillStyle(0x9b59b6, alpha * 0.6);
            graphics.fillRect(center.x - tankWidth / 2 - 3, center.y - 3, 4, 2);
            graphics.fillRect(center.x + tankWidth / 2 - 1, center.y - 3, 4, 2);
        }
    }


    private drawMortar(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding) {
        const time = this.time.now;

        // Subtle rotation for aiming (use ballista angle system)
        const aimAngle = building?.ballistaAngle ?? 0;
        const aimOffsetX = Math.cos(aimAngle) * 2;
        const aimOffsetY = Math.sin(aimAngle) * 1;

        // === STONE BASE ===
        graphics.fillStyle(tint ?? 0x6a6a6a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);
        graphics.lineStyle(2, 0x4a4a4a, 0.7 * alpha);
        graphics.strokePoints([c1, c2, c3, c4], true, true);

        // Raised stone platform (isometric ellipse)
        graphics.fillStyle(0x5a5a5a, alpha);
        graphics.fillEllipse(center.x, center.y - 2, 40, 24);
        graphics.lineStyle(2, 0x3a3a3a, alpha);
        graphics.strokeEllipse(center.x, center.y - 2, 40, 24);

        // === MORTAR TUBE (short, fat barrel with subtle aiming) ===
        // Barrel base
        const barrelCenterX = center.x + aimOffsetX;
        const barrelCenterY = center.y + aimOffsetY;

        // Barrel body (tapered sides going up)
        graphics.fillStyle(0x4a4a4a, alpha);
        graphics.beginPath();
        graphics.moveTo(barrelCenterX - 13, barrelCenterY - 6);
        graphics.lineTo(barrelCenterX - 9, barrelCenterY - 32);
        graphics.lineTo(barrelCenterX + 9, barrelCenterY - 32);
        graphics.lineTo(barrelCenterX + 13, barrelCenterY - 6);
        graphics.closePath();
        graphics.fillPath();

        // Barrel front highlight (lit side)
        graphics.fillStyle(0x5a5a5a, alpha);
        graphics.beginPath();
        graphics.moveTo(barrelCenterX + 3, barrelCenterY - 6);
        graphics.lineTo(barrelCenterX + 5, barrelCenterY - 32);
        graphics.lineTo(barrelCenterX + 9, barrelCenterY - 32);
        graphics.lineTo(barrelCenterX + 13, barrelCenterY - 6);
        graphics.closePath();
        graphics.fillPath();

        // Barrel top rim (ellipse ring)
        graphics.fillStyle(0x4a4a4a, alpha);
        graphics.fillEllipse(barrelCenterX, barrelCenterY - 32, 10, 5);

        // Metal reinforcement bands (curved on barrel)
        graphics.lineStyle(2, 0x555555, alpha);
        graphics.beginPath();
        graphics.arc(barrelCenterX, barrelCenterY - 14, 12, Math.PI * 0.2, Math.PI * 0.8);
        graphics.strokePath();
        graphics.beginPath();
        graphics.arc(barrelCenterX, barrelCenterY - 24, 9, Math.PI * 0.2, Math.PI * 0.8);
        graphics.strokePath();



        // === ANIMATED SMOKE ===
        const smoke1Y = (time / 40) % 30;
        const smoke1Alpha = Math.max(0, 1 - smoke1Y / 30) * 0.25;
        graphics.fillStyle(0x999999, alpha * smoke1Alpha);
        graphics.fillCircle(barrelCenterX + Math.sin(time / 200) * 2, barrelCenterY - 35 - smoke1Y, 3 + smoke1Y * 0.12);
    }

    private drawTeslaCoil(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null) {
        const time = this.time.now;

        // Stone base platform
        graphics.fillStyle(0x5a5a5a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);
        graphics.lineStyle(1, 0x3a3a3a, 0.5 * alpha);
        graphics.strokePoints([c1, c2, c3, c4], true, true);

        // Wooden support post
        graphics.fillStyle(0x4a3a2a, alpha);
        graphics.fillRect(center.x - 4, center.y - 35, 8, 35);
        graphics.lineStyle(1, 0x2a1a0a, 0.5 * alpha);
        graphics.strokeRect(center.x - 4, center.y - 35, 8, 35);

        // Metal coil rings with subtle glow
        for (let i = 0; i < 3; i++) {
            const ringY = center.y - 10 - i * 8;
            const ringGlow = 0.3 + Math.sin(time / 150 + i) * 0.1;
            graphics.fillStyle(0x6a6a6a, alpha);
            graphics.fillEllipse(center.x, ringY, 12, 4);
            graphics.lineStyle(1, 0x3a3a3a, alpha);
            graphics.strokeEllipse(center.x, ringY, 12, 4);
            // Electric glow on rings
            graphics.lineStyle(1, 0x00ccff, alpha * ringGlow);
            graphics.strokeEllipse(center.x, ringY, 13, 5);
        }

        // Glowing electric orb
        const orbY = center.y - 40;

        // Pulsing glow intensity
        const pulseIntensity = 0.8 + Math.sin(time / 120) * 0.2;
        const fastPulse = 0.6 + Math.sin(time / 50) * 0.4;

        // Outer glow (pulsing)
        graphics.fillStyle(0x00ccff, 0.3 * alpha * pulseIntensity);
        graphics.fillCircle(center.x, orbY, 14 + Math.sin(time / 80) * 2);

        // Mid glow
        graphics.fillStyle(0x44ddff, 0.5 * alpha * pulseIntensity);
        graphics.fillCircle(center.x, orbY, 10);

        // Core
        graphics.fillStyle(tint ?? 0xaaeeff, alpha);
        graphics.fillCircle(center.x, orbY, 7);

        // Electric highlight
        graphics.fillStyle(0xffffff, 0.8 * alpha);
        graphics.fillCircle(center.x - 2, orbY - 2, 2);

        // === IDLE CRACKLING ARCS ===
        // Random arcs that jump from the orb
        const arcCount = 3;
        for (let i = 0; i < arcCount; i++) {
            // Use time-based pseudo-random to create consistent but varied arcs
            const seed = Math.floor(time / 100) + i * 137;
            const arcActive = (seed % 5) < 2; // Arc appears ~40% of the time

            if (arcActive) {
                const arcAngle = ((seed * 1.618) % 6.28); // Golden ratio for nice distribution
                const arcLength = 12 + (seed % 8);

                // Start from orb
                const startX = center.x + Math.cos(arcAngle) * 6;
                const startY = orbY + Math.sin(arcAngle) * 6;

                // End point with jitter
                const endX = center.x + Math.cos(arcAngle) * arcLength + Math.sin(time / 20 + i) * 3;
                const endY = orbY + Math.sin(arcAngle) * arcLength + Math.cos(time / 25 + i) * 2;

                // Mid point for arc curve
                const midX = (startX + endX) / 2 + Math.sin(time / 15 + i * 2) * 4;
                const midY = (startY + endY) / 2 + Math.cos(time / 18 + i * 2) * 3;

                // Draw crackling arc
                graphics.lineStyle(2, 0x00ffff, alpha * fastPulse * 0.8);
                graphics.beginPath();
                graphics.moveTo(startX, startY);
                graphics.lineTo(midX, midY);
                graphics.lineTo(endX, endY);
                graphics.strokePath();

                // Brighter inner line
                graphics.lineStyle(1, 0xffffff, alpha * fastPulse * 0.6);
                graphics.beginPath();
                graphics.moveTo(startX, startY);
                graphics.lineTo(midX, midY);
                graphics.lineTo(endX, endY);
                graphics.strokePath();

                // Spark at end
                graphics.fillStyle(0xffffff, alpha * fastPulse);
                graphics.fillCircle(endX, endY, 1.5);
            }
        }

        // Small floating sparks around the orb
        for (let i = 0; i < 4; i++) {
            const sparkAngle = (time / 200 + i * 1.57) % (Math.PI * 2);
            const sparkDist = 16 + Math.sin(time / 100 + i) * 4;
            const sparkX = center.x + Math.cos(sparkAngle) * sparkDist;
            const sparkY = orbY + Math.sin(sparkAngle) * sparkDist * 0.6;
            const sparkAlpha = 0.3 + Math.sin(time / 60 + i * 2) * 0.3;

            graphics.fillStyle(0x88ffff, alpha * sparkAlpha);
            graphics.fillCircle(sparkX, sparkY, 1.5);
        }
    }

    // === PRISM TOWER - Beam bounces between enemies ===
    private drawPrismTower(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, _building?: PlacedBuilding) {
        const time = this.time.now;

        // Isometric stone base platform
        graphics.fillStyle(tint ?? 0x4a4a5a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);

        // Base edge highlights (isometric)
        graphics.lineStyle(1, 0x6a6a7a, alpha * 0.8);
        graphics.lineBetween(c1.x, c1.y, c2.x, c2.y);
        graphics.lineBetween(c1.x, c1.y, c4.x, c4.y);
        graphics.lineStyle(1, 0x2a2a3a, alpha * 0.8);
        graphics.lineBetween(c2.x, c2.y, c3.x, c3.y);
        graphics.lineBetween(c3.x, c3.y, c4.x, c4.y);

        // Crystal pillar base (isometric hexagonal)
        const baseHeight = 15;
        graphics.fillStyle(0x3a3a4a, alpha);
        // SE face
        graphics.fillPoints([
            new Phaser.Math.Vector2(center.x + 8, center.y + 4),
            new Phaser.Math.Vector2(center.x + 8, center.y + 4 - baseHeight),
            new Phaser.Math.Vector2(center.x, center.y - 4 - baseHeight),
            new Phaser.Math.Vector2(center.x, center.y - 4)
        ], true);
        // SW face (lighter)
        graphics.fillStyle(0x5a5a6a, alpha);
        graphics.fillPoints([
            new Phaser.Math.Vector2(center.x, center.y - 4),
            new Phaser.Math.Vector2(center.x, center.y - 4 - baseHeight),
            new Phaser.Math.Vector2(center.x - 8, center.y + 4 - baseHeight),
            new Phaser.Math.Vector2(center.x - 8, center.y + 4)
        ], true);

        // Main crystal (triangular prism - isometric)
        const crystalBase = center.y - baseHeight;
        const crystalHeight = 35;

        // Crystal faces with rainbow refraction
        const hue1 = (time / 20) % 360;
        const hue2 = (hue1 + 120) % 360;
        const hue3 = (hue1 + 240) % 360;

        // Convert HSL to approximate hex (simplified)
        const hslToColor = (h: number) => {
            const c = 0.7;
            const x = c * (1 - Math.abs((h / 60) % 2 - 1));
            let r = 0, g = 0, b = 0;
            if (h < 60) { r = c; g = x; }
            else if (h < 120) { r = x; g = c; }
            else if (h < 180) { g = c; b = x; }
            else if (h < 240) { g = x; b = c; }
            else if (h < 300) { r = x; b = c; }
            else { r = c; b = x; }
            return ((Math.floor((r + 0.3) * 255) << 16) | (Math.floor((g + 0.3) * 255) << 8) | Math.floor((b + 0.3) * 255));
        };

        // SE crystal face
        graphics.fillStyle(hslToColor(hue1), alpha * 0.8);
        graphics.beginPath();
        graphics.moveTo(center.x + 6, crystalBase + 4);
        graphics.lineTo(center.x, crystalBase - crystalHeight);
        graphics.lineTo(center.x, crystalBase - 2);
        graphics.closePath();
        graphics.fillPath();

        // SW crystal face
        graphics.fillStyle(hslToColor(hue2), alpha * 0.8);
        graphics.beginPath();
        graphics.moveTo(center.x - 6, crystalBase + 4);
        graphics.lineTo(center.x, crystalBase - crystalHeight);
        graphics.lineTo(center.x, crystalBase - 2);
        graphics.closePath();
        graphics.fillPath();

        // Front crystal face
        graphics.fillStyle(hslToColor(hue3), alpha * 0.9);
        graphics.beginPath();
        graphics.moveTo(center.x - 6, crystalBase + 4);
        graphics.lineTo(center.x, crystalBase - crystalHeight);
        graphics.lineTo(center.x + 6, crystalBase + 4);
        graphics.closePath();
        graphics.fillPath();

        // Crystal glow
        const glowPulse = 0.4 + Math.sin(time / 100) * 0.2;
        graphics.fillStyle(0xffffff, alpha * glowPulse);
        graphics.fillCircle(center.x, crystalBase - crystalHeight + 5, 4);

        // Refracted light beams (subtle)
        graphics.lineStyle(1, 0xffffff, alpha * 0.3);
        for (let i = 0; i < 3; i++) {
            const beamAngle = (time / 500 + i * 2.1) % (Math.PI * 2);
            const beamLen = 15 + Math.sin(time / 150 + i) * 5;
            graphics.lineBetween(
                center.x, crystalBase - crystalHeight,
                center.x + Math.cos(beamAngle) * beamLen,
                crystalBase - crystalHeight + Math.sin(beamAngle) * beamLen * 0.5
            );
        }
    }

    // === MAGMA VENT - STEAMPUNK/TECH REDESIGN ===
    private drawMagmaVent(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding, baseGraphics?: Phaser.GameObjects.Graphics) {
        const time = this.time.now || 0;
        const _building = building;

        const g = baseGraphics || graphics; // Use baseGraphics for base

        // Eruption state
        const timeSinceFire = _building?.lastFireTime ? (time - _building.lastFireTime) : 100000;
        const attackDuration = 1200;
        const isErupting = timeSinceFire < attackDuration;
        const eruptIntensity = isErupting ? Math.sin((timeSinceFire / attackDuration) * Math.PI) : 0; // 0 to 1 to 0

        // === BASE PLATFORM (Metal grating) ===
        // Dark metallic base
        const baseColor = isErupting
            ? Phaser.Display.Color.GetColor(
                Phaser.Math.Interpolation.Linear([0x2a, 0x55, 0x2a], (timeSinceFire / attackDuration)),
                Phaser.Math.Interpolation.Linear([0x2a, 0x22, 0x2a], (timeSinceFire / attackDuration)),
                Phaser.Math.Interpolation.Linear([0x2a, 0x00, 0x2a], (timeSinceFire / attackDuration))
            )
            : 0x2a2a2a;

        g.fillStyle(tint ?? baseColor, alpha);
        g.fillPoints([c1, c2, c3, c4], true);

        // Steel rim
        g.lineStyle(2, 0x555555, alpha);
        g.strokePoints([c1, c2, c3, c4], true, true);

        // Grating lines - glow orange when erupting
        const gratingColor = isErupting ? 0xff6600 : 0x3a3a3a;
        const gratingAlpha = isErupting ? 0.8 : 0.5;

        g.lineStyle(isErupting ? 2 : 1, gratingColor, alpha * gratingAlpha);
        for (let i = 0; i < 4; i++) {
            const r = (i + 1) / 5;
            // Cross hatching
            const startX = c1.x + (c2.x - c1.x) * r;
            const startY = c1.y + (c2.y - c1.y) * r;
            const endX = c4.x + (c3.x - c4.x) * r;
            const endY = c4.y + (c3.y - c4.y) * r;
            g.lineBetween(startX, startY, endX, endY);

            const sX = c1.x + (c4.x - c1.x) * r;
            const sY = c1.y + (c4.y - c1.y) * r;
            const eX = c2.x + (c3.x - c2.x) * r;
            const eY = c2.y + (c3.y - c2.y) * r;
            g.lineBetween(sX, sY, eX, eY);
        }
        // === VOLCANIC ROCKS (Surrounding the vent) ===
        graphics.fillStyle(0x2a1a10, alpha); // Dark reddish rock

        // Large Left Rock
        const leftRockOrigin = { x: center.x - 35, y: center.y + 5 };
        graphics.fillPoints([
            { x: leftRockOrigin.x + 0, y: leftRockOrigin.y + 0 },
            { x: leftRockOrigin.x + 15, y: leftRockOrigin.y - 8 },
            { x: leftRockOrigin.x + 25, y: leftRockOrigin.y + 0 },
            { x: leftRockOrigin.x + 10, y: leftRockOrigin.y + 10 },
            { x: leftRockOrigin.x - 5, y: leftRockOrigin.y + 5 }
        ], true);
        // Rock highlight
        graphics.fillStyle(0x3a2a20, alpha);
        graphics.fillRect(center.x - 32, center.y + 2, 8, 4);

        // Large Right Rock
        graphics.fillStyle(0x2a1a10, alpha);
        const rightRockOrigin = { x: center.x + 25, y: center.y - 5 };
        graphics.fillPoints([
            { x: rightRockOrigin.x + 0, y: rightRockOrigin.y + 0 },
            { x: rightRockOrigin.x + 15, y: rightRockOrigin.y - 5 },
            { x: rightRockOrigin.x + 20, y: rightRockOrigin.y + 5 },
            { x: rightRockOrigin.x + 5, y: rightRockOrigin.y + 15 },
            { x: rightRockOrigin.x - 5, y: rightRockOrigin.y + 5 }
        ], true);
        // Rock highlight
        graphics.fillStyle(0x3a2a20, alpha);
        graphics.fillRect(center.x + 30, center.y - 2, 8, 4);

        // Back Rock Cluster
        graphics.fillStyle(0x2a1a10, alpha);
        const backRockOrigin = { x: center.x - 10, y: center.y - 25 };
        graphics.fillPoints([
            { x: backRockOrigin.x + 0, y: backRockOrigin.y + 0 },
            { x: backRockOrigin.x + 20, y: backRockOrigin.y - 5 },
            { x: backRockOrigin.x + 25, y: backRockOrigin.y + 8 },
            { x: backRockOrigin.x + 5, y: backRockOrigin.y + 12 },
            { x: backRockOrigin.x - 5, y: backRockOrigin.y + 5 }
        ], true);

        // Glowing fissures on rocks when erupting
        if (isErupting) {
            graphics.fillStyle(0xff4400, alpha * eruptIntensity * 0.5);
            graphics.fillRect(center.x - 28, center.y + 6, 6, 2); // Left rock crack
            graphics.fillRect(center.x + 32, center.y + 5, 4, 2); // Right rock crack
        }

        // === CONTAINMENT RING (Copper/brass outer ring) ===
        const ringY = center.y - 5;

        // Outer containment ring - back half
        graphics.fillStyle(0x8b5a2b, alpha); // Copper
        graphics.beginPath();
        graphics.moveTo(center.x - 22, ringY + 8);
        graphics.lineTo(center.x - 20, ringY - 8);
        graphics.lineTo(center.x + 20, ringY - 8);
        graphics.lineTo(center.x + 22, ringY + 8);
        graphics.closePath();
        graphics.fillPath();

        // Ring highlight (shiny copper)
        graphics.fillStyle(0xcd7f32, alpha * 0.8);
        graphics.fillRect(center.x - 18, ringY - 6, 36, 4);

        // === LAVA CHAMBER (Central pit with tech housing) ===
        // Dark inner chamber
        graphics.fillStyle(0x1a0a00, alpha);
        graphics.fillRect(center.x - 14, ringY - 4, 28, 10);

        // Lava pool (pixelated glow)
        const lavaGlow = isErupting ? (0.8 + Math.sin(time / 50) * 0.2) : (0.4 + Math.sin(time / 200) * 0.1);
        graphics.fillStyle(0xff2200, alpha * lavaGlow);
        graphics.fillRect(center.x - 10, ringY - 2, 20, 6);
        graphics.fillStyle(0xff6600, alpha * lavaGlow);
        graphics.fillRect(center.x - 6, ringY - 1, 12, 4);
        graphics.fillStyle(0xffaa00, alpha * lavaGlow * 0.8);
        graphics.fillRect(center.x - 3, ringY, 6, 2);

        // === STEAM PIPES (Left and right) ===
        // Left pipe
        graphics.fillStyle(0x6a4a3a, alpha);
        graphics.fillRect(center.x - 26, ringY - 15, 6, 20);
        graphics.fillStyle(0x8b6a5a, alpha);
        graphics.fillRect(center.x - 25, ringY - 14, 4, 18);

        // Right pipe
        graphics.fillStyle(0x6a4a3a, alpha);
        graphics.fillRect(center.x + 20, ringY - 15, 6, 20);
        graphics.fillStyle(0x8b6a5a, alpha);
        graphics.fillRect(center.x + 21, ringY - 14, 4, 18);

        // Pipe caps (brass) - glow when erupting
        const capColor = isErupting ? 0xff8800 : 0xb8860b;
        graphics.fillStyle(capColor, alpha);
        graphics.fillRect(center.x - 27, ringY - 18, 8, 4);
        graphics.fillRect(center.x + 19, ringY - 18, 8, 4);

        // === PRESSURE GAUGES ===
        // Left gauge housing
        graphics.fillStyle(0x4a4a4a, alpha);
        graphics.fillRect(center.x - 32, ringY - 8, 8, 8);
        graphics.fillStyle(0x2a2a2a, alpha);
        graphics.fillRect(center.x - 31, ringY - 7, 6, 6);
        // Gauge needle (moves with pressure)
        const needleAngle = isErupting ? eruptIntensity : 0.2;
        graphics.fillStyle(0xff4400, alpha);
        graphics.fillRect(center.x - 29 + needleAngle * 2, ringY - 5, 2, 3);

        // Right gauge
        graphics.fillStyle(0x4a4a4a, alpha);
        graphics.fillRect(center.x + 24, ringY - 8, 8, 8);
        graphics.fillStyle(0x2a2a2a, alpha);
        graphics.fillRect(center.x + 25, ringY - 7, 6, 6);
        graphics.fillStyle(0x00ff00, alpha * (isErupting ? 0.3 : 0.8));
        graphics.fillRect(center.x + 27, ringY - 5, 2, 3);

        // === RIVETS (Industrial detail) ===
        graphics.fillStyle(isErupting ? 0x8a6a5a : 0x5a5a5a, alpha);
        const rivetPositions = [
            [-20, ringY + 6], [20, ringY + 6],
            [-18, ringY - 10], [18, ringY - 10],
            [-24, ringY], [24, ringY]
        ];
        for (const [rx, ry] of rivetPositions) {
            graphics.fillRect(center.x + rx - 1, ry - 1, 3, 3);
        }

        // === CONTROL PANEL (Front) ===
        graphics.fillStyle(0x3a3a3a, alpha);
        graphics.fillRect(center.x - 8, ringY + 6, 16, 6);
        // Buttons/lights
        graphics.fillStyle(isErupting ? 0xff0000 : 0x440000, alpha);
        graphics.fillRect(center.x - 5, ringY + 8, 3, 3);
        graphics.fillStyle(0x004400, alpha);
        graphics.fillRect(center.x + 2, ringY + 8, 3, 3);

        // === IDLE SMOKE (Small wisps from pipes) ===
        const smokeCount = isErupting ? 0 : 2; // Only show idle smoke when not erupting
        for (let i = 0; i < smokeCount; i++) {
            const pipeX = i === 0 ? center.x - 23 : center.x + 23;
            const smokeCycle = 4000;
            const smokePhase = ((time / smokeCycle) + i * 0.5) % 1;
            const smokeY = ringY - 18 - smokePhase * 20;
            const smokeX = pipeX + Math.sin(time / 600 + i) * 4 * smokePhase;
            const smokeAlpha = (1 - smokePhase) * 0.2;
            const smokeSize = Math.floor(2 + smokePhase * 3);

            graphics.fillStyle(0x888888, alpha * smokeAlpha);
            graphics.fillRect(smokeX - smokeSize / 2, smokeY - smokeSize / 2, smokeSize, smokeSize);
        }
    }

    // === DRAGON'S BREATH - Ancient Chinese/Steampunk Firecracker Salvo Launcher ===
    private drawDragonsBreath(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding, baseGraphics?: Phaser.GameObjects.Graphics) {
        const time = this.time.now || 0;
        const g = baseGraphics || graphics;

        // Firing state
        const timeSinceFire = building?.lastFireTime ? (time - building.lastFireTime) : 100000;
        const salvoActive = timeSinceFire < 800;
        const salvoPhase = salvoActive ? timeSinceFire / 800 : 0;

        // === ORNATE STONE PLATFORM (Chinese temple style) ===
        // Main platform with red lacquer appearance
        g.fillStyle(tint ?? 0x8b1a1a, alpha);
        g.fillPoints([c1, c2, c3, c4], true);

        // Gold trim border (3 layers for depth)
        g.lineStyle(4, 0xffd700, alpha);
        g.strokePoints([c1, c2, c3, c4], true, true);
        g.lineStyle(2, 0xb8860b, alpha * 0.8);
        const inset1 = 4;
        const i1 = new Phaser.Math.Vector2(c1.x, c1.y + inset1);
        const i2 = new Phaser.Math.Vector2(c2.x + inset1 * 0.5, c2.y);
        const i3 = new Phaser.Math.Vector2(c3.x, c3.y - inset1);
        const i4 = new Phaser.Math.Vector2(c4.x - inset1 * 0.5, c4.y);
        g.strokePoints([i1, i2, i3, i4], true, true);

        // Decorative corner ornaments (Chinese cloud motifs)
        g.fillStyle(0xffd700, alpha * 0.9);
        g.fillCircle(c1.x, c1.y, 5);
        g.fillCircle(c2.x, c2.y, 5);
        g.fillCircle(c3.x, c3.y, 5);
        g.fillCircle(c4.x, c4.y, 5);
        g.fillStyle(0xcc0000, alpha);
        g.fillCircle(c1.x, c1.y, 3);
        g.fillCircle(c2.x, c2.y, 3);
        g.fillCircle(c3.x, c3.y, 3);
        g.fillCircle(c4.x, c4.y, 3);

        // Dragon scale pattern on base (isometric texture)
        g.fillStyle(0x6a1010, alpha * 0.4);
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 4; col++) {
                const scaleX = center.x - 30 + col * 18 + (row % 2) * 9;
                const scaleY = center.y - 5 + row * 8;
                g.fillEllipse(scaleX, scaleY, 8, 4);
            }
        }

        // === CENTRAL PAGODA STRUCTURE ===
        const baseHeight = -15;
        const strutHeight = 50;

        // Four corner pillars (brass with Chinese red accents)
        const pillarOffsets = [
            { x: -28, y: -12 }, { x: 28, y: -12 },
            { x: -28, y: 12 }, { x: 28, y: 12 }
        ];

        for (const offset of pillarOffsets) {
            const px = center.x + offset.x;
            const py = center.y + offset.y * 0.5;

            // Pillar shadow
            graphics.fillStyle(0x1a0a0a, alpha * 0.3);
            graphics.fillRect(px - 4, py + 2, 10, strutHeight + 5);

            // Brass pillar body
            graphics.fillStyle(0xb8860b, alpha);
            graphics.fillRect(px - 3, py + baseHeight, 8, strutHeight);

            // Red lacquer section
            graphics.fillStyle(0xcc0000, alpha);
            graphics.fillRect(px - 2, py + baseHeight + 5, 6, strutHeight - 10);

            // Gold bands
            graphics.fillStyle(0xffd700, alpha);
            graphics.fillRect(px - 4, py + baseHeight, 10, 3);
            graphics.fillRect(px - 4, py + baseHeight + strutHeight - 5, 10, 3);
            graphics.fillRect(px - 3, py + baseHeight + 20, 8, 2);

            // Decorative dragon head on front pillars
            if (offset.y > 0) {
                graphics.fillStyle(0xffd700, alpha);
                graphics.fillCircle(px + 2, py + baseHeight - 5, 4);
                graphics.fillStyle(0xff0000, alpha);
                graphics.fillCircle(px + 1, py + baseHeight - 6, 1.5);
                graphics.fillCircle(px + 4, py + baseHeight - 6, 1.5);
            }
        }

        // === 16 FIRECRACKER LAUNCH PODS (4x4 Grid) ===
        const podBaseY = center.y + baseHeight - 5;
        const podSpacing = 12;
        const gridOffset = -18;

        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const podIndex = row * 4 + col;
                const podX = center.x + gridOffset + col * podSpacing;
                const podY = podBaseY + (row - 1.5) * (podSpacing * 0.5);

                // Staggered firing animation
                const podFireDelay = podIndex * 40; // Each pod fires 40ms after previous
                const podTimeSinceFire = timeSinceFire - podFireDelay;
                const podFiring = podTimeSinceFire > 0 && podTimeSinceFire < 200;
                const podRecoil = podFiring ? Math.sin((podTimeSinceFire / 200) * Math.PI) * 4 : 0;

                // Pod tube shadow
                graphics.fillStyle(0x1a1a1a, alpha * 0.4);
                graphics.fillEllipse(podX + 2, podY + 3, 6, 3);

                // Brass pod tube (pointing upward)
                const tubeHeight = 18;
                const tubeTop = podY - tubeHeight + podRecoil;

                // Tube body
                graphics.fillStyle(0x8b5a2b, alpha);
                graphics.fillRect(podX - 4, tubeTop, 8, tubeHeight);

                // Copper sheen
                graphics.fillStyle(0xcd7f32, alpha * 0.7);
                graphics.fillRect(podX - 3, tubeTop + 2, 3, tubeHeight - 4);

                // Red paper wrapper (firecracker style)
                graphics.fillStyle(0xcc0000, alpha);
                graphics.fillRect(podX - 3, tubeTop + 4, 6, tubeHeight - 8);

                // Gold band at top
                graphics.fillStyle(0xffd700, alpha);
                graphics.fillRect(podX - 4, tubeTop, 8, 3);
                graphics.fillRect(podX - 4, tubeTop + tubeHeight - 3, 8, 3);

                // Fuse (glowing when about to fire)
                const fuseGlow = salvoActive && podTimeSinceFire > -100 && podTimeSinceFire < 50;
                graphics.fillStyle(fuseGlow ? 0xff6600 : 0x3a3a3a, alpha);
                graphics.fillRect(podX - 1, tubeTop - 3, 2, 4);

                if (fuseGlow) {
                    // Spark effect
                    graphics.fillStyle(0xffff00, alpha * (0.5 + Math.sin(time / 30 + podIndex) * 0.5));
                    graphics.fillCircle(podX, tubeTop - 4, 2);
                    graphics.fillStyle(0xff8800, alpha * 0.6);
                    graphics.fillCircle(podX, tubeTop - 5, 3);
                }

                // Muzzle flash when firing
                if (podFiring) {
                    const flashIntensity = 1 - (podTimeSinceFire / 200);
                    graphics.fillStyle(0xffff00, alpha * flashIntensity * 0.8);
                    graphics.fillCircle(podX, tubeTop - 6, 6 * flashIntensity);
                    graphics.fillStyle(0xff6600, alpha * flashIntensity * 0.6);
                    graphics.fillCircle(podX, tubeTop - 8, 8 * flashIntensity);
                    graphics.fillStyle(0xff4400, alpha * flashIntensity * 0.4);
                    graphics.fillCircle(podX, tubeTop - 10, 10 * flashIntensity);
                }

                // Smoke trail after firing
                if (podTimeSinceFire > 100 && podTimeSinceFire < 600) {
                    const smokeProgress = (podTimeSinceFire - 100) / 500;
                    const smokeY = tubeTop - 10 - smokeProgress * 30;
                    const smokeX = podX + Math.sin(time / 100 + podIndex) * 5 * smokeProgress;
                    graphics.fillStyle(0x888888, alpha * (1 - smokeProgress) * 0.4);
                    graphics.fillCircle(smokeX, smokeY, 3 + smokeProgress * 4);
                }
            }
        }

        // === PAGODA ROOF ===
        const roofY = center.y + baseHeight - 30;

        // Curved roof edges (Chinese style)
        graphics.fillStyle(0x2a1a10, alpha);
        // Main roof polygon
        graphics.beginPath();
        graphics.moveTo(center.x - 38, roofY + 15);
        graphics.lineTo(center.x - 32, roofY);
        graphics.lineTo(center.x, roofY - 8);
        graphics.lineTo(center.x + 32, roofY);
        graphics.lineTo(center.x + 38, roofY + 15);
        graphics.lineTo(center.x + 32, roofY + 18);
        graphics.lineTo(center.x, roofY + 8);
        graphics.lineTo(center.x - 32, roofY + 18);
        graphics.closePath();
        graphics.fillPath();

        // Red lacquer on roof
        graphics.fillStyle(0x8b0000, alpha);
        graphics.beginPath();
        graphics.moveTo(center.x - 30, roofY + 12);
        graphics.lineTo(center.x - 26, roofY + 2);
        graphics.lineTo(center.x, roofY - 4);
        graphics.lineTo(center.x + 26, roofY + 2);
        graphics.lineTo(center.x + 30, roofY + 12);
        graphics.lineTo(center.x, roofY + 5);
        graphics.closePath();
        graphics.fillPath();

        // Gold roof edge trim
        graphics.lineStyle(2, 0xffd700, alpha);
        graphics.lineBetween(center.x - 38, roofY + 15, center.x - 32, roofY);
        graphics.lineBetween(center.x - 32, roofY, center.x, roofY - 8);
        graphics.lineBetween(center.x, roofY - 8, center.x + 32, roofY);
        graphics.lineBetween(center.x + 32, roofY, center.x + 38, roofY + 15);

        // Curved roof tips (dragon tail style)
        graphics.fillStyle(0xffd700, alpha);
        graphics.fillCircle(center.x - 40, roofY + 13, 4);
        graphics.fillCircle(center.x + 40, roofY + 13, 4);

        // Central finial (dragon pearl)
        graphics.fillStyle(0xffd700, alpha);
        graphics.fillCircle(center.x, roofY - 12, 6);
        graphics.fillStyle(0xff0000, alpha);
        graphics.fillCircle(center.x, roofY - 12, 4);
        graphics.fillStyle(0xff6600, alpha * 0.6);
        graphics.fillCircle(center.x - 1, roofY - 13, 2);

        // === DRAGON DECORATIONS ===
        // Left dragon silhouette
        graphics.fillStyle(0xffd700, alpha * 0.9);
        graphics.beginPath();
        graphics.moveTo(center.x - 42, center.y - 5);
        graphics.lineTo(center.x - 48, center.y - 15);
        graphics.lineTo(center.x - 45, center.y - 20);
        graphics.lineTo(center.x - 40, center.y - 18);
        graphics.lineTo(center.x - 38, center.y - 10);
        graphics.closePath();
        graphics.fillPath();

        // Right dragon silhouette
        graphics.beginPath();
        graphics.moveTo(center.x + 42, center.y - 5);
        graphics.lineTo(center.x + 48, center.y - 15);
        graphics.lineTo(center.x + 45, center.y - 20);
        graphics.lineTo(center.x + 40, center.y - 18);
        graphics.lineTo(center.x + 38, center.y - 10);
        graphics.closePath();
        graphics.fillPath();

        // Dragon eyes (glowing)
        const eyeGlow = 0.7 + Math.sin(time / 200) * 0.3;
        graphics.fillStyle(0xff0000, alpha * eyeGlow);
        graphics.fillCircle(center.x - 45, center.y - 17, 2);
        graphics.fillCircle(center.x + 45, center.y - 17, 2);

        // === STEAM/SMOKE EFFECTS ===
        // Ambient steam from the mechanism
        if (!salvoActive) {
            for (let i = 0; i < 3; i++) {
                const steamCycle = ((time / 3000) + i * 0.33) % 1;
                const steamX = center.x - 15 + i * 15 + Math.sin(time / 500 + i) * 5;
                const steamY = roofY - 5 - steamCycle * 25;
                const steamAlpha = (1 - steamCycle) * 0.2;
                const steamSize = 3 + steamCycle * 5;

                graphics.fillStyle(0xcccccc, alpha * steamAlpha);
                graphics.fillCircle(steamX, steamY, steamSize);
            }
        }

        // === GLOWING RUNES (Ancient symbols) ===
        const runeGlow = 0.4 + Math.sin(time / 300) * 0.2;
        graphics.fillStyle(0xff6600, alpha * runeGlow);

        // Front rune symbols
        graphics.fillRect(center.x - 8, center.y + 8, 3, 6);
        graphics.fillRect(center.x - 4, center.y + 9, 2, 4);
        graphics.fillRect(center.x + 2, center.y + 8, 3, 6);
        graphics.fillRect(center.x + 6, center.y + 9, 2, 4);

        // === BRASS CONTROL MECHANISMS ===
        // Pressure dials on sides
        graphics.fillStyle(0xb8860b, alpha);
        graphics.fillCircle(center.x - 35, center.y + 5, 5);
        graphics.fillCircle(center.x + 35, center.y + 5, 5);

        graphics.fillStyle(0x2a2a2a, alpha);
        graphics.fillCircle(center.x - 35, center.y + 5, 3);
        graphics.fillCircle(center.x + 35, center.y + 5, 3);

        // Dial needles (animated)
        const dialAngle = salvoActive ? salvoPhase * Math.PI : Math.sin(time / 1000) * 0.5;
        graphics.lineStyle(1, 0xff4400, alpha);
        graphics.lineBetween(
            center.x - 35, center.y + 5,
            center.x - 35 + Math.cos(dialAngle) * 2, center.y + 5 - Math.sin(dialAngle) * 2
        );
        graphics.lineBetween(
            center.x + 35, center.y + 5,
            center.x + 35 + Math.cos(dialAngle) * 2, center.y + 5 - Math.sin(dialAngle) * 2
        );
    }

    // === RUBBLE SYSTEM (Destroyed Building Remains) ===
    private createRubble(gridX: number, gridY: number, width: number, height: number) {
        const graphics = this.add.graphics();
        this.drawRubble(graphics, gridX, gridY, width, height);

        // Very low depth so rubble renders UNDER troops and other elements
        graphics.setDepth(5);

        this.rubble.push({ gridX, gridY, width, height, graphics, createdAt: Date.now() });
    }

    private drawRubble(graphics: Phaser.GameObjects.Graphics, gridX: number, gridY: number, width: number, height: number, time: number = 0, fireIntensity: number = 1) {
        const c1 = this.cartToIso(gridX, gridY);
        const c2 = this.cartToIso(gridX + width, gridY);
        const c3 = this.cartToIso(gridX + width, gridY + height);
        const c4 = this.cartToIso(gridX, gridY + height);
        const center = this.cartToIso(gridX + width / 2, gridY + height / 2);

        // Base rubble pile (dark shadow)
        graphics.fillStyle(0x2a2a2a, 0.5);
        graphics.fillPoints([c1, c2, c3, c4], true);

        // Debris count scales with building size
        const debrisCount = width * height * 5;
        const seed = gridX * 1000 + gridY; // Consistent random per location
        const isLarge = width >= 3 || height >= 3;

        // For large rubble (3x3), add significant structural pieces
        if (isLarge) {
            // Collapsed wall sections
            for (let i = 0; i < 4; i++) {
                const rand1 = Math.sin(seed + i * 11.11) * 0.5 + 0.5;
                const rand2 = Math.cos(seed + i * 12.22) * 0.5 + 0.5;
                const wx = center.x + (rand1 - 0.5) * width * 30;
                const wy = center.y + (rand2 - 0.5) * height * 15;
                const wallAngle = rand1 * Math.PI * 0.5;
                const wallLen = 15 + rand1 * 10;
                const wallHeight = 8 + rand2 * 6;

                // Wall segment (collapsed stone wall piece)
                graphics.fillStyle(0x6a6a6a, 0.9);
                graphics.beginPath();
                graphics.moveTo(wx - wallLen * 0.5, wy);
                graphics.lineTo(wx + wallLen * 0.5, wy);
                graphics.lineTo(wx + wallLen * 0.4, wy - wallHeight);
                graphics.lineTo(wx - wallLen * 0.3, wy - wallHeight * 0.8);
                graphics.closePath();
                graphics.fillPath();

                // Shadow
                graphics.fillStyle(0x3a3a3a, 0.4);
                graphics.beginPath();
                graphics.moveTo(wx - wallLen * 0.5, wy);
                graphics.lineTo(wx + wallLen * 0.5, wy);
                graphics.lineTo(wx + wallLen * 0.6, wy + 4);
                graphics.lineTo(wx - wallLen * 0.4, wy + 3);
                graphics.closePath();
                graphics.fillPath();
            }

            // Large broken pillars/columns
            for (let i = 0; i < 2; i++) {
                const rand1 = Math.sin(seed + i * 20.1) * 0.5 + 0.5;
                const rand2 = Math.cos(seed + i * 21.2) * 0.5 + 0.5;
                const px = center.x + (rand1 - 0.5) * width * 20;
                const py = center.y + (rand2 - 0.5) * height * 10;

                // Fallen pillar
                graphics.fillStyle(0x8a7a6a, 0.9);
                graphics.fillRect(px - 12, py - 4, 24, 8);
                graphics.fillStyle(0x9a8a7a, 1);
                graphics.fillRect(px - 10, py - 6, 20, 4);
            }
        }

        // Scattered stone chunks
        for (let i = 0; i < debrisCount; i++) {
            const rand1 = Math.sin(seed + i * 1.23) * 0.5 + 0.5;
            const rand2 = Math.cos(seed + i * 2.34) * 0.5 + 0.5;
            const rand3 = Math.sin(seed + i * 3.45) * 0.5 + 0.5;

            const px = center.x + (rand1 - 0.5) * width * 32;
            const py = center.y + (rand2 - 0.5) * height * 16;
            const size = isLarge ? (4 + rand3 * 8) : (3 + rand3 * 6);

            // Stone colors vary
            const stoneColors = [0x8a8a8a, 0x6a6a6a, 0x5a5a5a, 0x7a6a5a, 0x9a8a7a];
            const colorIdx = Math.floor(rand1 * stoneColors.length);

            graphics.fillStyle(stoneColors[colorIdx], 0.9);
            // Draw irregular stone shapes
            graphics.beginPath();
            graphics.moveTo(px, py - size * 0.6);
            graphics.lineTo(px + size * 0.5, py - size * 0.2);
            graphics.lineTo(px + size * 0.4, py + size * 0.4);
            graphics.lineTo(px - size * 0.3, py + size * 0.5);
            graphics.lineTo(px - size * 0.5, py);
            graphics.closePath();
            graphics.fillPath();
        }

        // Broken wood beams (for larger buildings)
        if (width >= 2 || height >= 2) {
            const beamCount = isLarge ? 6 : Math.floor((width + height) / 2);
            for (let i = 0; i < beamCount; i++) {
                const rand1 = Math.sin(seed + i * 5.67 + 100) * 0.5 + 0.5;
                const rand2 = Math.cos(seed + i * 6.78 + 100) * 0.5 + 0.5;
                const rand3 = Math.sin(seed + i * 7.89 + 100) * 0.5 + 0.5;

                const bx = center.x + (rand1 - 0.5) * width * 26;
                const by = center.y + (rand2 - 0.5) * height * 13;
                const angle = rand3 * Math.PI;
                const length = isLarge ? (12 + rand1 * 18) : (8 + rand1 * 12);

                graphics.lineStyle(isLarge ? 4 : 3, 0x5a3a2a, 0.8);
                graphics.lineBetween(
                    bx - Math.cos(angle) * length,
                    by - Math.sin(angle) * length * 0.5,
                    bx + Math.cos(angle) * length,
                    by + Math.sin(angle) * length * 0.5
                );

                // Charred ends for large rubble (pixelated)
                if (isLarge) {
                    graphics.fillStyle(0x2a1a0a, 0.7);
                    const cx = bx - Math.cos(angle) * length;
                    const cy = by - Math.sin(angle) * length * 0.5;
                    graphics.fillRect(cx - 2, cy - 2, 5, 5);
                }
            }
        }

        // Dust/ash patches - use rectangles for pixelated look
        for (let i = 0; i < debrisCount / 2; i++) {
            const rand1 = Math.sin(seed + i * 9.01 + 200) * 0.5 + 0.5;
            const rand2 = Math.cos(seed + i * 0.12 + 200) * 0.5 + 0.5;

            const dx = center.x + (rand1 - 0.5) * width * 28;
            const dy = center.y + (rand2 - 0.5) * height * 14;
            const size = 4 + rand1 * 4;

            graphics.fillStyle(0x4a4a4a, 0.3);
            graphics.fillRect(dx - size / 2, dy - size / 2, size, size);
        }

        // BURNING EFFECTS for large (3x3) rubble - fades out over time
        // All effects use rectangles for consistent pixelation
        if (isLarge && time > 0) {
            // Fire spots - fade out based on fireIntensity
            if (fireIntensity > 0.05) {
                for (let i = 0; i < 4; i++) {
                    const rand1 = Math.sin(seed + i * 30.3) * 0.5 + 0.5;
                    const rand2 = Math.cos(seed + i * 31.4) * 0.5 + 0.5;
                    const fx = center.x + (rand1 - 0.5) * width * 20;
                    const fy = center.y + (rand2 - 0.5) * height * 10;

                    const flicker = Math.sin(time / 100 + i * 2) * 0.3 + 0.7;
                    const fireSize = Math.floor((6 + Math.sin(time / 150 + i) * 3) * fireIntensity);

                    // Orange glow base (rectangle)
                    const glowSize = fireSize + 6;
                    graphics.fillStyle(0xff6600, 0.4 * flicker * fireIntensity);
                    graphics.fillRect(fx - glowSize / 2, fy - glowSize / 2, glowSize, glowSize);

                    // Fire core (rectangle)
                    graphics.fillStyle(0xff4400, 0.7 * flicker * fireIntensity);
                    graphics.fillRect(fx - fireSize / 2, fy - 2 - fireSize / 2, fireSize, fireSize);

                    // Yellow flame tip (small rectangle)
                    const tipSize = Math.max(2, fireSize * 0.5);
                    const tipY = fy - 5 - Math.sin(time / 80 + i) * 2;
                    graphics.fillStyle(0xffaa00, 0.8 * flicker * fireIntensity);
                    graphics.fillRect(fx - tipSize / 2, tipY - tipSize / 2, tipSize, tipSize);
                }

                // Rising embers - small pixel particles
                for (let i = 0; i < 6; i++) {
                    const rand1 = Math.sin(seed + i * 40.4) * 0.5 + 0.5;
                    const rand2 = Math.cos(seed + i * 41.5) * 0.5 + 0.5;
                    const emberCycle = ((time / 2000) + rand1) % 1;

                    const ex = center.x + (rand1 - 0.5) * width * 15 + Math.sin(time / 300 + i) * 5;
                    const ey = center.y + (rand2 - 0.5) * height * 8 - emberCycle * 30;
                    const emberAlpha = (1 - emberCycle) * 0.8 * fireIntensity;

                    graphics.fillStyle(0xff6600, emberAlpha);
                    graphics.fillRect(ex - 1, ey - 1, 3, 3); // 3x3 pixel ember
                }
            }

            // Smoke wisps - INCREASE as fire fades out (smoldering effect)
            // Use rectangles for pixelated smoke
            const smokeIntensity = 1 - fireIntensity * 0.5; // More smoke as fire fades
            const smokeCount = fireIntensity > 0.3 ? 3 : 5; // More smoke when fire is low
            for (let i = 0; i < smokeCount; i++) {
                const rand1 = Math.sin(seed + i * 50.5) * 0.5 + 0.5;
                const rand2 = Math.cos(seed + i * 51.6) * 0.5 + 0.5;
                const smokeCycle = ((time / 3000) + rand1) % 1;

                const sx = center.x + (rand1 - 0.5) * width * 12 + Math.sin(time / 500 + i) * 8;
                const sy = center.y + (rand2 - 0.5) * height * 6 - smokeCycle * 50;
                const smokeAlpha = (1 - smokeCycle) * 0.3 * smokeIntensity;
                const smokeSize = Math.floor((4 + smokeCycle * 10) * smokeIntensity);

                graphics.fillStyle(0x555555, smokeAlpha);
                graphics.fillRect(sx - smokeSize / 2, sy - smokeSize / 2, smokeSize, smokeSize);
            }
        }
    }

    private growGrass(time: number) {
        if (this.mode !== 'HOME') return;
        // Grow every 1000ms (Reduced rate: 2x slower and sparser)
        if (time < this.lastGrassGrowTime + 1000) return;
        this.lastGrassGrowTime = time;

        const grass = this.obstacles.filter(o => o.type === 'grass_patch');
        const maxGrass = this.mapSize * this.mapSize * 0.07; // 7% limit (sparser)

        if (grass.length >= maxGrass) return;



        // Spread logic: Pick random grass, try neighbor (high probability)
        const spreadChance = grass.length > 5 ? 0.9 : 0.4; // If established, spread mostly

        if (grass.length > 0 && Math.random() < spreadChance) {
            const parent = grass[Math.floor(Math.random() * grass.length)];
            const neighbors = [
                { x: parent.gridX + 1, y: parent.gridY },
                { x: parent.gridX - 1, y: parent.gridY },
                { x: parent.gridX, y: parent.gridY + 1 },
                { x: parent.gridX, y: parent.gridY - 1 }
            ];
            const spot = neighbors[Math.floor(Math.random() * neighbors.length)];
            // placeObstacle checks validity (bounds + optimization)
            this.placeObstacle(spot.x, spot.y, 'grass_patch');
        } else {
            // Spontaneous generation
            const x = Math.floor(Math.random() * (this.mapSize - 4)) + 2;
            const y = Math.floor(Math.random() * (this.mapSize - 4)) + 2;
            this.placeObstacle(x, y, 'grass_patch');
        }
    }

    private updateRubbleAnimations(time: number) {
        const now = Date.now();
        this.rubble.forEach(r => {
            // Only animate large rubble (3x3)
            if (r.width >= 3 || r.height >= 3) {
                r.graphics.clear();

                // Fire fades out over time: full for 15s, then fades over 30s
                const age = (now - r.createdAt) / 1000; // Age in seconds
                let fireIntensity = 1;
                if (age > 15) {
                    // Fade from 1 to 0 between 15s and 45s
                    fireIntensity = Math.max(0, 1 - (age - 15) / 30);
                }

                this.drawRubble(r.graphics, r.gridX, r.gridY, r.width, r.height, time, fireIntensity);
            }
        });
    }

    private clearRubble() {
        this.rubble.forEach(r => r.graphics.destroy());
        this.rubble = [];
    }

    // === OBSTACLE SYSTEM (Rocks, Trees, Grass) ===
    private placeObstacle(gridX: number, gridY: number, type: ObstacleType): boolean {
        const info = OBSTACLES[type];
        if (!info) return false;

        // Check if position is valid (not overlapping buildings or other obstacles)
        if (!this.isObstaclePositionValid(gridX, gridY, info.width, info.height)) return false;

        const graphics = this.add.graphics();
        const animOffset = Math.random() * 1000;

        const obstacle: PlacedObstacle = {
            id: Phaser.Utils.String.UUID(),
            type,
            gridX,
            gridY,
            graphics,
            animOffset
        };

        this.drawObstacle(obstacle);

        const depth = (gridX + info.width) + (gridY + info.height);
        graphics.setDepth(depth * 10);

        this.obstacles.push(obstacle);

        // Persist to backend if in HOME mode
        if (this.mode === 'HOME') {
            Backend.placeObstacle('player_home', type, gridX, gridY);
        }
        return true;
    }

    private isObstaclePositionValid(gridX: number, gridY: number, width: number, height: number): boolean {
        if (gridX < 0 || gridY < 0 || gridX + width > this.mapSize || gridY + height > this.mapSize) return false;

        // Check buildings
        for (const b of this.buildings) {
            const bInfo = BUILDINGS[b.type];
            const overlapX = Math.max(0, Math.min(gridX + width, b.gridX + bInfo.width) - Math.max(gridX, b.gridX));
            const overlapY = Math.max(0, Math.min(gridY + height, b.gridY + bInfo.height) - Math.max(gridY, b.gridY));
            if (overlapX > 0 && overlapY > 0) return false;
        }

        // Check other obstacles
        for (const o of this.obstacles) {
            const oInfo = OBSTACLES[o.type];
            const overlapX = Math.max(0, Math.min(gridX + width, o.gridX + oInfo.width) - Math.max(gridX, o.gridX));
            const overlapY = Math.max(0, Math.min(gridY + height, o.gridY + oInfo.height) - Math.max(gridY, o.gridY));
            if (overlapX > 0 && overlapY > 0) return false;
        }

        return true;
    }

    private drawObstacle(obstacle: PlacedObstacle, time: number = 0) {
        const info = OBSTACLES[obstacle.type];
        const center = this.cartToIso(obstacle.gridX + info.width / 2, obstacle.gridY + info.height / 2);

        obstacle.graphics.clear();

        switch (obstacle.type) {
            case 'rock_small':
                this.drawSmallRock(obstacle.graphics, center);
                break;
            case 'rock_large':
                this.drawLargeRock(obstacle.graphics, center);
                break;
            case 'tree_oak':
                this.drawOakTree(obstacle.graphics, center, time + obstacle.animOffset);
                break;
            case 'tree_pine':
                this.drawPineTree(obstacle.graphics, center, time + obstacle.animOffset);
                break;
            case 'grass_patch':
                this.drawGrassPatch(obstacle.graphics, center, time + obstacle.animOffset);
                break;
        }
    }

    private drawSmallRock(graphics: Phaser.GameObjects.Graphics, center: Phaser.Math.Vector2) {
        const x = center.x;
        const y = center.y;

        // Ground contact shadow (very subtle, touching the rock)
        graphics.fillStyle(0x3a3a3a, 0.25);
        graphics.fillEllipse(x, y + 2, 16, 5);

        // Flat stone base sitting ON the ground (isometric diamond shape)
        graphics.fillStyle(0x6a6a6a, 1);
        graphics.beginPath();
        graphics.moveTo(x, y - 4); // top
        graphics.lineTo(x + 10, y + 1); // right
        graphics.lineTo(x, y + 6); // bottom
        graphics.lineTo(x - 10, y + 1); // left
        graphics.closePath();
        graphics.fillPath();

        // Top surface (lighter, slightly raised)
        graphics.fillStyle(0x8a8a8a, 1);
        graphics.beginPath();
        graphics.moveTo(x, y - 6); // top
        graphics.lineTo(x + 8, y - 1); // right
        graphics.lineTo(x, y + 3); // bottom
        graphics.lineTo(x - 8, y - 1); // left
        graphics.closePath();
        graphics.fillPath();

        // Highlight on top-left edge
        graphics.fillStyle(0x9a9a9a, 0.7);
        graphics.beginPath();
        graphics.moveTo(x - 6, y - 2);
        graphics.lineTo(x, y - 5);
        graphics.lineTo(x + 2, y - 3);
        graphics.lineTo(x - 4, y);
        graphics.closePath();
        graphics.fillPath();

        // Small texture details (crevices)
        graphics.lineStyle(1, 0x5a5a5a, 0.6);
        graphics.lineBetween(x - 3, y, x + 3, y + 1);
    }

    private drawLargeRock(graphics: Phaser.GameObjects.Graphics, center: Phaser.Math.Vector2) {
        const x = center.x;
        const y = center.y;

        // Ground contact shadow (subtle, directly under rocks)
        graphics.fillStyle(0x3a3a3a, 0.2);
        graphics.fillEllipse(x, y + 6, 40, 12);

        // Main stone slab (flat isometric, sitting on ground)
        graphics.fillStyle(0x5a5a5a, 1);
        graphics.beginPath();
        graphics.moveTo(x, y - 8); // top
        graphics.lineTo(x + 18, y); // right
        graphics.lineTo(x, y + 10); // bottom
        graphics.lineTo(x - 18, y); // left
        graphics.closePath();
        graphics.fillPath();

        // Top surface of main slab (lighter)
        graphics.fillStyle(0x7a7a7a, 1);
        graphics.beginPath();
        graphics.moveTo(x, y - 10); // top
        graphics.lineTo(x + 15, y - 2); // right
        graphics.lineTo(x, y + 6); // bottom
        graphics.lineTo(x - 15, y - 2); // left
        graphics.closePath();
        graphics.fillPath();

        // Second smaller stone (overlapping, slight offset)
        graphics.fillStyle(0x6a6a6a, 1);
        graphics.beginPath();
        graphics.moveTo(x + 8, y - 12); // top
        graphics.lineTo(x + 18, y - 6); // right
        graphics.lineTo(x + 10, y); // bottom
        graphics.lineTo(x, y - 6); // left
        graphics.closePath();
        graphics.fillPath();

        // Top of second stone
        graphics.fillStyle(0x8a8a8a, 1);
        graphics.beginPath();
        graphics.moveTo(x + 8, y - 14);
        graphics.lineTo(x + 16, y - 8);
        graphics.lineTo(x + 10, y - 3);
        graphics.lineTo(x + 2, y - 8);
        graphics.closePath();
        graphics.fillPath();

        // Third small stone (bottom left area)
        graphics.fillStyle(0x5a5a5a, 1);
        graphics.beginPath();
        graphics.moveTo(x - 10, y + 2);
        graphics.lineTo(x - 4, y + 6);
        graphics.lineTo(x - 8, y + 10);
        graphics.lineTo(x - 14, y + 6);
        graphics.closePath();
        graphics.fillPath();

        // Highlight on main stone
        graphics.fillStyle(0x9a9a9a, 0.6);
        graphics.beginPath();
        graphics.moveTo(x - 10, y - 4);
        graphics.lineTo(x, y - 8);
        graphics.lineTo(x + 4, y - 6);
        graphics.lineTo(x - 6, y - 2);
        graphics.closePath();
        graphics.fillPath();

        // Moss patch between stones
        graphics.fillStyle(0x4a6a4a, 0.5);
        graphics.fillCircle(x - 4, y + 3, 3);
        graphics.fillCircle(x + 6, y - 3, 2);

        // Crevice details
        graphics.lineStyle(1, 0x4a4a4a, 0.5);
        graphics.lineBetween(x - 8, y, x + 4, y + 2);
        graphics.lineBetween(x + 2, y - 4, x + 8, y - 2);
    }

    private drawOakTree(graphics: Phaser.GameObjects.Graphics, center: Phaser.Math.Vector2, time: number) {
        const x = center.x;
        const y = center.y;
        const sway = Math.sin(time / 800) * 2;

        // Shadow
        graphics.fillStyle(0x333333, 0.3);
        graphics.fillEllipse(x + 5, y + 20, 40, 16);

        // Trunk
        graphics.fillStyle(0x5a3a2a, 1);
        graphics.beginPath();
        graphics.moveTo(x - 6, y + 15);
        graphics.lineTo(x - 4 + sway * 0.3, y - 15);
        graphics.lineTo(x + 4 + sway * 0.3, y - 15);
        graphics.lineTo(x + 6, y + 15);
        graphics.closePath();
        graphics.fillPath();

        // Trunk bark detail
        graphics.lineStyle(1, 0x4a2a1a, 0.6);
        graphics.lineBetween(x - 2, y + 10, x - 1 + sway * 0.2, y - 10);
        graphics.lineBetween(x + 2, y + 12, x + 1 + sway * 0.2, y - 8);

        // Foliage layers (bottom to top)
        const foliageColors = [0x2a6a2a, 0x3a8a3a, 0x4a9a4a];
        const foliageLayers = [
            { yOff: -20, size: 24, sway: sway * 0.5 },
            { yOff: -30, size: 20, sway: sway * 0.7 },
            { yOff: -40, size: 16, sway: sway * 1.0 }
        ];

        foliageLayers.forEach((layer, i) => {
            graphics.fillStyle(foliageColors[i], 1);
            graphics.fillEllipse(x + layer.sway, y + layer.yOff, layer.size, layer.size * 0.6);
        });

        // Highlight spots on top layer
        graphics.fillStyle(0x5aaa5a, 0.5);
        graphics.fillCircle(x - 4 + sway, y - 42, 4);
        graphics.fillCircle(x + 6 + sway, y - 38, 3);
    }

    private drawPineTree(graphics: Phaser.GameObjects.Graphics, center: Phaser.Math.Vector2, time: number) {
        const x = center.x;
        const y = center.y;
        const sway = Math.sin(time / 700) * 1.5;

        // Shadow
        graphics.fillStyle(0x333333, 0.3);
        graphics.fillEllipse(x + 3, y + 12, 20, 8);

        // Trunk
        graphics.fillStyle(0x5a3a2a, 1);
        graphics.beginPath();
        graphics.moveTo(x - 3, y + 10);
        graphics.lineTo(x - 2 + sway * 0.2, y - 10);
        graphics.lineTo(x + 2 + sway * 0.2, y - 10);
        graphics.lineTo(x + 3, y + 10);
        graphics.closePath();
        graphics.fillPath();

        // Pine layers (triangular)
        const pineColors = [0x1a5a2a, 0x2a6a3a, 0x3a7a4a];
        const layers = [
            { yOff: -5, width: 18, height: 12, sway: sway * 0.3 },
            { yOff: -15, width: 14, height: 12, sway: sway * 0.6 },
            { yOff: -25, width: 10, height: 12, sway: sway * 0.9 },
            { yOff: -34, width: 6, height: 10, sway: sway * 1.2 }
        ];

        layers.forEach((layer, i) => {
            graphics.fillStyle(pineColors[Math.min(i, 2)], 1);
            graphics.beginPath();
            graphics.moveTo(x + layer.sway, y + layer.yOff - layer.height);
            graphics.lineTo(x + layer.width / 2 + layer.sway * 0.5, y + layer.yOff);
            graphics.lineTo(x - layer.width / 2 + layer.sway * 0.5, y + layer.yOff);
            graphics.closePath();
            graphics.fillPath();
        });
    }

    private drawGrassPatch(graphics: Phaser.GameObjects.Graphics, center: Phaser.Math.Vector2, time: number) {
        const x = center.x;
        const y = center.y;

        // Draw multiple grass blades
        for (let i = 0; i < 8; i++) {
            const bx = x + (i - 4) * 4 + Math.sin(i * 2) * 3;
            const by = y + Math.cos(i * 3) * 4;
            const sway = Math.sin(time / 500 + i * 0.5) * 2;
            const height = 10 + Math.sin(i * 1.5) * 4;

            const grassColor = i % 2 === 0 ? 0x4a8a4a : 0x5a9a5a;
            graphics.lineStyle(2, grassColor, 0.9);
            graphics.beginPath();
            graphics.moveTo(bx, by);
            graphics.lineTo(bx + sway, by - height);
            graphics.strokePath();
        }

        // Ground accent
        graphics.fillStyle(0x3a6a3a, 0.3);
        graphics.fillEllipse(x, y + 2, 16, 6);
    }

    private updateObstacleAnimations(time: number) {
        this.obstacles.forEach(obstacle => {
            if (obstacle.type === 'tree_oak' || obstacle.type === 'tree_pine' || obstacle.type === 'grass_patch') {
                this.drawObstacle(obstacle, time);
            }
        });
    }

    private removeObstacle(obstacleId: string): boolean {
        const index = this.obstacles.findIndex(o => o.id === obstacleId);
        if (index === -1) return false;

        const obstacle = this.obstacles[index];
        obstacle.graphics.destroy();
        this.obstacles.splice(index, 1);

        // Persist to backend if in HOME mode
        if (this.mode === 'HOME') {
            Backend.removeObstacle('player_home', obstacleId);
        }
        return true;
    }

    private clearObstacles() {
        this.obstacles.forEach(o => o.graphics.destroy());
        this.obstacles = [];
    }

    private spawnRandomObstacles(count: number = 12) {
        // Weighted types - grass appears 5x more often
        const types: ObstacleType[] = [
            'rock_small', 'rock_large',
            'tree_oak', 'tree_pine',
            'grass_patch', 'grass_patch', 'grass_patch', 'grass_patch', 'grass_patch' // 5x grass
        ];
        let placed = 0;
        let attempts = 0;

        while (placed < count && attempts < count * 10) {
            const type = types[Math.floor(Math.random() * types.length)];
            const info = OBSTACLES[type];
            const gridX = Math.floor(Math.random() * (this.mapSize - info.width - 4)) + 2;
            const gridY = Math.floor(Math.random() * (this.mapSize - info.height - 4)) + 2;

            // Avoid center of map (where town hall usually goes)
            const centerDist = Math.abs(gridX - 12) + Math.abs(gridY - 12);
            if (centerDist < 6) {
                attempts++;
                continue;
            }

            if (this.placeObstacle(gridX, gridY, type)) {
                placed++;
            }
            attempts++;
        }
    }

    private drawWall(graphics: Phaser.GameObjects.Graphics, _center: Phaser.Math.Vector2, gridX: number, gridY: number, alpha: number, tint: number | null, building?: PlacedBuilding) {
        // Isometric wall with proper connected segments
        // Key: Only draw segments toward neighbors with LOWER depth (behind us in iso view)
        // This ensures segment tops are drawn by the "front" wall, preventing overlap issues
        const wallHeight = 20;
        const wallThickness = 0.3;
        const owner = building?.owner ?? 'PLAYER';

        // Stone colors - consistent isometric shading
        const stoneTop = tint ?? 0xd4c4a8;
        const stoneFront = tint ?? 0xa89878;
        const stoneSide = tint ?? 0x8a7a68;

        // Check which neighbors exist
        const hasNeighbor = (dx: number, dy: number) => {
            return this.buildings.some(b =>
                b.type === 'wall' &&
                b.gridX === gridX + dx &&
                b.gridY === gridY + dy &&
                b.owner === owner
            );
        };

        const nN = hasNeighbor(0, -1); // North (Y-1) - LOWER depth, draw TO it
        const nS = hasNeighbor(0, 1);  // South (Y+1) - HIGHER depth, don't draw
        const nW = hasNeighbor(-1, 0); // West (X-1) - LOWER depth, draw TO it
        const nE = hasNeighbor(1, 0);  // East (X+1) - HIGHER depth, don't draw

        const hw = wallThickness / 2;
        const cx = gridX + 0.5;
        const cy = gridY + 0.5;

        // Collect geometry: sides first, then tops
        const sideFaces: { points: Phaser.Math.Vector2[], color: number }[] = [];
        const topFaces: Phaser.Math.Vector2[][] = [];

        // Helper to add a segment's geometry
        const addSegment = (x1: number, y1: number, x2: number, y2: number) => {
            const isVertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);

            if (isVertical) {
                // Segment runs in Y direction (N-S in grid)
                const minY = Math.min(y1, y2);
                const maxY = Math.max(y1, y2);

                const bl = this.cartToIso(x1 - hw, minY);
                const br = this.cartToIso(x1 + hw, minY);
                const fl = this.cartToIso(x1 - hw, maxY);
                const fr = this.cartToIso(x1 + hw, maxY);

                const tbl = new Phaser.Math.Vector2(bl.x, bl.y - wallHeight);
                const tbr = new Phaser.Math.Vector2(br.x, br.y - wallHeight);
                const tfl = new Phaser.Math.Vector2(fl.x, fl.y - wallHeight);
                const tfr = new Phaser.Math.Vector2(fr.x, fr.y - wallHeight);

                // Right face (SE)
                sideFaces.push({ points: [br, fr, tfr, tbr], color: stoneSide });
                // Front face (SW)
                sideFaces.push({ points: [fr, fl, tfl, tfr], color: stoneFront });
                // Top
                topFaces.push([tbl, tbr, tfr, tfl]);
            } else {
                // Segment runs in X direction (E-W in grid)
                const minX = Math.min(x1, x2);
                const maxX = Math.max(x1, x2);

                const lt = this.cartToIso(minX, y1 - hw);
                const lb = this.cartToIso(minX, y1 + hw);
                const rt = this.cartToIso(maxX, y1 - hw);
                const rb = this.cartToIso(maxX, y1 + hw);

                const tlt = new Phaser.Math.Vector2(lt.x, lt.y - wallHeight);
                const tlb = new Phaser.Math.Vector2(lb.x, lb.y - wallHeight);
                const trt = new Phaser.Math.Vector2(rt.x, rt.y - wallHeight);
                const trb = new Phaser.Math.Vector2(rb.x, rb.y - wallHeight);

                // Right face (SE)
                sideFaces.push({ points: [rt, rb, trb, trt], color: stoneSide });
                // Front face (SW)
                sideFaces.push({ points: [rb, lb, tlb, trb], color: stoneFront });
                // Top
                topFaces.push([tlt, trt, trb, tlb]);
            }
        };

        // Only draw segments toward neighbors with LOWER depth (North and West)
        // This wall is "in front" so it owns these segments and their tops render last
        // Segments extend all the way to neighbor's center to connect properly
        if (nN) addSegment(cx, cy, cx, gridY - 0.5);       // To North neighbor's center
        if (nW) addSegment(cx, cy, gridX - 0.5, cy);       // To West neighbor's center

        // Central pillar
        const ps = wallThickness * 0.6;
        const hps = ps / 2;

        const pTL = this.cartToIso(cx - hps, cy - hps);
        const pTR = this.cartToIso(cx + hps, cy - hps);
        const pBR = this.cartToIso(cx + hps, cy + hps);
        const pBL = this.cartToIso(cx - hps, cy + hps);

        const ptTL = new Phaser.Math.Vector2(pTL.x, pTL.y - wallHeight);
        const ptTR = new Phaser.Math.Vector2(pTR.x, pTR.y - wallHeight);
        const ptBR = new Phaser.Math.Vector2(pBR.x, pBR.y - wallHeight);
        const ptBL = new Phaser.Math.Vector2(pBL.x, pBL.y - wallHeight);

        sideFaces.push({ points: [pTR, pBR, ptBR, ptTR], color: stoneSide });
        sideFaces.push({ points: [pBR, pBL, ptBL, ptBR], color: stoneFront });
        topFaces.push([ptTL, ptTR, ptBR, ptBL]);

        // === RENDER PASS 1: All side faces ===
        for (const face of sideFaces) {
            graphics.fillStyle(face.color, alpha);
            graphics.fillPoints(face.points, true);
        }

        // === RENDER PASS 2: All top faces ===
        graphics.fillStyle(stoneTop, alpha);
        for (const top of topFaces) {
            graphics.fillPoints(top, true);
        }

        // === RENDER PASS 3: Top highlights ===
        graphics.lineStyle(1, 0xe8dcc8, alpha * 0.6);
        graphics.lineBetween(ptTL.x, ptTL.y, ptTR.x, ptTR.y);
        graphics.lineBetween(ptTL.x, ptTL.y, ptBL.x, ptBL.y);

        // Junction decoration
        const neighborCount = (nN ? 1 : 0) + (nS ? 1 : 0) + (nE ? 1 : 0) + (nW ? 1 : 0);
        if (neighborCount >= 3) {
            const pcx = (ptTL.x + ptBR.x) / 2;
            const pcy = (ptTL.y + ptBR.y) / 2;
            graphics.fillStyle(0xe8dcc8, alpha);
            graphics.fillCircle(pcx, pcy, 2.5);
        }
    }

    private drawArmyCamp(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, baseGraphics?: Phaser.GameObjects.Graphics) {
        const time = this.time.now;
        const g = baseGraphics || graphics; // Draw floor on baseGraphics if available

        const info = BUILDINGS['army_camp'];
        const ringRadiusX = 15 * info.width;
        const ringRadiusY = 7.5 * info.height;

        // === TRAINING GROUND BASE ===
        // Packed dirt/sand arena floor
        g.fillStyle(tint ?? 0xb8a080, alpha);
        g.fillPoints([c1, c2, c3, c4], true);

        // Inner training circle (worn area)
        g.lineStyle(2, 0xa89070, 0.5 * alpha);
        g.strokeEllipse(center.x, center.y, ringRadiusX * 2, ringRadiusY * 2);
        g.fillStyle(0xa89070, 0.3 * alpha);
        g.fillEllipse(center.x, center.y, ringRadiusX * 2, ringRadiusY * 2);
        // Ground texture - packed earth patterns
        g.fillStyle(0x9a8060, alpha * 0.5);
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const dist = 20 + (i % 3) * 12;
            const ox = Math.cos(angle) * dist * 0.8;
            const oy = Math.sin(angle) * dist * 0.4;
            g.fillCircle(center.x + ox, center.y + 5 + oy, 2 + (i % 2));
        }

        // Simple border
        g.lineStyle(2, 0x8b7355, alpha * 0.7);
        g.strokePoints([c1, c2, c3, c4], true, true);

        // === CENTRAL CAMPFIRE ===
        const fireX = center.x;
        const fireY = center.y + 8;

        // Fire pit stones (ring) - Move to ground layer
        g.fillStyle(0x555555, alpha);
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const stoneX = fireX + Math.cos(angle) * 12;
            const stoneY = fireY + Math.sin(angle) * 6;
            g.fillEllipse(stoneX, stoneY, 5, 3);
        }

        // Fire pit inner (ash/coals) - Ground layer
        g.fillStyle(0x2a2020, alpha);
        g.fillEllipse(fireX, fireY, 10, 5);

        // Glowing coals - Ground layer
        const coalGlow = 0.5 + Math.sin(time / 200) * 0.2;
        g.fillStyle(0x881100, alpha * coalGlow);
        g.fillEllipse(fireX, fireY, 8, 4);
        g.fillStyle(0xcc3300, alpha * coalGlow * 0.7);
        g.fillEllipse(fireX - 2, fireY, 4, 2);
        g.fillEllipse(fireX + 3, fireY + 1, 3, 1.5);

        // Main flame animation
        const flame1 = Math.sin(time / 60) * 0.3 + 0.7;
        const flame2 = Math.sin(time / 45 + 1) * 0.25 + 0.75;
        const flame3 = Math.sin(time / 80 + 2) * 0.35 + 0.65;

        // Flame glow on ground
        graphics.fillStyle(0xff4400, alpha * 0.15 * flame1);
        graphics.fillEllipse(fireX, fireY, 25, 12);

        // Back flames (draw first)
        graphics.fillStyle(0xdd4400, alpha * flame3);
        graphics.beginPath();
        graphics.moveTo(fireX - 6, fireY);
        graphics.lineTo(fireX - 8, fireY - 12 - flame3 * 5);
        graphics.lineTo(fireX - 3, fireY - 8);
        graphics.lineTo(fireX - 5, fireY - 18 - flame2 * 6);
        graphics.lineTo(fireX, fireY - 10);
        graphics.lineTo(fireX + 2, fireY - 16 - flame1 * 5);
        graphics.lineTo(fireX + 5, fireY - 6);
        graphics.lineTo(fireX + 7, fireY - 14 - flame3 * 4);
        graphics.lineTo(fireX + 6, fireY);
        graphics.closePath();
        graphics.fillPath();

        // Mid flames (orange)
        graphics.fillStyle(0xff6600, alpha * flame1);
        graphics.beginPath();
        graphics.moveTo(fireX - 5, fireY);
        graphics.lineTo(fireX - 6, fireY - 10 - flame2 * 4);
        graphics.lineTo(fireX - 2, fireY - 7);
        graphics.lineTo(fireX - 3, fireY - 15 - flame1 * 5);
        graphics.lineTo(fireX + 1, fireY - 9);
        graphics.lineTo(fireX + 3, fireY - 13 - flame3 * 4);
        graphics.lineTo(fireX + 5, fireY - 5);
        graphics.lineTo(fireX + 5, fireY);
        graphics.closePath();
        graphics.fillPath();

        // Inner flames (yellow-orange)
        graphics.fillStyle(0xffaa00, alpha * flame2);
        graphics.beginPath();
        graphics.moveTo(fireX - 3, fireY);
        graphics.lineTo(fireX - 4, fireY - 7 - flame1 * 3);
        graphics.lineTo(fireX - 1, fireY - 5);
        graphics.lineTo(fireX, fireY - 11 - flame2 * 4);
        graphics.lineTo(fireX + 2, fireY - 6);
        graphics.lineTo(fireX + 3, fireY - 8 - flame3 * 3);
        graphics.lineTo(fireX + 3, fireY);
        graphics.closePath();
        graphics.fillPath();

        // Core flames (yellow)
        graphics.fillStyle(0xffdd44, alpha * flame3);
        graphics.beginPath();
        graphics.moveTo(fireX - 2, fireY);
        graphics.lineTo(fireX - 2, fireY - 5 - flame2 * 2);
        graphics.lineTo(fireX, fireY - 8 - flame1 * 3);
        graphics.lineTo(fireX + 2, fireY - 4 - flame3 * 2);
        graphics.lineTo(fireX + 2, fireY);
        graphics.closePath();
        graphics.fillPath();

        // Fire sparks/embers rising
        for (let i = 0; i < 5; i++) {
            const sparkPhase = (time / 80 + i * 40) % 40;
            if (sparkPhase < 35) {
                const sparkRise = sparkPhase * 0.7;
                const sparkDrift = Math.sin(sparkPhase * 0.3 + i) * 4;
                const sparkAlpha = 1 - sparkPhase / 35;
                graphics.fillStyle(0xffaa44, alpha * sparkAlpha * 0.8);
                graphics.fillCircle(fireX + sparkDrift + (i - 2) * 2, fireY - 15 - sparkRise, 1.2);
            }
        }

        // === TRAINING DUMMY (left side) ===
        const dummyX = center.x - 35;
        const dummyY = center.y - 5;

        // Dummy post
        graphics.fillStyle(0x5d4e37, alpha);
        graphics.fillRect(dummyX - 2, dummyY - 25, 4, 30);
        graphics.fillStyle(0x3d2e17, alpha);
        graphics.fillRect(dummyX + 1, dummyY - 25, 1, 30);

        // Dummy body (straw-stuffed sack)
        graphics.fillStyle(0xc4a060, alpha);
        graphics.fillEllipse(dummyX, dummyY - 18, 8, 12);
        graphics.fillStyle(0xa48040, alpha * 0.6);
        graphics.fillEllipse(dummyX + 2, dummyY - 18, 5, 10);

        // Dummy head
        graphics.fillStyle(0xc4a060, alpha);
        graphics.fillCircle(dummyX, dummyY - 32, 6);
        graphics.fillStyle(0xa48040, alpha * 0.5);
        graphics.fillCircle(dummyX + 1, dummyY - 32, 4);

        // Dummy arms (wooden crossbar)
        graphics.fillStyle(0x5d4e37, alpha);
        graphics.fillRect(dummyX - 10, dummyY - 22, 20, 3);

        // Straw detail
        graphics.lineStyle(1, 0x8a7030, alpha * 0.6);
        graphics.lineBetween(dummyX - 4, dummyY - 10, dummyX - 6, dummyY - 5);
        graphics.lineBetween(dummyX + 3, dummyY - 10, dummyX + 5, dummyY - 6);
        graphics.lineBetween(dummyX, dummyY - 10, dummyX, dummyY - 4);

        // === WEAPON RACK (right side) ===
        const rackX = center.x + 35;
        const rackY = center.y;

        // Rack frame (A-frame)
        graphics.fillStyle(0x5d4e37, alpha);
        // Left leg
        graphics.beginPath();
        graphics.moveTo(rackX - 10, rackY + 5);
        graphics.lineTo(rackX - 8, rackY - 20);
        graphics.lineTo(rackX - 5, rackY - 20);
        graphics.lineTo(rackX - 7, rackY + 5);
        graphics.closePath();
        graphics.fillPath();

        // Right leg
        graphics.beginPath();
        graphics.moveTo(rackX + 10, rackY + 5);
        graphics.lineTo(rackX + 8, rackY - 20);
        graphics.lineTo(rackX + 5, rackY - 20);
        graphics.lineTo(rackX + 7, rackY + 5);
        graphics.closePath();
        graphics.fillPath();

        // Cross bar
        graphics.fillRect(rackX - 9, rackY - 18, 18, 3);
        graphics.fillStyle(0x3d2e17, alpha);
        graphics.fillRect(rackX - 9, rackY - 16, 18, 1);

        // Weapons on rack
        // Sword 1
        graphics.fillStyle(0x888888, alpha);
        graphics.fillRect(rackX - 7, rackY - 30, 2, 14);
        graphics.fillStyle(0x5d4e37, alpha);
        graphics.fillRect(rackX - 8, rackY - 17, 4, 3);
        graphics.fillStyle(0xccaa00, alpha);
        graphics.fillRect(rackX - 7, rackY - 17, 2, 1);

        // Sword 2
        graphics.fillStyle(0x777777, alpha);
        graphics.fillRect(rackX + 1, rackY - 28, 2, 12);
        graphics.fillStyle(0x5d4e37, alpha);
        graphics.fillRect(rackX, rackY - 17, 4, 3);
        graphics.fillStyle(0xccaa00, alpha);
        graphics.fillRect(rackX + 1, rackY - 17, 2, 1);

        // Axe
        graphics.fillStyle(0x5d4e37, alpha);
        graphics.fillRect(rackX + 6, rackY - 32, 2, 16);
        graphics.fillStyle(0x666666, alpha);
        graphics.beginPath();
        graphics.moveTo(rackX + 5, rackY - 32);
        graphics.lineTo(rackX + 11, rackY - 30);
        graphics.lineTo(rackX + 11, rackY - 26);
        graphics.lineTo(rackX + 5, rackY - 24);
        graphics.closePath();
        graphics.fillPath();
    }

    private drawGenericBuilding(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, _center: Phaser.Math.Vector2, info: any, alpha: number, tint: number | null) {
        const color = tint ?? info.color;
        const height = 30 * Math.max(info.width, info.height);
        const t1 = new Phaser.Math.Vector2(c1.x, c1.y - height);
        const t2 = new Phaser.Math.Vector2(c2.x, c2.y - height);
        const t3 = new Phaser.Math.Vector2(c3.x, c3.y - height);
        const t4 = new Phaser.Math.Vector2(c4.x, c4.y - height);

        graphics.fillStyle(color, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);

        const darkColor = Phaser.Display.Color.IntegerToColor(color).darken(20).color;
        const lightColor = Phaser.Display.Color.IntegerToColor(color).brighten(10).color;

        graphics.fillStyle(darkColor, alpha);
        graphics.fillPoints([c2, c3, t3, t2], true);
        graphics.fillStyle(lightColor, alpha);
        graphics.fillPoints([c3, c4, t4, t3], true);

        graphics.lineStyle(1, 0x000000, 0.3 * alpha);
        graphics.strokePoints([c2, c3, t3, t2], true, true);
        graphics.strokePoints([c3, c4, t4, t3], true, true);

        const topColor = Phaser.Display.Color.IntegerToColor(color).brighten(25).color;
        graphics.fillStyle(topColor, alpha);
        graphics.fillPoints([t1, t2, t3, t4], true);
        graphics.lineStyle(2, 0xffffff, 0.15 * alpha);
        graphics.lineBetween(t1.x, t1.y, t2.x, t2.y);
        graphics.lineBetween(t1.x, t1.y, t4.x, t4.y);
    }


    private updateHealthBar(item: PlacedBuilding | Troop) {
        if (!item.healthBar) return; // Safely ignore dummy targets without health bars
        const bar = item.healthBar;
        bar.clear();

        // Only show health bar if damage has been taken
        const hasDamage = item.health < item.maxHealth;
        const isTroop = !('graphics' in item);
        const showBar = isTroop ? (item as Troop).hasTakenDamage : hasDamage;

        if (!showBar) {
            bar.setVisible(false);
            return;
        }
        bar.setVisible(true);

        let x: number, y: number, width: number, height: number;
        const isBuilding = 'graphics' in item;

        if (isBuilding) {
            const info = BUILDINGS[item.type];
            const p = this.cartToIso(item.gridX + info.width / 2, item.gridY + info.height / 2);
            width = 36 + info.width * 8;
            height = 8;
            x = p.x - width / 2;
            y = p.y - 50 - (info.height * 10);
        } else {
            const pos = this.cartToIso(item.gridX, item.gridY);
            width = 28;
            height = 6;
            x = pos.x - width / 2;
            y = pos.y - 22;
        }

        const healthPct = Math.max(0, item.health / item.maxHealth);
        const radius = height / 2;

        // Outer border (dark)
        bar.fillStyle(0x1a1a1a, 0.9);
        this.drawRoundedRect(bar, x - 2, y - 2, width + 4, height + 4, radius + 2);

        // Inner border (slightly lighter)
        bar.fillStyle(0x333333, 1);
        this.drawRoundedRect(bar, x - 1, y - 1, width + 2, height + 2, radius + 1);

        // Background (dark red/maroon for empty health)
        bar.fillStyle(0x4a1a1a, 1);
        this.drawRoundedRect(bar, x, y, width, height, radius);

        // Health fill color with smooth gradient feel
        let fillColor: number;
        let highlightColor: number;
        if (healthPct > 0.6) {
            fillColor = 0x2ecc71;
            highlightColor = 0x58d68d;
        } else if (healthPct > 0.35) {
            fillColor = 0xf39c12;
            highlightColor = 0xf7dc6f;
        } else {
            fillColor = 0xe74c3c;
            highlightColor = 0xf1948a;
        }

        // Main health fill
        if (healthPct > 0) {
            const fillWidth = Math.max(height, width * healthPct);
            bar.fillStyle(fillColor, 1);
            this.drawRoundedRect(bar, x, y, fillWidth, height, radius);

            // Inner shadow at top of fill
            bar.fillStyle(0x000000, 0.2);
            bar.fillRect(x + radius, y, Math.max(0, fillWidth - radius * 2), 2);

            // Glossy highlight on top half
            bar.fillStyle(highlightColor, 0.4);
            bar.fillRect(x + radius, y + 1, Math.max(0, fillWidth - radius * 2), height / 3);

            // Bright specular highlight
            bar.fillStyle(0xffffff, 0.3);
            bar.fillRect(x + radius + 2, y + 2, Math.min(8, Math.max(0, fillWidth - radius * 2 - 4)), 1);
        }

        // Health segments (CoC-style dividers)
        if (isBuilding && width > 30) {
            bar.lineStyle(1, 0x000000, 0.3);
            const segments = Math.floor(width / 12);
            for (let i = 1; i < segments; i++) {
                const segX = x + (width / segments) * i;
                bar.lineBetween(segX, y + 1, segX, y + height - 1);
            }
        }

        bar.setDepth(30000);
    }


    private drawRoundedRect(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, radius: number) {
        graphics.beginPath();
        graphics.moveTo(x + radius, y);
        graphics.lineTo(x + width - radius, y);
        graphics.arc(x + width - radius, y + radius, radius, -Math.PI / 2, 0);
        graphics.lineTo(x + width, y + height - radius);
        graphics.arc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2);
        graphics.lineTo(x + radius, y + height);
        graphics.arc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI);
        graphics.lineTo(x, y + radius);
        graphics.arc(x + radius, y + radius, radius, Math.PI, -Math.PI / 2);
        graphics.closePath();
        graphics.fillPath();
    }

    private updateCombat(time: number) {
        // Include all defense types
        const defenses = this.buildings.filter(b => (
            b.type === 'cannon' ||
            b.type === 'mortar' ||
            b.type === 'tesla' ||
            b.type === 'ballista' ||
            b.type === 'xbow' ||
            b.type === 'prism' ||
            b.type === 'magmavent' ||
            b.type === 'dragons_breath'
        ) && b.health > 0);
        defenses.forEach(defense => {
            let nearestTroop: Troop | null = null;
            const stats = getBuildingStats(defense.type as BuildingType, defense.level || 1);
            let minDist = stats.range || 7;
            const interval = stats.fireRate || 2500;

            // Initial delay for non-continuous defenses (not prism laser)
            const needsInitialDelay = defense.type !== 'prism' && defense.type !== 'magmavent';
            if (!defense.lastFireTime) {
                // Set initial fire time - continuous defenses fire immediately, others have 1.5s delay
                defense.lastFireTime = needsInitialDelay ? time : (time - interval);
            }

            // Check if enough time has passed since last shot
            if (time < (defense.lastFireTime || 0) + interval) return;

            this.troops.forEach(troop => {
                if (troop.owner !== defense.owner && troop.health > 0) {
                    const dist = Phaser.Math.Distance.Between(defense.gridX, defense.gridY, troop.gridX, troop.gridY);
                    if (dist < minDist) {
                        if (stats.minRange && dist < stats.minRange) return; // Dead zone check
                        minDist = dist; nearestTroop = troop;
                    }
                }
            });

            if (nearestTroop) {
                defense.lastFireTime = time;
                if (defense.type === 'mortar') this.shootMortarAt(defense, nearestTroop);
                else if (defense.type === 'tesla') this.shootTeslaAt(defense, nearestTroop);
                else if (defense.type === 'ballista') this.shootBallistaAt(defense, nearestTroop);
                else if (defense.type === 'xbow') this.shootXBowAt(defense, nearestTroop);
                else if (defense.type === 'prism') this.shootPrismContinuousLaser(defense, nearestTroop, time);
                else if (defense.type === 'magmavent') this.shootMagmaEruption(defense);
                else if (defense.type === 'dragons_breath') this.shootDragonsBreathAt(defense, nearestTroop);
                else this.shootAt(defense, nearestTroop);
            } else {
                // No target - clean up prism laser if it exists
                if (defense.type === 'prism') {
                    this.cleanupPrismLaser(defense);
                }
            }
        });


        this.troops.forEach(troop => {
            if (troop.health <= 0) return;



            if (troop.type === 'ward') {
                // --- PASSIVE WARD HEAL ---
                const wardStats = TROOP_STATS.ward;
                const healDelay = 500; // Heal every 0.5 seconds
                if (!(troop as any).lastPassiveHeal || time > (troop as any).lastPassiveHeal + healDelay) {
                    (troop as any).lastPassiveHeal = time;

                    this.troops.forEach(other => {
                        if (other.owner === troop.owner && other.health > 0 && other.health < other.maxHealth) {
                            const d = Phaser.Math.Distance.Between(troop.gridX, troop.gridY, other.gridX, other.gridY);
                            if (d <= wardStats.healRadius) {
                                other.health = Math.min(other.maxHealth, other.health + wardStats.healAmount);
                                this.updateHealthBar(other);

                                // Small green puff of health
                                const pos = this.cartToIso(other.gridX, other.gridY);
                                const flash = this.add.circle(pos.x, pos.y - 12, 5, 0x00ff88, 0.5);
                                flash.setDepth(other.gameObject.depth + 1);
                                this.tweens.add({
                                    targets: flash,
                                    y: pos.y - 25,
                                    alpha: 0,
                                    scale: 1.5,
                                    duration: 500,
                                    onComplete: () => flash.destroy()
                                });
                            }
                        }
                    });
                }

                // Retarget if follow target is dead (Ward doesn't 'heal' single targets anymore, just follows/attacks)
                if (troop.target && troop.target.health <= 0) {
                    troop.target = null;
                }
            }

            if (!troop.target || troop.target.health <= 0) {
                if (troop.type === 'ward') {
                    troop.target = this.findWardTarget(troop);
                } else {
                    troop.target = this.findNearestEnemyBuilding(troop);
                }
            }

            if (troop.target) {
                const b = troop.target;
                const isBuilding = ('type' in b && BUILDINGS[b.type]);
                const tw = isBuilding ? BUILDINGS[b.type].width : 0.5;
                const th = isBuilding ? BUILDINGS[b.type].height : 0.5;
                const bx = isBuilding ? b.gridX : b.gridX - tw / 2;
                const by = isBuilding ? b.gridY : b.gridY - th / 2;

                const dx = Math.max(bx - troop.gridX, 0, troop.gridX - (bx + tw));
                const dy = Math.max(by - troop.gridY, 0, troop.gridY - (by + th));
                const dist = Math.sqrt(dx * dx + dy * dy);

                const stats = TROOP_STATS[troop.type];
                const isEnemy = b.owner !== troop.owner;

                if (troop.type === 'ward' && time > troop.lastAttackTime + troop.attackDelay) {
                    // Ward specialized attack behavior (Grand Warden style)
                    const wardStats = TROOP_STATS.ward;
                    const enemies = this.buildings.filter(b => b.owner !== troop.owner && b.health > 0);
                    let attackTarget: PlacedBuilding | null = null;

                    // 1. If targeting an enemy directly, use it
                    if (isEnemy && dist <= wardStats.range + 0.1) {
                        attackTarget = troop.target;
                    }
                    // 2. Otherwise ASSIST the leader if they have an enemy target
                    else {
                        const leader = troop.target;
                        if (leader && leader.target && leader.target.owner !== troop.owner) {
                            const targetBuilding = leader.target as PlacedBuilding;
                            const tInfo = BUILDINGS[targetBuilding.type];
                            const tdx = Math.max(targetBuilding.gridX - troop.gridX, 0, troop.gridX - (targetBuilding.gridX + (tInfo?.width || 1)));
                            const tdy = Math.max(targetBuilding.gridY - troop.gridY, 0, troop.gridY - (targetBuilding.gridY + (tInfo?.height || 1)));
                            const tdist = Math.sqrt(tdx * tdx + tdy * tdy);

                            if (tdist <= wardStats.range) {
                                attackTarget = targetBuilding;
                            }
                        }

                        // 3. If no leader target, find nearest building in range (PRIORITIZE NON-WALLS)
                        if (!attackTarget) {
                            const buildings = enemies.filter(b => b.type !== 'wall');
                            let minDist = wardStats.range;
                            buildings.forEach(b => {
                                const info = BUILDINGS[b.type];
                                const bdx = Math.max(b.gridX - troop.gridX, 0, troop.gridX - (b.gridX + info.width));
                                const bdy = Math.max(b.gridY - troop.gridY, 0, troop.gridY - (b.gridY + info.height));
                                const bd = Math.sqrt(bdx * bdx + bdy * bdy);
                                if (bd <= minDist) {
                                    minDist = bd;
                                    attackTarget = b;
                                }
                            });
                        }
                    }

                    if (attackTarget) {
                        troop.lastAttackTime = time;
                        this.showWardLaser(troop, attackTarget, wardStats.damage);

                        // Apply damage directly if it's the target loop handling it
                        if (attackTarget.health > 0) {
                            attackTarget.health -= (wardStats.damage * 0.2); // Small tick damage per pulse handled by laser visuals usually, but adding solid hit here
                            this.updateHealthBar(attackTarget);
                            if (attackTarget.health <= 0) {
                                this.destroyBuilding(attackTarget);
                            }
                        }
                    }
                } else if (dist <= stats.range + 0.1) {
                    if (time > troop.lastAttackTime + troop.attackDelay) {
                        // ATTACK LOGIC (Non-Ward Enemies)
                        if (isEnemy && troop.type !== 'ward') {
                            troop.lastAttackTime = time;

                            if (troop.type === 'archer') {
                                this.showArcherProjectile(troop, troop.target, stats.damage);
                            } else {
                                // Melee: immediate damage
                                troop.target.health -= stats.damage;
                                this.showHitEffect(troop.target.graphics);
                                this.updateHealthBar(troop.target);

                                const currentPos = this.cartToIso(troop.gridX, troop.gridY);
                                const targetPos = this.cartToIso(bx + tw / 2, by + th / 2);
                                const angle = Math.atan2(targetPos.y - currentPos.y, targetPos.x - currentPos.x);
                                this.tweens.add({
                                    targets: troop.gameObject,
                                    x: currentPos.x + Math.cos(angle) * 10,
                                    y: currentPos.y + Math.sin(angle) * 10,
                                    duration: 50,
                                    yoyo: true
                                });

                                if (troop.target.health <= 0) {
                                    this.destroyBuilding(troop.target);
                                    troop.target = null;
                                }
                            }
                        }
                    }
                }
            }
        });

    }


    private shootMortarAt(mortar: PlacedBuilding, troop: Troop) {
        const info = BUILDINGS['mortar'];
        const start = this.cartToIso(mortar.gridX + info.width / 2, mortar.gridY + info.height / 2);
        const end = this.cartToIso(troop.gridX, troop.gridY);

        // Set angle for subtle mortar rotation
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        mortar.ballistaAngle = angle;

        // Mortar shell - starts invisible, appears as it leaves barrel
        const ball = this.add.graphics();
        ball.fillStyle(0x3a3a3a, 1);
        ball.fillCircle(0, 0, 8);
        ball.fillStyle(0x5a5a5a, 1);
        ball.fillCircle(-2, -2, 3);
        ball.setPosition(start.x, start.y - 35); // Start at barrel opening
        ball.setDepth(5000);
        ball.setAlpha(0); // Start invisible

        const midY = (start.y + end.y) / 2 - 350;

        // Muzzle flash and smoke effect
        this.createSmokeEffect(start.x, start.y - 35, 6, 0.8, 1000);

        const flash = this.add.graphics();
        flash.fillStyle(0xff8800, 0.8);
        flash.fillCircle(0, 0, 8);
        flash.fillStyle(0xffcc00, 0.6);
        flash.fillCircle(0, 0, 5);
        flash.setPosition(start.x, start.y - 35);
        flash.setDepth(5001);
        this.tweens.add({
            targets: flash,
            alpha: 0,
            scale: 2,
            duration: 100,
            onComplete: () => flash.destroy()
        });

        // Animate the projectile - fade in quickly as it emerges
        this.tweens.add({
            targets: ball,
            alpha: 1,
            duration: 80,
            ease: 'Linear'
        });

        const dist = Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y);
        this.tweens.add({
            targets: ball, x: end.x, duration: dist / 0.3, ease: 'Linear',
            onUpdate: (tween) => {
                const t = tween.progress;
                ball.y = (1 - t) * (1 - t) * (start.y - 35) + 2 * (1 - t) * t * midY + t * t * end.y;
                const scale = 0.5 + (1 - Math.abs(t - 0.5) * 2) * 0.6;
                ball.setScale(scale);
                ball.setRotation(t * Math.PI * 4);
            },
            onComplete: () => {
                ball.destroy();
                this.createMortarExplosion(end.x, end.y, mortar.owner, troop.gridX, troop.gridY);
            }
        });
    }

    private createMortarExplosion(x: number, y: number, owner: 'PLAYER' | 'ENEMY', targetGx: number, targetGy: number) {
        this.cameras.main.shake(100, 0.002); // Reduced shake

        // Ground crater/scorch mark
        const crater = this.add.graphics();
        crater.fillStyle(0x2a1a0a, 0.6);
        crater.fillEllipse(x, y + 5, 40, 20);
        crater.setDepth(1);
        this.tweens.add({ targets: crater, alpha: 0, duration: 2000, delay: 500, onComplete: () => crater.destroy() });

        // Initial flash
        const flash = this.add.circle(x, y, 5, 0xffffcc, 1);
        flash.setDepth(10001);
        this.tweens.add({ targets: flash, radius: 50, alpha: 0, duration: 100, onComplete: () => flash.destroy() });

        // Primary shockwave ring
        const shock = this.add.graphics();
        shock.lineStyle(4, 0xff6600, 0.8);
        shock.strokeCircle(x, y, 10);
        shock.setDepth(10000);
        this.tweens.add({
            targets: shock, alpha: 0, duration: 400,
            onUpdate: (tween) => {
                shock.clear();
                const r = 10 + tween.progress * 70;
                shock.lineStyle(4 - tween.progress * 3, 0xff6600, 0.8 - tween.progress * 0.8);
                shock.strokeCircle(x, y, r);
            },
            onComplete: () => shock.destroy()
        });

        // Secondary shockwave
        this.time.delayedCall(50, () => {
            const shock2 = this.add.graphics();
            shock2.lineStyle(2, 0xffaa00, 0.5);
            shock2.strokeCircle(x, y, 15);
            shock2.setDepth(9999);
            this.tweens.add({
                targets: shock2, alpha: 0, duration: 350,
                onUpdate: (tween) => {
                    shock2.clear();
                    shock2.lineStyle(2, 0xffaa00, 0.5 - tween.progress * 0.5);
                    shock2.strokeCircle(x, y, 15 + tween.progress * 60);
                },
                onComplete: () => shock2.destroy()
            });
        });

        // Fire particles (pixelated rectangles)
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const dist = 15 + Math.random() * 25;
            const fireColors = [0xff4400, 0xff6600, 0xff8800, 0xffaa00];
            const fireSize = 6 + Math.floor(Math.random() * 8);
            const fire = this.add.graphics();
            fire.fillStyle(fireColors[Math.floor(Math.random() * 4)], 0.9);
            fire.fillRect(-fireSize / 2, -fireSize / 2, fireSize, fireSize);
            fire.setPosition(x, y);
            fire.setDepth(10002);
            this.tweens.add({
                targets: fire,
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist * 0.5 - 30 - Math.random() * 40,
                alpha: 0, scale: 0.2,
                duration: 300 + Math.random() * 200,
                ease: 'Quad.easeOut',
                onComplete: () => fire.destroy()
            });
        }

        // Smoke plume (pixelated rectangles)
        for (let i = 0; i < 8; i++) {
            const delay = i * 30;
            this.time.delayedCall(delay, () => {
                const smokeColors = [0x444444, 0x555555, 0x666666];
                const smokeSize = 8 + Math.floor(Math.random() * 12);
                const smoke = this.add.graphics();
                smoke.fillStyle(smokeColors[Math.floor(Math.random() * 3)], 0.6);
                smoke.fillRect(-smokeSize / 2, -smokeSize / 2, smokeSize, smokeSize);
                smoke.setPosition(x + (Math.random() - 0.5) * 30, y);
                smoke.setDepth(9998);
                this.tweens.add({
                    targets: smoke,
                    y: smoke.y - 60 - Math.random() * 40,
                    x: smoke.x + (Math.random() - 0.5) * 30,
                    scale: 2.5, alpha: 0,
                    duration: 800 + Math.random() * 400,
                    ease: 'Quad.easeOut',
                    onComplete: () => smoke.destroy()
                });
            });
        }

        // Debris/dirt chunks
        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            const debris = this.add.graphics();
            debris.fillStyle(0x5a4a3a, 1);
            debris.fillRect(-3, -3, 6, 6);
            debris.setPosition(x, y);
            debris.setDepth(10003);

            const dist = 30 + Math.random() * 40;
            const peakY = y - 40 - Math.random() * 30;

            this.tweens.add({
                targets: debris,
                x: x + Math.cos(angle) * dist,
                duration: 500 + Math.random() * 200,
                ease: 'Quad.easeOut'
            });
            this.tweens.add({
                targets: debris,
                y: [peakY, y + 10],
                duration: 500 + Math.random() * 200,
                ease: 'Quad.easeIn',
                onComplete: () => debris.destroy()
            });
        }

        // Deal damage (smaller splash radius)
        const splashRadius = 2.5;
        this.troops.slice().forEach(t => {
            const d = Phaser.Math.Distance.Between(t.gridX, t.gridY, targetGx, targetGy);
            if (d < splashRadius && t.owner !== owner) {
                t.health -= 70;
                t.hasTakenDamage = true;
                this.updateHealthBar(t);
                if (t.health <= 0) this.destroyTroop(t);
            }
        });
    }


    private shootAt(cannon: PlacedBuilding, troop: Troop) {
        if (cannon.isFiring) return;
        cannon.isFiring = true;

        // Capture target reference at the start
        const targetTroop = troop;

        const info = BUILDINGS['cannon'];
        const start = this.cartToIso(cannon.gridX + info.width / 2, cannon.gridY + info.height / 2);
        const end = this.cartToIso(targetTroop.gridX, targetTroop.gridY);
        const angle = Math.atan2(end.y - (start.y - 14), end.x - start.x);

        // Set target angle for smooth rotation (same system as ballista/xbow)
        cannon.ballistaTargetAngle = angle;

        const ballDepth = cannon.graphics.depth + 50;

        // Calculate barrel tip position for muzzle flash
        const barrelLength = 28;
        const barrelHeight = -14;
        const barrelTipX = start.x + Math.cos(angle) * barrelLength;
        const barrelTipY = start.y + barrelHeight + Math.sin(angle) * 0.5 * barrelLength;

        // Muzzle flash at barrel tip - pixelated rectangles
        const flash = this.add.graphics();
        flash.fillStyle(0xffcc00, 0.9);
        flash.fillRect(barrelTipX - 12, barrelTipY - 12, 24, 24);
        flash.fillStyle(0xffffff, 0.9);
        flash.fillRect(barrelTipX - 6, barrelTipY - 6, 12, 12);
        flash.setDepth(ballDepth + 10);
        this.tweens.add({ targets: flash, alpha: 0, duration: 100, onComplete: () => flash.destroy() });

        // Gunpowder smoke - pixelated rectangles
        for (let i = 0; i < 3; i++) {
            const smoke = this.add.graphics();
            const smokeSize = 4 + Math.floor(Math.random() * 4);
            const smokeAngle = angle + (Math.random() - 0.5) * 0.5;
            const dist = 10 + Math.random() * 15;
            const sx = barrelTipX + Math.cos(smokeAngle) * dist * 0.2; // Start near tip
            const sy = barrelTipY + Math.sin(smokeAngle) * dist * 0.2;

            smoke.fillStyle(0xdddddd, 0.6);
            smoke.fillRect(-smokeSize / 2, -smokeSize / 2, smokeSize, smokeSize);
            smoke.setPosition(sx, sy);
            smoke.setDepth(ballDepth + 20); // Above flash

            this.tweens.add({
                targets: smoke,
                x: sx + Math.cos(smokeAngle) * dist,
                y: sy + Math.sin(smokeAngle) * dist * 0.5 - 10 - Math.random() * 10, // Drift up
                alpha: 0,
                scale: 1.5,
                duration: 400 + Math.random() * 300,
                onComplete: () => smoke.destroy()
            });
        }

        // === BARREL RECOIL ===
        // Set recoil to max and tween back to 0
        cannon.cannonRecoilOffset = 1;
        this.tweens.add({
            targets: cannon,
            cannonRecoilOffset: 0,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Cannonball (pixelated rectangle)
        const ball = this.add.graphics();
        ball.fillStyle(0x1a1a1a, 1);
        ball.fillRect(-7, -7, 14, 14);
        ball.fillStyle(0x3a3a3a, 1);
        ball.fillRect(-6, -6, 8, 8);
        ball.setPosition(barrelTipX, barrelTipY);
        ball.setDepth(ballDepth);

        // Projectile flies to target
        const dist = Phaser.Math.Distance.Between(barrelTipX, barrelTipY, end.x, end.y);
        this.tweens.add({
            targets: ball, x: end.x, y: end.y, duration: dist / 0.8, ease: 'Quad.easeIn',
            onComplete: () => {
                ball.destroy();
                cannon.isFiring = false;

                // Impact effect (pixelated rectangle)
                const impact = this.add.graphics();
                impact.fillStyle(0x8b7355, 0.6);
                impact.fillRect(end.x - 8, end.y, 16, 8);
                impact.setDepth(ballDepth - 10);
                this.tweens.add({ targets: impact, alpha: 0, duration: 300, onComplete: () => impact.destroy() });

                // Apply damage to captured target (3x damage: 45)
                if (targetTroop && targetTroop.health > 0) {
                    targetTroop.health -= 45;
                    targetTroop.hasTakenDamage = true;
                    this.updateHealthBar(targetTroop);

                    // Hit flash effect (pixelated rectangle)
                    const troopPos = this.cartToIso(targetTroop.gridX, targetTroop.gridY);
                    const hitFlash = this.add.graphics();
                    hitFlash.fillStyle(0xffffff, 0.6);
                    hitFlash.fillRect(troopPos.x - 8, troopPos.y - 18, 16, 16);
                    hitFlash.setDepth(ballDepth + 5);
                    this.tweens.add({ targets: hitFlash, alpha: 0, duration: 80, onComplete: () => hitFlash.destroy() });

                    if (targetTroop.health <= 0) this.destroyTroop(targetTroop);
                }
            }
        });
    }


    private shootTeslaAt(tesla: PlacedBuilding, troop: Troop) {
        const start = this.cartToIso(tesla.gridX + 0.5, tesla.gridY + 0.5);
        start.y -= 40; // From the orb

        // Orb pulse effect (pixelated rectangle)
        const orbPulse = this.add.graphics();
        orbPulse.fillStyle(0x88eeff, 0.6);
        orbPulse.fillRect(-12, -12, 24, 24);
        orbPulse.setPosition(start.x, start.y);
        orbPulse.setDepth(10001);
        this.tweens.add({ targets: orbPulse, scale: 1.5, alpha: 0, duration: 150, onComplete: () => orbPulse.destroy() });

        const chainCount = 3;
        const chainRadius = 5;
        let lastTarget: { x: number, y: number } = start;
        let currentTargets: (Troop | null)[] = [troop];

        // Find chain targets
        for (let i = 1; i < chainCount; i++) {
            const prev = currentTargets[i - 1];
            if (!prev) { currentTargets.push(null); continue; }
            const next = this.troops.find(t =>
                t.owner !== tesla.owner && t.health > 0 && !currentTargets.includes(t) &&
                Phaser.Math.Distance.Between(prev.gridX, prev.gridY, t.gridX, t.gridY) < chainRadius
            );
            currentTargets.push(next || null);
        }

        // Visualize electric chain
        currentTargets.filter(t => t !== null).forEach((t, idx) => {
            if (!t) return;
            const end = this.cartToIso(t.gridX, t.gridY);

            // Draw multiple lightning layers for thickness effect
            for (let layer = 0; layer < 3; layer++) {
                const lightning = this.add.graphics();
                const alpha = layer === 0 ? 1 : (layer === 1 ? 0.6 : 0.3);
                const width = layer === 0 ? 3 : (layer === 1 ? 5 : 8);
                const color = layer === 0 ? 0xffffff : (layer === 1 ? 0x88eeff : 0x00ccff);

                lightning.lineStyle(width, color, alpha);
                lightning.setDepth(10000 - layer);

                // Jagged branching path
                lightning.beginPath();
                lightning.moveTo(lastTarget.x, lastTarget.y);

                const segments = 6;
                const jitter = layer === 0 ? 8 : 12;
                for (let j = 1; j < segments; j++) {
                    const progress = j / segments;
                    const tx = lastTarget.x + (end.x - lastTarget.x) * progress;
                    const ty = lastTarget.y + (end.y - lastTarget.y) * progress;
                    lightning.lineTo(
                        tx + (Math.random() - 0.5) * jitter,
                        ty + (Math.random() - 0.5) * jitter
                    );
                }
                lightning.lineTo(end.x, end.y);
                lightning.strokePath();

                this.tweens.add({
                    targets: lightning,
                    alpha: 0,
                    duration: 150 + layer * 50,
                    delay: idx * 40,
                    onComplete: () => lightning.destroy()
                });
            }

            // Electric spark particles at impact
            for (let s = 0; s < 4; s++) {
                const spark = this.add.graphics();
                spark.lineStyle(1, 0x88eeff, 0.8);
                const sparkLen = 5 + Math.random() * 10;
                const sparkAngle = Math.random() * Math.PI * 2;
                spark.lineBetween(
                    end.x, end.y,
                    end.x + Math.cos(sparkAngle) * sparkLen,
                    end.y + Math.sin(sparkAngle) * sparkLen
                );
                spark.setDepth(10002);
                this.tweens.add({
                    targets: spark,
                    alpha: 0,
                    duration: 100 + Math.random() * 100,
                    delay: idx * 40,
                    onComplete: () => spark.destroy()
                });
            }

            // Glow at impact point
            const impactGlow = this.add.circle(end.x, end.y, 8, 0x00ccff, 0.5);
            impactGlow.setDepth(9999);
            this.tweens.add({
                targets: impactGlow,
                scale: 2, alpha: 0,
                duration: 200,
                delay: idx * 40,
                onComplete: () => impactGlow.destroy()
            });

            t.health -= 25 / (idx + 1);
            t.hasTakenDamage = true;
            this.updateHealthBar(t);
            if (t.health <= 0) this.destroyTroop(t);

            lastTarget = end;
        });
    }

    // === PRISM TOWER - CONTINUOUS CRAZY LASER BEAM ===
    private shootPrismContinuousLaser(prism: PlacedBuilding, target: Troop, time: number) {
        const info = BUILDINGS['prism'];
        const start = this.cartToIso(prism.gridX + info.width / 2, prism.gridY + info.height / 2);
        start.y -= 55; // From the crystal tip
        const end = this.cartToIso(target.gridX, target.gridY);

        // Calculate beam thickness based on time for pulsing effect
        const pulseThickness = 8 + Math.sin(time / 30) * 4;
        const coreThickness = 3 + Math.sin(time / 20) * 1.5;

        // Rainbow cycling color
        const hue = (time / 10) % 360;
        const beamColor = Phaser.Display.Color.HSLToColor(hue / 360, 1, 0.5).color;
        const glowColor = Phaser.Display.Color.HSLToColor(hue / 360, 1, 0.7).color;

        // Create or update the laser graphics
        if (!prism.prismLaserGraphics) {
            prism.prismLaserGraphics = this.add.graphics();
            prism.prismLaserGraphics.setDepth(10000);
        }
        if (!prism.prismLaserCore) {
            prism.prismLaserCore = this.add.graphics();
            prism.prismLaserCore.setDepth(10001);
        }

        // Clear and redraw laser every frame
        prism.prismLaserGraphics.clear();
        prism.prismLaserCore.clear();

        // Outer glow beam
        prism.prismLaserGraphics.lineStyle(pulseThickness + 8, glowColor, 0.3);
        prism.prismLaserGraphics.lineBetween(start.x, start.y, end.x, end.y);

        // Main beam with multiple layers for intense effect
        prism.prismLaserGraphics.lineStyle(pulseThickness, beamColor, 0.9);
        prism.prismLaserGraphics.lineBetween(start.x, start.y, end.x, end.y);

        // Inner bright core
        prism.prismLaserCore.lineStyle(coreThickness, 0xffffff, 1);
        prism.prismLaserCore.lineBetween(start.x, start.y, end.x, end.y);


        // Crazy sparkle particles along beam
        const angle = Math.atan2(end.y - start.y, end.x - start.x);

        // Spawn particles every few frames
        if (time % 50 < 20) {
            for (let i = 0; i < 3; i++) {
                const t = Math.random();
                const px = start.x + (end.x - start.x) * t + (Math.random() - 0.5) * 15;
                const py = start.y + (end.y - start.y) * t + (Math.random() - 0.5) * 10;

                const particle = this.add.graphics();
                const particleColor = Phaser.Display.Color.HSLToColor(((hue + Math.random() * 60) % 360) / 360, 1, 0.5).color;
                particle.fillStyle(particleColor, 1);
                particle.fillCircle(0, 0, 2 + Math.random() * 3);
                particle.setPosition(px, py);
                particle.setDepth(10002);

                // Particles fly outward
                const perpAngle = angle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1);
                this.tweens.add({
                    targets: particle,
                    x: px + Math.cos(perpAngle) * (20 + Math.random() * 20),
                    y: py + Math.sin(perpAngle) * (10 + Math.random() * 10),
                    alpha: 0,
                    scale: 0.2,
                    duration: 200 + Math.random() * 150,
                    ease: 'Quad.easeOut',
                    onComplete: () => particle.destroy()
                });
            }
        }

        // SCORCH MARKS / CHASM TRAIL (Jagged Pen-like Trail)
        // Reset trail if target changed significantly (or initialization)
        if (!prism.prismTrailLastPos) {
            prism.prismTrailLastPos = {
                x: end.x + (Math.random() - 0.5) * 10,
                y: end.y + (Math.random() - 0.5) * 10
            };
        } else if (prism.prismTarget !== target && prism.prismTarget?.id !== target.id) {
            // Target switched, reset pos
            prism.prismTrailLastPos = {
                x: end.x + (Math.random() - 0.5) * 10,
                y: end.y + (Math.random() - 0.5) * 10
            };
        }

        // Calculate Jagged Current Target for the segment end
        const jaggedEndX = end.x + (Math.random() - 0.5) * 6;
        const jaggedEndY = end.y + (Math.random() - 0.5) * 6;

        const distLast = Phaser.Math.Distance.Between(prism.prismTrailLastPos.x, prism.prismTrailLastPos.y, jaggedEndX, jaggedEndY);

        if (distLast > 2) {
            // MOVING: Draw connected segment
            const scorch = this.add.graphics();

            scorch.lineStyle(6, 0x0a0505, 0.7); // Thick, dark charcoal
            scorch.lineBetween(prism.prismTrailLastPos.x, prism.prismTrailLastPos.y, jaggedEndX, jaggedEndY);
            scorch.setDepth(5);

            // Persist for a while, then fade out slowly
            this.tweens.add({
                targets: scorch,
                alpha: 0,
                duration: 4000,
                ease: 'Quad.easeIn',
                onComplete: () => scorch.destroy()
            });

            // Update last pos to the JAGGED point to ensure exact continuity
            prism.prismTrailLastPos = { x: jaggedEndX, y: jaggedEndY };

        } else if (time % 200 < 20) {
            // STATIONARY: Random scratch around target (static)
            const scratch = this.add.graphics();
            scratch.lineStyle(4, 0x0a0505, 0.6);

            const sx = end.x + (Math.random() - 0.5) * 15;
            const sy = end.y + (Math.random() - 0.5) * 15;
            scratch.lineBetween(sx, sy, sx + (Math.random() - 0.5) * 12, sy + (Math.random() - 0.5) * 8);

            scratch.setDepth(5);

            this.tweens.add({
                targets: scratch,
                alpha: 0,
                duration: 2500,
                onComplete: () => scratch.destroy()
            });
        }

        // Impact sparkles at target
        const impactGlow = this.add.graphics();
        impactGlow.fillStyle(beamColor, 0.6);
        impactGlow.fillCircle(end.x, end.y, 12 + Math.sin(time / 25) * 5);
        impactGlow.setDepth(10003);
        this.tweens.add({
            targets: impactGlow,
            alpha: 0,
            duration: 60,
            onComplete: () => impactGlow.destroy()
        });

        // Crystal charging glow
        const crystalGlow = this.add.graphics();
        crystalGlow.fillStyle(0xffffff, 0.4 + Math.sin(time / 15) * 0.3);
        crystalGlow.fillCircle(start.x, start.y, 10);
        crystalGlow.setDepth(10002);
        this.tweens.add({
            targets: crystalGlow,
            alpha: 0,
            duration: 50,
            onComplete: () => crystalGlow.destroy()
        });

        // Deal continuous damage (3 DPS * 50ms tick = ~0.15 damage per tick)
        const damagePerTick = 3;
        target.health -= damagePerTick;
        target.hasTakenDamage = true;
        this.updateHealthBar(target);
        if (target.health <= 0) {
            this.destroyTroop(target);
            this.cleanupPrismLaser(prism);
        }

        prism.prismTarget = target;
    }

    // Clean up prism laser graphics when no target
    private cleanupPrismLaser(prism: PlacedBuilding) {
        if (prism.prismLaserGraphics) {
            prism.prismLaserGraphics.destroy();
            prism.prismLaserGraphics = undefined;
        }
        if (prism.prismLaserCore) {
            prism.prismLaserCore.destroy();
            prism.prismLaserCore = undefined;
        }
        prism.prismTarget = undefined;
        prism.prismTrailLastPos = undefined;
    }

    // === MAGMA VENT - MASSIVE VOLCANIC ERUPTION ===
    private shootMagmaEruption(magma: PlacedBuilding) {
        magma.lastFireTime = this.time.now;
        const info = BUILDING_DEFINITIONS['magmavent'];
        const center = this.cartToIso(magma.gridX + info.width / 2, magma.gridY + info.height / 2);
        center.y -= 30; // From crater

        // Very subtle screen shake
        this.cameras.main.shake(250, 0.002);

        const aoeRadius = info.range || 6;
        const damage = info.damage || 60;

        // Manual Circular Smoke Clouds (as requested)
        for (let i = 0; i < 6; i++) {
            this.time.delayedCall(i * 100, () => {
                const smoke = this.add.graphics();
                const size = 15 + Math.random() * 15;
                smoke.fillStyle(0x888888, 0.4);
                smoke.fillCircle(0, 0, size);
                smoke.setPosition(center.x + (Math.random() - 0.5) * 20, center.y - 10);
                smoke.setDepth(30000); // High depth to ensure visibility over buildings

                this.tweens.add({
                    targets: smoke,
                    y: center.y - 80 - Math.random() * 60,
                    x: smoke.x + (Math.random() - 0.5) * 40,
                    scale: 1.5,
                    alpha: 0,
                    duration: 2000 + Math.random() * 1000,
                    onComplete: () => smoke.destroy()
                });
            });
        }

        // Central explosion flash (pixelated rectangle)
        const flash = this.add.graphics();
        flash.setPosition(center.x, center.y);
        flash.fillStyle(0xff6600, 0.8);
        flash.fillRect(-15, -15, 30, 30);
        flash.setDepth(30001); // High depth
        this.tweens.add({
            targets: flash,
            scale: 2,
            alpha: 0,
            duration: 150,
            onComplete: () => flash.destroy()
        });

        // === AOE INDICATOR - Shows damage radius ===
        // Using SQRT2 for proper isometric circle-to-ellipse mapping
        const aoePixelsX = aoeRadius * this.tileWidth * 0.5 * Math.SQRT2;
        const aoePixelsY = aoeRadius * this.tileHeight * 0.5 * Math.SQRT2;

        const aoeIndicator = this.add.graphics();
        aoeIndicator.fillStyle(0xff4400, 0.25);
        // Reverted to Ellipse as requested
        aoeIndicator.fillEllipse(center.x, center.y + 20, aoePixelsX * 2, aoePixelsY * 2);
        aoeIndicator.lineStyle(3, 0xff6600, 0.8);
        aoeIndicator.strokeEllipse(center.x, center.y + 20, aoePixelsX * 2, aoePixelsY * 2);
        aoeIndicator.setDepth(5); // Ground level
        this.tweens.add({
            targets: aoeIndicator,
            alpha: 0,
            duration: 1200,
            ease: 'Quad.easeOut',
            onComplete: () => aoeIndicator.destroy()
        });

        // Flying lava rocks (Increased debris count and range)
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            // Increased range: goes farther
            const dist = 40 + Math.random() * 60;
            const peakHeight = 40 + Math.random() * 50;

            const rock = this.add.graphics();
            // Consistent lava colors (Orange/Red/Yellow range)
            const rockColors = [0xff2200, 0xff4400, 0xff6600, 0xff8800];
            rock.fillStyle(rockColors[Math.floor(Math.random() * rockColors.length)], 1);
            const rockSize = 3 + Math.floor(Math.random() * 3);
            rock.fillRect(-rockSize / 2, -rockSize / 2, rockSize, rockSize);
            // Hot glowing core
            rock.fillStyle(0xffff00, 0.6);
            rock.fillRect(-rockSize / 4, -rockSize / 4, rockSize / 2, rockSize / 2);
            rock.setPosition(center.x, center.y);
            rock.setDepth(30002); // High depth

            const endX = center.x + Math.cos(angle) * dist;
            const endY = center.y + Math.sin(angle) * dist * 0.5 + 30;

            // Parabolic arc
            this.tweens.add({
                targets: rock,
                x: endX,
                duration: 600 + Math.random() * 400,
                ease: 'Linear',
                onUpdate: (tween) => {
                    const t = tween.progress;
                    rock.y = center.y - Math.sin(t * Math.PI) * peakHeight + t * (endY - center.y);

                    // Trail particles
                    if (Math.random() > 0.8) {
                        const trail = this.add.graphics();
                        trail.fillStyle(0xff4400, 0.8);
                        trail.fillRect(-1, -1, 2, 2);
                        trail.setPosition(rock.x, rock.y);
                        trail.setDepth(30001);
                        this.tweens.add({
                            targets: trail,
                            alpha: 0,
                            scale: 0.3,
                            duration: 150,
                            onComplete: () => trail.destroy()
                        });
                    }
                },
                onComplete: () => {
                    // Ground burn mark (stays longer)
                    const scorch = this.add.graphics();
                    scorch.fillStyle(0x331100, 0.7); // Dark char
                    scorch.fillEllipse(endX, endY, 12, 6);
                    scorch.setDepth(4); // Ground level

                    // Fading ember inside
                    const ember = this.add.graphics();
                    ember.fillStyle(0xff4400, 0.8);
                    ember.fillRect(endX - 2, endY - 1, 4, 2);
                    ember.setDepth(5);
                    this.tweens.add({
                        targets: ember,
                        alpha: 0,
                        duration: 800,
                        onComplete: () => ember.destroy()
                    });

                    this.tweens.add({
                        targets: scorch,
                        alpha: 0,
                        duration: 4000, // Lasts much longer
                        onComplete: () => scorch.destroy()
                    });
                    rock.destroy();
                }
            });
        }



        // Area damage glow (subtle) - ground level
        const aoeGlow = this.add.graphics();
        aoeGlow.fillStyle(0xff4400, 0.2);
        aoeGlow.fillEllipse(center.x, center.y + 25, aoePixelsX * 2.2, aoePixelsY * 2.2);
        aoeGlow.setDepth(4); // Below everything
        this.tweens.add({
            targets: aoeGlow,
            alpha: 0,
            duration: 800,
            onComplete: () => aoeGlow.destroy()
        });

        // Light smoke (removed old one in favor of createSmokeEffect)


        // Damage all troops in range with massive damage
        this.troops.slice().forEach(t => {
            if (t.owner === magma.owner || t.health <= 0) return;
            const dist = Phaser.Math.Distance.Between(
                magma.gridX + info.width / 2, magma.gridY + info.height / 2,
                t.gridX, t.gridY
            );
            if (dist <= aoeRadius) {
                // More damage at center (100% at center, 50% at edge)
                const damageMult = 1 - (dist / aoeRadius * 0.5);
                t.health -= damage * damageMult;
                t.hasTakenDamage = true;

                // Hit flash on troop
                const hitFlash = this.add.graphics();
                hitFlash.fillStyle(0xff4400, 0.8);
                const troopPos = this.cartToIso(t.gridX, t.gridY);
                hitFlash.fillCircle(troopPos.x, troopPos.y, 15);
                hitFlash.setDepth(10006);
                this.tweens.add({
                    targets: hitFlash,
                    alpha: 0,
                    scale: 2,
                    duration: 150,
                    onComplete: () => hitFlash.destroy()
                });

                this.updateHealthBar(t);
                if (t.health <= 0) this.destroyTroop(t);
            }
        });
    }

    private showArcherProjectile(troop: Troop, target: PlacedBuilding, damage: number) {
        const start = this.cartToIso(troop.gridX, troop.gridY);
        const info = BUILDINGS[target.type];
        const end = this.cartToIso(target.gridX + info.width / 2, target.gridY + info.height / 2);
        const angle = Math.atan2(end.y - start.y, end.x - start.x);

        const targetBuilding = target;

        troop.facingAngle = angle;
        this.redrawTroop(troop);

        // Bow kickback animation - quick squish effect without moving the troop
        this.tweens.add({
            targets: troop.gameObject,
            scaleX: 0.85,
            scaleY: 1.1,
            duration: 40,
            yoyo: true,
            ease: 'Power2'
        });


        // Arrow with proper orientation
        const arrow = this.add.graphics();
        arrow.fillStyle(0x8b4513, 1);
        arrow.fillRect(-8, -1, 16, 2);
        arrow.fillStyle(0x888888, 1);
        arrow.fillTriangle(8, 0, 4, -3, 4, 3);
        arrow.fillStyle(0xcc6633, 1);
        arrow.fillTriangle(-8, 0, -5, -3, -5, 3);

        // Start from middle of the bow (center of archer, not top)
        arrow.setPosition(start.x, start.y - 4);
        arrow.setRotation(angle);
        arrow.setDepth(10000);

        // Straight line trajectory
        const endY = end.y - 25;

        this.tweens.add({
            targets: arrow,
            x: end.x,
            y: endY,
            duration: 200,
            ease: 'Linear',
            onComplete: () => {
                arrow.destroy();

                // Apply damage on hit
                if (targetBuilding && targetBuilding.health > 0) {
                    targetBuilding.health -= damage;
                    this.showHitEffect(targetBuilding.graphics);
                    this.updateHealthBar(targetBuilding);

                    if (targetBuilding.health <= 0) {
                        this.destroyBuilding(targetBuilding);
                        this.troops.forEach(t => {
                            if (t.target && t.target.id === targetBuilding.id) {
                                t.target = null;
                            }
                        });
                    }
                }

                // Small impact effect
                const thud = this.add.circle(end.x, endY, 3, 0x8b4513, 0.6);
                thud.setDepth(100);
                this.tweens.add({ targets: thud, scale: 0.5, alpha: 0, duration: 120, onComplete: () => thud.destroy() });

                // Impact sparkle
                for (let i = 0; i < 2; i++) {
                    const spark = this.add.circle(
                        end.x + (Math.random() - 0.5) * 8,
                        endY + (Math.random() - 0.5) * 8,
                        1.5, 0x88ccff, 0.7
                    );
                    spark.setDepth(101);
                    this.tweens.add({
                        targets: spark,
                        y: spark.y - 8,
                        alpha: 0,
                        duration: 80,
                        onComplete: () => spark.destroy()
                    });
                }
            }
        });
    }


    private shootBallistaAt(ballista: PlacedBuilding, troop: Troop) {
        const info = BUILDINGS['ballista'];
        const start = this.cartToIso(ballista.gridX + info.width / 2, ballista.gridY + info.height / 2);
        const end = this.cartToIso(troop.gridX, troop.gridY);
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const targetTroop = troop;

        // Set target angle for smooth rotation (handled in updateBuildingAnimations)
        ballista.ballistaTargetAngle = angle;

        // Initialize ballista state if not set
        if (ballista.ballistaAngle === undefined) {
            ballista.ballistaAngle = angle; // Start facing the target
        }
        ballista.ballistaBoltLoaded = true;
        ballista.ballistaStringTension = 0;

        // Wind-back animation: tween the string tension from 0 to 1
        this.tweens.add({
            targets: { tension: 0 },
            tension: 1,
            duration: 400,
            ease: 'Power2',
            onUpdate: (tween) => {
                ballista.ballistaStringTension = tween.getValue() ?? 0;
            },
            onComplete: () => {
                // Fire! Hide the bolt on the ballista
                ballista.ballistaBoltLoaded = false;
                // Create flying bolt projectile
                const bolt = this.add.graphics();

                // Draw bolt shape (narrower)
                bolt.fillStyle(0x5d4e37, 1);
                bolt.fillRect(-16, -1.5, 32, 3);
                // Arrowhead (smaller)
                bolt.fillStyle(0x3a3a3a, 1);
                bolt.beginPath();
                bolt.moveTo(20, 0);
                bolt.lineTo(14, -4);
                bolt.lineTo(14, 4);
                bolt.closePath();
                bolt.fillPath();
                // Fletching (smaller)
                bolt.fillStyle(0xcc3333, 1);
                bolt.beginPath();
                bolt.moveTo(-16, 0);
                bolt.lineTo(-11, -5);
                bolt.lineTo(-6, 0);
                bolt.closePath();
                bolt.fillPath();
                bolt.beginPath();
                bolt.moveTo(-16, 0);
                bolt.lineTo(-11, 5);
                bolt.lineTo(-6, 0);
                bolt.closePath();
                bolt.fillPath();

                bolt.setPosition(start.x, start.y - 12);
                bolt.setRotation(angle);
                bolt.setDepth(20000);



                // Release the string (tension snaps back to 0)
                this.tweens.add({
                    targets: { tension: 1 },
                    tension: 0,
                    duration: 100,
                    ease: 'Back.out',
                    onUpdate: (tween) => {
                        ballista.ballistaStringTension = tween.getValue() ?? 0;
                    }
                });

                // Animate bolt flying to target
                const dist = Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y);
                let lastTrailTime = 0;

                this.tweens.add({
                    targets: bolt,
                    x: end.x,
                    y: end.y,
                    duration: dist / 1.2,
                    ease: 'Linear',
                    onUpdate: (tween: Phaser.Tweens.Tween) => {
                        // White trail particles at TAIL - Aggressive
                        const now = this.time.now;
                        if (now - lastTrailTime > 10) {
                            lastTrailTime = now;
                            const trail = this.add.graphics();
                            trail.fillStyle(0xffffff, 0.7);
                            trail.fillCircle(0, 0, 3);

                            // Calculate tail position (bolt is ~30px long, tail at -16 local)
                            // Responsive offset: Starts at 0, grows to 70 based on travel
                            const traveled = tween.progress * dist;
                            const currentOffset = Math.min(traveled, 70);

                            const rot = bolt.rotation;
                            const tailX = bolt.x - Math.cos(rot) * currentOffset;
                            const tailY = bolt.y - Math.sin(rot) * currentOffset;

                            trail.setPosition(tailX, tailY);
                            trail.setDepth(19999);
                            this.tweens.add({
                                targets: trail,
                                alpha: 0,
                                scale: 0.2,
                                duration: 300,
                                onComplete: () => trail.destroy()
                            });
                        }
                    },
                    onComplete: () => {
                        this.cameras.main.shake(100, 0.0005, true);
                        bolt.destroy();
                        // Deal damage
                        if (targetTroop && targetTroop.health > 0) {
                            targetTroop.health -= 100;
                            targetTroop.hasTakenDamage = true;
                            this.updateHealthBar(targetTroop);
                            if (targetTroop.health <= 0) this.destroyTroop(targetTroop);
                        }

                        // === EXPLOSION EFFECT ===
                        // Initial flash
                        const flash = this.add.graphics();
                        flash.fillStyle(0xffffcc, 0.9);
                        flash.fillCircle(0, 0, 15);
                        flash.setPosition(end.x, end.y);
                        flash.setDepth(20002);
                        this.tweens.add({
                            targets: flash,
                            scale: 2, alpha: 0,
                            duration: 80,
                            onComplete: () => flash.destroy()
                        });

                        // Shockwave ring
                        const shock = this.add.graphics();
                        shock.lineStyle(3, 0xff8800, 0.7);
                        shock.strokeCircle(0, 0, 8);
                        shock.setPosition(end.x, end.y);
                        shock.setDepth(20001);
                        this.tweens.add({
                            targets: shock,
                            alpha: 0,
                            duration: 200,
                            onUpdate: (tween) => {
                                shock.clear();
                                const r = 8 + tween.progress * 30;
                                shock.lineStyle(3 - tween.progress * 2, 0xff8800, 0.7 - tween.progress * 0.7);
                                shock.strokeCircle(0, 0, r);
                            },
                            onComplete: () => shock.destroy()
                        });

                        // Fire/explosion particles
                        for (let i = 0; i < 6; i++) {
                            const particle = this.add.graphics();
                            const pAngle = Math.random() * Math.PI * 2;
                            const pDist = 15 + Math.random() * 20;
                            particle.fillStyle(0xff6600 + Math.floor(Math.random() * 0x3300), 0.9);
                            particle.fillCircle(0, 0, 4 + Math.random() * 4);
                            particle.setPosition(end.x, end.y);
                            particle.setDepth(20000);

                            this.tweens.add({
                                targets: particle,
                                x: end.x + Math.cos(pAngle) * pDist,
                                y: end.y + Math.sin(pAngle) * pDist * 0.5 - 10,
                                scale: 0.3,
                                alpha: 0,
                                duration: 200 + Math.random() * 100,
                                ease: 'Quad.easeOut',
                                onComplete: () => particle.destroy()
                            });
                        }

                        // Main impact glow
                        const impact = this.add.graphics();
                        impact.fillStyle(0xff4400, 0.8);
                        impact.fillCircle(0, 0, 12);
                        impact.fillStyle(0xffcc00, 0.6);
                        impact.fillCircle(0, 0, 6);
                        impact.setPosition(end.x, end.y);
                        impact.setDepth(19999);
                        this.tweens.add({
                            targets: impact,
                            scale: 2, alpha: 0,
                            duration: 200,
                            onComplete: () => impact.destroy()
                        });
                    }
                });

                // Reload bolt after a delay (match fire rate of 3500ms - windup)
                this.time.delayedCall(3000, () => {
                    ballista.ballistaBoltLoaded = true;
                });
            }
        });
    }

    private shootXBowAt(xbow: PlacedBuilding, troop: Troop) {
        const info = BUILDINGS['xbow'];
        const start = this.cartToIso(xbow.gridX + info.width / 2, xbow.gridY + info.height / 2);
        const end = this.cartToIso(troop.gridX, troop.gridY);
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const targetTroop = troop;

        // Set targeting angle for X-Bow rotation (uses same system as ballista)
        xbow.ballistaTargetAngle = angle;
        if (xbow.ballistaAngle === undefined) {
            xbow.ballistaAngle = angle;
        }

        // Fast string pullback animation
        xbow.ballistaStringTension = 1;
        this.tweens.add({
            targets: xbow,
            ballistaStringTension: 0,
            duration: 80, // Super fast pullback
            ease: 'Cubic.easeOut'
        });

        // Small, narrow arrow (shuttle)
        const arrow = this.add.graphics();
        arrow.fillStyle(0x5d4e37, 1);
        arrow.fillRect(-6, -0.8, 12, 1.6); // Much narrower
        // Small arrowhead
        arrow.fillStyle(0x4a4a4a, 1);
        arrow.beginPath();
        arrow.moveTo(7, 0);
        arrow.lineTo(4, -2);
        arrow.lineTo(4, 2);
        arrow.closePath();
        arrow.fillPath();
        // Fletching
        arrow.fillStyle(0xcc4444, 0.8);
        arrow.beginPath();
        arrow.moveTo(-6, 0);
        arrow.lineTo(-4, -2);
        arrow.lineTo(-2, 0);
        arrow.closePath();
        arrow.fillPath();

        arrow.setPosition(start.x, start.y - 20);
        arrow.setRotation(angle);
        arrow.setDepth(20000);



        const dist = Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y);
        this.tweens.add({
            targets: arrow,
            x: end.x,
            y: end.y,
            duration: dist / 1.5, // Constant speed (1500 px/s)
            ease: 'Linear',
            onComplete: () => {
                arrow.destroy();
                // Deal smaller damage (15 per arrow, but fires 5x per second = 75 DPS)
                if (targetTroop && targetTroop.health > 0) {
                    targetTroop.health -= 15;
                    targetTroop.hasTakenDamage = true;
                    this.updateHealthBar(targetTroop);
                    if (targetTroop.health <= 0) this.destroyTroop(targetTroop);
                }
                // Small impact
                const impact = this.add.circle(end.x, end.y, 4, 0x8b4513, 0.6);
                impact.setDepth(19999);
                this.tweens.add({
                    targets: impact,
                    scale: 1.5, alpha: 0,
                    duration: 100,
                    onComplete: () => impact.destroy()
                });
            }
        });
    }

    private showWardLaser(troop: Troop, target: Troop | PlacedBuilding, damage: number) {
        const start = this.cartToIso(troop.gridX, troop.gridY);

        const isBuilding = ('type' in target && !!BUILDINGS[target.type]);
        const width = isBuilding ? BUILDINGS[target.type].width : 0.5;
        const height = isBuilding ? BUILDINGS[target.type].height : 0.5;

        const end = this.cartToIso(target.gridX + width / 2, target.gridY + height / 2);

        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        troop.facingAngle = angle;
        this.redrawTroop(troop);

        // Green for heal (negative damage), Cyan for attack
        const color = damage < 0 ? 0x00ff00 : 0x88ffcc;

        const laser = this.add.graphics();
        laser.lineStyle(4, color, 0.9);
        laser.lineBetween(start.x + 7, start.y - 17, end.x, end.y - 20);
        laser.lineStyle(2, 0xffffff, 0.6);
        laser.lineBetween(start.x + 7, start.y - 17, end.x, end.y - 20);
        laser.setDepth(25000);

        const orb = this.add.circle(start.x + 7, start.y - 17, 6, color, 0.8);
        orb.setDepth(25001);

        // DEAL DAMAGE IMMEDIATELY ON LASER SPAWN (Attack Mode Only)
        if (damage > 0 && 'health' in target && target.health > 0) {
            target.health -= damage;

            // Only buildings show hit effect/health bar update this way
            if ('graphics' in target) {
                this.showHitEffect(target.graphics);
                this.updateHealthBar(target);

                if (target.health <= 0) {
                    // It's a building
                    if ('type' in target && BUILDINGS[target.type]) {
                        this.destroyBuilding(target as PlacedBuilding);
                        this.troops.forEach(t => {
                            if (t.target && t.target.id === target.id) t.target = null;
                        });
                    } else {
                        // Troop death (if Ward attacks troops in future)
                        this.destroyTroop(target as unknown as Troop);
                    }
                }
            }
        }

        // Instant impact sparkle at target
        const sparkle = this.add.circle(end.x, end.y - 20, 8, 0x88ffcc, 0.7);
        sparkle.setDepth(25000);
        this.tweens.add({
            targets: sparkle,
            scale: 2, alpha: 0,
            duration: 200,
            onComplete: () => sparkle.destroy()
        });

        // Fade out the laser visual
        this.tweens.add({
            targets: [laser, orb],
            alpha: 0,
            duration: 300,
            onComplete: () => {
                laser.destroy();
                orb.destroy();
            }
        });
    }


    private redrawTroop(troop: Troop) {
        const g = troop.gameObject;
        g.clear();
        this.drawTroopVisual(g, troop.type, troop.owner, troop.facingAngle);
    }




    private updateTroops(delta: number) {
        this.troops.forEach(troop => {
            // Redraw chronoswarm every frame for animated aura
            if (troop.type === 'chronoswarm' && troop.health > 0) {
                this.redrawTroop(troop);
            }
            if (troop.target && troop.health > 0) {
                const b = troop.target;
                const isBuilding = ('type' in b && BUILDINGS[b.type]);
                const tw = isBuilding ? BUILDINGS[b.type].width : 0.5;
                const th = isBuilding ? BUILDINGS[b.type].height : 0.5;
                const bx = isBuilding ? b.gridX : b.gridX - tw / 2;
                const by = isBuilding ? b.gridY : b.gridY - th / 2;

                // Target center for direction
                const tx = bx + tw / 2;
                const ty = by + th / 2;
                // Distance to edge
                const edx = Math.max(bx - troop.gridX, 0, troop.gridX - (bx + tw));
                const edy = Math.max(by - troop.gridY, 0, troop.gridY - (by + th));
                const dist = Math.sqrt(edx * edx + edy * edy);
                const stats = TROOP_STATS[troop.type];

                if (dist > stats.range) {
                    const time = this.time.now;

                    // Pathfinding - Staggered updates & Fanning
                    if (!troop.path || time >= (troop.nextPathTime || 0)) {
                        let finalTarget: any = troop.target;

                        troop.path = this.findPath(troop, finalTarget) || undefined;
                        troop.lastPathTime = time;
                        const interval = troop.type === 'ward' ? 250 : 500;
                        troop.nextPathTime = time + interval + Math.random() * interval;
                    }

                    let moveDir = new Phaser.Math.Vector2(0, 0);
                    let validMove = false;

                    if (troop.path && troop.path.length > 0) {
                        const next = troop.path[0];
                        const targetX = next.x + 0.5;
                        const targetY = next.y + 0.5;

                        // Calculate distance to next waypoint
                        let dx = targetX - troop.gridX;
                        let dy = targetY - troop.gridY;
                        const d = Math.sqrt(dx * dx + dy * dy);

                        // Check for Wall collision at next step
                        if (d < 0.8) {
                            const nodeB = this.buildings.find(bl => bl.health > 0 &&
                                next.x >= bl.gridX && next.x < bl.gridX + BUILDINGS[bl.type].width &&
                                next.y >= bl.gridY && next.y < bl.gridY + BUILDINGS[bl.type].height
                            );

                            if (nodeB && nodeB.type === 'wall' && nodeB.id !== troop.target.id && nodeB.owner !== troop.owner) {
                                // Blocked by wall -> Check for coordinated attack
                                const nearby = this.findNearbyWallTarget(troop, nodeB);
                                troop.target = nearby || nodeB;
                                troop.path = undefined;
                                return;
                            }
                        }

                        if (d < 0.15) {
                            troop.path.shift();
                            if (troop.path.length > 0) {
                                const n2 = troop.path[0];
                                dx = (n2.x + 0.5) - troop.gridX;
                                dy = (n2.y + 0.5) - troop.gridY;
                            }
                        }

                        moveDir.set(dx, dy).normalize();
                        validMove = true;
                    } else {
                        // Fallback steering
                        moveDir.set(tx - troop.gridX, ty - troop.gridY).normalize();
                        validMove = true;
                    }

                    if (validMove) {
                        // Separation
                        let sepX = 0, sepY = 0;
                        this.troops.forEach(other => {
                            if (other === troop) return;
                            const d = Phaser.Math.Distance.Between(troop.gridX, troop.gridY, other.gridX, other.gridY);
                            if (d < 0.8) {
                                sepX += (troop.gridX - other.gridX) * 0.2;
                                sepY += (troop.gridY - other.gridY) * 0.2;
                            }
                        });

                        // Chrono Swarm speed boost: check for nearby chronoswarm allies
                        let chronoBoost = 1.0;
                        if (troop.type !== 'chronoswarm') { // Chrono swarm doesn't boost itself
                            for (const other of this.troops) {
                                if (other.type === 'chronoswarm' && other.owner === troop.owner && other.id !== troop.id) {
                                    const d = Phaser.Math.Distance.Between(troop.gridX, troop.gridY, other.gridX, other.gridY);
                                    const boostRadius = TROOP_STATS.chronoswarm.boostRadius ?? 4.0;
                                    if (d < boostRadius) {
                                        chronoBoost = Math.max(chronoBoost, TROOP_STATS.chronoswarm.boostAmount ?? 1.5);
                                    }
                                }
                            }
                        }

                        const speed = stats.speed * troop.speedMult * chronoBoost * delta;
                        troop.gridX += (moveDir.x + sepX) * speed;
                        troop.gridY += (moveDir.y + sepY) * speed;

                        const pos = this.cartToIso(troop.gridX, troop.gridY);
                        troop.gameObject.setPosition(pos.x, pos.y);
                        this.updateHealthBar(troop);
                        troop.gameObject.setDepth((troop.gridX + troop.gridY) * 10);

                        // Archer Rotation
                        if (troop.type === 'archer') {
                            const targetPos = this.cartToIso(tx, ty);
                            const newFacing = Math.atan2(targetPos.y - pos.y, targetPos.x - pos.x);
                            if (Math.abs(newFacing - troop.facingAngle) > 0.1) {
                                troop.facingAngle = newFacing;
                                this.redrawTroop(troop);
                            }
                        }
                    }
                } else {
                    // In range - update facing direction for archers
                    if (troop.type === 'archer' && troop.target) {
                        const pos = this.cartToIso(troop.gridX, troop.gridY);
                        const targetPos = this.cartToIso(tx, ty);
                        const newFacing = Math.atan2(targetPos.y - pos.y, targetPos.x - pos.x);
                        if (Math.abs(newFacing - troop.facingAngle) > 0.1) {
                            troop.facingAngle = newFacing;
                            this.redrawTroop(troop);
                        }
                    }
                    if (!troop.target) troop.target = this.findNearestEnemyBuilding(troop);
                }
            }
        });
    }




    private findNearbyWallTarget(troop: Troop, blockedWall: PlacedBuilding): PlacedBuilding | null {
        // Find existing wall targets being attacked by friends nearby (within 3 tiles)
        const candidates = this.troops
            .filter(t => t !== troop && t.owner === troop.owner && t.target && t.target.type === 'wall')
            .map(t => t.target!)
            .filter((value, index, self) => self.findIndex(v => v.id === value.id) === index)
            .filter(wall => {
                const dist = Phaser.Math.Distance.Between(blockedWall.gridX, blockedWall.gridY, wall.gridX, wall.gridY);
                return dist < 4;
            });

        if (candidates.length > 0) {
            // Sort by popularity (converge on single piece)
            return candidates.sort((a, b) => {
                const countA = this.troops.filter(t => t.target && t.target.id === a.id).length;
                const countB = this.troops.filter(t => t.target && t.target.id === b.id).length;
                return countB - countA;
            })[0];
        }
        return null;
    }

    private findNearestEnemyBuilding(troop: Troop): PlacedBuilding | null {
        const enemies = this.buildings.filter(b => b.owner !== troop.owner && b.health > 0);
        if (enemies.length === 0) return null;

        const isWall = (b: PlacedBuilding) => b.type === 'wall';
        const isDefense = (b: PlacedBuilding) => BUILDINGS[b.type].category === 'defense';

        // Check if only walls remain - if so, don't target anything (battle is essentially over)
        const nonWallBuildings = enemies.filter(b => !isWall(b));
        if (nonWallBuildings.length === 0) {
            // Only walls left - don't target them, let the battle end
            return null;
        }

        let targets: PlacedBuilding[] = [];

        if (troop.type === 'giant') {
            // Giants: Prioritize Defenses.
            // 1. Non-Wall Defenses
            targets = enemies.filter(b => !isWall(b) && isDefense(b));
            if (targets.length === 0) {
                // 2. Any Non-Wall (Act as if no logic/Warriors)
                targets = nonWallBuildings;
            }
        } else if (troop.type === 'ward') {
            // Ward: Assistance Mode (No walls)
            targets = nonWallBuildings;
        } else {
            // Regular: Prioritize Non-Walls
            targets = nonWallBuildings;
        }

        if (targets.length === 0) return null;

        let nearest: PlacedBuilding | null = null;
        let minDist = Infinity;
        targets.forEach(b => {
            const info = BUILDINGS[b.type];
            const dist = Phaser.Math.Distance.Between(troop.gridX, troop.gridY, b.gridX + info.width / 2, b.gridY + info.height / 2);
            if (dist < minDist) { minDist = dist; nearest = b; }
        });

        return nearest;
    }



    private findPath(troop: Troop, target: any): Phaser.Math.Vector2[] | null {
        const width = this.mapSize;
        const height = this.mapSize;
        // Default cost 10
        const grid = new Int32Array(width * height).fill(10);

        this.buildings.forEach(b => {
            if (b.health <= 0) return;
            const isTarget = (b.id === target.id);
            // Wall Cost 5000. Blocked 999999. Target 0.
            const cost = isTarget ? 0 : (b.type === 'wall' ? 5000 : 999999);
            const info = BUILDINGS[b.type];
            for (let x = b.gridX; x < b.gridX + info.width; x++) {
                for (let y = b.gridY; y < b.gridY + info.height; y++) {
                    if (x >= 0 && x < width && y >= 0 && y < height) grid[y * width + x] = cost;
                }
            }
        });

        // Troop obstacles for fanning
        this.troops.forEach(t => {
            if (t !== troop && t.health > 0) {
                const tx = Math.floor(t.gridX);
                const ty = Math.floor(t.gridY);
                if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
                    const idx = ty * width + tx;
                    if (grid[idx] < 1000) grid[idx] += 40;
                }
            }
        });

        const bTarget = target as any;
        const isBuilding = ('type' in bTarget && BUILDINGS[bTarget.type]);

        const open: any[] = [];
        const closed = new Uint8Array(width * height);
        open.push({ x: Math.floor(troop.gridX), y: Math.floor(troop.gridY), f: 0, g: 0, p: null });

        while (open.length > 0) {
            open.sort((a, b) => a.f - b.f);
            const curr = open.shift();

            const tx = isBuilding ? bTarget.gridX : Math.floor(bTarget.gridX);
            const ty = isBuilding ? bTarget.gridY : Math.floor(bTarget.gridY);
            const thw = isBuilding ? BUILDINGS[bTarget.type].width : 1;
            const thh = isBuilding ? BUILDINGS[bTarget.type].height : 1;

            if (curr.x >= tx && curr.x < tx + thw &&
                curr.y >= ty && curr.y < ty + thh) {
                const path = [];
                let p = curr;
                while (p.p) {
                    path.push(new Phaser.Math.Vector2(p.x, p.y));
                    p = p.p;
                }
                return path.reverse();
            }

            const idx = curr.y * width + curr.x;
            if (closed[idx]) continue;
            closed[idx] = 1;

            const neighbors = [{ x: curr.x + 1, y: curr.y }, { x: curr.x - 1, y: curr.y }, { x: curr.x, y: curr.y + 1 }, { x: curr.x, y: curr.y - 1 }];

            for (let n of neighbors) {
                if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
                const nIdx = n.y * width + n.x;
                if (closed[nIdx]) continue;

                const cellCost = grid[nIdx];
                if (cellCost >= 900000) continue;

                const g = curr.g + cellCost;
                const h = (Math.abs(n.x - target.gridX) + Math.abs(n.y - target.gridY)) * 10;
                const f = g + h;

                const existing = open.find((o: any) => o.x === n.x && o.y === n.y);
                if (existing) {
                    if (g < existing.g) { existing.g = g; existing.f = f; existing.p = curr; }
                } else {
                    open.push({ x: n.x, y: n.y, f, g, p: curr });
                }
            }
        }
        return null;
    }

    private destroyBuilding(b: PlacedBuilding) {
        const index = this.buildings.findIndex(x => x.id === b.id);
        if (index === -1) return;

        // Cleanup graphics
        b.graphics.destroy();
        if (b.baseGraphics) b.baseGraphics.destroy();

        // Clean up prism laser if this is a prism tower
        if (b.type === 'prism') {
            this.cleanupPrismLaser(b);
        }

        // Clean up range indicator if this building was selected
        if (b.rangeIndicator) {
            b.rangeIndicator.destroy();
        }

        const info = BUILDINGS[b.type];
        const pos = this.cartToIso(b.gridX + info.width / 2, b.gridY + info.height / 2);
        const size = Math.max(info.width, info.height);

        // Screen shake proportional to building size
        const shakeIntensity = (0.003 + size * 0.002) * (this.mode === 'HOME' ? 0.2 : 1.0);
        this.cameras.main.shake(150 + size * 100, shakeIntensity);

        // Initial flash
        const flash = this.add.circle(pos.x, pos.y - 20, 10 * size, 0xffffcc, 0.8);
        flash.setDepth(30001);
        this.tweens.add({ targets: flash, scale: 2, alpha: 0, duration: 100, onComplete: () => flash.destroy() });

        // Rubble/debris chunks
        for (let i = 0; i < 8 + size * 4; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 20 + Math.random() * 30 * size;
            const rubbleColors = [0x8b7355, 0x6b5344, 0x5a4a3a, 0x4a3a2a];
            const rubble = this.add.graphics();
            rubble.fillStyle(rubbleColors[Math.floor(Math.random() * 4)], 1);
            const rubbleSize = 3 + Math.random() * 5;
            rubble.fillRect(-rubbleSize / 2, -rubbleSize / 2, rubbleSize, rubbleSize);
            rubble.setPosition(pos.x, pos.y - 15);
            rubble.setDepth(30000);

            const peakY = pos.y - 40 - Math.random() * 30 * size;
            this.tweens.add({
                targets: rubble,
                x: pos.x + Math.cos(angle) * dist,
                duration: 400 + Math.random() * 200,
                ease: 'Quad.easeOut'
            });
            this.tweens.add({
                targets: rubble,
                y: [peakY, pos.y + 5],
                duration: 400 + Math.random() * 200,
                ease: 'Quad.easeIn',
                onComplete: () => rubble.destroy()
            });
        }

        // Dust cloud (pixelated rectangles)
        for (let i = 0; i < 6 + size * 2; i++) {
            this.time.delayedCall(i * 30, () => {
                const dustColors = [0x8b7355, 0x9b8365, 0x7b6345];
                const dustSize = 8 + Math.floor(Math.random() * 10);
                const dust = this.add.graphics();
                dust.fillStyle(dustColors[Math.floor(Math.random() * 3)], 0.6);
                dust.fillRect(-dustSize / 2, -dustSize / 2, dustSize, dustSize);
                dust.setPosition(pos.x + (Math.random() - 0.5) * 40 * size, pos.y - 10);
                dust.setDepth(29999);
                this.tweens.add({
                    targets: dust,
                    y: dust.y - 30 - Math.random() * 20,
                    x: dust.x + (Math.random() - 0.5) * 30,
                    scale: 2, alpha: 0,
                    duration: 600 + Math.random() * 300,
                    onComplete: () => dust.destroy()
                });
            });
        }

        // Type-specific effects
        if (b.type === 'town_hall') {
            // Massive fire and explosion (pixelated rectangles)
            for (let i = 0; i < 25; i++) {
                const delay = i * 40;
                this.time.delayedCall(delay, () => {
                    const fireColors = [0xff4400, 0xff6600, 0xff8800, 0xffaa00];
                    const fireSize = 8 + Math.floor(Math.random() * 15);
                    const fire = this.add.graphics();
                    fire.fillStyle(fireColors[Math.floor(Math.random() * 4)], 0.9);
                    fire.fillRect(-fireSize / 2, -fireSize / 2, fireSize, fireSize);
                    fire.setPosition(pos.x + (Math.random() - 0.5) * 80, pos.y - 10 - (Math.random() * 40));
                    fire.setDepth(30000);
                    this.tweens.add({
                        targets: fire,
                        y: fire.y - 80,
                        scale: 0.3, alpha: 0,
                        duration: 500 + Math.random() * 300,
                        onComplete: () => fire.destroy()
                    });
                });
            }
        } else if (b.type === 'cannon' || b.type === 'mortar' || b.type === 'tesla') {
            // Sparks for defensive buildings
            for (let i = 0; i < 12; i++) {
                const spark = this.add.graphics();
                spark.lineStyle(2, b.type === 'tesla' ? 0x00ccff : 0xffaa00, 0.8);
                const len = 5 + Math.random() * 15;
                const angle = Math.random() * Math.PI * 2;
                spark.lineBetween(0, 0, Math.cos(angle) * len, Math.sin(angle) * len);
                spark.setPosition(pos.x, pos.y - 15);
                spark.setDepth(30002);
                this.tweens.add({
                    targets: spark,
                    x: pos.x + (Math.random() - 0.5) * 50,
                    y: pos.y - 30 - Math.random() * 30,
                    alpha: 0,
                    duration: 200 + Math.random() * 200,
                    onComplete: () => spark.destroy()
                });
            }
        } else if (b.type === 'mine') {
            // Gold coins scatter
            for (let i = 0; i < 10; i++) {
                const coin = this.add.circle(pos.x, pos.y - 10, 4, 0xffd700, 1);
                coin.setDepth(30000);
                const angle = Math.random() * Math.PI * 2;
                const dist = 25 + Math.random() * 25;
                this.tweens.add({
                    targets: coin,
                    x: pos.x + Math.cos(angle) * dist,
                    y: [pos.y - 30, pos.y + 5],
                    duration: 400, ease: 'Quad.easeIn',
                    onComplete: () => {
                        this.tweens.add({ targets: coin, alpha: 0, duration: 200, onComplete: () => coin.destroy() });
                    }
                });
            }
        }

        // Create rubble at the building location (attack mode only)
        if (this.mode === 'ATTACK') {
            const info = BUILDINGS[b.type];
            if (info) {
                this.createRubble(b.gridX, b.gridY, info.width, info.height);
            }
        }

        b.graphics.destroy();
        if (b.barrelGraphics) b.barrelGraphics.destroy();
        b.healthBar.destroy();
        this.buildings.splice(index, 1);

        // If a wall is broken, force all troops to re-evaluate paths
        // This allows them to switch from attacking a wall to using a new gap
        if (b.type === 'wall') {
            this.troops.forEach(t => {
                t.lastPathTime = 0;
                t.nextPathTime = 0;
                if (t.target && t.target.type === 'wall') t.target = null;
            });
        }

        if (this.mode === 'ATTACK') {
            // Track destruction stats and loot
            if (b.owner === 'ENEMY') {
                if (b.type !== 'wall') this.destroyedBuildings++;

                // Award loot if available
                if (b.loot) {
                    this.goldLooted += b.loot.gold;
                    this.elixirLooted += b.loot.elixir;
                }

                this.updateBattleStats();

                this.updateBattleStats();
            }

            const enemies = this.buildings.filter(eb => eb.owner === 'ENEMY' && eb.type !== 'wall');
            if (enemies.length === 0) {
                const gold = this.goldLooted;
                const elixir = this.elixirLooted;
                this.time.delayedCall(2000, () => { (window as any).onRaidEnded?.(gold, elixir); });
            }

        } else {
            if (b.type === 'army_camp') {
                const campCount = this.buildings.filter(bc => bc.type === 'army_camp').length;
                (window as any).refreshCampCapacity?.(campCount);
            }
            // Remove from backend when player building is deleted
            if (b.owner === 'PLAYER') {
                Backend.removeBuilding('player_home', b.id);
            }
        }
    }


    private updateBattleStats() {
        const destruction = this.initialEnemyBuildings > 0
            ? Math.round((this.destroyedBuildings / this.initialEnemyBuildings) * 100)
            : 0;
        (window as any).updateBattleStats?.(destruction, this.goldLooted, this.elixirLooted);
    }



    private destroyTroop(t: Troop) {
        if (t.id === 'dummy_target') return; // Ignore dummy targets used for fun shooting
        const pos = this.cartToIso(t.gridX, t.gridY);

        // RECURSION SPLIT: Spawn two smaller recursions on death if generation < 2
        if (t.type === 'recursion' && (t.recursionGen ?? 0) < 2) {
            const nextGen = (t.recursionGen ?? 0) + 1;
            // Spawn split effect
            const splitFlash = this.add.circle(pos.x, pos.y, 15, 0x00ffaa, 0.8);
            splitFlash.setDepth(30002);
            this.tweens.add({
                targets: splitFlash,
                scale: 2.5, alpha: 0,
                duration: 200,
                onComplete: () => splitFlash.destroy()
            });

            // Spawn two smaller recursions slightly offset
            const offsets = [
                { dx: -0.5, dy: -0.3 },
                { dx: 0.5, dy: 0.3 }
            ];
            for (const off of offsets) {
                this.time.delayedCall(50, () => {
                    this.spawnTroop(t.gridX + off.dx, t.gridY + off.dy, 'recursion', t.owner, nextGen);
                });
            }
        }

        // Death explosion effect (pixelated rectangle)
        const flash = this.add.graphics();
        flash.fillStyle(0xffffff, 0.8);
        flash.fillRect(-6, -6, 12, 12);
        flash.setPosition(pos.x, pos.y);
        flash.setDepth(30001);
        this.tweens.add({ targets: flash, scale: 2, alpha: 0, duration: 100, onComplete: () => flash.destroy() });

        // Particle burst (pixelated rectangles)
        const particleColors = t.type === 'warrior' ? [0xffff00, 0xffcc00] :
            t.type === 'archer' ? [0x00ccff, 0x0088cc] :
                t.type === 'recursion' ? [0x00ffaa, 0x00cc88] :
                    t.type === 'chronoswarm' ? [0xffcc00, 0xffaa00] :
                        [0xff8800, 0xcc6600];
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const particle = this.add.graphics();
            particle.fillStyle(particleColors[i % 2], 0.9);
            particle.fillRect(-3, -3, 6, 6);
            particle.setPosition(pos.x, pos.y);
            particle.setDepth(30000);
            this.tweens.add({
                targets: particle,
                x: pos.x + Math.cos(angle) * 25,
                y: pos.y + Math.sin(angle) * 15 - 15,
                alpha: 0, scale: 0.3,
                duration: 250 + Math.random() * 100,
                ease: 'Quad.easeOut',
                onComplete: () => particle.destroy()
            });
        }

        // Smoke puff (pixelated rectangle)
        const smoke = this.add.graphics();
        smoke.fillStyle(0x666666, 0.5);
        smoke.fillRect(-10, -10, 20, 20);
        smoke.setPosition(pos.x, pos.y);
        smoke.setDepth(29999);
        this.tweens.add({
            targets: smoke,
            y: pos.y - 20,
            scale: 2, alpha: 0,
            duration: 400,
            onComplete: () => smoke.destroy()
        });

        this.troops = this.troops.filter(x => x.id !== t.id);
        t.gameObject.destroy();
        t.healthBar.destroy();
    }

    private showHitEffect(_graphics: Phaser.GameObjects.Graphics) {
        // No visual effect - buildings should not change opacity when hit
    }

    private updateResources(time: number) {
        if (this.mode !== 'HOME') return;
        if (time < this.lastResourceUpdate + this.resourceInterval) return;
        this.lastResourceUpdate = time;

        // Gold from mines
        const playerMines = this.buildings.filter(b => b.type === 'mine' && b.owner === 'PLAYER');
        if (playerMines.length > 0) (window as any).addGold(playerMines.length * 5);

        // Elixir from collectors
        const playerCollectors = this.buildings.filter(b => b.type === 'elixir_collector' && b.owner === 'PLAYER');
        if (playerCollectors.length > 0) (window as any).addElixir(playerCollectors.length * 5);
    }


    private spawnTroop(gx: number, gy: number, type: 'warrior' | 'archer' | 'giant' | 'ward' | 'recursion' | 'chronoswarm' = 'warrior', owner: 'PLAYER' | 'ENEMY' = 'PLAYER', recursionGen: number = 0) {
        // Bounds check - STRICT
        if (gx < 0 || gy < 0 || gx >= this.mapSize || gy >= this.mapSize) {
            return;
        }
        const stats = TROOP_STATS[type];
        const pos = this.cartToIso(gx, gy);

        // Scale factor for recursions based on generation (each split = 75% size)
        const scaleFactor = type === 'recursion' ? Math.pow(0.75, recursionGen) : 1;

        // Create detailed troop graphic
        const troopGraphic = this.add.graphics();
        this.drawTroopVisual(troopGraphic, type, owner);
        troopGraphic.setPosition(pos.x, pos.y);
        troopGraphic.setDepth((gx + gy) * 10);

        // Spawn dust effect
        for (let i = 0; i < 5; i++) {
            const dust = this.add.circle(
                pos.x + (Math.random() - 0.5) * 15,
                pos.y + 5,
                3 + Math.random() * 3,
                0x8b7355,
                0.5
            );
            dust.setDepth((gx + gy) * 10 - 1);
            this.tweens.add({
                targets: dust,
                x: dust.x + (Math.random() - 0.5) * 20,
                y: dust.y - 10,
                alpha: 0, scale: 1.5,
                duration: 300 + Math.random() * 200,
                onComplete: () => dust.destroy()
            });
        }

        // Landing bounce animation
        troopGraphic.setScale(0.5 * scaleFactor);
        troopGraphic.y -= 20;
        this.tweens.add({
            targets: troopGraphic,
            scaleX: scaleFactor, scaleY: scaleFactor,
            y: pos.y,
            duration: 200,
            ease: 'Bounce.easeOut'
        });

        // Recursions have reduced health per generation (70% per gen)
        const healthMod = type === 'recursion' ? Math.pow(0.7, recursionGen) : 1;
        const troopHealth = stats.health * healthMod;

        const troop: Troop = {
            id: Phaser.Utils.String.UUID(),
            type: type,
            gameObject: troopGraphic,
            healthBar: this.add.graphics(),
            gridX: gx, gridY: gy,
            health: troopHealth, maxHealth: troopHealth,
            target: null, owner: owner,
            lastAttackTime: 0,
            attackDelay: 700 + Math.random() * 300,
            speedMult: 0.9 + Math.random() * 0.2,
            hasTakenDamage: false,
            facingAngle: 0,
            recursionGen: type === 'recursion' ? recursionGen : undefined
        };

        this.troops.push(troop);
        this.hasDeployed = true;
        this.updateHealthBar(troop);
        troop.target = this.findNearestEnemyBuilding(troop);

        if (this.mode === 'ATTACK') {
            this.deploymentGraphics.setAlpha(0.3);
        }
    }

    private drawTroopVisual(graphics: Phaser.GameObjects.Graphics, type: 'warrior' | 'archer' | 'giant' | 'ward' | 'recursion' | 'chronoswarm', owner: 'PLAYER' | 'ENEMY', facingAngle: number = 0) {
        const isPlayer = owner === 'PLAYER';

        switch (type) {
            case 'warrior': {
                // Body (yellow/gold for player, purple for enemy)
                const bodyColor = isPlayer ? 0xf1c40f : 0x9b59b6;
                const darkBody = isPlayer ? 0xd4a500 : 0x7d3c98;

                // Shadow
                graphics.fillStyle(0x000000, 0.3);
                graphics.fillEllipse(0, 5, 14, 6);

                // Body
                graphics.fillStyle(darkBody, 1);
                graphics.fillCircle(0, 0, 9);
                graphics.fillStyle(bodyColor, 1);
                graphics.fillCircle(0, -1, 8);

                // Highlight
                graphics.fillStyle(0xffffff, 0.3);
                graphics.fillCircle(-2, -4, 3);

                // Sword
                graphics.fillStyle(0xaaaaaa, 1);
                graphics.fillRect(6, -8, 2, 10);
                graphics.fillStyle(0x666666, 1);
                graphics.fillRect(4, -2, 6, 2);
                break;
            }
            case 'archer': {
                const bodyColor = isPlayer ? 0x00bcd4 : 0xe91e63;
                const darkBody = isPlayer ? 0x0097a7 : 0xc2185b;

                // Shadow
                graphics.fillStyle(0x000000, 0.3);
                graphics.fillEllipse(0, 5, 12, 5);

                // Body
                graphics.fillStyle(darkBody, 1);
                graphics.fillCircle(0, 0, 8);
                graphics.fillStyle(bodyColor, 1);
                graphics.fillCircle(0, -1, 7);

                // Highlight
                graphics.fillStyle(0xffffff, 0.3);
                graphics.fillCircle(-2, -3, 2);

                // Bow - rotates based on facing angle
                const bowAngle = facingAngle || 0;
                const bowX = Math.cos(bowAngle) * 6;
                const bowY = Math.sin(bowAngle) * 4;

                graphics.lineStyle(2, 0x8b4513, 1);
                graphics.beginPath();
                graphics.arc(bowX, bowY, 8, bowAngle - Math.PI / 3, bowAngle + Math.PI / 3);
                graphics.strokePath();

                graphics.lineStyle(1, 0xcccccc, 1);
                const stringStart = { x: bowX + Math.cos(bowAngle - Math.PI / 3) * 8, y: bowY + Math.sin(bowAngle - Math.PI / 3) * 8 };
                const stringEnd = { x: bowX + Math.cos(bowAngle + Math.PI / 3) * 8, y: bowY + Math.sin(bowAngle + Math.PI / 3) * 8 };
                graphics.lineBetween(stringStart.x, stringStart.y, stringEnd.x, stringEnd.y);
                break;
            }
            case 'giant': {
                const bodyColor = isPlayer ? 0xe67e22 : 0x8e44ad;
                const darkBody = isPlayer ? 0xd35400 : 0x6c3483;

                // Shadow
                graphics.fillStyle(0x000000, 0.3);
                graphics.fillEllipse(0, 8, 22, 10);

                // Body (larger)
                graphics.fillStyle(darkBody, 1);
                graphics.fillCircle(0, 0, 14);
                graphics.fillStyle(bodyColor, 1);
                graphics.fillCircle(0, -2, 12);

                // Muscle highlights
                graphics.fillStyle(0xffffff, 0.2);
                graphics.fillCircle(-4, -6, 4);
                graphics.fillCircle(4, -4, 3);

                // Belt
                graphics.fillStyle(0x5d4e37, 1);
                graphics.fillRect(-10, 2, 20, 4);
                graphics.fillStyle(0xffd700, 1);
                graphics.fillRect(-2, 2, 4, 4);
                break;
            }
            case 'ward': {
                const bodyColor = isPlayer ? 0x2ecc71 : 0x27ae60;
                const darkBody = isPlayer ? 0x1e8449 : 0x196f3d;
                const glowColor = isPlayer ? 0x58d68d : 0x45b39d;

                // Larger heal radius - 7 tiles instead of 5
                const healRadiusPixels = 7 * 32; // 224 pixels in isometric Y
                const pulseAlpha = 0.1 + Math.sin(Date.now() / 300) * 0.05;
                const now = Date.now();

                // Draw noisy/magical edge using multiple points - 4x faster shimmer
                graphics.lineStyle(3, glowColor, pulseAlpha + 0.15);
                graphics.beginPath();
                const segments = 48;
                for (let i = 0; i <= segments; i++) {
                    const theta = (i / segments) * Math.PI * 2;
                    // Add noise using multiple sine waves at different frequencies (4x faster)
                    const noise = Math.sin(now / 25 + theta * 3) * 4 +
                        Math.sin(now / 37 + theta * 7) * 2 +
                        Math.sin(now / 20 + theta * 11) * 1.5;
                    const rx = (healRadiusPixels + noise) * Math.cos(theta);
                    const ry = ((healRadiusPixels / 2) + noise * 0.5) * Math.sin(theta);
                    if (i === 0) {
                        graphics.moveTo(rx, 5 + ry);
                    } else {
                        graphics.lineTo(rx, 5 + ry);
                    }
                }
                graphics.closePath();
                graphics.strokePath();

                // Fill with semi-transparent magical glow
                graphics.fillStyle(glowColor, pulseAlpha * 0.25);
                graphics.fillEllipse(0, 5, healRadiusPixels, healRadiusPixels / 2);

                // Inner pulsing aura glow
                const innerPulse = 0.25 + Math.sin(Date.now() / 200) * 0.1;
                graphics.fillStyle(glowColor, innerPulse);
                graphics.fillCircle(0, 0, 30);
                graphics.fillStyle(glowColor, innerPulse * 0.5);
                graphics.fillCircle(0, 0, 45);

                // Shadow
                graphics.fillStyle(0x000000, 0.3);
                graphics.fillEllipse(0, 5, 16, 7);

                // Robe body (larger for tankiness)
                graphics.fillStyle(darkBody, 1);
                graphics.fillCircle(0, 1, 11);
                graphics.fillStyle(bodyColor, 1);
                graphics.fillCircle(0, 0, 10);

                // Highlight
                graphics.fillStyle(0xffffff, 0.3);
                graphics.fillCircle(-3, -4, 4);

                // Staff (thicker)
                graphics.fillStyle(0x5d4e37, 1);
                graphics.fillRect(8, -18, 4, 24);
                graphics.fillStyle(0x4a3520, 1);
                graphics.fillRect(9, -18, 2, 24);

                // Crystal orb on staff (larger)
                graphics.fillStyle(0x88ffcc, 0.9);
                graphics.fillCircle(10, -20, 6);
                graphics.fillStyle(0xffffff, 0.6);
                graphics.fillCircle(8, -22, 2);

                // Glow around orb
                graphics.lineStyle(3, 0xaaffdd, 0.5);
                graphics.strokeCircle(10, -20, 9);
                break;
            }

            // === NOVEL UNITS ===
            case 'recursion': {
                // Fractal/geometric entity that splits on death
                const bodyColor = isPlayer ? 0x00ffaa : 0xaa00ff;
                const innerColor = isPlayer ? 0x00aa77 : 0x7700aa;
                const now = Date.now();

                // Shadow
                graphics.fillStyle(0x000000, 0.3);
                graphics.fillEllipse(0, 5, 14, 6);

                // Outer hexagonal shell (rotating slowly)
                const rot = now / 2000;
                graphics.fillStyle(bodyColor, 0.9);
                graphics.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = rot + (i / 6) * Math.PI * 2;
                    const px = Math.cos(angle) * 10;
                    const py = Math.sin(angle) * 10 * 0.6 - 2;
                    if (i === 0) graphics.moveTo(px, py);
                    else graphics.lineTo(px, py);
                }
                graphics.closePath();
                graphics.fillPath();

                // Inner hexagon (counter-rotating)
                graphics.fillStyle(innerColor, 1);
                graphics.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = -rot * 1.5 + (i / 6) * Math.PI * 2;
                    const px = Math.cos(angle) * 5;
                    const py = Math.sin(angle) * 5 * 0.6 - 2;
                    if (i === 0) graphics.moveTo(px, py);
                    else graphics.lineTo(px, py);
                }
                graphics.closePath();
                graphics.fillPath();

                // Central core with split symbol
                graphics.fillStyle(0xffffff, 0.9);
                graphics.fillCircle(0, -2, 2.5);
                graphics.lineStyle(1, bodyColor, 1);
                graphics.lineBetween(-1.5, -2, 1.5, -2);
                graphics.lineBetween(0, -3.5, 0, -0.5);
                break;
            }

            case 'chronoswarm': {
                // Mechanical time-bending insects
                const shellColor = isPlayer ? 0xffcc00 : 0x00ccff;
                const innerColor = isPlayer ? 0xaa8800 : 0x0088aa;
                const now = Date.now();

                // Large visible speed aura - corresponds to 4 tile boost radius
                // In isometric: 4 tiles ≈ 160px wide, 80px tall
                const auraScale = 0.85 + Math.sin(now / 200) * 0.15;
                const auraAlpha = 0.15 + Math.sin(now / 150) * 0.08;
                graphics.lineStyle(2, shellColor, auraAlpha);
                graphics.strokeEllipse(0, 0, 160 * auraScale, 80 * auraScale);
                // Inner aura ring
                graphics.lineStyle(1, 0xffffff, auraAlpha * 0.5);
                graphics.strokeEllipse(0, 0, 140 * auraScale, 70 * auraScale);
                // Speed particles orbiting
                const particleCount = 6;
                for (let i = 0; i < particleCount; i++) {
                    const pAngle = (now / 500) + (i / particleCount) * Math.PI * 2;
                    const px = Math.cos(pAngle) * 70;
                    const py = Math.sin(pAngle) * 35;
                    graphics.fillStyle(shellColor, 0.4 + Math.sin(now / 100 + i) * 0.2);
                    graphics.fillCircle(px, py, 3);
                }

                // Shadow
                graphics.fillStyle(0x000000, 0.25);
                graphics.fillEllipse(0, 4, 18, 8);

                // Main beetle body (isometric oval)
                graphics.fillStyle(innerColor, 1);
                graphics.fillEllipse(0, 0, 12, 8);
                graphics.fillStyle(shellColor, 1);
                graphics.fillEllipse(0, -1, 10, 7);

                // Clockwork pattern on shell
                graphics.lineStyle(1, innerColor, 0.6);
                graphics.lineBetween(-4, -1, 4, -1);
                graphics.lineBetween(0, -4, 0, 2);

                // Gear symbols
                const gearRot = now / 100;
                graphics.lineStyle(1, 0xffffff, 0.5);
                for (let i = 0; i < 4; i++) {
                    const ga = gearRot + (i / 4) * Math.PI * 2;
                    const gx = Math.cos(ga) * 3;
                    const gy = Math.sin(ga) * 2 - 1;
                    graphics.fillStyle(0xffffff, 0.6);
                    graphics.fillCircle(gx, gy, 1);
                }

                // Antennae (vibrating fast)
                const antVib = Math.sin(now / 30) * 2;
                graphics.lineStyle(1, shellColor, 0.8);
                graphics.lineBetween(-3, -5, -5 + antVib, -10);
                graphics.lineBetween(3, -5, 5 - antVib, -10);

                // Glowing eyes
                graphics.fillStyle(0xffffff, 0.9);
                graphics.fillCircle(-2, -3, 1.5);
                graphics.fillCircle(2, -3, 1.5);
                break;
            }

        }

        // Outline
        graphics.lineStyle(1, 0x000000, 0.5);
        const radius = type === 'giant' ? 12 : (type === 'ward' ? 8 : 8);
        graphics.strokeCircle(0, type === 'giant' ? -2 : (type === 'ward' ? 0 : -1), radius);
    }



    private cartToIso(x: number, y: number): Phaser.Math.Vector2 {
        const tx = (x - y) * (this.tileWidth / 2);
        const ty = (x + y) * (this.tileHeight / 2);
        return new Phaser.Math.Vector2(tx, ty);
    }

    private isoToCart(screenX: number, screenY: number): Phaser.Math.Vector2 {
        const halfW = this.tileWidth / 2;
        const halfH = this.tileHeight / 2;
        const y = (screenY / halfH - screenX / halfW) / 2;
        const x = (screenY / halfH + screenX / halfW) / 2;
        return new Phaser.Math.Vector2(x, y);
    }

    private getBuildingsBounds(owner: 'PLAYER' | 'ENEMY') {
        const ownerBuildings = this.buildings.filter(b => b.owner === owner);
        if (ownerBuildings.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        ownerBuildings.forEach(b => {
            const info = BUILDINGS[b.type];
            minX = Math.min(minX, b.gridX);
            minY = Math.min(minY, b.gridY);
            maxX = Math.max(maxX, b.gridX + info.width);
            maxY = Math.max(maxY, b.gridY + info.height);
        });
        const buffer = 1;
        return { minX: minX - buffer, minY: minY - buffer, maxX: maxX + buffer, maxY: maxY + buffer };
    }

    private updateDeploymentHighlight() {
        this.deploymentGraphics.clear();
        if (this.mode !== 'ATTACK') {
            this.deploymentGraphics.setVisible(false);
            return;
        }
        const bounds = this.getBuildingsBounds('ENEMY');
        if (!bounds) return;
        this.deploymentGraphics.setVisible(true);
        // Persist subtly even during placing
        if (!this.deploymentGraphics.alpha) this.deploymentGraphics.setAlpha(0.3);

        this.deploymentGraphics.lineStyle(2, 0xff0000, 0.4);
        const c1 = this.cartToIso(bounds.minX, bounds.minY);
        const c2 = this.cartToIso(bounds.maxX, bounds.minY);
        const c3 = this.cartToIso(bounds.maxX, bounds.maxY);
        const c4 = this.cartToIso(bounds.minX, bounds.maxY);
        this.deploymentGraphics.strokePoints([c1, c2, c3, c4], true, true);
        this.deploymentGraphics.fillStyle(0xff0000, 0.1);
        this.deploymentGraphics.fillPoints([c1, c2, c3, c4], true);
        this.deploymentGraphics.setDepth(5);
    }

    private onPointerDown(pointer: Phaser.Input.Pointer) {
        if (pointer.button === 0) {
            const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            const gridPosFloat = this.isoToCart(worldPoint.x, worldPoint.y);
            const gridPosSnap = new Phaser.Math.Vector2(Math.floor(gridPosFloat.x), Math.floor(gridPosFloat.y));

            if (this.mode === 'ATTACK') {
                const bounds = this.getBuildingsBounds('ENEMY');

                // Check if clicking on an enemy building to show its range
                const clickedBuilding = this.buildings.find(b => {
                    if (b.owner !== 'ENEMY' || b.health <= 0) return false;
                    const info = BUILDINGS[b.type];
                    return gridPosSnap.x >= b.gridX && gridPosSnap.x < b.gridX + info.width &&
                        gridPosSnap.y >= b.gridY && gridPosSnap.y < b.gridY + info.height;
                });

                if (clickedBuilding) {
                    // Show range indicator for this building
                    this.showBuildingRangeIndicator(clickedBuilding);
                    // Flash the red zone
                    this.tweens.add({
                        targets: this.deploymentGraphics,
                        alpha: 0.8,
                        duration: 100,
                        yoyo: true,
                        onComplete: () => this.deploymentGraphics.setAlpha(0.3)
                    });
                    return;
                }

                // Clear any existing range indicator when clicking elsewhere
                this.clearBuildingRangeIndicator();

                if (bounds && gridPosFloat.x >= bounds.minX && gridPosFloat.x <= bounds.maxX && gridPosFloat.y >= bounds.minY && gridPosFloat.y <= bounds.maxY) {
                    // Flash the red zone
                    this.tweens.add({
                        targets: this.deploymentGraphics,
                        alpha: 0.8,
                        duration: 100,
                        yoyo: true,
                        onComplete: () => this.deploymentGraphics.setAlpha(0.3)
                    });
                    // Don't return - allow dragging even in forbidden zone
                }

                const army = (window as any).getArmy();
                const selectedType = (window as any).getSelectedTroopType();
                if (selectedType && army[selectedType] > 0 && (!bounds || !(gridPosFloat.x >= bounds.minX && gridPosFloat.x <= bounds.maxX && gridPosFloat.y >= bounds.minY && gridPosFloat.y <= bounds.maxY))) {
                    this.spawnTroop(gridPosFloat.x, gridPosFloat.y, selectedType, 'PLAYER');
                    (window as any).deployTroop(selectedType);
                    this.lastDeployTime = this.time.now;
                    return; // Don't start dragging when deploying
                }

                // Enable camera dragging in attack mode
                this.isDragging = true;
                this.dragOrigin.set(pointer.x, pointer.y);
                return;
            }

            if (this.isMoving && this.selectedInWorld) {
                if (this.isPositionValid(gridPosSnap.x, gridPosSnap.y, this.selectedInWorld.type, this.selectedInWorld.id)) {
                    // Clear any obstacles at the new position
                    const info = BUILDINGS[this.selectedInWorld.type];
                    this.removeOverlappingObstacles(gridPosSnap.x, gridPosSnap.y, info.width, info.height);

                    this.selectedInWorld.gridX = gridPosSnap.x;
                    this.selectedInWorld.gridY = gridPosSnap.y;
                    this.selectedInWorld.graphics.clear();
                    this.drawBuildingVisuals(this.selectedInWorld.graphics, gridPosSnap.x, gridPosSnap.y, this.selectedInWorld.type, 1, null, this.selectedInWorld);
                    const depth = (gridPosSnap.x + BUILDINGS[this.selectedInWorld.type].width) + (gridPosSnap.y + BUILDINGS[this.selectedInWorld.type].height);
                    this.selectedInWorld.graphics.setDepth(depth * 10);
                    // For ballista/xbow, update barrel graphics depth
                    if (this.selectedInWorld.barrelGraphics) {
                        this.selectedInWorld.barrelGraphics.setDepth(this.selectedInWorld.graphics.depth + 1);
                    }
                    this.updateHealthBar(this.selectedInWorld);
                    // Update range indicator to follow the moved building
                    if (this.selectedInWorld.rangeIndicator) {
                        this.showBuildingRangeIndicator(this.selectedInWorld);
                    }
                    this.isMoving = false;
                    this.ghostBuilding.setVisible(false);
                    // Persist move in backend
                    if (this.selectedInWorld.owner === 'PLAYER') {
                        Backend.moveBuilding('player_home', this.selectedInWorld.id, gridPosSnap.x, gridPosSnap.y);
                    }
                }
                return;
            }

            if (pointer.rightButtonDown()) {
                this.cancelPlacement();
                return;
            }

            if (this.selectedBuildingType) {
                if (this.isPositionValid(gridPosSnap.x, gridPosSnap.y, this.selectedBuildingType)) {
                    const type = this.selectedBuildingType;
                    const success = this.placeBuilding(gridPosSnap.x, gridPosSnap.y, type, 'PLAYER');

                    if (success) {
                        // Successful placement effect
                        const info = BUILDINGS[type];
                        const pos = this.cartToIso(gridPosSnap.x + info.width / 2, gridPosSnap.y + info.height / 2);
                        this.createSmokeEffect(pos.x, pos.y, 8);

                        if (type !== 'wall') {
                            this.selectedBuildingType = null;
                            this.ghostBuilding.setVisible(false);
                            (window as any).onPlacementCancelled?.();
                        }
                    } else {
                        // Shake the ghost building to indicate failure (likely max limit reached)
                        this.tweens.add({
                            targets: this.ghostBuilding,
                            x: this.ghostBuilding.x + 5,
                            duration: 50,
                            yoyo: true,
                            repeat: 3
                        });
                    }
                }
                return;
            }

            const clicked = this.buildings.find(b => {
                const info = BUILDINGS[b.type];
                return gridPosSnap.x >= b.gridX && gridPosSnap.x < b.gridX + info.width &&
                    gridPosSnap.y >= b.gridY && gridPosSnap.y < b.gridY + info.height && b.owner === 'PLAYER';
            });
            if (clicked) {
                // If clicking a different building, clear previous range indicator
                if (this.selectedInWorld !== clicked) {
                    this.clearBuildingRangeIndicator();
                }
                this.selectedInWorld = clicked;
                (window as any).onBuildingSelected?.({ id: clicked.id, type: clicked.type, level: clicked.level || 1 });
                // Show range indicator for defensive buildings in home mode too
                this.showBuildingRangeIndicator(clicked);
            } else {
                // Check if we have a defense selected that should shoot AND input is within range
                if (this.selectedInWorld &&
                    ['cannon', 'ballista', 'xbow', 'mortar', 'tesla', 'magmavent', 'prism'].includes(this.selectedInWorld.type)) {

                    const info = BUILDINGS[this.selectedInWorld.type];
                    const centerX = this.selectedInWorld.gridX + info.width / 2;
                    const centerY = this.selectedInWorld.gridY + info.height / 2;
                    const dist = Phaser.Math.Distance.Between(gridPosFloat.x, gridPosFloat.y, centerX, centerY);

                    if (dist <= (info.range || 10)) {
                        // Start manual firing sequence
                        this.isManualFiring = true;
                        return; // Don't deselect!
                    }
                }

                // Clicking elsewhere - deselect
                if (this.selectedInWorld && this.selectedInWorld.type === 'prism') {
                    this.cleanupPrismLaser(this.selectedInWorld);
                }
                this.selectedInWorld = null;
                (window as any).onBuildingSelected?.(null);
                // Clear range indicator when clicking elsewhere
                this.clearBuildingRangeIndicator();
                this.isManualFiring = false;
                this.isDragging = true;
                this.dragOrigin.set(pointer.x, pointer.y);
            }
        }
    }

    private onPointerMove(pointer: Phaser.Input.Pointer) {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const cartFloat = this.isoToCart(worldPoint.x, worldPoint.y);
        const gridPosSnap = new Phaser.Math.Vector2(Math.floor(cartFloat.x), Math.floor(cartFloat.y));
        const gridPosFloat = cartFloat;

        this.hoverGrid.set(gridPosSnap.x, gridPosSnap.y);

        // Drag to build walls
        if (pointer.isDown && this.selectedBuildingType === 'wall') {
            if (this.isPositionValid(gridPosSnap.x, gridPosSnap.y, this.selectedBuildingType)) {
                this.placeBuilding(gridPosSnap.x, gridPosSnap.y, this.selectedBuildingType, 'PLAYER');
            }
        }

        if (this.mode === 'ATTACK' && pointer.isDown) {
            const now = this.time.now;
            if (now - this.lastDeployTime > 333) {

                const bounds = this.getBuildingsBounds('ENEMY');
                const isForbidden = bounds && gridPosFloat.x >= bounds.minX && gridPosFloat.x <= bounds.maxX && gridPosFloat.y >= bounds.minY && gridPosFloat.y <= bounds.maxY;

                if (!isForbidden) {
                    const army = (window as any).getArmy();
                    const selectedType = (window as any).getSelectedTroopType();
                    if (selectedType && army[selectedType] > 0) {
                        this.spawnTroop(gridPosFloat.x, gridPosFloat.y, selectedType, 'PLAYER');
                        (window as any).deployTroop(selectedType);
                        this.lastDeployTime = now;
                        return; // Don't drag camera when actually deploying
                    }
                }
            }
        }


        if (this.isDragging) {
            const dx = (pointer.x - this.dragOrigin.x) * this.cameraSensitivity;
            const dy = (pointer.y - this.dragOrigin.y) * this.cameraSensitivity;
            this.cameras.main.scrollX -= dx / this.cameras.main.zoom;
            this.cameras.main.scrollY -= dy / this.cameras.main.zoom;
            this.dragOrigin.set(pointer.x, pointer.y);
        }

        this.ghostBuilding.clear();
        if (this.selectedBuildingType || (this.isMoving && this.selectedInWorld)) {
            const type = this.selectedBuildingType || this.selectedInWorld?.type;
            if (type && gridPosSnap.x >= 0 && gridPosSnap.x < this.mapSize && gridPosSnap.y >= 0 && gridPosSnap.y < this.mapSize) {
                this.ghostBuilding.setVisible(true);

                this.drawBuildingVisuals(this.ghostBuilding, gridPosSnap.x, gridPosSnap.y, type, 0.5, null);

                // Ghost depth should be on top of everything for visibility
                this.ghostBuilding.setDepth(200000);
            } else { this.ghostBuilding.setVisible(false); }
        }
    }

    private onPointerUp() {
        this.isDragging = false;
        this.isManualFiring = false;
        if (this.selectedInWorld && this.selectedInWorld.type === 'prism') {
            this.cleanupPrismLaser(this.selectedInWorld);
        }
    }

    private updateTooltip() {
        // Disabled: User requested legacy tooltip removal. UI now handles info via selection panel.
        (window as any).updateGameTooltip?.(null);
    }



    // === BUILDING RANGE INDICATOR ===
    private showBuildingRangeIndicator(building: PlacedBuilding) {
        // Only show range for defensive buildings
        const info = BUILDINGS[building.type];
        if (info.category !== 'defense' || building.type === 'wall') return;

        // Clear any existing indicator
        this.clearBuildingRangeIndicator();

        // Get the range for this building type
        // Get range from centralized stats
        const range = info.range || 0;
        const deadZone = info.minRange || 0;

        if (range === 0) return;

        // Calculate center position
        const center = this.cartToIso(building.gridX + info.width / 2, building.gridY + info.height / 2);

        // Create range indicator graphics
        const rangeGraphics = this.add.graphics();
        rangeGraphics.setDepth(5);

        // Calculate isometric ellipse size (range in pixels)
        // Note: We need Math.SQRT2 factor because isometric projection of a grid-circle 
        // creates an ellipse where the major axis corresponds to the grid diagonal.
        const radiusX = range * this.tileWidth * 0.5 * Math.SQRT2;
        const radiusY = range * this.tileHeight * 0.5 * Math.SQRT2;

        // Draw subtle filled area
        rangeGraphics.fillStyle(0x4488ff, 0.08);
        rangeGraphics.fillEllipse(center.x, center.y, radiusX * 2, radiusY * 2);

        // Draw dashed outline (simulate with multiple arcs)
        rangeGraphics.lineStyle(2, 0x4488ff, 0.4);
        const dashCount = 24;
        const dashGap = 0.4; // Gap ratio
        for (let i = 0; i < dashCount; i++) {
            const startAngle = (i / dashCount) * Math.PI * 2;
            const endAngle = ((i + (1 - dashGap)) / dashCount) * Math.PI * 2;

            // Draw arc segment as a series of lines
            rangeGraphics.beginPath();
            const steps = 5;
            for (let j = 0; j <= steps; j++) {
                const t = startAngle + (endAngle - startAngle) * (j / steps);
                const x = center.x + Math.cos(t) * radiusX;
                const y = center.y + Math.sin(t) * radiusY;
                if (j === 0) {
                    rangeGraphics.moveTo(x, y);
                } else {
                    rangeGraphics.lineTo(x, y);
                }
            }
            rangeGraphics.strokePath();
        }

        // Add a subtle glow
        rangeGraphics.lineStyle(4, 0x4488ff, 0.15);
        rangeGraphics.strokeEllipse(center.x, center.y, radiusX * 2, radiusY * 2);

        // === DEAD ZONE INDICATOR ===
        if (deadZone > 0) {
            const deadRadiusX = deadZone * this.tileWidth * 0.5;
            const deadRadiusY = deadZone * this.tileHeight * 0.5;

            // Draw dead zone filled area (red, more opaque)
            rangeGraphics.fillStyle(0xff4444, 0.15);
            rangeGraphics.fillEllipse(center.x, center.y, deadRadiusX * 2, deadRadiusY * 2);

            // Draw dead zone dashed outline (red)
            rangeGraphics.lineStyle(2, 0xff4444, 0.5);
            for (let i = 0; i < dashCount; i++) {
                const startAngle = (i / dashCount) * Math.PI * 2;
                const endAngle = ((i + (1 - dashGap)) / dashCount) * Math.PI * 2;

                rangeGraphics.beginPath();
                const steps = 5;
                for (let j = 0; j <= steps; j++) {
                    const t = startAngle + (endAngle - startAngle) * (j / steps);
                    const x = center.x + Math.cos(t) * deadRadiusX;
                    const y = center.y + Math.sin(t) * deadRadiusY;
                    if (j === 0) {
                        rangeGraphics.moveTo(x, y);
                    } else {
                        rangeGraphics.lineTo(x, y);
                    }
                }
                rangeGraphics.strokePath();
            }
        }

        building.rangeIndicator = rangeGraphics;
        this.attackModeSelectedBuilding = building;

        // Add subtle pulse animation
        this.tweens.add({
            targets: rangeGraphics,
            alpha: 0.6,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    private clearBuildingRangeIndicator() {
        if (this.attackModeSelectedBuilding?.rangeIndicator) {
            this.attackModeSelectedBuilding.rangeIndicator.destroy();
            this.attackModeSelectedBuilding.rangeIndicator = undefined;
        }
        this.attackModeSelectedBuilding = null;
    }

    private handleCameraMovement(delta: number) {
        if (!this.cursorKeys) return;
        const speed = 0.5 * delta * this.cameraSensitivity;
        if (this.cursorKeys.left?.isDown) this.cameras.main.scrollX -= speed;
        else if (this.cursorKeys.right?.isDown) this.cameras.main.scrollX += speed;
        if (this.cursorKeys.up?.isDown) this.cameras.main.scrollY -= speed;
        else if (this.cursorKeys.down?.isDown) this.cameras.main.scrollY += speed;
    }

    private updateSelectionHighlight() {
        if (!this.selectionGraphics) return;
        this.selectionGraphics.clear();

        if (this.mode === 'HOME' && this.selectedInWorld) {
            const b = this.selectedInWorld;
            const info = BUILDINGS[b.type];

            // Draw bright border around base
            const p1 = this.cartToIso(b.gridX, b.gridY);
            const p2 = this.cartToIso(b.gridX + info.width, b.gridY);
            const p3 = this.cartToIso(b.gridX + info.width, b.gridY + info.height);
            const p4 = this.cartToIso(b.gridX, b.gridY + info.height);

            this.selectionGraphics.lineStyle(4, 0x00ffff, 1); // Bright Cyan
            this.selectionGraphics.beginPath();
            this.selectionGraphics.moveTo(p1.x, p1.y);
            this.selectionGraphics.lineTo(p2.x, p2.y);
            this.selectionGraphics.lineTo(p3.x, p3.y);
            this.selectionGraphics.lineTo(p4.x, p4.y);
            this.selectionGraphics.closePath();
            this.selectionGraphics.strokePath();

            // Subtle, slow pulsing opacity (0.6 to 1.0)
            this.selectionGraphics.setAlpha(0.8 + 0.2 * Math.sin(this.time.now / 800));

            // Layer BEHIND the building base (simulate on ground)
            // UPDATE: User wants it OVERLAPPING other objects (high visibility)
            // We set it to max depth.
            this.selectionGraphics.setDepth(200000);
        }
    }

    private showCloudTransition(onMidpoint: () => void) {
        // Show React overlay to cover UI - CSS animation handles timing
        (window as any).showCloudOverlay?.();

        const cloudSprites: Phaser.GameObjects.Arc[] = [];

        // for (let i = 0; i < cloudCount; i++) {
        //     const row = Math.floor(i / 7);
        //     const col = i % 7;
        //     const x = (col / 6) * width + (Math.random() - 0.5) * 100;
        //     const y = (row / 7) * height + (Math.random() - 0.5) * 100;
        //     const r = 100 + Math.random() * 100;
        //
        //     const cloud = this.add.circle(x, y, 0, 0xffffff, 1);
        //     cloud.setScrollFactor(0);
        //     cloud.setDepth(1000000);
        //     cloudSprites.push(cloud);
        //
        //     this.tweens.add({
        //         targets: cloud,
        //         radius: r,
        //         duration: 400 + Math.random() * 200,
        //         delay: (row + col) * 40,
        //         ease: 'Quad.easeOut'
        //     });
        // });


        // Wait for screen to be fully obscured (approximately after most tweens finish)
        this.time.delayedCall(750, () => {
            onMidpoint();

            // Hold for a moment to ensure state swap happens behind cover
            this.time.delayedCall(1700, () => {
                if (cloudSprites.length === 0) {
                    (window as any).hideCloudOverlay?.();
                } else {
                    cloudSprites.forEach((c, idx) => {
                        this.tweens.add({
                            targets: c,
                            radius: 0,
                            alpha: 0,
                            duration: 500,
                            delay: idx * 10,
                            onComplete: () => {
                                c.destroy();
                                if (idx === cloudSprites.length - 1) {
                                    (window as any).hideCloudOverlay?.();
                                }
                            }
                        });
                    });
                }
            });
        });
    }



    private createUI() {
        (window as any).selectBuilding = (type: string | null) => {
            this.selectedBuildingType = type;
            this.isMoving = false;
            if (!this.selectedBuildingType) this.ghostBuilding.setVisible(false);
        };
        (window as any).startAttack = () => {
            this.showCloudTransition(() => {
                this.mode = 'ATTACK';
                this.clearScene();
                this.generateEnemyVillage();
                this.centerCamera();
                // Initialize battle stats
                this.initialEnemyBuildings = this.buildings.filter(b => b.owner === 'ENEMY' && b.type !== 'wall').length;
                this.destroyedBuildings = 0;
                this.goldLooted = 0;
                this.elixirLooted = 0;
                this.raidEndScheduled = false; // Reset for new raid
                this.updateBattleStats();
                (window as any).setGameMode?.('ATTACK');
            });
        };

        (window as any).startPracticeAttack = () => {
            this.showCloudTransition(() => {
                this.mode = 'ATTACK';
                this.clearScene();
                // Load player's own base as the enemy
                const playerWorld = Backend.getWorld('player_home');
                if (playerWorld && playerWorld.buildings.length > 0) {
                    // Distribute loot
                    const lootMap = LootSystem.calculateLootDistribution(playerWorld.buildings, playerWorld.resources.gold, playerWorld.resources.elixir);
                    playerWorld.buildings.forEach(b => {
                        const inst = this.instantiateBuilding(b, 'ENEMY'); // Load as enemy so defenses work
                        if (inst) inst.loot = lootMap.get(b.id);
                    });
                } else {
                    // Fallback to default village if no saved base
                    this.placeDefaultVillage();
                    // Convert all to enemy
                    this.buildings.forEach(b => b.owner = 'ENEMY');
                }
                this.centerCamera();
                // Initialize battle stats
                this.initialEnemyBuildings = this.buildings.filter(b => b.owner === 'ENEMY' && b.type !== 'wall').length;
                this.destroyedBuildings = 0;
                this.goldLooted = 0;
                this.elixirLooted = 0;
                this.raidEndScheduled = false;
                this.updateBattleStats();
                (window as any).setGameMode?.('ATTACK');
            });
        };

        // Find new map (skip current enemy base)
        (window as any).findNewMap = () => {
            // Only allow if no troops have been deployed yet
            const deployedTroops = this.troops.filter(t => t.owner === 'PLAYER').length;
            if (deployedTroops > 0) {
                // Could show feedback here, but for now just don't do anything
                return;
            }

            this.showCloudTransition(() => {
                // Clear and regenerate enemy village
                this.clearScene();
                this.generateEnemyVillage();
                this.centerCamera();
                // Reset battle stats for new village
                this.initialEnemyBuildings = this.buildings.filter(b => b.owner === 'ENEMY' && b.type !== 'wall').length;
                this.destroyedBuildings = 0;
                this.goldLooted = 0;
                this.elixirLooted = 0;
                this.updateBattleStats();
            });
        };

        (window as any).goHome = () => {
            this.showCloudTransition(() => {
                this.goHome();
            });
        };
        (window as any).deleteSelectedBuilding = () => {
            if (this.selectedInWorld) this.destroyBuilding(this.selectedInWorld);
            this.selectedInWorld = null;
        };
        (window as any).moveSelectedBuilding = () => {
            this.isMoving = true;
            this.selectedBuildingType = null;
        };

        (window as any).upgradeSelectedBuilding = () => {
            if (this.selectedInWorld) {
                this.selectedInWorld.level = (this.selectedInWorld.level || 1) + 1;
                const stats = getBuildingStats(this.selectedInWorld.type as BuildingType, this.selectedInWorld.level);
                this.selectedInWorld.maxHealth = stats.maxHealth;
                this.selectedInWorld.health = stats.maxHealth;
                this.selectedInWorld.graphics.clear();
                if (this.selectedInWorld.baseGraphics) this.selectedInWorld.baseGraphics.clear();
                this.drawBuildingVisuals(this.selectedInWorld.graphics, this.selectedInWorld.gridX, this.selectedInWorld.gridY, this.selectedInWorld.type, 1, null, this.selectedInWorld, this.selectedInWorld.baseGraphics);
                this.updateHealthBar(this.selectedInWorld);
                return this.selectedInWorld.level;
            }
            return null;
        };
        (window as any).deselectBuilding = () => {
            this.selectedInWorld = null;
            this.isMoving = false;
        };

        // Obstacle management
        (window as any).getObstacles = () => {
            return this.obstacles.map(o => ({
                id: o.id,
                type: o.type,
                gridX: o.gridX,
                gridY: o.gridY,
                ...OBSTACLES[o.type]
            }));
        };
        (window as any).clearObstacle = (obstacleId: string) => {
            return this.removeObstacle(obstacleId);
        };
    }

    public goHome() {
        this.cancelPlacement();
        this.mode = 'HOME';
        this.hasDeployed = false;
        this.clearScene();
        // Load saved base instead of default
        if (!this.loadSavedBase()) {
            this.placeDefaultVillage();
        }
        this.centerCamera();
        const campCount = this.buildings.filter(b => b.type === 'army_camp').length;
        (window as any).refreshCampCapacity?.(campCount);
    }


    private clearScene() {
        this.buildings.forEach(b => {
            b.graphics.destroy();
            if (b.baseGraphics) b.baseGraphics.destroy();
            if (b.barrelGraphics) b.barrelGraphics.destroy();
            if (b.prismLaserGraphics) b.prismLaserGraphics.destroy();
            if (b.prismLaserCore) b.prismLaserCore.destroy();
            if (b.rangeIndicator) b.rangeIndicator.destroy();
            b.healthBar.destroy();
        });
        this.troops.forEach(t => { t.gameObject.destroy(); t.healthBar.destroy(); });
        this.buildings = [];
        this.troops = [];
        this.attackModeSelectedBuilding = null;
        this.clearRubble();
        this.clearObstacles();
    }

    private placeDefaultVillage() {
        // Clear existing if any (safety)
        this.buildings = [];

        // Town Hall
        this.placeBuilding(10, 10, 'town_hall', 'PLAYER');

        // Defenses
        this.placeBuilding(8, 8, 'cannon', 'PLAYER');
        this.placeBuilding(13, 11, 'cannon', 'PLAYER');
        this.placeBuilding(7, 12, 'cannon', 'PLAYER'); // Placeholder for archer tower
        this.placeBuilding(12, 7, 'mortar', 'PLAYER');
        this.placeBuilding(3, 14, 'dragons_breath', 'PLAYER'); // New heavy defense

        // Resources
        this.placeBuilding(6, 6, 'mine', 'PLAYER');
        this.placeBuilding(15, 12, 'mine', 'PLAYER');
        this.placeBuilding(8, 14, 'elixir_collector', 'PLAYER');
        this.placeBuilding(14, 8, 'elixir_collector', 'PLAYER');

        // Army
        this.placeBuilding(5, 10, 'barracks', 'PLAYER');
        this.placeBuilding(16, 9, 'army_camp', 'PLAYER');

        // Spawn random wildlife/obstacles
        this.spawnRandomObstacles(15);
    }

    public resetVillage() {
        this.buildings.forEach(b => {
            b.graphics.destroy();
            if (b.barrelGraphics) b.barrelGraphics.destroy();
            b.healthBar.destroy();
        });
        // Clear all arrays
        this.buildings = [];
        this.selectedInWorld = null;
        this.selectedBuildingType = null;

        localStorage.removeItem('clashIsoBase');
        this.placeDefaultVillage();

        // Refresh camp capacity state in React
        const campCount = this.buildings.filter(b => b.type === 'army_camp').length;
        (window as any).refreshCampCapacity?.(campCount);
    }

    private generateEnemyVillage() {
        const enemyWorld = Backend.generateEnemyWorld();
        // Give fake resources for loot
        enemyWorld.resources = {
            gold: Math.floor(10000 + Math.random() * 40000),
            elixir: Math.floor(10000 + Math.random() * 40000)
        };

        const lootMap = LootSystem.calculateLootDistribution(enemyWorld.buildings, enemyWorld.resources.gold, enemyWorld.resources.elixir);

        enemyWorld.buildings.forEach(b => {
            const inst = this.instantiateBuilding(b, 'ENEMY');
            if (inst) inst.loot = lootMap.get(b.id);
        });
    }



    private findWardTarget(ward: Troop): Troop | PlacedBuilding | null {
        // 1. Closest INJURED ally (Priority)
        const injured = this.troops.filter(t => t.owner === ward.owner && t !== ward && t.health < t.maxHealth && t.health > 0);
        if (injured.length > 0) {
            injured.sort((a, b) => {
                const da = Phaser.Math.Distance.Between(ward.gridX, ward.gridY, a.gridX, a.gridY);
                const db = Phaser.Math.Distance.Between(ward.gridX, ward.gridY, b.gridX, b.gridY);
                return da - db;
            });
            return injured[0];
        }

        // 2. Closest Ally (to follow)
        const allies = this.troops.filter(t => t.owner === ward.owner && t !== ward && t.health > 0);
        if (allies.length > 0) {
            allies.sort((a, b) => {
                const da = Phaser.Math.Distance.Between(ward.gridX, ward.gridY, a.gridX, a.gridY);
                const db = Phaser.Math.Distance.Between(ward.gridX, ward.gridY, b.gridX, b.gridY);
                return da - db;
            });
            return allies[0];
        }

        // 3. Enemy
        return this.findNearestEnemyBuilding(ward);
    }
    private createSmokeEffect(x: number, y: number, count: number = 5, scale: number = 1, duration: number = 800) {
        for (let i = 0; i < count; i++) {
            this.time.delayedCall(i * 40, () => {
                const smoke = this.add.graphics();
                const size = (4 + Math.random() * 6) * scale;
                smoke.fillStyle(0x757575, 0.35);
                smoke.fillRect(-size / 2, -size / 2, size, size);
                smoke.setRotation(Math.random() * Math.PI);
                smoke.setPosition(x + (Math.random() - 0.5) * 25, y + (Math.random() - 0.5) * 15);
                smoke.setDepth(10005);

                this.tweens.add({
                    targets: smoke,
                    y: y - (60 + Math.random() * 60) * scale,
                    x: smoke.x + (Math.random() - 0.5) * 50 * scale,
                    alpha: 0,
                    scale: 2.2 * scale,
                    duration: duration + Math.random() * (duration * 0.5),
                    ease: 'Quad.easeOut',
                    onComplete: () => smoke.destroy()
                });
            });
        }
    }

    private shootDragonsBreathAt(db: PlacedBuilding, troop: Troop) {
        const info = BUILDING_DEFINITIONS['dragons_breath'];
        const start = this.cartToIso(db.gridX + info.width / 2, db.gridY + info.height / 2);
        const stats = getBuildingStats('dragons_breath', db.level || 1);
        const range = stats.range || 13;

        // Find all potential targets in range to distribute pods
        const potentialTargets = this.troops.filter(t =>
            t.owner !== db.owner &&
            t.health > 0 &&
            Phaser.Math.Distance.Between(db.gridX, db.gridY, t.gridX, t.gridY) <= range
        );

        // Screenshake for the start of the massive salvo
        this.cameras.main.shake(150, 0.004);

        for (let i = 0; i < 16; i++) {
            this.time.delayedCall(i * 50, () => {
                if (!db || db.health <= 0) return;

                // Cycle through targets if we have them, otherwise fallback to the primary target
                const target = potentialTargets.length > 0
                    ? potentialTargets[i % potentialTargets.length]
                    : troop;

                if (target && target.health > 0) {
                    const jitterX = (Math.random() - 0.5) * 2.0;
                    const jitterY = (Math.random() - 0.5) * 2.0;
                    this.shootDragonPod(db, start, target.gridX + jitterX, target.gridY + jitterY, stats.damage || 25);
                }
            });
        }
    }

    private shootDragonPod(db: PlacedBuilding, start: { x: number, y: number }, targetGridX: number, targetGridY: number, damage: number) {
        const end = this.cartToIso(targetGridX, targetGridY);
        const pod = this.add.graphics();
        pod.fillStyle(0xff3300, 1);
        pod.fillCircle(0, 0, 4);
        pod.setPosition(start.x + (Math.random() - 0.5) * 30, start.y - 40);
        pod.setDepth(5000);

        const midY = (start.y + end.y) / 2 - 250;
        const dist = Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y);

        this.tweens.add({
            targets: pod,
            x: end.x,
            duration: dist / 0.35 + Math.random() * 150,
            ease: 'Linear',
            onUpdate: (tween) => {
                const t = tween.progress;
                pod.y = (1 - t) * (1 - t) * (start.y - 40) + 2 * (1 - t) * t * midY + t * t * end.y;
                if (Math.random() > 0.7) {
                    const spark = this.add.circle(pod.x, pod.y, 2, 0xffaa00, 0.8);
                    spark.setDepth(4999);
                    this.tweens.add({ targets: spark, alpha: 0, scale: 2, duration: 200, onComplete: () => spark.destroy() });
                }
            },
            onComplete: () => {
                pod.destroy();
                const boom = this.add.circle(end.x, end.y, 15, 0xff6600, 0.7);
                boom.setDepth(5001);
                this.tweens.add({ targets: boom, alpha: 0, scale: 2, duration: 150, onComplete: () => boom.destroy() });

                this.troops.slice().forEach(t => {
                    if (t.owner !== db.owner && t.health > 0) {
                        const d = Phaser.Math.Distance.Between(t.gridX, t.gridY, targetGridX, targetGridY);
                        if (d < 1.2) {
                            t.health -= damage;
                            t.hasTakenDamage = true;
                            this.updateHealthBar(t);
                            if (t.health <= 0) this.destroyTroop(t);
                        }
                    }
                });
            }
        });
    }
}

