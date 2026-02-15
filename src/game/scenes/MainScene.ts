
import Phaser from 'phaser';
import { Backend } from '../backend/GameBackend';
import type { SerializedBuilding, SerializedWorld } from '../data/Models';
import { BUILDING_DEFINITIONS, OBSTACLE_DEFINITIONS, getBuildingStats, getTroopStats, type BuildingType, type ObstacleType, type TroopType } from '../config/GameDefinitions';
import { LootSystem } from '../systems/LootSystem';
import type { PlacedBuilding, Troop, PlacedObstacle } from '../types/GameTypes';
import { BuildingRenderer } from '../renderers/BuildingRenderer';
import { TroopRenderer } from '../renderers/TroopRenderer';
import { ObstacleRenderer } from '../renderers/ObstacleRenderer';
import { RubbleRenderer } from '../renderers/RubbleRenderer';
import { PathfindingSystem } from '../systems/PathfindingSystem';
import { TargetingSystem } from '../systems/TargetingSystem';
import { depthForBuilding, depthForGroundPlane, depthForObstacle, depthForRubble, depthForTroop } from '../systems/DepthSystem';
import { IsoUtils } from '../utils/IsoUtils';
import { MobileUtils } from '../utils/MobileUtils';
import { Auth } from '../backend/Auth';
import { gameManager } from '../GameManager';
import { particleManager } from '../systems/ParticleManager';
import type { GameMode } from '../types/GameMode';
import { SceneInputController } from './controllers/SceneInputController';
import solanaCoin from '../../assets/Solana.png';

const BUILDINGS = BUILDING_DEFINITIONS as any;
const OBSTACLES = OBSTACLE_DEFINITIONS as any;

interface EnemyInstantiationSummary {
    requested: number;
    prepared: number;
    placed: number;
    playablePlaced: number;
    skippedUnknownType: number;
    skippedOutOfBounds: number;
    failedInstantiation: number;
}











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
    public tileWidth = 64;
    private groundRenderTexture!: Phaser.GameObjects.RenderTexture;
    private tempGraphics!: Phaser.GameObjects.Graphics;
    private readonly RT_OFFSET_X = 1000;
    private readonly RT_OFFSET_Y = 500;
    public tileHeight = 32;
    public mapSize = 25;
    public buildings: PlacedBuilding[] = [];
    public rubble: { gridX: number; gridY: number; width: number; height: number; graphics: Phaser.GameObjects.Graphics; createdAt: number }[] = [];
    public obstacles: PlacedObstacle[] = [];
    public troops: Troop[] = [];
    public ghostBuilding!: Phaser.GameObjects.Graphics;
    public deploymentGraphics!: Phaser.GameObjects.Graphics;
    public forbiddenGraphics!: Phaser.GameObjects.Graphics;
    public cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
    public inputController!: SceneInputController;

    public selectedBuildingType: string | null = null;
    public selectedInWorld: PlacedBuilding | null = null;
    public isMoving = false;
    public ghostGridPos: { x: number; y: number } | null = null;
    public isDragging = false;
    public dragOrigin: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    public dragStartCam: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    public dragStartScreen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    public hoverGrid: Phaser.Math.Vector2 = new Phaser.Math.Vector2(-100, -100);
    public preferredWallLevel = 1;

    public mode: GameMode = 'HOME';
    public isScouting = false;

    // Combat stuff
    public resourceInterval = 2000;
    public lastResourceUpdate = 0;

    // Battle stats tracking
    public initialEnemyBuildings = 0;
    public lastDeployTime = 0;
    public deployStartTime = 0;
    public lastForbiddenInteractionTime = 0;
    public lastGrassGrowTime = 0;

    public destroyedBuildings = 0;
    public solLooted = 0;
    public hasDeployed = false;
    public raidEndScheduled = false; // Prevent multiple end calls
    public pendingSpawnCount = 0; // Prevent battle end during troop splits (phalanx/recursion)

    public villageNameLabel!: Phaser.GameObjects.Text;
    public attackModeSelectedBuilding: PlacedBuilding | null = null;
    public dummyTroop: Troop | null = null;
    private _dummyLeaveHandler: (() => void) | null = null;

    // Online attack tracking
    public currentEnemyWorld: { id: string; username: string; isBot?: boolean; attackId?: string } | null = null;
    public playerBarracksLevel = 1;
    public playerLabLevel = 1;
    private needsDefaultBase = false;
    private sceneReadyForBaseLoad = false;

    public get userId(): string {
        try {
            const user = Auth.getCurrentUser();
            return user?.id || 'default_player';
        } catch (error) {
            console.error('Error getting user ID:', error);
            return 'default_player';
        }
    }

    public isLockingDragForTroops = false;
    public selectionGraphics!: Phaser.GameObjects.Graphics;

    public cameraSensitivity = 1.0;
    public hasUserMovedCamera = false;


    constructor() {
        super('MainScene');
    }

    private normalizeBuildingType(type: string): BuildingType | null {
        if (!type) return null;
        const canonical = type.trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (canonical === 'mine' || canonical === 'elixir_collector' || canonical === 'gold_mine' || canonical === 'elixir_pump' || canonical === 'gold_collector' || canonical === 'solana_mine') {
            return 'solana_collector';
        }
        // Legacy compatibility: accept names that differ only by underscores.
        if (!BUILDINGS[canonical]) {
            const compactCanonical = canonical.replace(/_/g, '');
            for (const key of Object.keys(BUILDINGS)) {
                if (key.replace(/_/g, '') === compactCanonical) {
                    return key as BuildingType;
                }
            }
        }
        return BUILDINGS[canonical] ? (canonical as BuildingType) : null;
    }

    private getAttackEnemyBuildings(): PlacedBuilding[] {
        if (this.mode === 'ATTACK') {
            return this.buildings.filter(b => b.type !== 'wall');
        }
        return this.buildings.filter(b => b.owner === 'ENEMY' && b.type !== 'wall');
    }

    private snapshotPlayerBarracksLevel() {
        const maxBarracks = this.buildings.reduce((max, building) => {
            if (building.owner !== 'PLAYER' || building.type !== 'barracks') return max;
            return Math.max(max, Math.max(1, building.level || 1));
        }, 1);
        this.playerBarracksLevel = Math.max(1, maxBarracks);
    }

    private snapshotPlayerLabLevel() {
        const maxLab = this.buildings.reduce((max, building) => {
            if (building.owner !== 'PLAYER' || building.type !== 'lab') return max;
            return Math.max(max, Math.max(1, building.level || 1));
        }, 0);
        this.playerLabLevel = maxLab;
    }

    private getBarracksLevelForOwner(owner: 'PLAYER' | 'ENEMY'): number {
        if (owner === 'PLAYER' && this.mode === 'ATTACK') {
            return Math.max(1, this.playerBarracksLevel);
        }
        const maxBarracks = this.buildings.reduce((max, building) => {
            if (building.owner !== owner || building.type !== 'barracks') return max;
            return Math.max(max, Math.max(1, building.level || 1));
        }, 1);
        if (owner === 'PLAYER') {
            this.playerBarracksLevel = Math.max(1, maxBarracks);
        }
        return Math.max(1, maxBarracks);
    }

    private getLabLevelForOwner(owner: 'PLAYER' | 'ENEMY'): number {
        if (owner === 'PLAYER' && this.mode === 'ATTACK') {
            return Math.max(0, this.playerLabLevel);
        }
        const maxLab = this.buildings.reduce((max, building) => {
            if (building.owner !== owner || building.type !== 'lab') return max;
            return Math.max(max, Math.max(1, building.level || 1));
        }, 0);
        if (owner === 'PLAYER') {
            this.playerLabLevel = maxLab;
        }
        return maxLab;
    }

    private getTroopLevelForOwner(owner: 'PLAYER' | 'ENEMY'): number {
        const labLevel = this.getLabLevelForOwner(owner);
        return Math.max(1, Math.min(labLevel, 3));
    }

    private getTroopCombatStats(troop: Troop) {
        return getTroopStats(troop.type, troop.level || 1);
    }

    private getBattleTotals() {
        const enemies = this.getAttackEnemyBuildings();
        const remaining = enemies.filter(b => b.health > 0 && !b.isDestroyed).length;
        const totalKnown = Math.max(this.initialEnemyBuildings, this.destroyedBuildings + remaining, enemies.length);
        return { remaining, totalKnown };
    }

    public getHomePlayableBuildingCount() {
        if (this.mode !== 'HOME') return 0;
        return this.buildings.filter(b => b.owner === 'PLAYER' && b.type !== 'wall').length;
    }

    preload() {
        this.load.image('solanaCoin', solanaCoin);
    }

    create() {
        this.cameras.main.setBackgroundColor('#141824'); // Deep midnight navy background

        // Set default zoom based on device
        const defaultZoom = MobileUtils.getDefaultZoom();
        this.cameras.main.setZoom(defaultZoom);

        this.scale.on('resize', () => {
            if (!this.hasUserMovedCamera) {
                this.centerCamera();
            }
        });

        // Register and apply pixelation pipeline
        const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
        if (renderer.pipelines) {
            if (!renderer.pipelines.has('Pixelate')) {
                renderer.pipelines.addPostPipeline('Pixelate', PixelatePipeline);
            }
            this.cameras.main.setPostPipeline('Pixelate');
        }

        gameManager.registerScene({
            setPixelation: (size: number) => {
                PixelatePipeline.size = size;
            },
            setSensitivity: (val: number) => {
                this.cameraSensitivity = val;
            },
            // Startup path: App already fetched cloud state and cached it, so avoid a second cloud refresh here.
            loadBase: () => this.sceneReadyForBaseLoad
                ? this.reloadHomeBase({ refreshOnline: false })
                : Promise.resolve(false)
        });

        // Initialize at 1.5
        PixelatePipeline.size = 1.5;

        if (this.textures.exists('solanaCoin')) {
            this.textures.get('solanaCoin').setFilter(Phaser.Textures.FilterMode.NEAREST);
        }

        this.inputController = new SceneInputController(this);
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.inputController.onPointerDown(pointer));
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.inputController.onPointerMove(pointer));
        this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.inputController.onPointerUp(pointer));

        this.input.on('wheel', (pointer: Phaser.Input.Pointer, _gameObjects: any, _deltaX: number, deltaY: number, _deltaZ: number) => {
            const camera = this.cameras.main;
            const minZoom = MobileUtils.getMinZoom();
            const maxZoom = MobileUtils.getMaxZoom();

            const oldZoom = camera.zoom;
            const newZoom = Phaser.Math.Clamp(oldZoom - deltaY * 0.002, minZoom, maxZoom);

            if (newZoom === oldZoom) return;
            this.hasUserMovedCamera = true;

            // Pointer position on screen (relative to canvas)
            const screenX = pointer.x;
            const screenY = pointer.y;

            // In Phaser, camera.scrollX/Y is where the CENTER of the camera view is in world space
            // Screen to world formula: worldX = scrollX + (screenX - viewportWidth/2) / zoom
            const viewportCenterX = camera.width / 2;
            const viewportCenterY = camera.height / 2;

            // Calculate the world point under the cursor with current zoom
            const worldX = camera.scrollX + (screenX - viewportCenterX) / oldZoom;
            const worldY = camera.scrollY + (screenY - viewportCenterY) / oldZoom;

            // Apply new zoom
            camera.setZoom(newZoom);

            // Calculate new scroll so the same world point stays under the cursor
            // worldX = newScrollX + (screenX - viewportCenterX) / newZoom
            // newScrollX = worldX - (screenX - viewportCenterX) / newZoom
            camera.scrollX = worldX - (screenX - viewportCenterX) / newZoom;
            camera.scrollY = worldY - (screenY - viewportCenterY) / newZoom;
        });

        this.events.once('shutdown', () => {
            this.sceneReadyForBaseLoad = false;
            gameManager.clearScene();
            particleManager.clearAll();
        });

        particleManager.init(this);

        this.tempGraphics = this.add.graphics().setVisible(false);
        this.createIsoGrid();
        // Center immediately so the first rendered frame is in the village center.
        this.centerCamera();
        this.createUI();

        this.selectionGraphics = this.add.graphics();
        this.ghostBuilding = this.add.graphics();
        this.ghostBuilding.setVisible(false);

        this.deploymentGraphics = this.add.graphics();
        this.deploymentGraphics.setVisible(false);

        this.forbiddenGraphics = this.add.graphics();
        this.forbiddenGraphics.setDepth(5);
        this.forbiddenGraphics.setVisible(false);

        if (this.input.keyboard) {
            this.cursorKeys = this.input.keyboard.createCursorKeys();
            this.input.keyboard.on('keydown-ESC', () => {
                if (this.dummyTroop) {
                    this.removeDummyTroop();
                    return;
                }
                this.cancelPlacement();
            });
            this.input.keyboard.on('keydown-M', () => {
                if (this.selectedInWorld) {
                    this.unbakeBuildingFromGround(this.selectedInWorld);
                    this.isMoving = true;
                    this.selectedBuildingType = null;
                    this.inputController.onPointerMove(this.input.activePointer);
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

        this.sceneReadyForBaseLoad = true;

        // Base load is commanded by App once auth/session initialization is complete.
    }

    private centerCamera() {
        const centerGrid = this.mapSize / 2;
        const pos = IsoUtils.cartToIso(centerGrid, centerGrid);
        this.cameras.main.centerOn(pos.x, pos.y);
        this.hasUserMovedCamera = false;
    }

    public cancelPlacement() {
        if (this.isMoving && this.selectedInWorld) {
            this.bakeBuildingToGround(this.selectedInWorld);
        }
        this.selectedBuildingType = null;
        this.isMoving = false;
        this.ghostGridPos = null;
        this.ghostBuilding.clear();
        this.ghostBuilding.setVisible(false);
        this.selectedInWorld = null;
        this.clearBuildingRangeIndicator();
        this.removeDummyTroop();
        gameManager.onPlacementCancelled();
    }

    update(time: number, delta: number) {
        PixelatePipeline.zoom = this.cameras.main.zoom;
        PixelatePipeline.scroll.set(this.cameras.main.scrollX, this.cameras.main.scrollY);

        this.checkBattleEnd();

        this.handleCameraMovement(delta);
        this.updateCombat(time);
        this.updateSpikeZones();
        this.updateLavaZones();
        this.updateTroops(delta);
        this.updateResources(time);
        this.updateSelectionHighlight();
        this.updateDeploymentHighlight();
        this.updateBuildingAnimations(time);
        this.updateObstacleAnimations(time);
        this.growGrass(time);
        this.updateRubbleAnimations(time);

        // Dummy troop cursor-follow
        if (this.dummyTroop) {
            const pointer = this.input.activePointer;
            const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            const cart = IsoUtils.isoToCart(worldPt.x, worldPt.y);
            this.dummyTroop.gridX = cart.x;
            this.dummyTroop.gridY = cart.y;
            const iso = IsoUtils.cartToIso(cart.x, cart.y);
            this.dummyTroop.gameObject.setPosition(iso.x, iso.y);
            this.dummyTroop.gameObject.setDepth(depthForTroop(cart.x, cart.y, 'warrior') + 10);
            this.dummyTroop.health = this.dummyTroop.maxHealth;
            this.dummyTroop.hasTakenDamage = false;
        }
    }

    private checkBattleEnd() {
        // Only check if we are attacking and have started deploying
        if (this.mode !== 'ATTACK' || !this.hasDeployed || this.raidEndScheduled) return;

        // 1. Check Army Remaining (troops not yet converted to entities)
        const army = gameManager.getArmy();
        const armyRemaining = Object.values(army).reduce((total: number, count: any) => total + (typeof count === 'number' ? count : 0), 0) as number;

        // 2. Check Active Troops (entities on the field)
        // We filter by health > 0 to exclude dying troops that might still be in the array for animation handling
        const activeTroops = this.troops.filter(t => t.health > 0).length;

        const { remaining } = this.getBattleTotals();

        // Debug info (console logs would be visible in browser)
        // console.log(`Battle State: Army: ${armyRemaining}, Active: ${activeTroops}, Remaining: ${remaining}`);

        // END CONDITION:
        // A) No reinforcements left AND no troops fighting AND no pending spawns (splits)
        // B) Base is 100% destroyed (no non-wall buildings remain)
        const noEnemiesRemaining = remaining === 0 && (this.destroyedBuildings > 0 || this.initialEnemyBuildings > 0);
        if ((armyRemaining <= 0 && activeTroops === 0 && this.pendingSpawnCount === 0) || noEnemiesRemaining) {
            this.raidEndScheduled = true;

            // 2-second delay to let final animations play / player realize what happened
            this.time.delayedCall(2000, () => {
                // Trigger the end sequence via the game manager callback, but pass a flag or handle it there
                // The user wants the SAME pathway as "Return Home"
                let handled = false;
                try {
                    handled = gameManager.onRaidEnded(this.solLooted);
                } catch (error) {
                    console.error('onRaidEnded handler failed:', error);
                }
                if (!handled) {
                    this.showCloudTransition(async () => {
                        gameManager.setGameMode('HOME');
                        await this.goHome();
                        // We also need to tell React to switch view if possible, but goHome handles internal state
                    });
                }
            });
        }
    }

    public activateDummyTroop() {
        // Deselect any selected building
        if (this.selectedInWorld) {
            if (this.selectedInWorld.type === 'prism') this.cleanupPrismLaser(this.selectedInWorld);
            this.selectedInWorld = null;
            gameManager.onBuildingSelected(null);
            this.clearBuildingRangeIndicator();
        }

        const pointer = this.input.activePointer;
        const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const cart = IsoUtils.isoToCart(worldPt.x, worldPt.y);
        const iso = IsoUtils.cartToIso(cart.x, cart.y);

        const gfx = this.add.graphics();
        this.drawScarecrow(gfx);
        gfx.setPosition(iso.x, iso.y);
        gfx.setDepth(depthForTroop(cart.x, cart.y, 'warrior') + 10);

        const healthBar = this.add.graphics().setVisible(false);

        const troop: Troop = {
            id: 'dummy_scarecrow',
            type: 'warrior',
            level: 1,
            gameObject: gfx,
            healthBar,
            gridX: cart.x,
            gridY: cart.y,
            health: Infinity,
            maxHealth: Infinity,
            owner: 'ENEMY',
            lastAttackTime: 0,
            attackDelay: 999999,
            speedMult: 0,
            hasTakenDamage: false,
            facingAngle: 0,
            target: null
        };

        this.troops.push(troop);
        this.dummyTroop = troop;
        this.game.canvas.style.cursor = 'none';

        // Auto-remove dummy when cursor leaves the canvas
        this._dummyLeaveHandler = () => {
            if (this.dummyTroop) this.removeDummyTroop();
        };
        this.game.canvas.addEventListener('mouseleave', this._dummyLeaveHandler);
    }

    public removeDummyTroop() {
        if (!this.dummyTroop) return;
        const idx = this.troops.indexOf(this.dummyTroop);
        if (idx !== -1) this.troops.splice(idx, 1);
        this.dummyTroop.gameObject.destroy();
        this.dummyTroop.healthBar.destroy();
        this.dummyTroop = null;
        this.game.canvas.style.cursor = '';

        // Remove mouseleave listener
        if (this._dummyLeaveHandler) {
            this.game.canvas.removeEventListener('mouseleave', this._dummyLeaveHandler);
            this._dummyLeaveHandler = null;
        }

        // Clean up any active prism lasers
        this.buildings.forEach(b => {
            if (b.type === 'prism') this.cleanupPrismLaser(b);
        });

        gameManager.setDummyActive(false);
    }

    public toggleDummyTroop() {
        if (this.dummyTroop) {
            this.removeDummyTroop();
        } else {
            this.activateDummyTroop();
        }
    }

    private drawScarecrow(graphics: Phaser.GameObjects.Graphics) {
        // Brown vertical pole
        graphics.lineStyle(3, 0x8B4513);
        graphics.beginPath();
        graphics.moveTo(0, -30);
        graphics.lineTo(0, 10);
        graphics.strokePath();

        // Horizontal crossbar
        graphics.lineStyle(3, 0x8B4513);
        graphics.beginPath();
        graphics.moveTo(-12, -18);
        graphics.lineTo(12, -18);
        graphics.strokePath();

        // Circle head (burlap color)
        graphics.fillStyle(0xD2B48C);
        graphics.fillCircle(0, -34, 6);
        graphics.lineStyle(1, 0x8B4513);
        graphics.strokeCircle(0, -34, 6);

        // Small triangular shirt below crossbar
        graphics.fillStyle(0xA0522D);
        graphics.beginPath();
        graphics.moveTo(-10, -18);
        graphics.lineTo(10, -18);
        graphics.lineTo(0, -4);
        graphics.closePath();
        graphics.fillPath();
    }

    private getDefenseStats(def: PlacedBuilding) {
        return getBuildingStats(def.type as BuildingType, def.level || 1);
    }

    private getDefenseCenterGrid(def: PlacedBuilding) {
        const stats = this.getDefenseStats(def);
        return { x: def.gridX + stats.width / 2, y: def.gridY + stats.height / 2 };
    }




    private fireDefenseAtTarget(defense: PlacedBuilding, target: Troop, time: number) {
        switch (defense.type) {
            case 'cannon':
                this.shootAt(defense, target);
                break;
            case 'ballista':
                this.shootBallistaAt(defense, target);
                break;
            case 'xbow':
                this.shootXBowAt(defense, target);
                break;
            case 'mortar':
                this.shootMortarAt(defense, target);
                break;
            case 'tesla':
                this.shootTeslaAt(defense, target);
                break;
            case 'magmavent':
                this.shootMagmaEruption(defense);
                break;
            case 'prism':
                this.shootPrismContinuousLaser(defense, target, time);
                break;
            case 'dragons_breath':
                this.shootDragonsBreathAt(defense, target);
                break;
            case 'spike_launcher':
                this.shootSpikeLauncherAt(defense, target);
                break;
            default:
                this.shootGenericDefenseAt(defense, target);
        }
    }


    private shootGenericDefenseAt(defense: PlacedBuilding, target: Troop) {
        let stats: any;
        try {
            stats = this.getDefenseStats(defense);
        } catch {
            stats = BUILDINGS[defense.type] ?? { width: 1, height: 1, damage: 0, color: 0xffffff };
        }

        const startCenter = IsoUtils.cartToIso(defense.gridX + (stats.width ?? 1) / 2, defense.gridY + (stats.height ?? 1) / 2);
        const end = IsoUtils.cartToIso(target.gridX, target.gridY);

        const angle = Math.atan2(end.y - startCenter.y, end.x - startCenter.x);
        defense.ballistaTargetAngle = angle;
        if (defense.ballistaAngle === undefined) defense.ballistaAngle = angle;

        const start = { x: startCenter.x, y: startCenter.y - 30 };

        const projectile = this.add.graphics();
        const color = stats.color ?? 0xffffff;
        projectile.fillStyle(color, 1);
        projectile.fillRect(-4, -4, 8, 8);
        projectile.setPosition(start.x, start.y);
        projectile.setDepth((defense.graphics?.depth ?? 5000) + 50);

        const dist = Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y);
        const duration = Math.max(120, dist / 1.2);

        this.tweens.add({
            targets: projectile,
            x: end.x,
            y: end.y,
            duration,
            ease: 'Linear',
            onComplete: () => {
                projectile.destroy();

                const impact = this.add.graphics();
                impact.fillStyle(0xffffff, 0.45);
                impact.fillRect(-6, -6, 12, 12);
                impact.setPosition(end.x, end.y);
                impact.setDepth((defense.graphics?.depth ?? 5000) + 49);
                this.tweens.add({
                    targets: impact,
                    alpha: 0,
                    scale: 2,
                    duration: 200,
                    onComplete: () => impact.destroy()
                });

                // Only apply damage to real troops that exist in the active troop list.
                if (!this.troops.includes(target)) return;
                if (target.owner === defense.owner || target.health <= 0) return;

                const damage = typeof stats.damage === 'number' ? stats.damage : 0;
                if (damage <= 0) return;

                target.health -= damage;
                target.hasTakenDamage = true;
                this.updateHealthBar(target);
                if (target.health <= 0) this.destroyTroop(target);
            }
        });
    }

    private isOffScreen(gridX: number, gridY: number, _size: number = 1): boolean {
        const iso = IsoUtils.cartToIso(gridX, gridY);
        // Add significant padding for effects/UI
        const padding = 200;
        const cam = this.cameras.main;

        // Simple screen bounds check
        // Note: iso coordinates are world space, camera scroll is top-left
        // But we need to account for zoom. WorldView is easiest.
        const view = cam.worldView;

        return (iso.x < view.x - padding ||
            iso.x > view.x + view.width + padding ||
            iso.y < view.y - padding ||
            iso.y > view.y + view.height + padding);
    }

    private updateBuildingAnimations(_time: number) {
        // Redraw all buildings for idle animations
        this.buildings.forEach(b => {
            if (b.owner === 'PLAYER' || this.mode === 'ATTACK') {
                if (this.isOffScreen(b.gridX, b.gridY, (BUILDINGS[b.type]?.width || 1))) return;

                // Hide original building if being moved (ghost is shown instead)
                if (this.isMoving && this.selectedInWorld === b) {
                    b.graphics.clear();
                    b.baseGraphics?.clear();
                    return;
                }

                // Smoothly interpolate ballista, xbow, and cannon angle towards target
                // OR towards mouse if selected in HOME mode
                let targetAngle = b.ballistaTargetAngle;

                if (this.mode === 'HOME' && this.selectedInWorld === b &&
                    (b.type === 'ballista' || b.type === 'xbow' || b.type === 'cannon')) {
                    const info = BUILDINGS[b.type];
                    const center = IsoUtils.cartToIso(b.gridX + info.width / 2, b.gridY + info.height / 2);
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
                // If baseGraphics is missing (baked), skipBase=true. If present (moving), skipBase=false.
                this.drawBuildingVisuals(b.graphics, b.gridX, b.gridY, b.type, alpha, null, b, b.baseGraphics, !b.baseGraphics);

                // SOLANA COLLECTOR: Particle burst during shake phase
                if (b.type === 'solana_collector') {
                    const cycleLength = 8000;
                    const cycleTime = this.time.now % cycleLength;
                    const isShaking = cycleTime >= 2000 && cycleTime < 3000;
                    if (isShaking && (this.time.now % 180 < 20)) { // Spawn coin every ~180ms during shake
                        const pos = IsoUtils.cartToIso(b.gridX + 1, b.gridY + 1);
                        this.spawnSolCoinBurst(pos.x, pos.y, 1);
                    }
                }

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
        const pos = IsoUtils.cartToIso(gridX, gridY);
        particleManager.spawn({
            x: pos.x,
            y: pos.y - 25,
            depth: 29999,
            duration: 2000 + Math.random() * 1000,
            onDraw: (g) => {
                g.fillStyle(0x111111, 0.5); // Darker, slightly transparent black
                const size = 3 + Math.random() * 2;
                g.fillRect(-size / 2, -size / 2, size, size);
            },
            move: {
                x: pos.x + (Math.random() - 0.5) * 5,
                y: pos.y - 120 - Math.random() * 50
            },
            alpha: 0,
            rotation: Math.random() * 360,
            scale: 2.5
        });
    }


    // Persistent state is now managed by Backend service automatically on modification

    private isWorldValid(world: SerializedWorld): boolean {
        if (!Array.isArray(world.buildings) || world.buildings.length === 0) return false;
        let hasValidBuilding = false;
        for (const building of world.buildings) {
            const normalizedType = this.normalizeBuildingType(String((building as { type?: unknown }).type ?? ''));
            if (!normalizedType) continue;
            const definition = BUILDINGS[normalizedType];
            if (!definition) continue;
            const rawX = Number((building as { gridX?: unknown }).gridX);
            const rawY = Number((building as { gridY?: unknown }).gridY);
            if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) continue;
            hasValidBuilding = true;
        }
        return hasValidBuilding;
    }

    private applyWorldToScene(world: SerializedWorld): { requested: number; placed: number; playablePlaced: number } {
        const requested = Array.isArray(world.buildings) ? world.buildings.length : 0;
        let placed = 0;
        let playablePlaced = 0;

        // Clear existing graphics and state before instantiation
        this.clearScene();

        const maxWallFromWorld = (Array.isArray(world.buildings) ? world.buildings : []).reduce((max, building) => {
            const normalizedType = this.normalizeBuildingType(String((building as { type?: unknown }).type ?? ''));
            if (normalizedType !== 'wall') return max;
            return Math.max(max, Math.max(1, Number((building as { level?: unknown }).level) || 1));
        }, 1);
        const maxBarracksFromWorld = (Array.isArray(world.buildings) ? world.buildings : []).reduce((max, building) => {
            const normalizedType = this.normalizeBuildingType(String((building as { type?: unknown }).type ?? ''));
            if (normalizedType !== 'barracks') return max;
            return Math.max(max, Math.max(1, Number((building as { level?: unknown }).level) || 1));
        }, 1);
        const maxLabFromWorld = (Array.isArray(world.buildings) ? world.buildings : []).reduce((max, building) => {
            const normalizedType = this.normalizeBuildingType(String((building as { type?: unknown }).type ?? ''));
            if (normalizedType !== 'lab') return max;
            return Math.max(max, Math.max(1, Number((building as { level?: unknown }).level) || 1));
        }, 0);
        this.preferredWallLevel = Math.max(1, Math.max(world.wallLevel || 1, maxWallFromWorld));
        this.playerBarracksLevel = Math.max(1, maxBarracksFromWorld);
        this.playerLabLevel = maxLabFromWorld;

        // Load buildings with strict per-building validation so one bad entry cannot blank the scene.
        (Array.isArray(world.buildings) ? world.buildings : []).forEach(rawBuilding => {
            const normalizedType = this.normalizeBuildingType(String((rawBuilding as { type?: unknown }).type ?? ''));
            if (!normalizedType) return;

            const definition = BUILDINGS[normalizedType];
            if (!definition) return;

            const rawX = Number((rawBuilding as { gridX?: unknown }).gridX);
            const rawY = Number((rawBuilding as { gridY?: unknown }).gridY);
            if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return;

            const gridX = Phaser.Math.Clamp(Math.floor(rawX), 0, Math.max(0, this.mapSize - definition.width));
            const gridY = Phaser.Math.Clamp(Math.floor(rawY), 0, Math.max(0, this.mapSize - definition.height));

            const rawLevel = Number((rawBuilding as { level?: unknown }).level ?? 1);
            const level = Number.isFinite(rawLevel) ? Math.max(1, Math.floor(rawLevel)) : 1;
            const id = typeof (rawBuilding as { id?: unknown }).id === 'string' && String((rawBuilding as { id?: unknown }).id).length > 0
                ? String((rawBuilding as { id?: unknown }).id)
                : Phaser.Utils.String.UUID();

            try {
                const inst = this.instantiateBuilding(
                    {
                        id,
                        type: normalizedType,
                        gridX,
                        gridY,
                        level
                    },
                    'PLAYER'
                );
                if (!inst) return;
                placed++;
                if (inst.type !== 'wall') {
                    playablePlaced++;
                }
            } catch (error) {
                console.error('applyWorldToScene: failed to instantiate player building', {
                    buildingId: id,
                    buildingType: normalizedType,
                    error
                });
            }
        });

        // Load obstacles from backend, or spawn some if none exist
        if (placed > 0 && world.obstacles && world.obstacles.length > 0) {
            world.obstacles.forEach(o => {
                this.placeObstacle(o.gridX, o.gridY, o.type, true, o.id); // skipBackend=true to prevent duplication
            });
        }

        const campLevels = this.buildings.filter(b => b.type === 'army_camp').map(b => b.level ?? 1);
        gameManager.refreshCampCapacity(campLevels);
        gameManager.closeMenus?.(); // Ensure UI is reset when loading

        return { requested, placed, playablePlaced };
    }

    private async refreshHomeBaseFromCloud(lastKnownSaveTime: number) {
        if (!Auth.isOnlineMode()) return;
        if (this.mode !== 'HOME') return;
        const refreshed = await Backend.refreshWorldFromCloud(this.userId);
        if (!refreshed || !this.isWorldValid(refreshed)) return;
        const refreshedSave = refreshed.lastSaveTime ?? 0;
        if (refreshedSave <= lastKnownSaveTime) return;
        if (this.mode !== 'HOME') return;
        this.applyWorldToScene(refreshed);
    }

    private canUseAppliedHomeWorld(summary: { requested: number; placed: number; playablePlaced: number }): boolean {
        if (summary.playablePlaced > 0) return true;
        console.warn('Home world applied with no playable structures', summary);
        return false;
    }

    private logWorldLoadDiagnostics(world: SerializedWorld | null, stage: string, summary?: { requested: number; placed: number; playablePlaced: number }) {
        if (!world) {
            console.warn(`loadSavedBase diagnostics (${stage}): world is null`);
            return;
        }
        const buildings = Array.isArray(world.buildings) ? world.buildings : [];
        const hasTownHall = buildings.some(building => this.normalizeBuildingType(String((building as { type?: unknown }).type ?? '')) === 'town_hall');
        const typeHistogram: Record<string, number> = {};
        buildings.forEach(building => {
            const rawType = String((building as { type?: unknown }).type ?? 'unknown');
            typeHistogram[rawType] = (typeHistogram[rawType] ?? 0) + 1;
        });
        console.warn(`loadSavedBase diagnostics (${stage})`, {
            worldId: world.id,
            userId: this.userId,
            buildingCount: buildings.length,
            hasTownHall,
            sampleTypes: Object.entries(typeHistogram).slice(0, 12),
            summary
        });
    }

    private async loadSavedBase(
        forceOnline: boolean = false,
        options: { preferCache?: boolean; refreshOnline?: boolean } = {}
    ): Promise<boolean> {
        // Load player home world from Backend
        this.needsDefaultBase = false;
        let world: SerializedWorld | null = null;
        let lastKnownSaveTime = 0;

        if (options.preferCache) {
            const cached = Backend.getCachedWorld(this.userId);
            if (cached && this.isWorldValid(cached)) {
                const cacheSummary = this.applyWorldToScene(cached);
                if (this.canUseAppliedHomeWorld(cacheSummary)) {
                    world = cached;
                    lastKnownSaveTime = cached.lastSaveTime ?? 0;
                } else {
                    console.warn('loadSavedBase: Cached world failed visual instantiation checks, forcing remote read path.');
                    this.logWorldLoadDiagnostics(cached, 'cache_failed_visual_apply', cacheSummary);
                }
            }
        }

        if (!world) {
            world = forceOnline && Auth.isOnlineMode()
                ? await Backend.forceLoadFromCloud(this.userId)
                : await Backend.getWorld(this.userId);

            // If world doesn't exist, create it (empty)
            if (!world) {
                if (!Auth.isOnlineMode()) {
                    world = await Backend.createWorld(this.userId, 'PLAYER');
                } else {
                    console.warn('loadSavedBase: Online base unavailable, skipping default placement.');
                    return false;
                }
            }

            // Check if there's anything valid to load
            if (!this.isWorldValid(world)) {
                if (world.buildings.length === 0) {
                    console.log("loadSavedBase: Empty base. Triggering default placement.");
                    this.needsDefaultBase = true;
                } else {
                    console.warn("loadSavedBase: No renderable buildings after sanitization. Skipping default placement to avoid data loss.");
                    this.needsDefaultBase = !Auth.isOnlineMode();
                }
                this.logWorldLoadDiagnostics(world, 'invalid_world_payload');
                return false;
            }

            const summary = this.applyWorldToScene(world);
            if (!this.canUseAppliedHomeWorld(summary)) {
                this.logWorldLoadDiagnostics(world, 'applied_world_not_playable', summary);
                return false;
            }
            lastKnownSaveTime = world.lastSaveTime ?? 0;
        }

        if (options.refreshOnline && Auth.isOnlineMode()) {
            void this.refreshHomeBaseFromCloud(lastKnownSaveTime);
        }

        return true;
    }

    private async reloadHomeBase(options: { refreshOnline?: boolean } = {}): Promise<boolean> {
        const refreshOnline = options.refreshOnline ?? true;
        let success = await this.loadSavedBase(false, { preferCache: true, refreshOnline });

        // If local/cache hydration failed, force a direct cloud fetch once before giving up.
        if (!success && Auth.isOnlineMode()) {
            success = await this.loadSavedBase(true, { preferCache: false, refreshOnline: false });
        }

        if (!success && this.needsDefaultBase) {
            // Never auto-write a fallback base in online mode; this can overwrite a valid remote base.
            if (Auth.isOnlineMode()) {
                console.error('reloadHomeBase: refusing automatic default base creation while online to avoid destructive overwrite');
                return false;
            }

            const offlineWorld = await Backend.createWorld(this.userId, 'PLAYER');
            const summary = this.applyWorldToScene(offlineWorld);
            if (!this.canUseAppliedHomeWorld(summary)) {
                return false;
            }
            this.centerCamera();
            return true;
        }
        if (success) {
            this.centerCamera();
        }
        return success;
    }


    private createIsoGrid() {
        // Initialize Ground Render Texture
        // 2000x1200 covers the map range (-800 to 800 X, 0 to 800 Y) with padding
        this.groundRenderTexture = this.add.renderTexture(-this.RT_OFFSET_X, -this.RT_OFFSET_Y, 2000, 1500);
        this.groundRenderTexture.setDepth(depthForGroundPlane());
        this.groundRenderTexture.setOrigin(0, 0);

        // Draw all tiles with lush grass variation to the texture
        for (let x = 0; x < this.mapSize; x++) {
            for (let y = 0; y < this.mapSize; y++) {
                this.tempGraphics.clear();
                this.drawIsoTile(this.tempGraphics, x, y);
                this.groundRenderTexture.draw(this.tempGraphics, this.RT_OFFSET_X, this.RT_OFFSET_Y);
            }
        }

        // Add username label in the left corner (Grid 0, mapSize)
        const leftCorner = IsoUtils.cartToIso(0, this.mapSize);

        this.villageNameLabel = this.add.text(leftCorner.x + 20, leftCorner.y - 15, '', {
            fontFamily: 'Outfit, Arial Black, sans-serif',
            fontSize: '28px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 6
        })
            .setOrigin(0, 1)
            .setAlpha(1.0) // Full brightness
            .setDepth(-500)
            .setAngle(-26.5); // Align with isometric left axis

        this.updateVillageName();
    }

    public updateUsername(name: string) {
        if (!this.villageNameLabel) return;

        if (this.mode === 'HOME') {
            this.villageNameLabel.setText(`${name.toUpperCase()}'S VILLAGE`);
        } else {
            this.villageNameLabel.setText(`ENEMY VILLAGE`);
        }
    }

    private updateVillageName() {
        if (!this.villageNameLabel) return;

        let name = 'COMMANDER';
        if (this.mode === 'HOME') {
            name = Auth.getCurrentUser()?.username || 'COMMANDER';
        } else {
            // Use the enemy's username if attacking an online base
            name = this.currentEnemyWorld?.username || 'ENEMY';
        }

        this.villageNameLabel.setText(`${name.toUpperCase()}'S VILLAGE`);
    }

    private setVillageNameVisible(visible: boolean) {
        if (!this.villageNameLabel) return;
        this.villageNameLabel.setVisible(visible);
    }

    private drawIsoTile(graphics: Phaser.GameObjects.Graphics, x: number, y: number, fillOnly: boolean = false) {
        const pos = IsoUtils.cartToIso(x, y);
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

        if (!fillOnly) {
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
    }

    private instantiateBuilding(data: SerializedBuilding, owner: 'PLAYER' | 'ENEMY') {
        const { gridX, gridY, type, id, level = 1 } = data;
        const normalizedType = this.normalizeBuildingType(type as string);
        if (!normalizedType) {
            console.warn('Unknown building type skipped:', type);
            return;
        }

        // Calculate stats based on level
        const stats = getBuildingStats(normalizedType as BuildingType, level);

        const graphics = this.add.graphics();
        const baseGraphics = undefined; // Optimization: Bake to Ground Texture instead of per-building graphics
        const building: PlacedBuilding = {
            id, type: normalizedType, gridX, gridY, level, graphics, baseGraphics,
            healthBar: this.add.graphics(),
            health: stats.maxHealth || 100,
            maxHealth: stats.maxHealth || 100,
            owner
        };

        // Bake the base to the ground texture
        this.bakeBuildingToGround(building);

        // Draw dynamic visuals (skipBase=true implied by bake, but drawBuildingVisuals handles default)
        // We pass skipBase=true to ensure only dynamic parts are drawn to 'graphics'
        this.drawBuildingVisuals(graphics, gridX, gridY, normalizedType, 1, null, building, baseGraphics, true);

        const depth = depthForBuilding(gridX, gridY, normalizedType as BuildingType);
        graphics.setDepth(depth);

        // Initialize cannon angle
        if (normalizedType === 'cannon') {
            building.ballistaAngle = Math.PI / 4; // Default facing bottom-right
        }

        this.buildings.push(building);
        this.updateHealthBar(building);

        if (normalizedType === 'army_camp') {
            const campLevels = this.buildings.filter(b => b.type === 'army_camp').map(b => b.level ?? 1);
            gameManager.refreshCampCapacity(campLevels);
        }

        if (normalizedType === 'wall') {
            this.preferredWallLevel = Math.max(this.preferredWallLevel, level || 1);
        }

        if (normalizedType === 'barracks' && owner === 'PLAYER') {
            this.playerBarracksLevel = Math.max(this.playerBarracksLevel, level || 1);
        }

        if (normalizedType === 'lab' && owner === 'PLAYER') {
            this.playerLabLevel = Math.max(this.playerLabLevel, level || 1);
        }

        // Update neighbor wall connections when a new wall is placed
        if (normalizedType === 'wall') {
            this.refreshWallNeighbors(gridX, gridY, owner);
        }

        return building;
    }

    public async placeBuilding(gridX: number, gridY: number, type: string, owner: 'PLAYER' | 'ENEMY' = 'PLAYER', isFree: boolean = false): Promise<boolean> {
        // Remove any obstacles that overlap with this building
        const info = BUILDINGS[type];
        if (info) {
            this.removeOverlappingObstacles(gridX, gridY, info.width, info.height);
        }

        if (owner === 'PLAYER') {
            // Backend Validation & Placement
            const data = await Backend.placeBuilding(this.userId, type as BuildingType, gridX, gridY);
            if (data) {
                this.instantiateBuilding(data, 'PLAYER');
                gameManager.onBuildingPlaced(type, isFree);
                return true;
            }
            return false;
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

    public removeOverlappingObstacles(gridX: number, gridY: number, width: number, height: number) {
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





    public isPositionValid(gridX: number, gridY: number, type: string, buildingToIgnore: string | null = null): boolean {
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

    private bakeBuildingToGround(b: PlacedBuilding) {
        // Walls are fully dynamic (level + neighbor links), so they should never be baked.
        if (b.type === 'wall') return;
        if (!this.groundRenderTexture || !this.tempGraphics) return;
        this.tempGraphics.clear();
        // Draw ONLY the base to temporary graphics
        this.drawBuildingVisuals(this.tempGraphics, b.gridX, b.gridY, b.type, 1, null, b, undefined, false, true);
        // Stamp to texture (additive)
        this.groundRenderTexture.draw(this.tempGraphics, this.RT_OFFSET_X, this.RT_OFFSET_Y);
    }

    // Call this before moving/deleting to restore grass
    private unbakeBuildingFromGround(b: PlacedBuilding) {
        if (b.type === 'wall') return;
        if (!this.groundRenderTexture || !this.tempGraphics) return;

        const info = BUILDINGS[b.type];
        // Margin tiles use fillOnly to cover border stroke bleed without introducing
        // semi-transparent edge highlights that would composite on top of neighboring
        // tiles and create a visible seam.
        const margin = 1;
        const clearMinX = b.gridX - margin;
        const clearMinY = b.gridY - margin;
        const clearMaxX = b.gridX + info.width + margin;
        const clearMaxY = b.gridY + info.height + margin;

        for (let x = clearMinX; x < clearMaxX; x++) {
            for (let y = clearMinY; y < clearMaxY; y++) {
                if (x >= 0 && x < this.mapSize && y >= 0 && y < this.mapSize) {
                    // Margin tiles: fill only (no edge highlights that bleed into neighbors)
                    // Footprint tiles: full redraw with edges
                    const isMargin = x < b.gridX || x >= b.gridX + info.width ||
                                     y < b.gridY || y >= b.gridY + info.height;
                    this.tempGraphics.clear();
                    this.drawIsoTile(this.tempGraphics, x, y, isMargin);
                    this.groundRenderTexture.draw(this.tempGraphics, this.RT_OFFSET_X, this.RT_OFFSET_Y);
                }
            }
        }

        // Re-bake bases of any neighboring buildings whose footprints overlap the cleared area
        for (const other of this.buildings) {
            if (other === b) continue;
            const oi = BUILDINGS[other.type];
            const otherMaxX = other.gridX + oi.width;
            const otherMaxY = other.gridY + oi.height;
            if (other.gridX < clearMaxX && otherMaxX > clearMinX &&
                other.gridY < clearMaxY && otherMaxY > clearMinY) {
                this.bakeBuildingToGround(other);
            }
        }
    }

    public drawBuildingVisuals(graphics: Phaser.GameObjects.Graphics, gridX: number, gridY: number, type: string, alpha: number = 1, tint: number | null = null, building?: PlacedBuilding, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        const info = BUILDINGS[type];
        const c1 = IsoUtils.cartToIso(gridX, gridY);
        const c2 = IsoUtils.cartToIso(gridX + info.width, gridY);
        const c3 = IsoUtils.cartToIso(gridX + info.width, gridY + info.height);
        const c4 = IsoUtils.cartToIso(gridX, gridY + info.height);
        const center = IsoUtils.cartToIso(gridX + info.width / 2, gridY + info.height / 2);

        // Building-specific premium visuals
        switch (type) {
            case 'town_hall':
                BuildingRenderer.drawTownHall(graphics, gridX, gridY, this.time.now, alpha, tint, baseGraphics, skipBase, onlyBase);
                break;
            case 'barracks':
                BuildingRenderer.drawBarracks(graphics, c1, c2, c3, c4, center, alpha, tint, building, baseGraphics, skipBase, onlyBase);
                break;
            case 'cannon':
                // Use level-based rendering for cannon
                if (building && building.level >= 4) {
                    BuildingRenderer.drawCannonLevel4(graphics, c1, c2, c3, c4, center, alpha, tint, building, baseGraphics, skipBase, onlyBase);
                } else if (building && building.level === 3) {
                    BuildingRenderer.drawCannonLevel3(graphics, c1, c2, c3, c4, center, alpha, tint, building, baseGraphics, skipBase, onlyBase);
                } else if (building && building.level === 2) {
                    BuildingRenderer.drawCannonLevel2(graphics, c1, c2, c3, c4, center, alpha, tint, building, baseGraphics, skipBase, onlyBase);
                } else {
                    BuildingRenderer.drawCannon(graphics, c1, c2, c3, c4, center, alpha, tint, building, baseGraphics, skipBase, onlyBase);
                }
                break;
            case 'ballista':
                if (building && building.level >= 3) {
                    BuildingRenderer.drawBallistaLevel3(graphics, c1, c2, c3, c4, center, alpha, tint, building, baseGraphics, skipBase, onlyBase);
                } else if (building && building.level >= 2) {
                    BuildingRenderer.drawBallistaLevel2(graphics, c1, c2, c3, c4, center, alpha, tint, building, baseGraphics, skipBase, onlyBase);
                } else {
                    BuildingRenderer.drawBallista(graphics, c1, c2, c3, c4, center, alpha, tint, building, baseGraphics, skipBase, onlyBase);
                }
                break;
            case 'solana_collector':
                BuildingRenderer.drawSolanaCollector(graphics, c1, c2, c3, c4, center, alpha, tint, building, this.time.now, baseGraphics, skipBase, onlyBase);
                break;
            case 'mortar':
                BuildingRenderer.drawMortar(graphics, c1, c2, c3, c4, center, alpha, tint, building, this.time.now, baseGraphics);
                break;
            case 'tesla':
                BuildingRenderer.drawTeslaCoil(graphics, c1, c2, c3, c4, center, alpha, tint, building, this.time.now, baseGraphics);
                break;
            case 'wall': {
                const owner = building?.owner ?? 'PLAYER';
                const hasNeighbor = (dx: number, dy: number) => {
                    return this.buildings.some(b =>
                        b.type === 'wall' && b.gridX === gridX + dx && b.gridY === gridY + dy && b.owner === owner
                    );
                };
                BuildingRenderer.drawWall(graphics, center, gridX, gridY, alpha, tint, building, {
                    nN: hasNeighbor(0, -1),
                    nS: hasNeighbor(0, 1),
                    nE: hasNeighbor(1, 0),
                    nW: hasNeighbor(-1, 0),
                    owner: owner
                });
                break;
            }
            case 'army_camp':
                BuildingRenderer.drawArmyCamp(graphics, c1, c2, c3, c4, center, alpha, tint, baseGraphics, building, skipBase, onlyBase);
                break;
            case 'xbow':
                if (building && building.level >= 3) {
                    BuildingRenderer.drawXBowLevel3(graphics, c1, c2, c3, c4, center, alpha, tint, building, this.time.now, baseGraphics, skipBase, onlyBase);
                } else if (building && building.level >= 2) {
                    BuildingRenderer.drawXBowLevel2(graphics, c1, c2, c3, c4, center, alpha, tint, building, this.time.now, baseGraphics, skipBase, onlyBase);
                } else {
                    BuildingRenderer.drawXBow(graphics, c1, c2, c3, c4, center, alpha, tint, building, this.time.now, baseGraphics, skipBase, onlyBase);
                }
                break;
            case 'prism':
                BuildingRenderer.drawPrismTower(graphics, c1, c2, c3, c4, center, alpha, tint, building, baseGraphics, skipBase, onlyBase);
                break;
            case 'magmavent':
                BuildingRenderer.drawMagmaVent(graphics, c1, c2, c3, c4, center, alpha, tint, building, baseGraphics, this.time.now, skipBase, onlyBase);
                break;
            case 'dragons_breath':
                BuildingRenderer.drawDragonsBreath(graphics, c1, c2, c3, c4, center, alpha, tint, building, baseGraphics, gridX, gridY, this.time.now, skipBase, onlyBase);
                break;
            case 'spike_launcher':
                BuildingRenderer.drawSpikeLauncher(graphics, c1, c2, c3, c4, center, alpha, tint, building, this.time.now, baseGraphics, skipBase, onlyBase);
                break;
            case 'lab':
                BuildingRenderer.drawLab(graphics, c1, c2, c3, c4, center, alpha, tint, building, this.time.now, baseGraphics, skipBase, onlyBase);
                break;

            default:
                BuildingRenderer.drawGenericBuilding(graphics, c1, c2, c3, c4, center, info, alpha, tint, baseGraphics);
        }
    }

    /**
     * Redraw walls adjacent to a given position to update their neighbor connections.
     * Call this after moving/placing/removing a wall.
     */
    public refreshWallNeighbors(gridX: number, gridY: number, owner: 'PLAYER' | 'ENEMY') {
        const offsets = [
            { dx: 0, dy: -1 },  // North
            { dx: 0, dy: 1 },   // South
            { dx: 1, dy: 0 },   // East
            { dx: -1, dy: 0 }   // West
        ];

        for (const { dx, dy } of offsets) {
            const neighbor = this.buildings.find(b =>
                b.type === 'wall' &&
                b.gridX === gridX + dx &&
                b.gridY === gridY + dy &&
                b.owner === owner
            );
            if (neighbor) {
                neighbor.graphics.clear();
                this.drawBuildingVisuals(
                    neighbor.graphics,
                    neighbor.gridX,
                    neighbor.gridY,
                    'wall',
                    1,
                    null,
                    neighbor
                );
            }
        }
    }







    // === MAGMA VENT - STEAMPUNK/TECH REDESIGN ===

    // === DRAGON'S BREATH - Subtle Asian-Themed Firecracker Battery ===

    // === RUBBLE SYSTEM (Destroyed Building Remains) ===
    private createRubble(gridX: number, gridY: number, width: number, height: number) {
        const graphics = this.add.graphics();
        RubbleRenderer.drawRubble(graphics, gridX, gridY, width, height);

        graphics.setDepth(depthForRubble(gridX, gridY, width, height));

        this.rubble.push({ gridX, gridY, width, height, graphics, createdAt: Date.now() });
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
            this.placeObstacle(spot.x, spot.y, 'grass_patch', true);
        } else {
            // Spontaneous generation
            const x = Math.floor(Math.random() * (this.mapSize - 4)) + 2;
            const y = Math.floor(Math.random() * (this.mapSize - 4)) + 2;
            this.placeObstacle(x, y, 'grass_patch', true);
        }
    }

    private updateRubbleAnimations(time: number) {
        const now = Date.now();
        this.rubble.forEach(r => {
            // Only animate large rubble (3x3)
            if (r.width >= 3 || r.height >= 3) {
                if (!r.graphics || !r.graphics.scene) return;
                r.graphics.clear();

                // Fire fades out over time: full for 15s, then fades over 30s
                const age = (now - r.createdAt) / 1000; // Age in seconds
                let fireIntensity = 1;
                if (age > 15) {
                    // Fade from 1 to 0 between 15s and 45s
                    fireIntensity = Math.max(0, 1 - (age - 15) / 30);
                }

                RubbleRenderer.drawRubble(r.graphics, r.gridX, r.gridY, r.width, r.height, time, fireIntensity);
            }
        });
    }

    private clearRubble() {
        this.rubble.forEach(r => r.graphics.destroy());
        this.rubble = [];
    }

    // === OBSTACLE SYSTEM (Rocks, Trees, Grass) ===
    public placeObstacle(gridX: number, gridY: number, type: ObstacleType, skipBackend: boolean = false, idOverride?: string) {
        const info = OBSTACLES[type];
        if (!info) return false;

        // Check if position is valid (not overlapping buildings or other obstacles)
        if (!this.isObstaclePositionValid(gridX, gridY, info.width, info.height)) return false;

        const graphics = this.add.graphics();
        const animOffset = Math.random() * Math.PI * 2;

        const obstacle: PlacedObstacle = {
            id: idOverride || Phaser.Utils.String.UUID(),
            type,
            gridX,
            gridY,
            graphics,
            animOffset
        };

        this.drawObstacle(obstacle);

        graphics.setDepth(depthForObstacle(gridX, gridY, info.width, info.height));

        this.obstacles.push(obstacle);

        // Persist to backend if in HOME mode and not skipping
        if (this.mode === 'HOME' && !skipBackend) {
            Backend.placeObstacle(this.userId, type, gridX, gridY);
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
        ObstacleRenderer.drawObstacle(obstacle.graphics, obstacle, time);
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
            Backend.removeObstacle(this.userId, obstacleId);
        }
        return true;
    }

    private clearObstacles() {
        this.obstacles.forEach(o => o.graphics.destroy());
        this.obstacles = [];
    }

    // === LEVEL 1: WOODEN PALISADE ===

    // === LEVEL 2: STONE WALL ===

    // === LEVEL 3: FORTIFIED DARK STONE ===





    public updateHealthBar(item: PlacedBuilding | Troop) {
        if (!item.healthBar || !item.healthBar.scene) return; // Ignore destroyed or dummy health bars
        if ('isDestroyed' in item && item.isDestroyed) return;
        // Never show health bar for the dummy scarecrow
        if ('id' in item && (item as Troop).id === 'dummy_scarecrow') return;
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
            if (!info) return;
            const p = IsoUtils.cartToIso(item.gridX + info.width / 2, item.gridY + info.height / 2);
            width = 36 + info.width * 8;
            height = 8;
            x = p.x - width / 2;
            y = p.y - 50 - (info.height * 10);
        } else {
            const troop = item as Troop;
            const pos = IsoUtils.cartToIso(troop.gridX, troop.gridY);
            width = 28;
            height = 6;
            x = pos.x - width / 2;

            // Adjust health bar height based on unit size
            let yOffset = 22;
            if (troop.type === 'golem') yOffset = 70;
            else if (troop.type === 'sharpshooter' || troop.type === 'mobilemortar') yOffset = 45;
            else if (troop.type === 'giant') yOffset = 35;

            y = pos.y - yOffset;
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
            const fillWidth = width * healthPct;
            if (fillWidth > 0.5) { // Only draw if visible
                bar.fillStyle(fillColor, 1);
                // For very small widths, use a smaller radius to prevent artifacts
                const fillRadius = Math.min(radius, fillWidth / 2);
                this.drawRoundedRect(bar, x, y, fillWidth, height, fillRadius);

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
        }

        // Always set depth when bar is visible to ensure proper layering
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
        const isDummyActive = this.mode === 'HOME' && this.dummyTroop !== null;
        if (this.mode !== 'ATTACK' && !isDummyActive) return;

        // Include any fireable defense (no per-type hardcoding).
        const defenses = this.buildings.filter(b => {
            const info = BUILDINGS[b.type];
            return info && info.category === 'defense' && b.type !== 'wall' && b.health > 0;
        });
        defenses.forEach(defense => {
            let nearestTroop: Troop | null = null;
            const stats = getBuildingStats(defense.type as BuildingType, defense.level || 1);
            let minDist = stats.range || 7;
            const interval = stats.fireRate || 2500;

            // Initial delay for non-continuous defenses (not prism laser)
            const needsInitialDelay = defense.type !== 'prism' && defense.type !== 'magmavent';
            if (defense.lastFireTime === undefined) {
                // Set initial fire time - continuous defenses fire immediately, others have 1.5s delay
                defense.lastFireTime = needsInitialDelay ? time : (time - interval);
            }

            // Tesla charge-up mechanic: handle charging/firing separately from cooldown
            if (defense.type === 'tesla') {
                // If currently charging, check if charge is complete (800ms)
                if (defense.teslaCharging && defense.teslaChargeStart) {
                    if (time >= defense.teslaChargeStart + 800) {
                        // Charge complete — fire!
                        const target = defense.teslaChargeTarget;
                        if (target && target.health > 0) {
                            this.fireDefenseAtTarget(defense, target, time);
                        }
                        defense.teslaCharging = false;
                        defense.teslaCharged = true;
                        defense.lastFireTime = time;
                        defense.teslaChargeTarget = undefined;
                    }
                    return; // Don't look for new targets while charging
                }

                // Reset charged state after 400ms
                if (defense.teslaCharged && defense.lastFireTime && time > defense.lastFireTime + 400) {
                    defense.teslaCharged = false;
                }

                // Check cooldown before starting new charge
                if (time < (defense.lastFireTime || 0) + interval) return;

                // Find target and start charging
                const bWidth = stats.width || 1;
                const bHeight = stats.height || 1;
                const centerX = defense.gridX + bWidth / 2;
                const centerY = defense.gridY + bHeight / 2;

                this.troops.forEach(troop => {
                    if (troop.owner !== defense.owner && troop.health > 0) {
                        const dist = Phaser.Math.Distance.Between(centerX, centerY, troop.gridX, troop.gridY);
                        if (dist < minDist) {
                            if (stats.minRange && dist < stats.minRange) return;
                            minDist = dist; nearestTroop = troop;
                        }
                    }
                });

                if (nearestTroop) {
                    defense.teslaCharging = true;
                    defense.teslaChargeStart = time;
                    defense.teslaChargeTarget = nearestTroop;
                }
                return;
            }

            // Check if enough time has passed since last shot
            if (time < (defense.lastFireTime || 0) + interval) return;

            const bWidth = stats.width || 1;
            const bHeight = stats.height || 1;
            const centerX = defense.gridX + bWidth / 2;
            const centerY = defense.gridY + bHeight / 2;

            this.troops.forEach(troop => {
                if (troop.owner !== defense.owner && troop.health > 0) {
                    const dist = Phaser.Math.Distance.Between(centerX, centerY, troop.gridX, troop.gridY);
                    if (dist < minDist) {
                        if (stats.minRange && dist < stats.minRange) return; // Dead zone check
                        minDist = dist; nearestTroop = troop;
                    }
                }
            });

            if (nearestTroop) {
                defense.lastFireTime = time;
                this.fireDefenseAtTarget(defense, nearestTroop, time);
            } else {
                // No target - clean up prism laser if it exists
                if (defense.type === 'prism') {
                    this.cleanupPrismLaser(defense);
                }
            }
        });

        // Only fire defenses in dummy mode, skip troop AI/movement/damage
        if (isDummyActive) return;

        this.troops.forEach(troop => {
            if (troop.health <= 0) return;



            if (troop.type === 'ward') {
                // --- PASSIVE WARD HEAL ---
                const wardStats = this.getTroopCombatStats(troop);
                const healDelay = 500; // Heal every 0.5 seconds
                if (!(troop as any).lastPassiveHeal || time > (troop as any).lastPassiveHeal + healDelay) {
                    (troop as any).lastPassiveHeal = time;

                    this.troops.forEach(other => {
                        if (other.owner === troop.owner && other.health > 0 && other.health < other.maxHealth) {
                            const d = Phaser.Math.Distance.Between(troop.gridX, troop.gridY, other.gridX, other.gridY);
                            if (d <= (wardStats.healRadius ?? 0)) {
                                other.health = Math.min(other.maxHealth, other.health + (wardStats.healAmount ?? 0));
                                this.updateHealthBar(other);

                                // Green plus sign heal indicator
                                const pos = IsoUtils.cartToIso(other.gridX, other.gridY);
                                const plusGfx = this.add.graphics();
                                plusGfx.setPosition(pos.x, pos.y - 12);
                                plusGfx.setDepth(other.gameObject.depth + 1);
                                plusGfx.fillStyle(0x00ff88, 0.7);
                                plusGfx.fillRect(-1, -4, 2, 8); // vertical bar
                                plusGfx.fillRect(-4, -1, 8, 2); // horizontal bar
                                this.tweens.add({
                                    targets: plusGfx,
                                    y: pos.y - 25,
                                    alpha: 0,
                                    scaleX: 1.5,
                                    scaleY: 1.5,
                                    duration: 500,
                                    onComplete: () => plusGfx.destroy()
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
                    troop.target = TargetingSystem.findTarget(troop, this.buildings);
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

                const stats = this.getTroopCombatStats(troop);
                const isEnemy = b.owner !== troop.owner;

                if (troop.type === 'ward' && time > troop.lastAttackTime + troop.attackDelay) {
                    // Ward specialized attack behavior (Grand Warden style)
                    const wardStats = stats;
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
                            } else if (troop.type === 'sharpshooter') {
                                // Sharpshooter - enhanced archer projectile
                                this.showSharpshooterProjectile(troop, troop.target, stats.damage);
                            } else if (troop.type === 'mobilemortar') {
                                // Mobile Mortar - arcing splash attack like mortar building
                                this.showMobileMortarShot(troop, troop.target, stats.damage);
                            } else if (troop.type === 'stormmage') {
                                this.showStormLightning(troop, troop.target, stats.damage);
                            } else if (troop.type === 'golem') {
                                // GOLEM GROUND POUND - Single slam with AoE damage
                                const currentPos = IsoUtils.cartToIso(troop.gridX, troop.gridY);

                                // Initialize slamOffset if not set
                                if (troop.slamOffset === undefined) troop.slamOffset = 0;

                                // Single slam animation - body/head drops down (using slamOffset)
                                const slamTarget = { offset: 0 };
                                this.tweens.add({
                                    targets: slamTarget,
                                    offset: 12, // Body/head slam down amount
                                    duration: 200,
                                    ease: 'Quad.easeIn',
                                    onUpdate: () => {
                                        troop.slamOffset = slamTarget.offset;
                                        this.redrawTroopWithMovement(troop, false);
                                    },
                                    onComplete: () => {
                                        // Screen shake at impact
                                        this.cameras.main.shake(50, 0.0015);

                                        // Ground crack effect (moved higher to align with slam)
                                        this.showGolemCrackEffect(currentPos.x, currentPos.y + 15);

                                        // Deal damage to all buildings within 3 tile radius
                                        const aoeTiles = 3;
                                        this.buildings.forEach(b => {
                                            if (b.owner !== troop.owner && b.health > 0) {
                                                const bdx = (b.gridX + BUILDINGS[b.type].width / 2) - troop.gridX;
                                                const bdy = (b.gridY + BUILDINGS[b.type].height / 2) - troop.gridY;
                                                const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
                                                if (bdist <= aoeTiles) {
                                                    b.health -= stats.damage;
                                                    this.showHitEffect(b.graphics);
                                                    this.updateHealthBar(b);
                                                    if (b.health <= 0) {
                                                        this.destroyBuilding(b);
                                                    }
                                                }
                                            }
                                        });

                                        // Rise back up
                                        this.tweens.add({
                                            targets: slamTarget,
                                            offset: 0,
                                            duration: 400,
                                            ease: 'Quad.easeOut',
                                            onUpdate: () => {
                                                troop.slamOffset = slamTarget.offset;
                                                this.redrawTroopWithMovement(troop, false);
                                            }
                                        });
                                    }
                                });

                            } else if (troop.type === 'davincitank') {
                                // DA VINCI TANK - Fire cannon from closest 45° position toward target
                                const tankPos = IsoUtils.cartToIso(troop.gridX, troop.gridY);
                                const targetBuilding = troop.target;
                                const targetInfo = BUILDINGS[targetBuilding.type];
                                const targetPos = IsoUtils.cartToIso(
                                    targetBuilding.gridX + targetInfo.width / 2,
                                    targetBuilding.gridY + targetInfo.height / 2
                                );

                                // Store current angle for rotation after shot
                                const currentAngle = troop.facingAngle || 0;

                                // Calculate angle TO target
                                const angleToTarget = Math.atan2(targetPos.y - tankPos.y, targetPos.x - tankPos.x);

                                // Snap to nearest 45° increment (8 cannons = PI/4 spacing)
                                const snapIncrement = Math.PI / 4;
                                const firingAngle = Math.round(angleToTarget / snapIncrement) * snapIncrement;

                                // Muzzle effects appear CLOSER to tank
                                const muzzleOffset = 30;
                                const muzzleX = tankPos.x + Math.cos(firingAngle) * muzzleOffset;
                                const muzzleY = tankPos.y + Math.sin(firingAngle) * muzzleOffset * 0.5 - 10;

                                // Cannonball starts FARTHER from tank
                                const ballOffset = 45;
                                const ballX = tankPos.x + Math.cos(firingAngle) * ballOffset;
                                const ballY = tankPos.y + Math.sin(firingAngle) * ballOffset * 0.5 - 12;

                                // Adjust depth: when shooting upward (negative Y direction), put ball behind tank
                                const isShootingUp = firingAngle < 0 || firingAngle > Math.PI;
                                const ballDepth = isShootingUp ? 5000 : 25000;

                                // Muzzle flash
                                const flash = this.add.graphics();
                                flash.fillStyle(0xffaa00, 0.9);
                                flash.fillCircle(0, 0, 8);
                                flash.fillStyle(0xffff00, 0.7);
                                flash.fillCircle(0, 0, 4);
                                flash.setPosition(muzzleX, muzzleY);
                                flash.setDepth(ballDepth);
                                this.tweens.add({
                                    targets: flash,
                                    scale: 2, alpha: 0,
                                    duration: 150,
                                    onComplete: () => flash.destroy()
                                });

                                // Cannonball projectile - 2x SMALLER (3px radius)
                                const ball = this.add.graphics();
                                ball.fillStyle(0x2a2a2a, 1);
                                ball.fillCircle(0, 0, 3);
                                ball.fillStyle(0x4a4a4a, 1);
                                ball.fillCircle(-0.5, -0.5, 1);
                                ball.setPosition(ballX, ballY);
                                ball.setDepth(ballDepth);

                                // Smoke puff at muzzle - smaller
                                particleManager.spawn({
                                    x: muzzleX,
                                    y: muzzleY,
                                    depth: ballDepth - 1,
                                    duration: 600,
                                    onDraw: (g) => {
                                        g.fillStyle(0x555555, 0.5);
                                        g.fillCircle(0, 0, 4);
                                    },
                                    move: {
                                        x: muzzleX + (Math.random() - 0.5) * 15,
                                        y: muzzleY - 15
                                    },
                                    alpha: 0,
                                    scale: 2.5
                                });

                                // Light screen shake on fire
                                this.cameras.main.shake(25, 0.0005);

                                // ROTATE AFTER SHOT - delayed until cannonball is in flight
                                const newAngle = currentAngle + Math.PI / 4;
                                this.time.delayedCall(150, () => {
                                    const rotationTarget = { angle: currentAngle };
                                    this.tweens.add({
                                        targets: rotationTarget,
                                        angle: newAngle,
                                        duration: 200,
                                        ease: 'Quad.easeOut',
                                        onUpdate: () => {
                                            troop.facingAngle = rotationTarget.angle % (Math.PI * 2);
                                            this.redrawTroopWithMovement(troop, false);
                                        }
                                    });
                                });

                                // Store target reference for damage application
                                const targetRef = targetBuilding;
                                const damage = stats.damage;

                                // Cannonball flies to target - FASTER, damage on IMPACT
                                this.tweens.add({
                                    targets: ball,
                                    x: targetPos.x,
                                    y: targetPos.y - 10,
                                    duration: 200,  // Faster flight
                                    ease: 'Quad.easeIn',
                                    onComplete: () => {
                                        // Impact effect - isometric oval
                                        const impact = this.add.graphics();
                                        impact.fillStyle(0xff6600, 0.6);
                                        impact.fillEllipse(0, 0, 16, 8);
                                        impact.setPosition(targetPos.x, targetPos.y - 10);
                                        impact.setDepth(5000);
                                        this.tweens.add({
                                            targets: impact,
                                            scale: 1.5, alpha: 0,
                                            duration: 200,
                                            onComplete: () => impact.destroy()
                                        });
                                        ball.destroy();

                                        // DAMAGE APPLIED ON IMPACT
                                        if (targetRef && targetRef.health > 0) {
                                            targetRef.health -= damage;
                                            this.showHitEffect(targetRef.graphics);
                                            this.updateHealthBar(targetRef);

                                            if (targetRef.health <= 0) {
                                                this.destroyBuilding(targetRef);
                                                troop.target = null;
                                            }
                                        }
                                    }
                                });

                            } else if (troop.type === 'phalanx') {
                                // PHALANX - Spear thrust attack
                                const targetBuilding = troop.target;

                                // Reset and tilt facing angle toward target
                                const tankPos = IsoUtils.cartToIso(troop.gridX, troop.gridY);
                                const targetInfo = BUILDINGS[targetBuilding.type];
                                const targetPos = IsoUtils.cartToIso(
                                    targetBuilding.gridX + targetInfo.width / 2,
                                    targetBuilding.gridY + targetInfo.height / 2
                                );
                                troop.facingAngle = Math.atan2(targetPos.y - tankPos.y, targetPos.x - tankPos.x);

                                // Spear thrust animation
                                troop.phalanxSpearOffset = 0;
                                this.tweens.add({
                                    targets: troop,
                                    phalanxSpearOffset: 1,
                                    duration: 150,
                                    yoyo: true,
                                    ease: 'Quad.easeIn',
                                    onUpdate: () => {
                                        this.redrawTroopWithMovement(troop, false);
                                    },
                                    onComplete: () => {
                                        troop.phalanxSpearOffset = 0;
                                        this.redrawTroopWithMovement(troop, false);
                                    }
                                });

                                // Apply damage directly
                                targetBuilding.health -= stats.damage;
                                this.showHitEffect(targetBuilding.graphics);
                                this.updateHealthBar(targetBuilding);

                                if (targetBuilding.health <= 0) {
                                    this.destroyBuilding(targetBuilding);
                                    troop.target = null;
                                }
                            } else if (troop.type === 'wallbreaker') {
                                // WALL BREAKER — Suicide explosion on first attack
                                troop.lastAttackTime = time;
                                const wallMult = troop.target.type === 'wall' ? ((stats as any).wallDamageMultiplier || 3) : 1;
                                const sRadius = (stats as any).splashRadius || 2.5;

                                // Apply splash damage to all buildings in radius
                                this.buildings.forEach(b => {
                                    if (b.owner !== troop.owner && b.health > 0) {
                                        const bInfo = BUILDINGS[b.type];
                                        const bCenterX = b.gridX + bInfo.width / 2;
                                        const bCenterY = b.gridY + bInfo.height / 2;
                                        const bdist = Phaser.Math.Distance.Between(troop.gridX, troop.gridY, bCenterX, bCenterY);
                                        if (bdist <= sRadius) {
                                            const bMult = b.type === 'wall' ? wallMult : 1;
                                            const dmg = bdist < 0.5 ? stats.damage * bMult : stats.damage * bMult * 0.6;
                                            b.health -= dmg;
                                            this.showHitEffect(b.graphics);
                                            this.updateHealthBar(b);
                                            if (b.health <= 0) {
                                                this.destroyBuilding(b);
                                            }
                                        }
                                    }
                                });

                                // Kill itself and trigger explosion visual
                                troop.health = 0;
                                this.destroyTroop(troop);
                            } else {
                                // Melee: immediate damage (Warrior, Giant, Ram)
                                let finalDamage = stats.damage;
                                if ((troop.type === 'ram' || troop.type === 'giant') && troop.target.type === 'wall') {
                                    finalDamage *= (stats as any).wallDamageMultiplier || 1;
                                }

                                troop.target.health -= finalDamage;
                                this.showHitEffect(troop.target.graphics);
                                this.updateHealthBar(troop.target);

                                // Giant uses renderer-driven lean, no separate punch tween
                                if (troop.type !== 'giant') {
                                    const currentPos = IsoUtils.cartToIso(troop.gridX, troop.gridY);
                                    const targetPos = IsoUtils.cartToIso(bx + tw / 2, by + th / 2);
                                    const angle = Math.atan2(targetPos.y - currentPos.y, targetPos.x - currentPos.x);

                                    // Ram gets a bigger punch animation
                                    const punchDist = troop.type === 'ram' ? 18 : 10;
                                    this.tweens.add({
                                        targets: troop.gameObject,
                                        x: currentPos.x + Math.cos(angle) * punchDist,
                                        y: currentPos.y + Math.sin(angle) * (punchDist * 0.5),
                                        duration: troop.type === 'ram' ? 100 : 50,
                                        yoyo: true
                                    });

                                    // Screen shake for Ram impact
                                    if (troop.type === 'ram') {
                                        this.cameras.main.shake(40, 0.002);
                                    }
                                }

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
        const stats = this.getDefenseStats(mortar);
        const start = IsoUtils.cartToIso(mortar.gridX + info.width / 2, mortar.gridY + info.height / 2);
        const end = IsoUtils.cartToIso(troop.gridX, troop.gridY);

        // Set angle for subtle mortar rotation
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        mortar.ballistaAngle = angle;

        // Level-based scaling - L3 is 1.3x bigger
        const level = mortar.level ?? 1;
        const shellScale = level >= 3 ? 1.3 : 1.0;
        const shellRadius = 8 * shellScale;
        const mortarDamage = stats.damage || 62;

        // Mortar shell - starts invisible, appears as it leaves barrel
        const ball = this.add.graphics();
        if (level >= 4) {
            // Gold-studded shell
            ball.fillStyle(0xb8860b, 1);
            ball.fillCircle(0, 0, shellRadius);
            ball.fillStyle(0xdaa520, 1);
            ball.fillCircle(-2 * shellScale, -2 * shellScale, 4 * shellScale);
            // Gold studs
            ball.fillStyle(0xffd700, 0.9);
            ball.fillCircle(shellRadius * 0.5, -shellRadius * 0.3, 1.5);
            ball.fillCircle(-shellRadius * 0.3, shellRadius * 0.5, 1.5);
            ball.fillCircle(shellRadius * 0.4, shellRadius * 0.4, 1.5);
            ball.fillCircle(-shellRadius * 0.6, -shellRadius * 0.1, 1.5);
        } else {
            ball.fillStyle(0x3a3a3a, 1);
            ball.fillCircle(0, 0, shellRadius);
            ball.fillStyle(0x5a5a5a, 1);
            ball.fillCircle(-2 * shellScale, -2 * shellScale, 3 * shellScale);
            if (level >= 3) {
                ball.fillStyle(0xaaaaaa, 0.6);
                ball.fillCircle(-3 * shellScale, -3 * shellScale, 2);
            }
        }
        ball.setPosition(start.x, start.y - 35);
        ball.setDepth(5000);
        ball.setAlpha(0);

        const midY = (start.y + end.y) / 2 - 350;

        // Muzzle flash and smoke effect
        this.createSmokeEffect(start.x, start.y - 35, 6, 0.8, 1000);

        const flash = this.add.graphics();
        flash.fillStyle(0xff8800, 0.8);
        flash.fillCircle(0, 0, 8 * shellScale);
        flash.fillStyle(0xffcc00, 0.6);
        flash.fillCircle(0, 0, 5 * shellScale);
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
                this.createMortarExplosion(end.x, end.y, mortar.owner, troop.gridX, troop.gridY, level, mortarDamage);
            }
        });
    }

    private createMortarExplosion(
        x: number,
        y: number,
        owner: 'PLAYER' | 'ENEMY',
        targetGx: number,
        targetGy: number,
        level: number = 1,
        damage: number = 62
    ) {
        const scale = level >= 3 ? 1.3 : 1.0;
        this.cameras.main.shake(50, 0.001 * scale);

        // Ground crater/scorch mark (L1-L2 only, L3 uses cracks instead)
        if (level < 3) {
            const crater = this.add.graphics();
            crater.fillStyle(0x2a1a0a, 0.6);
            crater.fillEllipse(x, y + 5, 40 * scale, 20 * scale);
            crater.setDepth(1);
            this.tweens.add({ targets: crater, alpha: 0, duration: 2000, delay: 500, onComplete: () => crater.destroy() });
        }

        // L3: Ground cracks radiating from impact (no circular crater)
        if (level >= 3) {
            const cracks = this.add.graphics();
            cracks.lineStyle(2, 0x1a1a1a, 0.7);
            cracks.setDepth(1);
            // Draw 6 cracks radiating outward
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.3;
                const length = 25 + Math.random() * 20;
                const midX = x + Math.cos(angle) * length * 0.5;
                const midY = y + Math.sin(angle) * length * 0.3; // Flatten for isometric
                const endX = x + Math.cos(angle) * length;
                const endY = y + Math.sin(angle) * length * 0.5;
                cracks.beginPath();
                cracks.moveTo(x, y);
                // Jagged crack line
                cracks.lineTo(midX + (Math.random() - 0.5) * 8, midY + (Math.random() - 0.5) * 4);
                cracks.lineTo(endX, endY);
                cracks.strokePath();
                // Branch cracks
                if (Math.random() > 0.5) {
                    const branchAngle = angle + (Math.random() - 0.5) * 0.8;
                    cracks.beginPath();
                    cracks.moveTo(midX, midY);
                    cracks.lineTo(midX + Math.cos(branchAngle) * 12, midY + Math.sin(branchAngle) * 6);
                    cracks.strokePath();
                }
            }
            this.tweens.add({ targets: cracks, alpha: 0, duration: 3000, delay: 800, onComplete: () => cracks.destroy() });
        }

        // Initial flash (isometric oval)
        const flash = this.add.graphics();
        flash.fillStyle(0xffffcc, 1);
        flash.fillEllipse(0, 0, 10 * scale, 5 * scale);
        flash.setPosition(x, y);
        flash.setDepth(10001);
        this.tweens.add({ targets: flash, alpha: 0, scaleX: 10, scaleY: 10, duration: 100, onComplete: () => flash.destroy() });

        // Primary shockwave ring (isometric oval)
        const shock = this.add.graphics();
        shock.lineStyle(4, 0xff6600, 0.8);
        shock.strokeEllipse(x, y, 20 * scale, 10 * scale);
        shock.setDepth(10000);
        this.tweens.add({
            targets: shock, alpha: 0, duration: 400,
            onUpdate: (tween) => {
                shock.clear();
                const r = 10 * scale + tween.progress * 70 * scale;
                shock.lineStyle(4 - tween.progress * 3, 0xff6600, 0.8 - tween.progress * 0.8);
                shock.strokeEllipse(x, y, r * 2, r);
            },
            onComplete: () => shock.destroy()
        });

        // Secondary shockwave (isometric oval)
        this.time.delayedCall(50, () => {
            const shock2 = this.add.graphics();
            shock2.lineStyle(2, 0xffaa00, 0.5);
            shock2.strokeEllipse(x, y, 30 * scale, 15 * scale);
            shock2.setDepth(9999);
            this.tweens.add({
                targets: shock2, alpha: 0, duration: 350,
                onUpdate: (tween) => {
                    shock2.clear();
                    const r2 = 15 * scale + tween.progress * 60 * scale;
                    shock2.lineStyle(2, 0xffaa00, 0.5 - tween.progress * 0.5);
                    shock2.strokeEllipse(x, y, r2 * 2, r2);
                },
                onComplete: () => shock2.destroy()
            });
        });

        // Fire particles (pixelated rectangles)
        const fireCount = level >= 3 ? 16 : 12;
        for (let i = 0; i < fireCount; i++) {
            const angle = (i / fireCount) * Math.PI * 2;
            const dist = (15 + Math.random() * 25) * scale;
            const fireColors = [0xff4400, 0xff6600, 0xff8800, 0xffaa00];
            const fireSize = (6 + Math.floor(Math.random() * 8)) * scale;
            const fire = this.add.graphics();
            fire.fillStyle(fireColors[Math.floor(Math.random() * 4)], 0.9);
            fire.fillRect(-fireSize / 2, -fireSize / 2, fireSize, fireSize);
            fire.setPosition(x, y);
            fire.setDepth(10002);
            this.tweens.add({
                targets: fire,
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist * 0.5 - 30 * scale - Math.random() * 40 * scale,
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
                t.health -= damage;
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
        const stats = this.getDefenseStats(cannon);
        const cannonDamage = stats.damage || 70;

        const info = BUILDINGS['cannon'];
        const start = IsoUtils.cartToIso(cannon.gridX + info.width / 2, cannon.gridY + info.height / 2);
        const end = IsoUtils.cartToIso(targetTroop.gridX, targetTroop.gridY);
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
        const cLevel = cannon.level ?? 1;
        const ball = this.add.graphics();
        if (cLevel >= 4) {
            // Gold cannonball with marble core
            ball.fillStyle(0xb8860b, 1);
            ball.fillRect(-7, -7, 14, 14);
            ball.fillStyle(0xdaa520, 1);
            ball.fillRect(-6, -6, 8, 8);
            ball.fillStyle(0xffd700, 0.6);
            ball.fillRect(-4, -4, 4, 4);
        } else {
            ball.fillStyle(0x1a1a1a, 1);
            ball.fillRect(-7, -7, 14, 14);
            ball.fillStyle(0x3a3a3a, 1);
            ball.fillRect(-6, -6, 8, 8);
        }
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

                // Apply damage to captured target using level-based damage
                if (targetTroop && targetTroop.health > 0) {
                    targetTroop.health -= cannonDamage;
                    targetTroop.hasTakenDamage = true;
                    this.updateHealthBar(targetTroop);

                    // Hit flash effect (pixelated rectangle)
                    const troopPos = IsoUtils.cartToIso(targetTroop.gridX, targetTroop.gridY);
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
        const stats = this.getDefenseStats(tesla);
        const start = IsoUtils.cartToIso(tesla.gridX + 0.5, tesla.gridY + 0.5);
        start.y -= 40; // From the orb

        // Orb pulse effect (pixelated rectangle)
        const orbPulse = this.add.graphics();
        orbPulse.fillStyle(0x88eeff, 0.6);
        orbPulse.fillRect(-12, -12, 24, 24);
        orbPulse.setPosition(start.x, start.y);
        orbPulse.setDepth(10001);
        this.tweens.add({ targets: orbPulse, scale: 1.5, alpha: 0, duration: 150, onComplete: () => orbPulse.destroy() });

        const chainCount = 3;
        const chainRadius = 3;
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

        // Crackling lightning: draw 4 successive bolts over ~200ms
        const boltCount = 4;
        const boltInterval = 50;
        const validTargets = currentTargets.filter(t => t !== null) as Troop[];

        for (let bolt = 0; bolt < boltCount; bolt++) {
            const isFinalBolt = bolt === boltCount - 1;
            let boltLastTarget = { ...start };

            validTargets.forEach((t, idx) => {
                const end = IsoUtils.cartToIso(t.gridX, t.gridY);

                // Draw multiple lightning layers for thickness effect
                for (let layer = 0; layer < 3; layer++) {
                    const lightning = this.add.graphics();
                    const alpha = layer === 0 ? 1 : (layer === 1 ? 0.6 : 0.3);
                    const width = layer === 0 ? 3 : (layer === 1 ? 5 : 8);
                    const color = layer === 0 ? 0xffffff : (layer === 1 ? 0x88eeff : 0x00ccff);

                    lightning.lineStyle(width, color, alpha);
                    lightning.setDepth(10000 - layer);

                    // Jagged branching path with unique random jitter per bolt
                    lightning.beginPath();
                    lightning.moveTo(boltLastTarget.x, boltLastTarget.y);

                    const segments = 6;
                    const jitter = layer === 0 ? 8 : 12;
                    for (let j = 1; j < segments; j++) {
                        const progress = j / segments;
                        const tx = boltLastTarget.x + (end.x - boltLastTarget.x) * progress;
                        const ty = boltLastTarget.y + (end.y - boltLastTarget.y) * progress;
                        lightning.lineTo(
                            tx + (Math.random() - 0.5) * jitter,
                            ty + (Math.random() - 0.5) * jitter
                        );
                    }
                    lightning.lineTo(end.x, end.y);
                    lightning.strokePath();

                    if (isFinalBolt) {
                        // Final bolt fades out normally
                        this.tweens.add({
                            targets: lightning,
                            alpha: 0,
                            duration: 150 + layer * 50,
                            delay: bolt * boltInterval + idx * 40,
                            onComplete: () => lightning.destroy()
                        });
                    } else {
                        // Non-final bolts get destroyed when next bolt appears
                        this.time.delayedCall(bolt * boltInterval + boltInterval, () => lightning.destroy());
                    }
                }

                boltLastTarget = { x: end.x, y: end.y };
            });
        }

        // Impact effects on final bolt timing
        validTargets.forEach((t, idx) => {
            const end = IsoUtils.cartToIso(t.gridX, t.gridY);
            const impactDelay = (boltCount - 1) * boltInterval;

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
                    delay: impactDelay + idx * 40,
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
                delay: impactDelay + idx * 40,
                onComplete: () => impactGlow.destroy()
            });

            // Use stats.damage instead of hardcoded 25
            t.health -= stats.damage! / (idx + 1);
            t.hasTakenDamage = true;
            this.updateHealthBar(t);
            if (t.health <= 0) this.destroyTroop(t);
        });
    }

    // === PRISM TOWER - CONTINUOUS CRAZY LASER BEAM ===
    private shootPrismContinuousLaser(prism: PlacedBuilding, target: Troop, time: number) {
        const info = BUILDINGS['prism'];
        const stats = this.getDefenseStats(prism);
        const tickInterval = Math.max(25, stats.fireRate ?? 100);
        const prismDps = stats.damage ?? 0;
        const start = IsoUtils.cartToIso(prism.gridX + info.width / 2, prism.gridY + info.height / 2);
        start.y -= 55; // From the crystal tip
        const end = IsoUtils.cartToIso(target.gridX, target.gridY);

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

        const shouldApplyDamage = prism.prismLastDamageTime === undefined || time >= prism.prismLastDamageTime + tickInterval;
        if (prismDps > 0 && shouldApplyDamage) {
            prism.prismLastDamageTime = time;
            const damagePerTick = prismDps * (tickInterval / 1000);
            target.health -= damagePerTick;
            target.hasTakenDamage = true;
            this.updateHealthBar(target);
            if (target.health <= 0) {
                this.destroyTroop(target);
                this.cleanupPrismLaser(prism);
            }
        }

        prism.prismTarget = target;
    }

    // Clean up prism laser graphics when no target
    public cleanupPrismLaser(prism: PlacedBuilding) {
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
        prism.prismLastDamageTime = undefined;
    }

    // === MAGMA VENT - MASSIVE VOLCANIC ERUPTION ===
    // === MAGMA VENT - MASSIVE VOLCANIC ERUPTION ===
    private shootMagmaEruption(magma: PlacedBuilding) {
        const stats = this.getDefenseStats(magma);
        const info = BUILDING_DEFINITIONS['magmavent'];
        const center = IsoUtils.cartToIso(magma.gridX + info.width / 2, magma.gridY + info.height / 2);
        center.y -= 30; // From crater

        // Stronger screen shake for the volcano
        this.cameras.main.shake(200, 0.0025);

        const aoeRadius = stats.range || 4.2;

        // Black billowing smoke that rises after firing
        for (let i = 0; i < 3; i++) {
            this.time.delayedCall(150 + i * 120, () => {
                const smoke = this.add.graphics();
                const size = 8 + Math.random() * 5;

                // Dark black/charcoal smoke - small squares
                smoke.fillStyle(0x111111, 0.55);
                smoke.fillRect(-size / 2, -size / 2, size, size);

                smoke.setPosition(center.x + (Math.random() - 0.5) * 20, center.y - 5);
                smoke.setDepth(30000);

                this.tweens.add({
                    targets: smoke,
                    y: center.y - 60 - Math.random() * 40,
                    x: smoke.x + (Math.random() - 0.5) * 30,
                    scale: { from: 1, to: 2 },
                    alpha: 0,
                    duration: 1400 + Math.random() * 600,
                    onComplete: () => smoke.destroy()
                });
            });
        }

        // Central blast - NO huge circles off screen. Just a sharp local flash.
        const flash = this.add.graphics();
        flash.setPosition(center.x, center.y);
        flash.fillStyle(0xffaa00, 0.9);
        // Star/Spike shape for blast instead of big rect
        flash.beginPath();
        for (let j = 0; j < 8; j++) {
            const angle = (j / 8) * Math.PI * 2;
            const r = j % 2 === 0 ? 30 : 10;
            flash.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        flash.closePath();
        flash.fillPath();

        flash.setDepth(30001);
        this.tweens.add({
            targets: flash,
            scale: { from: 0.5, to: 1.5 },
            alpha: 0,
            duration: 200, // Very fast pop
            onComplete: () => flash.destroy()
        });

        // === AOE INDICATOR - Shows damage radius ===
        const aoePixelsX = aoeRadius * this.tileWidth * 0.5 * Math.SQRT2;
        const aoePixelsY = aoeRadius * this.tileHeight * 0.5 * Math.SQRT2;

        const aoeIndicator = this.add.graphics();
        aoeIndicator.fillStyle(0xff4400, 0.15); // Lighter alpha
        aoeIndicator.fillEllipse(center.x, center.y + 20, aoePixelsX * 2, aoePixelsY * 2);
        aoeIndicator.lineStyle(2, 0xff6600, 0.5);
        aoeIndicator.strokeEllipse(center.x, center.y + 20, aoePixelsX * 2, aoePixelsY * 2);
        aoeIndicator.setDepth(5);
        this.tweens.add({
            targets: aoeIndicator,
            alpha: 0,
            duration: 1200,
            ease: 'Quad.easeOut',
            onComplete: () => aoeIndicator.destroy()
        });

        // Flying lava rocks
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 30 + Math.random() * 70; // Varied range
            const peakHeight = 40 + Math.random() * 50;

            const rock = this.add.graphics();
            const rockColors = [0xff2200, 0xff4400, 0xff6600, 0xff8800];
            rock.fillStyle(rockColors[Math.floor(Math.random() * rockColors.length)], 1);
            const rockSize = 3 + Math.floor(Math.random() * 3);
            rock.fillRect(-rockSize / 2, -rockSize / 2, rockSize, rockSize);
            rock.setPosition(center.x, center.y);
            rock.setDepth(30002);

            const endX = center.x + Math.cos(angle) * dist;
            const endY = center.y + Math.sin(angle) * dist * 0.5 + 30;

            this.tweens.add({
                targets: rock,
                x: endX,
                duration: 600 + Math.random() * 400,
                ease: 'Linear',
                onUpdate: (tween) => {
                    const t = tween.progress;
                    rock.y = center.y - Math.sin(t * Math.PI) * peakHeight + t * (endY - center.y);

                    // Reduced trail frequency
                    if (Math.random() > 0.85) {
                        const trail = this.add.graphics();
                        trail.fillStyle(0xff4400, 0.6);
                        trail.fillRect(-1, -1, 2, 2);
                        trail.setPosition(rock.x, rock.y);
                        trail.setDepth(30001);
                        this.tweens.add({
                            targets: trail, alpha: 0, scale: 0.1, duration: 200, onComplete: () => trail.destroy()
                        });
                    }
                },
                onComplete: () => {
                    // Ground burn mark
                    const scorch = this.add.graphics();
                    scorch.fillStyle(0x331100, 0.6);
                    scorch.fillEllipse(endX, endY, 10, 5);
                    scorch.setDepth(4);

                    this.tweens.add({ targets: scorch, alpha: 0, duration: 2000, onComplete: () => scorch.destroy() });
                    rock.destroy();
                }
            });
        }

        // Area damage glow (subtle)
        const aoeGlow = this.add.graphics();
        aoeGlow.fillStyle(0xff4400, 0.1);
        aoeGlow.fillEllipse(center.x, center.y + 25, aoePixelsX * 2, aoePixelsY * 2);
        aoeGlow.setDepth(4);
        this.tweens.add({ targets: aoeGlow, alpha: 0, duration: 600, onComplete: () => aoeGlow.destroy() });

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
                const damage = stats.damage || 80;
                const damageMult = 1 - (dist / aoeRadius * 0.5);
                t.health -= damage * damageMult;
                t.hasTakenDamage = true;

                // Hit flash on troop - position the graphics at the troop, draw circle at origin
                // so scaling animates from center instead of flying off-screen
                const hitFlash = particleManager.getPooledGraphic();
                const troopPos = IsoUtils.cartToIso(t.gridX, t.gridY);
                hitFlash.setPosition(troopPos.x, troopPos.y);
                hitFlash.fillStyle(0xff4400, 0.8);
                hitFlash.fillCircle(0, 0, 15);
                hitFlash.setDepth(10006);
                this.tweens.add({
                    targets: hitFlash,
                    alpha: 0,
                    scale: 2,
                    duration: 150,
                    onComplete: () => particleManager.returnToPool(hitFlash)
                });

                this.updateHealthBar(t);
                if (t.health <= 0) this.destroyTroop(t);
            }
        });
    }

    private showArcherProjectile(troop: Troop, target: PlacedBuilding, damage: number) {
        const start = IsoUtils.cartToIso(troop.gridX, troop.gridY);
        const info = BUILDINGS[target.type];
        const end = IsoUtils.cartToIso(target.gridX + info.width / 2, target.gridY + info.height / 2);
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
        const arrow = particleManager.getPooledGraphic();
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

    private showSharpshooterProjectile(troop: Troop, target: PlacedBuilding, damage: number) {
        const start = IsoUtils.cartToIso(troop.gridX, troop.gridY);
        const info = BUILDINGS[target.type];
        const end = IsoUtils.cartToIso(target.gridX + info.width / 2, target.gridY + info.height / 2);
        const angle = Math.atan2(end.y - start.y, end.x - start.x);

        const targetBuilding = target;

        troop.facingAngle = angle;

        // Initialize bow draw if not set
        if (troop.bowDrawProgress === undefined) {
            troop.bowDrawProgress = 0;
        }

        // ANIMATED BOW DRAW SEQUENCE
        // Phase 1: Draw the bow back
        this.tweens.add({
            targets: troop,
            bowDrawProgress: 1,
            duration: 300,
            ease: 'Power2',
            onUpdate: () => {
                this.redrawTroop(troop);
            },
            onComplete: () => {
                // Phase 2: Hold briefly then release
                this.time.delayedCall(80, () => {
                    // RELEASE!
                    // Snap bow back with spring animation
                    this.tweens.add({
                        targets: troop,
                        bowDrawProgress: 0,
                        duration: 100,
                        ease: 'Back.easeOut',
                        onUpdate: () => {
                            this.redrawTroop(troop);
                        }
                    });

                    // Body reaction on release
                    this.tweens.add({
                        targets: troop.gameObject,
                        scaleX: 0.9,
                        scaleY: 1.05,
                        duration: 50,
                        yoyo: true,
                        ease: 'Power2'
                    });

                    // Launch the arrow
                    this.launchSharpshooterArrow(troop, start, end, angle, targetBuilding, damage);
                });
            }
        });
    }

    private launchSharpshooterArrow(_troop: Troop, start: Phaser.Math.Vector2, end: Phaser.Math.Vector2, angle: number, targetBuilding: PlacedBuilding, damage: number) {
        // Large arrow with proper design
        const arrow = particleManager.getPooledGraphic();
        // Arrow shaft
        arrow.fillStyle(0x5d4037, 1);
        arrow.fillRect(-16, -2, 32, 4);
        // Metal tip
        arrow.fillStyle(0x888888, 1);
        arrow.fillTriangle(18, 0, 12, -4, 12, 4);
        arrow.fillStyle(0xcccccc, 1);
        arrow.fillTriangle(18, 0, 14, -2, 14, 2);
        // Green fletching
        arrow.fillStyle(0x2e7d32, 1);
        arrow.fillTriangle(-16, 0, -12, -5, -12, 5);
        arrow.fillTriangle(-18, -3, -16, 0, -12, -3);
        arrow.fillTriangle(-18, 3, -16, 0, -12, 3);

        arrow.setPosition(start.x, start.y - 12);
        arrow.setRotation(angle);
        arrow.setDepth(10000);
        arrow.setAlpha(0); // Start invisible

        // Delay arrow visibility so it doesn't overlap with bow-held arrow
        this.tweens.add({
            targets: arrow,
            alpha: 1,
            delay: 50,
            duration: 30,
            ease: 'Linear'
        });

        // Trail effect
        const trail = particleManager.getPooledGraphic();
        trail.lineStyle(2, 0x88ff88, 0.5);
        trail.lineBetween(start.x, start.y - 12, start.x, start.y - 12);
        trail.setDepth(9999);

        const endY = end.y - 25;
        const dist = Math.sqrt((end.x - start.x) ** 2 + (endY - (start.y - 12)) ** 2);
        const duration = Math.min(350, 80 + dist * 0.25); // Fast arrow

        this.tweens.add({
            targets: arrow,
            x: end.x,
            y: endY,
            duration: duration,
            ease: 'Linear',
            onUpdate: () => {
                // Update trail
                trail.clear();
                trail.lineStyle(2, 0x88ff88, 0.3);
                trail.lineBetween(start.x, start.y - 12, arrow.x, arrow.y);
            },
            onComplete: () => {
                particleManager.returnToPool(arrow);
                particleManager.returnToPool(trail);

                if (targetBuilding && targetBuilding.health > 0) {
                    targetBuilding.health -= damage;
                    this.showHitEffect(targetBuilding.graphics);
                    this.updateHealthBar(targetBuilding);

                    if (targetBuilding.health <= 0) {
                        this.destroyBuilding(targetBuilding);
                    }
                }

                // Bigger impact effect
                const thud = this.add.circle(end.x, endY, 8, 0x2e7d32, 0.8);
                thud.setDepth(100);
                this.tweens.add({ targets: thud, scale: 0.2, alpha: 0, duration: 180, onComplete: () => thud.destroy() });
            }
        });
    }

    private showMobileMortarShot(troop: Troop, target: PlacedBuilding, damage: number) {
        const stats = this.getTroopCombatStats(troop);
        const start = IsoUtils.cartToIso(troop.gridX, troop.gridY);
        const info = BUILDINGS[target.type];
        const end = IsoUtils.cartToIso(target.gridX + info.width / 2, target.gridY + info.height / 2);

        // Mortar is offset to the left of the troop position
        // Face target
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        troop.facingAngle = angle;

        // Mortar is offset relative to the troop based on facing direction
        const facingLeft = Math.abs(angle) > Math.PI / 2;
        const flip = facingLeft ? -1 : 1;
        const mortarX = start.x - (12 * flip);
        const mortarY = start.y - 22;

        // MORTAR RECOIL - animates only the mortar, not the soldier
        // Initialize if needed
        if (troop.mortarRecoil === undefined) {
            troop.mortarRecoil = 0;
        }

        // Animate the mortar jumping back
        this.tweens.add({
            targets: troop,
            mortarRecoil: 3, // Mortar kicks down slightly
            duration: 60,
            ease: 'Power2',
            yoyo: true,
            onUpdate: () => {
                this.redrawTroop(troop);
            },
            onComplete: () => {
                troop.mortarRecoil = 0;
                this.redrawTroop(troop);
            }
        });

        // Mortar shell - spawns from the mortar position
        const shell = particleManager.getPooledGraphic();
        shell.fillStyle(0x3a3a3a, 1);
        shell.fillCircle(0, 0, 5);
        shell.fillStyle(0x555555, 1);
        shell.fillCircle(-1.5, -1.5, 2.5);
        shell.setPosition(mortarX, mortarY);
        shell.setDepth(10000);

        // Muzzle flash at mortar position
        const flash = particleManager.getPooledGraphic();
        flash.fillStyle(0xff6600, 0.9);
        flash.fillCircle(0, 0, 10);
        flash.fillStyle(0xffaa00, 0.7);
        flash.fillCircle(0, 0, 6);
        flash.fillStyle(0xffffcc, 0.5);
        flash.fillCircle(0, 0, 3);
        flash.setPosition(mortarX, mortarY);
        flash.setDepth(10001);
        this.tweens.add({
            targets: flash,
            alpha: 0,
            scale: 1.8,
            duration: 100,
            onComplete: () => particleManager.returnToPool(flash)
        });

        // THIN BLACK SMOKE - rising slowly from mortar muzzle
        for (let i = 0; i < 6; i++) {
            const smoke = particleManager.getPooledGraphic();
            // Thin wispy smoke
            smoke.fillStyle(0x222222, 0.4 + Math.random() * 0.2);
            smoke.fillRect(-1, -3 - Math.random() * 4, 2 + Math.random() * 2, 6 + Math.random() * 4);
            smoke.setPosition(mortarX + (Math.random() - 0.5) * 6, mortarY);
            smoke.setDepth(10002);

            this.tweens.add({
                targets: smoke,
                y: mortarY - 40 - Math.random() * 30, // Rise up slowly
                x: mortarX + (Math.random() - 0.5) * 20, // Slight drift
                alpha: 0,
                scaleY: 2.5, // Stretch vertically as it rises
                scaleX: 0.5, // Get thinner
                duration: 1200 + Math.random() * 600, // Much slower
                delay: i * 80,
                ease: 'Linear',
                onComplete: () => particleManager.returnToPool(smoke)
            });
        }

        // Arcing trajectory
        const midY = Math.min(start.y - 20, end.y - 25) - 80;
        const endY = end.y;

        this.tweens.add({
            targets: shell,
            x: { value: (start.x + end.x) / 2, duration: 300, ease: 'Linear' },
            y: { value: midY, duration: 300, ease: 'Quad.easeOut' },
            onComplete: () => {
                this.tweens.add({
                    targets: shell,
                    x: { value: end.x, duration: 300, ease: 'Linear' },
                    y: { value: endY, duration: 300, ease: 'Quad.easeIn' },
                    onComplete: () => {
                        particleManager.returnToPool(shell);

                        // Explosion effect
                        this.cameras.main.shake(25, 0.001);

                        const explosion = particleManager.getPooledGraphic();
                        explosion.fillStyle(0xff4400, 0.8);
                        explosion.fillEllipse(0, 0, 40, 20);
                        explosion.fillStyle(0xff8800, 0.6);
                        explosion.fillEllipse(0, 0, 24, 12);
                        explosion.fillStyle(0xffcc00, 0.4);
                        explosion.fillEllipse(0, 0, 12, 6);
                        explosion.setPosition(end.x, endY);
                        explosion.setDepth(5000);
                        this.tweens.add({
                            targets: explosion,
                            alpha: 0,
                            scale: 2,
                            duration: 200,
                            onComplete: () => particleManager.returnToPool(explosion)
                        });

                        // Splash damage to all buildings in radius
                        const targetInfo = BUILDINGS[target.type];
                        const tCenterX = target.gridX + targetInfo.width / 2;
                        const tCenterY = target.gridY + targetInfo.height / 2;
                        const sRadius = stats.splashRadius || 2;

                        this.buildings.forEach(b => {
                            if (b.owner !== troop.owner && b.health > 0) {
                                const bInfo = BUILDINGS[b.type];
                                const bCenterX = b.gridX + bInfo.width / 2;
                                const bCenterY = b.gridY + bInfo.height / 2;
                                const bdx = bCenterX - tCenterX;
                                const bdy = bCenterY - tCenterY;
                                const bdist = Math.sqrt(bdx * bdx + bdy * bdy);

                                if (bdist <= sRadius) {
                                    // Full damage at center, half at edge
                                    const splashDamage = bdist < 0.5 ? damage : damage * 0.6;
                                    b.health -= splashDamage;
                                    this.showHitEffect(b.graphics);
                                    this.updateHealthBar(b);
                                    if (b.health <= 0) {
                                        this.destroyBuilding(b);
                                    }
                                }
                            }
                        });

                        // Debris
                        for (let i = 0; i < 6; i++) {
                            const debris = particleManager.getPooledGraphic();
                            debris.fillStyle(0x555555, 0.8);
                            debris.fillCircle(0, 0, 2 + Math.random() * 2);
                            debris.setPosition(end.x, endY);
                            debris.setDepth(5001);
                            const debrisAngle = Math.random() * Math.PI * 2;
                            const debrisDist = 15 + Math.random() * 25;
                            this.tweens.add({
                                targets: debris,
                                x: end.x + Math.cos(debrisAngle) * debrisDist,
                                y: endY + Math.sin(debrisAngle) * debrisDist * 0.5 - 10,
                                alpha: 0,
                                duration: 300,
                                ease: 'Quad.easeOut',
                                onComplete: () => particleManager.returnToPool(debris)
                            });
                        }
                    }
                });
            }
        });
    }

    private showStormLightning(troop: Troop, target: PlacedBuilding, damage: number) {
        // Redraw to show attack pose (could be facing change or effect)
        const start = IsoUtils.cartToIso(troop.gridX, troop.gridY);
        const info = BUILDINGS[target.type];
        const end = IsoUtils.cartToIso(target.gridX + info.width / 2, target.gridY + info.height / 2);

        // Face target
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        troop.facingAngle = angle;
        this.redrawTroop(troop);

        // Calculate chain targets
        const stormStats = this.getTroopCombatStats(troop);
        const chainCount = stormStats.chainCount || 4;
        const chainRange = stormStats.chainRange || 5;
        const targets = this.findChainTargets(target, chainCount, chainRange, troop.owner);

        // Initial Zap Visual (Troop -> First Target)
        // Start from staff tip (offset)
        const staffTipX = start.x + Math.cos(angle - Math.PI / 4) * 8;
        const staffTipY = start.y + Math.sin(angle - Math.PI / 4) * 8 - 25;
        this.drawLightningBolt(staffTipX, staffTipY, end.x, end.y - 15, 0x00ffff);

        // Apply damage to primary
        this.applyLightningDamage(target, damage);

        // Chain logic (Target -> Next -> Next)
        let previous = target;
        // Use 80% damage for subsequent hits
        let currentDamage = damage * 0.8;

        targets.forEach((nextTarget, index) => {
            this.time.delayedCall(100 * (index + 1), () => {
                if (nextTarget.health > 0 && (previous.health > 0 || index === 0)) { // Allow chaining from dead primary
                    const pInfo = BUILDINGS[previous.type];
                    // Get center of previous, or its last known pos if dead (approx)
                    const pPos = IsoUtils.cartToIso(previous.gridX + pInfo.width / 2, previous.gridY + pInfo.height / 2);

                    const nInfo = BUILDINGS[nextTarget.type];
                    const nPos = IsoUtils.cartToIso(nextTarget.gridX + nInfo.width / 2, nextTarget.gridY + nInfo.height / 2);

                    this.drawLightningBolt(pPos.x, pPos.y - 15, nPos.x, nPos.y - 15, 0x00ccff);
                    this.applyLightningDamage(nextTarget, currentDamage);

                    currentDamage *= 0.8; // Further decay
                    previous = nextTarget;
                }
            });
        });
    }

    private findChainTargets(startNode: PlacedBuilding, count: number, range: number, attackerOwner: string): PlacedBuilding[] {
        const found: PlacedBuilding[] = [];
        let current = startNode;
        // Find all enemies excluding the start node and walls
        const enemies = this.buildings.filter(b => b.owner !== attackerOwner && b.health > 0 && b.id !== startNode.id && b.type !== 'wall');

        // Simple greedy chain
        for (let i = 0; i < count; i++) {
            // Find closest unvisited enemy to 'current'
            let nearest: PlacedBuilding | null = null;
            let minDist = range;

            const infoCurr = BUILDINGS[current.type];

            for (const enemy of enemies) {
                if (found.includes(enemy)) continue;

                const infoEnemy = BUILDINGS[enemy.type];
                const dist = Phaser.Math.Distance.Between(
                    current.gridX + infoCurr.width / 2, current.gridY + infoCurr.height / 2,
                    enemy.gridX + infoEnemy.width / 2, enemy.gridY + infoEnemy.height / 2
                );

                if (dist < minDist) {
                    minDist = dist;
                    nearest = enemy;
                }
            }

            if (nearest) {
                found.push(nearest);
                current = nearest;
            } else {
                break; // No more targets in range
            }
        }
        return found;
    }

    private drawLightningBolt(x1: number, y1: number, x2: number, y2: number, color: number) {
        const graphics = this.add.graphics();
        graphics.setDepth(20000);

        // Draw main bolt
        graphics.lineStyle(2, color, 1);
        graphics.beginPath();
        graphics.moveTo(x1, y1);

        const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
        // Ensure steps is at least 2 to prevent loops
        const steps = Math.max(Math.floor(dist / 10), 2);
        const angle = Math.atan2(y2 - y1, x2 - x1);

        let cx = x1;
        let cy = y1;

        for (let i = 1; i < steps; i++) {
            const progress = i / steps;
            const tx = x1 + (x2 - x1) * progress;
            const ty = y1 + (y2 - y1) * progress;

            // Jitter perpendicular to line
            const jitter = (Math.random() - 0.5) * 15;
            const px = tx + Math.cos(angle + Math.PI / 2) * jitter;
            const py = ty + Math.sin(angle + Math.PI / 2) * jitter;

            graphics.lineTo(px, py);
            cx = px;
            cy = py;

            // Occasional fork logic
            if (Math.random() > 0.7) {
                const forkLen = 15;
                const forkAngle = angle + (Math.random() - 0.5);
                const fx = cx + Math.cos(forkAngle) * forkLen;
                const fy = cy + Math.sin(forkAngle) * forkLen;

                const fork = this.add.graphics();
                fork.setDepth(20000);
                fork.lineStyle(1, color, 0.7);
                fork.lineBetween(cx, cy, fx, fy);
                this.tweens.add({
                    targets: fork,
                    alpha: 0,
                    duration: 150,
                    onComplete: () => fork.destroy()
                });
            }
        }
        graphics.lineTo(x2, y2);
        graphics.strokePath();

        // Glow effect
        graphics.lineStyle(6, color, 0.3);
        graphics.strokePath();

        // Fast Fade out
        this.tweens.add({
            targets: graphics,
            alpha: 0,
            duration: 200,
            onComplete: () => graphics.destroy()
        });
    }

    private applyLightningDamage(target: PlacedBuilding, damage: number) {
        if (target && target.health > 0) {
            target.health -= damage;
            this.showHitEffect(target.graphics, 0x00ffff); // Cyan hit flash
            this.updateHealthBar(target);

            if (target.health <= 0) {
                this.destroyBuilding(target);
                // Clear targets targeting this dead building
                this.troops.forEach(t => {
                    if (t.target && t.target.id === target.id) {
                        t.target = null;
                    }
                });
            }
        }
    }

    private shootBallistaAt(ballista: PlacedBuilding, troop: Troop) {
        const info = BUILDINGS['ballista'];
        const stats = this.getDefenseStats(ballista);
        const start = IsoUtils.cartToIso(ballista.gridX + info.width / 2, ballista.gridY + info.height / 2);
        const end = IsoUtils.cartToIso(troop.gridX, troop.gridY);
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const targetTroop = troop;
        const ballistaDamage = stats.damage || 240;

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
                const bLevel = ballista.level ?? 1;
                // L3: gold bolt, L2: grey, L1: wood
                bolt.fillStyle(bLevel >= 3 ? 0xb8860b : 0x5d4e37, 1);
                bolt.fillRect(-16, -1.5, 32, 3);
                // Arrowhead
                bolt.fillStyle(bLevel >= 3 ? 0xdaa520 : 0x3a3a3a, 1);
                bolt.beginPath();
                bolt.moveTo(20, 0);
                bolt.lineTo(14, -4);
                bolt.lineTo(14, 4);
                bolt.closePath();
                bolt.fillPath();
                // Fletching - Gold for L3, Grey for L2, Red for L1
                const fletchColor = bLevel >= 3 ? 0xffd700 : (bLevel >= 2 ? 0x444444 : 0xcc3333);
                bolt.fillStyle(fletchColor, 1);
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
                        this.cameras.main.shake(50, 0.00025, true);
                        bolt.destroy();
                        // Deal damage
                        if (targetTroop && targetTroop.health > 0) {
                            targetTroop.health -= ballistaDamage;
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

                        // Main impact glow (isometric oval)
                        const impact = this.add.graphics();
                        impact.fillStyle(0xff4400, 0.8);
                        impact.fillEllipse(0, 0, 24, 12);
                        impact.fillStyle(0xffcc00, 0.6);
                        impact.fillEllipse(0, 0, 12, 6);
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

                // Reload bolt based on configured fire cadence.
                const reloadDelay = Math.max(300, (stats.fireRate ?? 1900) - 250);
                this.time.delayedCall(reloadDelay, () => {
                    ballista.ballistaBoltLoaded = true;
                });
            }
        });
    }

    private shootXBowAt(xbow: PlacedBuilding, troop: Troop) {
        const info = BUILDINGS['xbow'];
        const stats = this.getDefenseStats(xbow);
        const xbowDamage = stats.damage || 14;
        const start = IsoUtils.cartToIso(xbow.gridX + info.width / 2, xbow.gridY + info.height / 2);
        const end = IsoUtils.cartToIso(troop.gridX, troop.gridY);
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
        const xbowLevel = xbow.level ?? 1;
        const arrow = this.add.graphics();
        // L3: gold shaft, L2: grey, L1: wood
        arrow.fillStyle(xbowLevel >= 3 ? 0xb8860b : 0x5d4e37, 1);
        arrow.fillRect(-6, -0.8, 12, 1.6);
        // Small arrowhead
        arrow.fillStyle(xbowLevel >= 3 ? 0xdaa520 : 0x4a4a4a, 1);
        arrow.beginPath();
        arrow.moveTo(7, 0);
        arrow.lineTo(4, -2);
        arrow.lineTo(4, 2);
        arrow.closePath();
        arrow.fillPath();
        // Fletching - Gold for L3, Grey for L2, Red for L1
        const fletchColor = xbowLevel >= 3 ? 0xffd700 : (xbowLevel >= 2 ? 0x444444 : 0xcc4444);
        arrow.fillStyle(fletchColor, 0.8);
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
                // Deal level-scaled damage.
                if (targetTroop && targetTroop.health > 0) {
                    targetTroop.health -= xbowDamage;
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
        const start = IsoUtils.cartToIso(troop.gridX, troop.gridY);

        const isBuilding = ('type' in target && !!BUILDINGS[target.type]);
        const width = isBuilding ? BUILDINGS[target.type].width : 0.5;
        const height = isBuilding ? BUILDINGS[target.type].height : 0.5;

        const end = IsoUtils.cartToIso(target.gridX + width / 2, target.gridY + height / 2);

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
        TroopRenderer.drawTroopVisual(g, troop.type, troop.owner, troop.facingAngle, true, troop.slamOffset || 0, troop.bowDrawProgress || 0, troop.mortarRecoil || 0, false, troop.phalanxSpearOffset || 0, troop.level || 1);
    }

    private redrawTroopWithMovement(troop: Troop, isMoving: boolean) {
        const g = troop.gameObject;
        g.clear();
        TroopRenderer.drawTroopVisual(g, troop.type, troop.owner, troop.facingAngle, isMoving, troop.slamOffset || 0, troop.bowDrawProgress || 0, troop.mortarRecoil || 0, false, troop.phalanxSpearOffset || 0, troop.level || 1);
    }




    private updateTroops(delta: number) {
        this.troops.forEach(troop => {
            // Redraw animated troops every frame
            if ((troop.type === 'warrior' || troop.type === 'archer' || troop.type === 'giant' || troop.type === 'ram' || troop.type === 'golem' || troop.type === 'sharpshooter' || troop.type === 'mobilemortar' || troop.type === 'davincitank' || troop.type === 'phalanx' || troop.type === 'romanwarrior' || troop.type === 'wallbreaker') && troop.health > 0) {
                // Determine if troop is actually moving (not in attack range)
                let isActuallyMoving = true;
                if (troop.target) {
                    const b = troop.target;
                    const isBuilding = ('type' in b && BUILDINGS[b.type]);
                    const tw = isBuilding ? BUILDINGS[b.type].width : 0.5;
                    const th = isBuilding ? BUILDINGS[b.type].height : 0.5;
                    const bx = isBuilding ? b.gridX : b.gridX - tw / 2;
                    const by = isBuilding ? b.gridY : b.gridY - th / 2;
                    const edx = Math.max(bx - troop.gridX, 0, troop.gridX - (bx + tw));
                    const edy = Math.max(by - troop.gridY, 0, troop.gridY - (by + th));
                    const dist = Math.sqrt(edx * edx + edy * edy);
                    const stats = this.getTroopCombatStats(troop);
                    isActuallyMoving = dist > stats.range;
                }
                this.redrawTroopWithMovement(troop, isActuallyMoving);
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
                const stats = this.getTroopCombatStats(troop);

                if (dist > stats.range) {
                    const time = this.time.now;

                    // Pathfinding - Staggered updates & Fanning
                    // Ram skips A* pathfinding to "charge straight"
                    if (troop.type !== 'ram' && (!troop.path || time >= (troop.nextPathTime || 0))) {
                        let finalTarget: any = troop.target;

                        troop.path = PathfindingSystem.findPath(troop, finalTarget, this.buildings, this.troops) || undefined;
                        troop.lastPathTime = time;
                        const interval = troop.type === 'ward' ? 250 : 500;
                        troop.nextPathTime = time + interval + Math.random() * interval;
                    } else if (troop.type === 'ram') {
                        troop.path = undefined;
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
                        // Fallback steering (Direct to target)
                        moveDir.set(tx - troop.gridX, ty - troop.gridY).normalize();
                        validMove = true;

                        // RAM SPECIAL: Check for walls ahead in straight line
                        if (troop.type === 'ram') {
                            const lookAhead = 0.8;
                            const checkX = Math.floor(troop.gridX + moveDir.x * lookAhead);
                            const checkY = Math.floor(troop.gridY + moveDir.y * lookAhead);

                            const wallAhead = this.buildings.find(b =>
                                b.type === 'wall' && b.owner !== troop.owner && b.health > 0 &&
                                checkX >= b.gridX && checkX < b.gridX + BUILDINGS[b.type].width &&
                                checkY >= b.gridY && checkY < b.gridY + BUILDINGS[b.type].height
                            );

                            if (wallAhead) {
                                troop.target = wallAhead;
                                return; // Stop moving this frame, start attacking next frame (since now dist <= range usually)
                            }
                        }
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

                        const speed = stats.speed * troop.speedMult * delta;
                        troop.gridX += (moveDir.x + sepX) * speed;
                        troop.gridY += (moveDir.y + sepY) * speed;

                        const pos = IsoUtils.cartToIso(troop.gridX, troop.gridY);
                        troop.gameObject.setPosition(pos.x, pos.y);
                        this.updateHealthBar(troop);
                        troop.gameObject.setDepth(depthForTroop(troop.gridX, troop.gridY, troop.type));

                        // Update facing angle for troops that need it (facing movement direction)
                        if (troop.type === 'archer' || troop.type === 'ram' || troop.type === 'golem' || troop.type === 'sharpshooter' || troop.type === 'mobilemortar' || troop.type === 'phalanx' || troop.type === 'romanwarrior') {
                            const targetPos = IsoUtils.cartToIso(tx, ty);
                            const newFacing = Math.atan2(targetPos.y - pos.y, targetPos.x - pos.x);
                            // Redraw troops that have direction-dependent visuals (check BEFORE updating facingAngle)
                            if ((troop.type === 'sharpshooter' || troop.type === 'mobilemortar' || troop.type === 'phalanx' || troop.type === 'romanwarrior') && Math.abs(newFacing - troop.facingAngle) > 0.1) {
                                troop.facingAngle = newFacing;
                                this.redrawTroop(troop);
                            } else {
                                troop.facingAngle = newFacing;
                            }
                        }
                    }
                } else {
                    // In range - update facing direction for ranged/directional troops
                    if ((troop.type === 'archer' || troop.type === 'sharpshooter' || troop.type === 'mobilemortar' || troop.type === 'phalanx' || troop.type === 'romanwarrior') && troop.target) {
                        const pos = IsoUtils.cartToIso(troop.gridX, troop.gridY);
                        const targetPos = IsoUtils.cartToIso(tx, ty);
                        const newFacing = Math.atan2(targetPos.y - pos.y, targetPos.x - pos.x);
                        if (Math.abs(newFacing - troop.facingAngle) > 0.1) {
                            troop.facingAngle = newFacing;
                            this.redrawTroop(troop);
                        }
                    }
                    if (!troop.target) troop.target = TargetingSystem.findTarget(troop, this.buildings);
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







    private destroyBuilding(b: PlacedBuilding) {
        // SAFETY: Town Hall cannot be deleted by the player
        if (this.mode === 'HOME' && b.type === 'town_hall') {
            console.log("Cannot destroy Town Hall in HOME mode.");
            return;
        }

        const index = this.buildings.findIndex(x => x.id === b.id);
        if (index === -1) return;

        if (b.isDestroyed) return;
        b.isDestroyed = true;

        const info = BUILDINGS[b.type];
        if (!info) {
            if (b.graphics) b.graphics.destroy();
            if (b.baseGraphics) b.baseGraphics.destroy();
            if (b.barrelGraphics) b.barrelGraphics.destroy();
            if (b.rangeIndicator) b.rangeIndicator.destroy();
            if (b.healthBar) b.healthBar.destroy();
            this.buildings.splice(index, 1);
            return;
        }

        // Remove any baked base from the ground layer so ruins can replace it.
        this.unbakeBuildingFromGround(b);

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

        const pos = IsoUtils.cartToIso(b.gridX + info.width / 2, b.gridY + info.height / 2);
        const size = Math.max(info.width, info.height);

        // Screen shake proportional to building size
        const shakeIntensity = (0.0015 + size * 0.001) * (this.mode === 'HOME' ? 0.2 : 1.0);
        this.cameras.main.shake(75 + size * 50, shakeIntensity);

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
        } else if (b.type === 'solana_collector' || b.type === 'mine' || b.type === 'elixir_collector') {
            this.spawnSolCoinBurst(pos.x, pos.y - 10);
        } else if (b.type === 'magmavent') {
            // === VOLCANIC DEATH ===

            // Stronger screen shake
            this.cameras.main.shake(300, 0.004 * (this.mode === 'HOME' ? 0.2 : 1.0));

            // Bright orange-white flash expanding from center
            const lavaFlash = this.add.circle(pos.x, pos.y - 15, 15, 0xffcc66, 0.9);
            lavaFlash.setDepth(30002);
            this.tweens.add({ targets: lavaFlash, scale: 4, alpha: 0, duration: 250, onComplete: () => lavaFlash.destroy() });

            // Rock crumble: 7 basalt chunks tumbling outward
            const rockPositions = [
                { x: -35, y: -10, label: 'back-left' },
                { x: -25, y: -25, label: 'back-left-top' },
                { x: 35, y: -5, label: 'back-right' },
                { x: 25, y: -20, label: 'back-right-top' },
                { x: 10, y: 18, label: 'front' },
                { x: -10, y: 15, label: 'front-left' },
                { x: 0, y: -30, label: 'top' },
            ];
            for (const rp of rockPositions) {
                const chunk = this.add.graphics();
                const chunkSize = 10 + Math.random() * 8;
                chunk.fillStyle(0x2a2a32, 1);
                chunk.beginPath();
                chunk.moveTo(0, -chunkSize * 0.6);
                chunk.lineTo(chunkSize * 0.5, -chunkSize * 0.2);
                chunk.lineTo(chunkSize * 0.3, chunkSize * 0.4);
                chunk.lineTo(-chunkSize * 0.4, chunkSize * 0.3);
                chunk.lineTo(-chunkSize * 0.5, -chunkSize * 0.1);
                chunk.closePath();
                chunk.fillPath();
                // Highlight face
                chunk.fillStyle(0x3a3a45, 0.7);
                chunk.beginPath();
                chunk.moveTo(0, -chunkSize * 0.6);
                chunk.lineTo(chunkSize * 0.5, -chunkSize * 0.2);
                chunk.lineTo(chunkSize * 0.1, -chunkSize * 0.1);
                chunk.closePath();
                chunk.fillPath();

                chunk.setPosition(pos.x + rp.x, pos.y + rp.y);
                chunk.setDepth(30001);

                const outAngle = Math.atan2(rp.y, rp.x) + (Math.random() - 0.5) * 0.5;
                const outDist = 40 + Math.random() * 30;
                const peakY = pos.y + rp.y - 30 - Math.random() * 25;

                this.tweens.add({
                    targets: chunk,
                    x: pos.x + rp.x + Math.cos(outAngle) * outDist,
                    duration: 500 + Math.random() * 200,
                    ease: 'Quad.easeOut'
                });
                this.tweens.add({
                    targets: chunk,
                    y: [peakY, pos.y + rp.y + 15],
                    duration: 500 + Math.random() * 200,
                    ease: 'Quad.easeIn'
                });
                this.tweens.add({
                    targets: chunk,
                    rotation: (Math.random() - 0.5) * 3,
                    alpha: 0,
                    duration: 700 + Math.random() * 200,
                    delay: 200,
                    onComplete: () => chunk.destroy()
                });
            }

            // Lava eruption: lava glob particles
            for (let i = 0; i < 18; i++) {
                const delay = Math.random() * 100;
                this.time.delayedCall(delay, () => {
                    const globColors = [0xff5500, 0xff7700, 0xffaa00, 0xffdd66];
                    const globSize = 3 + Math.random() * 7;
                    const glob = this.add.graphics();
                    glob.fillStyle(globColors[Math.floor(Math.random() * 4)], 1);
                    glob.fillCircle(0, 0, globSize);
                    // White-hot core on larger globs
                    if (globSize > 5) {
                        glob.fillStyle(0xffeecc, 0.8);
                        glob.fillCircle(0, 0, globSize * 0.4);
                    }
                    glob.setPosition(pos.x + (Math.random() - 0.5) * 20, pos.y - 15);
                    glob.setDepth(30002);

                    const angle = Math.random() * Math.PI * 2;
                    const dist = 30 + Math.random() * 60;
                    const peakY = pos.y - 50 - Math.random() * 50;

                    this.tweens.add({
                        targets: glob,
                        x: pos.x + Math.cos(angle) * dist,
                        duration: 500 + Math.random() * 300,
                        ease: 'Quad.easeOut'
                    });
                    this.tweens.add({
                        targets: glob,
                        y: [peakY, pos.y + 10 + Math.random() * 15],
                        duration: 500 + Math.random() * 300,
                        ease: 'Quad.easeIn',
                        onComplete: () => {
                            // Splat effect
                            const splat = this.add.graphics();
                            splat.fillStyle(0xff5500, 0.5);
                            splat.fillCircle(0, 0, globSize * 1.5);
                            splat.setPosition(glob.x, glob.y);
                            splat.setDepth(29999);
                            this.tweens.add({ targets: splat, alpha: 0, duration: 600, onComplete: () => splat.destroy() });
                            glob.destroy();
                        }
                    });
                });
            }

            // Black smoke plumes
            for (let i = 0; i < 4; i++) {
                this.time.delayedCall(i * 50, () => {
                    const smoke = this.add.graphics();
                    const smokeSize = 10 + Math.random() * 12;
                    smoke.fillStyle(0x222222, 0.6);
                    smoke.fillRect(-smokeSize / 2, -smokeSize / 2, smokeSize, smokeSize);
                    smoke.setPosition(pos.x + (Math.random() - 0.5) * 50, pos.y - 10);
                    smoke.setDepth(30000);
                    this.tweens.add({
                        targets: smoke,
                        y: smoke.y - 60 - Math.random() * 30,
                        x: smoke.x + (Math.random() - 0.5) * 30,
                        scale: 2.5, alpha: 0,
                        duration: 800 + Math.random() * 400,
                        onComplete: () => smoke.destroy()
                    });
                });
            }
        }

        // Create rubble at the building location (attack mode only)
        if (this.mode === 'ATTACK') {
                const info = BUILDINGS[b.type];
                if (info) {
                    if (b.type === 'magmavent') {
                        this.createLavaPool(b.gridX, b.gridY, info.width, info.height, b.owner, b.level || 1);
                    } else {
                        this.createRubble(b.gridX, b.gridY, info.width, info.height);
                    }
                }
            }

        if (b.barrelGraphics) b.barrelGraphics.destroy();
        b.healthBar.destroy();
        this.buildings.splice(index, 1);

        // Clear any troops still targeting this building
        this.troops.forEach(t => {
            if (t.target && t.target.id === b.id) t.target = null;
        });

        // If a wall is broken, force all troops to re-evaluate paths
        // This allows them to switch from attacking a wall to using a new gap
        if (b.type === 'wall') {
            this.troops.forEach(t => {
                t.lastPathTime = 0;
                t.nextPathTime = 0;
                if (t.target && t.target.type === 'wall') t.target = null;
            });
            // Update neighbor walls to disconnect from destroyed wall
            this.refreshWallNeighbors(b.gridX, b.gridY, b.owner);
        }

        if (this.mode === 'ATTACK') {
            // Track destruction stats and loot
            if (b.type !== 'wall') this.destroyedBuildings++;

            // Award loot if available
            if (b.loot) {
                this.solLooted += b.loot.sol;
            }

            this.updateBattleStats();

        } else {
            if (b.type === 'army_camp') {
                const campLevels = this.buildings.filter(bc => bc.type === 'army_camp').map(bc => bc.level ?? 1);
                gameManager.refreshCampCapacity(campLevels);
            }
            // Remove from backend when player building is deleted
            if (b.owner === 'PLAYER') {
                Backend.removeBuilding(this.userId, b.id);
            }
        }
    }


    private updateBattleStats() {
        const { totalKnown } = this.getBattleTotals();
        const destruction = totalKnown > 0
            ? Math.min(100, Math.round((this.destroyedBuildings / totalKnown) * 100))
            : 0;
        gameManager.updateBattleStats(destruction, this.solLooted);
    }



    private destroyTroop(t: Troop) {
        if (t.id === 'dummy_target') return; // Ignore dummy targets used for fun shooting
        const pos = IsoUtils.cartToIso(t.gridX, t.gridY);

        // WALL BREAKER EXPLOSION: Detailed boom with smoke, debris, and area ring
        if (t.type === 'wallbreaker') {
            const ex = pos.x;
            const ey = pos.y - 5;

            // 1. Area damage ring — expanding ground circle showing blast radius
            const ring = this.add.graphics();
            ring.lineStyle(3, 0xff6600, 0.7);
            ring.strokeEllipse(0, 0, 20, 10); // isometric ellipse
            ring.fillStyle(0xff4400, 0.15);
            ring.fillEllipse(0, 0, 20, 10);
            ring.setPosition(ex, ey + 8);
            ring.setDepth(29999);
            this.tweens.add({
                targets: ring, scaleX: 4, scaleY: 4, alpha: 0,
                duration: 400, ease: 'Quad.easeOut',
                onComplete: () => ring.destroy()
            });

            // 2. Core flash — bright white/yellow burst
            const flash = this.add.graphics();
            flash.fillStyle(0xffffff, 0.9);
            flash.fillCircle(0, 0, 6);
            flash.fillStyle(0xffff44, 0.7);
            flash.fillCircle(0, 0, 10);
            flash.setPosition(ex, ey);
            flash.setDepth(30005);
            this.tweens.add({ targets: flash, scale: 2.5, alpha: 0, duration: 150, onComplete: () => flash.destroy() });

            // 3. Fireball — orange/red expanding ball
            const fireball = this.add.graphics();
            fireball.fillStyle(0xff4400, 0.8);
            fireball.fillCircle(0, 0, 10);
            fireball.fillStyle(0xff8800, 0.6);
            fireball.fillCircle(-2, -2, 6);
            fireball.setPosition(ex, ey);
            fireball.setDepth(30003);
            this.tweens.add({ targets: fireball, scale: 2, alpha: 0, duration: 300, onComplete: () => fireball.destroy() });

            // 4. Screen shake
            this.cameras.main.shake(60, 0.003);

            // 5. Debris — barrel chunks, wood splinters, stone bits
            for (let i = 0; i < 14; i++) {
                const debrisAngle = Math.random() * Math.PI * 2;
                const debrisDist = 15 + Math.random() * 35;
                const debris = this.add.graphics();
                const isWood = Math.random() > 0.4;
                if (isWood) {
                    // Wood/barrel chunk
                    debris.fillStyle([0x5a3a1a, 0x6b4a2a, 0x8b6b4a][Math.floor(Math.random() * 3)], 0.9);
                    debris.fillRect(-1.5, -1, 3, 2 + Math.random() * 2);
                } else {
                    // Metal band / stone bit
                    debris.fillStyle([0x555555, 0x777777, 0x993300][Math.floor(Math.random() * 3)], 0.9);
                    debris.fillCircle(0, 0, 1 + Math.random() * 1.5);
                }
                debris.setPosition(ex, ey);
                debris.setDepth(30001);
                const arcHeight = -20 - Math.random() * 20;
                const endX = ex + Math.cos(debrisAngle) * debrisDist;
                const endY = ey + Math.sin(debrisAngle) * debrisDist * 0.5;
                const midX = (ex + endX) / 2;
                const midY = (ey + endY) / 2 + arcHeight;
                const dur = 350 + Math.random() * 250;
                // Arcing trajectory
                this.tweens.add({
                    targets: debris,
                    x: { value: midX, duration: dur * 0.5, ease: 'Sine.easeOut' },
                    duration: dur
                });
                this.tweens.add({
                    targets: debris,
                    x: { value: endX, duration: dur * 0.5, delay: dur * 0.5, ease: 'Sine.easeIn' },
                    duration: dur
                });
                this.tweens.add({
                    targets: debris,
                    y: [{ value: midY, duration: dur * 0.5, ease: 'Sine.easeOut' }, { value: endY, duration: dur * 0.5, ease: 'Sine.easeIn' }],
                    alpha: 0,
                    rotation: Math.random() * 6,
                    duration: dur,
                    onComplete: () => debris.destroy()
                });
            }

            // 6. Smoke puffs — multiple rising smoke clouds
            for (let i = 0; i < 4; i++) {
                const smoke = this.add.graphics();
                const smokeSize = 6 + Math.random() * 8;
                const smokeAlpha = 0.3 + Math.random() * 0.2;
                smoke.fillStyle(i < 2 ? 0x222222 : 0x444444, smokeAlpha);
                smoke.fillCircle(0, 0, smokeSize);
                const offsetX = (Math.random() - 0.5) * 16;
                const offsetY = (Math.random() - 0.5) * 8;
                smoke.setPosition(ex + offsetX, ey + offsetY);
                smoke.setDepth(30000);
                this.tweens.add({
                    targets: smoke,
                    y: ey + offsetY - 25 - Math.random() * 15,
                    x: ex + offsetX + (Math.random() - 0.5) * 10,
                    scale: 2 + Math.random(),
                    alpha: 0,
                    duration: 600 + Math.random() * 400,
                    delay: i * 50,
                    onComplete: () => smoke.destroy()
                });
            }

            // 7. Sparks — small bright particles
            for (let i = 0; i < 6; i++) {
                const spark = this.add.graphics();
                spark.fillStyle([0xffaa00, 0xff6600, 0xffff00][Math.floor(Math.random() * 3)], 1);
                spark.fillCircle(0, 0, 1);
                spark.setPosition(ex, ey);
                spark.setDepth(30004);
                const sparkAngle = Math.random() * Math.PI * 2;
                const sparkDist = 20 + Math.random() * 25;
                this.tweens.add({
                    targets: spark,
                    x: ex + Math.cos(sparkAngle) * sparkDist,
                    y: ey + Math.sin(sparkAngle) * sparkDist * 0.5 - 10,
                    alpha: 0,
                    duration: 200 + Math.random() * 150,
                    onComplete: () => spark.destroy()
                });
            }

            // Remove troop and skip default death effects
            this.troops = this.troops.filter(x => x.id !== t.id);
            t.gameObject.destroy();
            t.healthBar.destroy();
            return;
        }

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
                this.pendingSpawnCount++;
                this.time.delayedCall(50, () => {
                    this.spawnTroop(t.gridX + off.dx, t.gridY + off.dy, 'recursion', t.owner, nextGen, t.level || 1);
                    this.pendingSpawnCount--;
                });
            }
        }

        // === GOLEM DEATH ANIMATION ===
        if (t.type === 'golem') {
            const isPlayer = t.owner === 'PLAYER';
            // Stone colors with ancient weathering - EXACTLY as in drawTroopVisual
            const stoneBase = isPlayer ? 0x5a6a7a : 0x6a5a5a;
            const stoneDark = isPlayer ? 0x3a4a5a : 0x4a3a3a;
            const stoneLight = isPlayer ? 0x7a8a9a : 0x8a7a7a;
            const stoneAccent = isPlayer ? 0x4a5a6a : 0x5a4a4a;
            const mossColor = isPlayer ? 0x4a6a3a : 0x5a4a3a;

            // Remove the troop immediately but keep visual debris
            this.troops = this.troops.filter(x => x.id !== t.id);
            t.gameObject.destroy();
            t.healthBar.destroy();

            // Debris Depth: Render at the bottom (on ground level)
            const debrisDepth = 5;

            // 1. LEFT ARM PIECE
            const leftArm = this.add.graphics();
            leftArm.setPosition(pos.x, pos.y);
            leftArm.setDepth(debrisDepth);
            // Reconstruct Left Arm exactly:
            const lax = -18; const lay = -20;
            leftArm.fillStyle(stoneDark, 1);
            leftArm.beginPath(); leftArm.moveTo(lax - 4, lay); leftArm.lineTo(lax - 8, lay + 18); leftArm.lineTo(lax + 4, lay + 20); leftArm.lineTo(lax + 4, lay + 2); leftArm.closePath(); leftArm.fillPath();
            leftArm.fillStyle(stoneBase, 1);
            leftArm.beginPath(); leftArm.moveTo(lax - 2, lay + 2); leftArm.lineTo(lax - 4, lay + 16); leftArm.lineTo(lax + 2, lay + 17); leftArm.lineTo(lax + 2, lay + 3); leftArm.closePath(); leftArm.fillPath();
            const lfx = lax - 2; const lfy = lay + 18;
            leftArm.fillStyle(stoneAccent, 1);
            leftArm.beginPath(); leftArm.moveTo(lfx - 5, lfy); leftArm.lineTo(lfx - 7, lfy + 17); leftArm.lineTo(lfx + 5, lfy + 18); leftArm.lineTo(lfx + 6, lfy + 1); leftArm.closePath(); leftArm.fillPath();
            const lfistX = lfx - 1; const lfistY = lfy + 22;
            leftArm.fillStyle(stoneDark, 1); leftArm.fillCircle(lfistX, lfistY, 9);
            leftArm.fillStyle(stoneBase, 1); leftArm.fillCircle(lfistX - 1, lfistY - 1, 7);
            leftArm.fillStyle(stoneLight, 0.5); leftArm.fillCircle(lfistX - 4, lfistY - 3, 2); leftArm.fillCircle(lfistX, lfistY - 4, 2); leftArm.fillCircle(lfistX + 4, lfistY - 3, 2);

            this.tweens.add({
                targets: leftArm,
                x: pos.x - 12, y: pos.y + 10, rotation: -1.2, // Arms not as far (-22 -> -12)
                duration: 2800, // Slower (2400 -> 2800)
                ease: 'Bounce.easeOut',
                onComplete: () => {
                    this.tweens.add({ targets: leftArm, alpha: 0, duration: 4000, delay: 5000, onComplete: () => leftArm.destroy() });
                }
            });

            // 2. RIGHT ARM PIECE
            const rightArm = this.add.graphics();
            rightArm.setPosition(pos.x, pos.y);
            rightArm.setDepth(debrisDepth);
            // Reconstruct Right Arm exactly:
            const rax = 18; const ray = -20;
            rightArm.fillStyle(stoneDark, 1);
            rightArm.beginPath(); rightArm.moveTo(rax + 4, ray); rightArm.lineTo(rax + 8, ray + 18); rightArm.lineTo(rax - 4, ray + 20); rightArm.lineTo(rax - 4, ray + 2); rightArm.closePath(); rightArm.fillPath();
            rightArm.fillStyle(stoneBase, 1);
            rightArm.beginPath(); rightArm.moveTo(rax + 2, ray + 2); rightArm.lineTo(rax + 4, ray + 16); rightArm.lineTo(rax - 2, ray + 17); rightArm.lineTo(rax - 2, ray + 3); rightArm.closePath(); rightArm.fillPath();
            const rfx = rax + 2; const rfy = ray + 18;
            rightArm.fillStyle(stoneAccent, 1);
            rightArm.beginPath(); rightArm.moveTo(rfx + 5, rfy); rightArm.lineTo(rfx + 7, rfy + 17); rightArm.lineTo(rfx - 5, rfy + 18); rightArm.lineTo(rfx - 6, rfy + 1); rightArm.closePath(); rightArm.fillPath();
            const rfistX = rfx + 1; const rfistY = rfy + 22;
            rightArm.fillStyle(stoneDark, 1); rightArm.fillCircle(rfistX, rfistY, 9);
            rightArm.fillStyle(stoneBase, 1); rightArm.fillCircle(rfistX + 1, rfistY - 1, 7);
            rightArm.fillStyle(stoneLight, 0.5); rightArm.fillCircle(rfistX + 4, rfistY - 3, 2); rightArm.fillCircle(rfistX, rfistY - 4, 2); rightArm.fillCircle(rfistX - 4, rfistY - 3, 2);

            this.tweens.add({
                targets: rightArm,
                x: pos.x + 15, y: pos.y + 15, rotation: 1.4, // Arms not as far (+28 -> +15)
                duration: 3000, // Slower (2600 -> 3000)
                ease: 'Bounce.easeOut',
                onComplete: () => {
                    this.tweens.add({ targets: rightArm, alpha: 0, duration: 4000, delay: 4800, onComplete: () => rightArm.destroy() });
                }
            });

            // 3. LEFT LEG PIECE
            const leftLeg = this.add.graphics();
            leftLeg.setPosition(pos.x, pos.y);
            leftLeg.setDepth(debrisDepth);
            const legSpread = 12;
            leftLeg.fillStyle(stoneDark, 1);
            leftLeg.beginPath(); leftLeg.moveTo(-legSpread - 6, -5); leftLeg.lineTo(-legSpread - 8, 12); leftLeg.lineTo(-legSpread + 4, 14); leftLeg.lineTo(-legSpread + 2, -3); leftLeg.closePath(); leftLeg.fillPath();
            leftLeg.fillStyle(stoneBase, 1);
            leftLeg.beginPath(); leftLeg.moveTo(-legSpread - 4, -4); leftLeg.lineTo(-legSpread - 5, 10); leftLeg.lineTo(-legSpread, 11); leftLeg.lineTo(-legSpread + 1, -3); leftLeg.closePath(); leftLeg.fillPath();
            leftLeg.fillStyle(stoneDark, 1); leftLeg.fillRect(-legSpread - 10, 12, 16, 6);
            leftLeg.fillStyle(stoneAccent, 1); leftLeg.fillRect(-legSpread - 8, 11, 12, 3);

            this.tweens.add({
                targets: leftLeg,
                x: pos.x - 10, y: pos.y + 15, rotation: -0.5,
                duration: 2300, // Slightly slower (2000 -> 2300)
                ease: 'Bounce.easeOut',
                onComplete: () => {
                    this.tweens.add({ targets: leftLeg, alpha: 0, duration: 4000, delay: 5200, onComplete: () => leftLeg.destroy() });
                }
            });

            // 4. RIGHT LEG PIECE
            const rightLeg = this.add.graphics();
            rightLeg.setPosition(pos.x, pos.y);
            rightLeg.setDepth(debrisDepth);
            rightLeg.fillStyle(stoneDark, 1);
            rightLeg.beginPath(); rightLeg.moveTo(legSpread + 6, -5); rightLeg.lineTo(legSpread + 8, 12); rightLeg.lineTo(legSpread - 4, 14); rightLeg.lineTo(legSpread - 2, -3); rightLeg.closePath(); rightLeg.fillPath();
            rightLeg.fillStyle(stoneBase, 1);
            rightLeg.beginPath(); rightLeg.moveTo(legSpread + 4, -4); rightLeg.lineTo(legSpread + 5, 10); rightLeg.lineTo(legSpread, 11); rightLeg.lineTo(legSpread - 1, -3); rightLeg.closePath(); rightLeg.fillPath();
            rightLeg.fillStyle(stoneDark, 1); rightLeg.fillRect(legSpread - 6, 12, 16, 6);
            rightLeg.fillStyle(stoneAccent, 1); rightLeg.fillRect(legSpread - 4, 11, 12, 3);

            this.tweens.add({
                targets: rightLeg,
                x: pos.x + 12, y: pos.y + 12, rotation: 0.6,
                duration: 2500, // Slightly slower (2200 -> 2500)
                ease: 'Bounce.easeOut',
                onComplete: () => {
                    this.tweens.add({ targets: rightLeg, alpha: 0, duration: 4000, delay: 5100, onComplete: () => rightLeg.destroy() });
                }
            });

            // 5. TORSO RUIN
            const torso = this.add.graphics();
            torso.setPosition(pos.x, pos.y);
            torso.setDepth(debrisDepth);
            // Reconstruct Torso exactly. Note bodySlam=0 now.
            torso.fillStyle(stoneDark, 1);
            torso.beginPath(); torso.moveTo(-22, -8); torso.lineTo(-18, -28); torso.lineTo(18, -28); torso.lineTo(22, -8); torso.lineTo(16, 2); torso.lineTo(-16, 2); torso.closePath(); torso.fillPath();
            torso.fillStyle(stoneBase, 1);
            torso.beginPath(); torso.moveTo(-20, -10); torso.lineTo(-16, -30); torso.lineTo(16, -30); torso.lineTo(20, -10); torso.lineTo(14, 0); torso.lineTo(-14, 0); torso.closePath(); torso.fillPath();
            torso.fillStyle(stoneLight, 1);
            torso.beginPath(); torso.moveTo(-12, -24); torso.lineTo(-8, -28); torso.lineTo(8, -28); torso.lineTo(12, -24); torso.lineTo(10, -14); torso.lineTo(-10, -14); torso.closePath(); torso.fillPath();
            // DARK EYES on chest rune (no glow)
            torso.fillStyle(stoneDark, 1);
            torso.beginPath(); torso.moveTo(0, -26); torso.lineTo(-4, -22); torso.lineTo(0, -18); torso.lineTo(4, -22); torso.closePath(); torso.fillPath();
            // Cracks
            torso.lineStyle(1, stoneDark, 0.6); torso.lineBetween(-15, -20, -10, -15); torso.lineBetween(12, -25, 16, -18); torso.lineBetween(-8, -8, -3, -12); torso.lineBetween(5, -6, 10, -10);
            // Moss
            torso.fillStyle(mossColor, 0.7); torso.fillCircle(-14, -16, 3); torso.fillCircle(16, -12, 2.5); torso.fillCircle(-8, -4, 2);
            // Neck
            torso.fillStyle(stoneDark, 1); torso.fillRect(-8, -38, 16, 10);
            // Head
            torso.fillStyle(stoneBase, 1);
            torso.beginPath(); torso.moveTo(-14, -36); torso.lineTo(-16, -48); torso.lineTo(-10, -54); torso.lineTo(10, -54); torso.lineTo(16, -48); torso.lineTo(14, -36); torso.closePath(); torso.fillPath();
            torso.fillStyle(stoneDark, 1);
            torso.beginPath(); torso.moveTo(-14, -46); torso.lineTo(-12, -50); torso.lineTo(12, -50); torso.lineTo(14, -46); torso.lineTo(10, -44); torso.lineTo(-10, -44); torso.closePath(); torso.fillPath();
            // DARK EYES (lights off)
            torso.fillStyle(0x1a1a1a, 1); torso.fillCircle(-6, -45, 4); torso.fillCircle(6, -45, 4);

            this.tweens.add({
                targets: torso,
                y: pos.y + 5, scaleY: 0.85, rotation: 0.15, // Tilted to the side
                duration: 1600, // Even slower
                ease: 'Bounce.easeOut',
                onComplete: () => {
                    // (Rubble spawn removed as per request to fix "weird rectangles")
                    this.tweens.add({ targets: torso, alpha: 0, duration: 14000, delay: 8000, onComplete: () => torso.destroy() });
                }
            });

            // Dust cloud
            const dust = this.add.graphics();
            dust.fillStyle(0x888888, 0.1);
            dust.fillCircle(0, 0, 40);
            dust.setPosition(pos.x, pos.y + 10);
            dust.setDepth(debrisDepth - 2);
            this.tweens.add({
                targets: dust,
                scale: 3, alpha: 0, y: pos.y - 15,
                duration: 4800, // Even slower
                ease: 'Quad.easeOut',
                onComplete: () => dust.destroy()
            });

            return; // Skip normal death effects
        }
        // === END GOLEM DEATH ANIMATION ===

        // === PHALANX DEATH - Splits into 9 warriors ===
        if (t.type === 'phalanx') {
            // Flash effect
            const splitFlash = this.add.circle(pos.x, pos.y, 25, 0xffaa00, 0.8);
            splitFlash.setDepth(30002);
            this.tweens.add({
                targets: splitFlash,
                scale: 2, alpha: 0,
                duration: 300,
                onComplete: () => splitFlash.destroy()
            });

            // Spawn 9 warriors in a 3x3 grid
            const offsets = [
                { dx: -0.5, dy: -0.5 }, { dx: 0, dy: -0.5 }, { dx: 0.5, dy: -0.5 },
                { dx: -0.5, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0.5, dy: 0 },
                { dx: -0.5, dy: 0.5 }, { dx: 0, dy: 0.5 }, { dx: 0.5, dy: 0.5 }
            ];
            for (let i = 0; i < offsets.length; i++) {
                const off = offsets[i];
                this.pendingSpawnCount++;
                this.time.delayedCall(i * 30, () => { // Staggered spawn
                    this.spawnTroop(t.gridX + off.dx, t.gridY + off.dy, 'romanwarrior', t.owner, 0, t.level || 1);
                    this.pendingSpawnCount--;
                });
            }

            // Debris dust (isometric oval)
            const dust = this.add.graphics();
            dust.fillStyle(0x888888, 0.3);
            dust.fillEllipse(0, 0, 40, 20);
            dust.setPosition(pos.x, pos.y);
            dust.setDepth(5);
            this.tweens.add({
                targets: dust,
                scale: 2.5, alpha: 0,
                duration: 800,
                onComplete: () => dust.destroy()
            });

            // Don't return - let normal death cleanup happen
        }

        // === DA VINCI TANK DEATH - Leaves deactivated husk ===
        if (t.type === 'davincitank') {
            const isPlayer = t.owner === 'PLAYER';

            // Remove the troop from active list
            this.troops = this.troops.filter(x => x.id !== t.id);
            t.gameObject.destroy();
            t.healthBar.destroy();

            // === SMOKE BURST to cover the transition ===
            // Create multiple small smoke puffs
            for (let i = 0; i < 8; i++) {
                const smoke = this.add.graphics();
                smoke.fillStyle(0x1a1a1a, 0.85);  // Very dark black smoke
                const smokeSize = 2 + Math.random() * 2;  // TINY (2-4px radius)
                smoke.fillCircle(0, 0, smokeSize);
                const offsetX = (Math.random() - 0.5) * 15;  // Tight spread
                const offsetY = (Math.random() - 0.5) * 10 - 5;
                smoke.setPosition(pos.x + offsetX, pos.y + offsetY);
                smoke.setDepth(30000 + i);  // Above everything temporarily

                this.tweens.add({
                    targets: smoke,
                    scale: 1.5, alpha: 0,  // Minimal expansion
                    x: pos.x + offsetX + (Math.random() - 0.5) * 10,
                    y: pos.y + offsetY - 15 - Math.random() * 10,
                    duration: 1800 + Math.random() * 800,
                    delay: i * 50,
                    ease: 'Quad.easeOut',
                    onComplete: () => smoke.destroy()
                });
            }

            // Fire/explosion spark at center
            const spark = this.add.graphics();
            spark.fillStyle(0xff6600, 0.8);
            spark.fillCircle(0, 0, 15);
            spark.setPosition(pos.x, pos.y - 15);
            spark.setDepth(30010);
            this.tweens.add({
                targets: spark,
                scale: 2, alpha: 0,
                duration: 200,
                onComplete: () => spark.destroy()
            });

            // Create husk AFTER smoke starts (delayed slightly)
            this.time.delayedCall(100, () => {
                const husk = this.add.graphics();
                husk.setPosition(pos.x, pos.y);
                husk.setDepth(depthForTroop(t.gridX, t.gridY, t.type));

                // Draw the deactivated tank
                TroopRenderer.drawDaVinciTank(husk, isPlayer, false, true, t.facingAngle || 0);

                // Small dust cloud on impact
                const dust = this.add.graphics();
                dust.fillStyle(0x888888, 0.2);
                dust.fillCircle(0, 0, 30);
                dust.setPosition(pos.x, pos.y + 10);
                dust.setDepth(4);
                this.tweens.add({
                    targets: dust,
                    scale: 2.5, alpha: 0, y: pos.y - 5,
                    duration: 2500,
                    ease: 'Quad.easeOut',
                    onComplete: () => dust.destroy()
                });

                // Fade out husk slowly over time
                this.tweens.add({
                    targets: husk,
                    alpha: 0,
                    duration: 20000,
                    delay: 15000,
                    onComplete: () => husk.destroy()
                });
            });

            return; // Skip normal death effects
        }
        // === END DA VINCI TANK DEATH ===
        // Death explosion effect (pixelated rectangle)
        const flash = this.add.graphics();
        flash.fillRect(-6, -6, 12, 12);
        flash.setPosition(pos.x, pos.y);
        flash.setDepth(30001);
        this.tweens.add({ targets: flash, scale: 2, alpha: 0, duration: 100, onComplete: () => flash.destroy() });

        // Particle burst (pixelated rectangles)
        const particleColors = t.type === 'warrior' ? [0xffff00, 0xffcc00] :
            t.type === 'archer' ? [0x00ccff, 0x0088cc] :
                t.type === 'recursion' ? [0x00ffaa, 0x00cc88] :
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

    private showHitEffect(_graphics: Phaser.GameObjects.Graphics, _color: number = 0xffffff) {
        // Simple distinct tint flash if possible, or just ignore for now as requested by user previously
        // But for lightning we might want a blue tint.
        if (_color !== 0xffffff) {
            // If we wanted to tint, we'd need to ensure the graphics object supports it nicely or overlay.
            // For now, let's just leave it empty or minimal to avoid visual clutter as per previous preference.
        }
    }

    private showGolemCrackEffect(x: number, y: number) {
        // Create ground crack effect for Golem ground pound
        const crackGraphics = this.add.graphics();
        crackGraphics.setPosition(x, y);
        crackGraphics.setDepth(5);

        // Draw radial cracks
        const crackColor = 0x3a3a3a;
        const crackCount = 8;
        const maxLength = 60;

        for (let i = 0; i < crackCount; i++) {
            const angle = (i / crackCount) * Math.PI * 2 + Math.random() * 0.3;
            const length = maxLength * (0.6 + Math.random() * 0.4);

            // Main crack line
            crackGraphics.lineStyle(3, crackColor, 0.8);
            crackGraphics.beginPath();
            crackGraphics.moveTo(0, 0);

            // Jagged path
            let cx = 0, cy = 0;
            const segments = 3;
            for (let s = 1; s <= segments; s++) {
                const progress = s / segments;
                const jitter = (Math.random() - 0.5) * 15;
                cx = Math.cos(angle) * length * progress + Math.cos(angle + Math.PI / 2) * jitter;
                cy = Math.sin(angle) * length * progress * 0.5 + Math.sin(angle + Math.PI / 2) * jitter * 0.5;
                crackGraphics.lineTo(cx, cy);
            }
            crackGraphics.strokePath();

            // Branch cracks
            if (Math.random() > 0.4) {
                const branchAngle = angle + (Math.random() - 0.5) * 0.8;
                const branchLen = length * 0.4;
                crackGraphics.lineStyle(2, crackColor, 0.6);
                crackGraphics.beginPath();
                crackGraphics.moveTo(cx * 0.6, cy * 0.6);
                crackGraphics.lineTo(
                    cx * 0.6 + Math.cos(branchAngle) * branchLen,
                    cx * 0.6 + Math.sin(branchAngle) * branchLen * 0.5
                );
                crackGraphics.strokePath();
            }
        }

        // Fade out cracks
        this.tweens.add({
            targets: crackGraphics,
            alpha: 0,
            duration: 1200, // Slightly longer fade for better "settling" feel
            delay: 400,
            onComplete: () => crackGraphics.destroy()
        });
    }

    private updateResources(time: number) {
        if (this.mode !== 'HOME') return;
        if (time < this.lastResourceUpdate + this.resourceInterval) return;
        this.lastResourceUpdate = time;

        const intervalSeconds = this.resourceInterval / 1000;
        let solPerSecond = 0;

        this.buildings.forEach(b => {
            if (b.owner !== 'PLAYER') return;
            if (b.type !== 'solana_collector' && b.type !== 'mine' && b.type !== 'elixir_collector') return;
            const statsType = b.type === 'mine' || b.type === 'elixir_collector' ? 'solana_collector' : b.type;
            const stats = getBuildingStats(statsType as BuildingType, b.level || 1);
            const rate = stats.productionRate || 0;
            solPerSecond += rate;
        });

        const solToAdd = Math.floor(solPerSecond * intervalSeconds);

        if (solToAdd > 0) {
            gameManager.addSol(solToAdd);
        }
    }

    private spawnSolCoinBurst(x: number, y: number, count: number = 14) {
        if (!this.textures.exists('solanaCoin')) return;

        for (let i = 0; i < count; i++) {
            const coin = this.add.image(x, y, 'solanaCoin');
            coin.setDepth(30000);
            coin.setDisplaySize(16, 16);
            coin.setAlpha(1);
            coin.setAngle((Math.random() - 0.5) * 20);

            const angle = Math.random() * Math.PI * 2;
            const dist = 18 + Math.random() * 26;
            const rise = 18 + Math.random() * 20;

            this.tweens.add({
                targets: coin,
                x: x + Math.cos(angle) * dist,
                y: y - rise,
                alpha: 0,
                duration: 550 + Math.random() * 150,
                ease: 'Quad.easeOut',
                onComplete: () => coin.destroy()
            });
        }
    }


    public spawnTroop(
        gx: number,
        gy: number,
        type: TroopType = 'warrior',
        owner: 'PLAYER' | 'ENEMY' = 'PLAYER',
        recursionGen: number = 0,
        troopLevelOverride?: number
    ) {
        // Bounds check - Relaxed for deployment margin
        const margin = 2;
        if (gx < -margin || gy < -margin || gx >= this.mapSize + margin || gy >= this.mapSize + margin) {
            return;
        }
        const troopLevel = Math.max(1, Math.floor(troopLevelOverride ?? this.getTroopLevelForOwner(owner)));
        const stats = getTroopStats(type, troopLevel);
        const attackDelay = stats.attackDelay ?? (700 + Math.random() * 300);
        const firstAttackDelay = stats.firstAttackDelay ?? 0;
        const spawnTime = this.time.now;
        const pos = IsoUtils.cartToIso(gx, gy);

        // Scale factor for recursions based on generation (each split = 75% size)
        const scaleFactor = type === 'recursion' ? Math.pow(0.75, recursionGen) : 1;

        // Create detailed troop graphic
        const troopGraphic = this.add.graphics();
        TroopRenderer.drawTroopVisual(troopGraphic, type, owner, 0, true, 0, 0, 0, false, 0, troopLevel);
        troopGraphic.setPosition(pos.x, pos.y);
        troopGraphic.setDepth(depthForTroop(gx, gy, type));

        // Spawn dust effect - depth just below troop for proper layering
        const troopDepth = depthForTroop(gx, gy, type);
        for (let i = 0; i < 5; i++) {
            const dust = this.add.circle(
                pos.x + (Math.random() - 0.5) * 15,
                pos.y + 5,
                3 + Math.random() * 3,
                0x8b7355,
                0.5
            );
            dust.setDepth(troopDepth - 1);
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
            level: troopLevel,
            gameObject: troopGraphic,
            healthBar: this.add.graphics(),
            gridX: gx, gridY: gy,
            health: troopHealth, maxHealth: troopHealth,
            target: null, owner: owner,
            lastAttackTime: spawnTime - attackDelay + firstAttackDelay,
            attackDelay,
            speedMult: 0.9 + Math.random() * 0.2,
            hasTakenDamage: false,
            facingAngle: 0,
            recursionGen: type === 'recursion' ? recursionGen : undefined
        };

        this.troops.push(troop);
        this.hasDeployed = true;
        if (owner === 'PLAYER' && this.mode === 'ATTACK' && !this.isScouting) {
            this.setVillageNameVisible(false);
        }
        this.updateHealthBar(troop);
        troop.target = TargetingSystem.findTarget(troop, this.buildings);

        if (this.mode === 'ATTACK') {
            // Alpha handled by lerp in updateDeploymentHighlight
        }
    }




    public getBuildingsBounds(owner: 'PLAYER' | 'ENEMY') {
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
        // Clamp to map bounds
        return {
            minX: Math.max(0, minX - buffer),
            minY: Math.max(0, minY - buffer),
            maxX: Math.min(this.mapSize, maxX + buffer),
            maxY: Math.min(this.mapSize, maxY + buffer)
        };
    }

    private updateDeploymentHighlight() {
        this.deploymentGraphics.clear();
        this.forbiddenGraphics.clear();

        if (this.mode !== 'ATTACK' || this.isScouting) {
            this.deploymentGraphics.setVisible(false);
            this.forbiddenGraphics.setVisible(false);
            return;
        }

        this.deploymentGraphics.setVisible(true);
        this.forbiddenGraphics.setVisible(true);

        const isRecentlyDeployed = (this.time.now - this.lastDeployTime < 1000);
        const isPointerDown = this.input.activePointer.isDown;
        const isInteractingWithForbidden = (this.time.now - this.lastForbiddenInteractionTime < 1500);

        const targetMarginAlpha = (isPointerDown || isRecentlyDeployed) ? 0.6 : 0.15;
        const targetForbiddenAlpha = isInteractingWithForbidden ? 0.6 : 0.0;

        // Smoothly lerp alphas for immersion
        this.deploymentGraphics.alpha += (targetMarginAlpha - this.deploymentGraphics.alpha) * 0.15;

        // Red zone fades slower (0.02 factor on fade out for extra grace, 0.2 on fade in)
        const redLerp = this.forbiddenGraphics.alpha < targetForbiddenAlpha ? 0.2 : 0.02;
        this.forbiddenGraphics.alpha += (targetForbiddenAlpha - this.forbiddenGraphics.alpha) * redLerp;

        const margin = 2;

        // 1. Draw LUSH LIGHT GREEN deployment margin
        const m1 = IsoUtils.cartToIso(-margin, -margin);
        const m2 = IsoUtils.cartToIso(this.mapSize + margin, -margin);
        const m3 = IsoUtils.cartToIso(this.mapSize + margin, this.mapSize + margin);
        const m4 = IsoUtils.cartToIso(-margin, this.mapSize + margin);

        const i1 = IsoUtils.cartToIso(0, 0);
        const i2 = IsoUtils.cartToIso(this.mapSize, 0);
        const i3 = IsoUtils.cartToIso(this.mapSize, this.mapSize);
        const i4 = IsoUtils.cartToIso(0, this.mapSize);

        // Deployment area fill
        this.deploymentGraphics.fillStyle(0x7ed957, 0.4);
        this.deploymentGraphics.fillPoints([m1, m2, m3, m4], true);

        // Map boundary separator
        this.deploymentGraphics.lineStyle(2, 0xffffff, 0.4);
        this.deploymentGraphics.strokePoints([i1, i2, i3, i4], true, true);

        // Grid highlight
        this.deploymentGraphics.lineStyle(2, 0xadffad, 0.6);
        this.deploymentGraphics.strokePoints([m1, m2, m3, m4], true, true);

        // 2. Draw INNER forbidden zone (into red graphics)
        const bounds = this.getBuildingsBounds('ENEMY');
        if (bounds) {
            const b1 = IsoUtils.cartToIso(bounds.minX, bounds.minY);
            const b2 = IsoUtils.cartToIso(bounds.maxX, bounds.minY);
            const b3 = IsoUtils.cartToIso(bounds.maxX, bounds.maxY);
            const b4 = IsoUtils.cartToIso(bounds.minX, bounds.maxY);

            // Red zone fill
            this.forbiddenGraphics.fillStyle(0xff0000, 0.2);
            this.forbiddenGraphics.fillPoints([b1, b2, b3, b4], true);

            // Red zone border
            this.forbiddenGraphics.lineStyle(2, 0xff0000, 0.5);
            this.forbiddenGraphics.strokePoints([b1, b2, b3, b4], true, true);
        }

        this.deploymentGraphics.setDepth(5);
    }

    private playUpgradeEffect(building: PlacedBuilding) {
        const bInfo = BUILDINGS[building.type];

        // Calculate VISUAL center (considering isometric height)
        const groundCenter = IsoUtils.cartToIso(building.gridX + bInfo.width / 2, building.gridY + bInfo.height / 2);

        // Approximate visual center based on building type (most have some height)
        let heightOffset = 50;
        if (building.type === 'wall' || building.type === 'bomb' || building.type === 'spring_trap') heightOffset = 10;
        else if (building.type === 'army_camp') heightOffset = 20;
        else if (building.type === 'tesla' || building.type === 'archer_tower' || building.type === 'wizard_tower') heightOffset = 80;

        const centerX = groundCenter.x;
        const centerY = groundCenter.y - heightOffset / 2;

        // Create sparkle particles
        const numParticles = 12;
        for (let i = 0; i < numParticles; i++) {
            const angle = (i / numParticles) * Math.PI * 2;
            const speed = 40 + Math.random() * 40;
            const particle = this.add.graphics();
            particle.setDepth(building.graphics.depth + 100);

            // Random gold/yellow/white colors
            const colors = [0xFFD700, 0xFFA500, 0xFFFF00, 0xFFFFFF, 0xFFE4B5];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = 3 + Math.random() * 3;

            particle.fillStyle(color, 1);
            particle.fillCircle(0, 0, size);
            particle.x = centerX;
            particle.y = centerY;

            this.tweens.add({
                targets: particle,
                x: centerX + Math.cos(angle) * speed,
                y: centerY + Math.sin(angle) * speed - 40 - Math.random() * 30,
                alpha: 0,
                scale: { from: 1, to: 0.2 },
                duration: 800 + Math.random() * 400,
                ease: 'Cubic.easeOut',
                onComplete: () => particle.destroy()
            });
        }

        // Create rising star effect
        for (let i = 0; i < 3; i++) {
            const star = this.add.graphics();
            star.setDepth(building.graphics.depth + 110);
            star.fillStyle(0xFFD700, 1);
            star.beginPath();
            star.moveTo(0, -6);
            star.lineTo(2, -2);
            star.lineTo(6, 0);
            star.lineTo(2, 2);
            star.lineTo(0, 6);
            star.lineTo(-2, 2);
            star.lineTo(-6, 0);
            star.lineTo(-2, -2);
            star.closePath();
            star.fillPath();
            star.x = centerX + (Math.random() - 0.5) * 30;
            star.y = centerY;

            this.tweens.add({
                targets: star,
                y: centerY - 60 - Math.random() * 40,
                alpha: { from: 1, to: 0 },
                scale: { from: 1.5, to: 0.5 },
                duration: 800 + Math.random() * 400,
                delay: i * 100,
                ease: 'Cubic.easeOut',
                onComplete: () => star.destroy()
            });
        }

        // Pop Animation
        this.tweens.killTweensOf(building.graphics);
        if (building.baseGraphics) this.tweens.killTweensOf(building.baseGraphics);

        building.graphics.y = 0;
        if (building.baseGraphics) building.baseGraphics.y = 0;

        this.tweens.add({
            targets: building.graphics,
            y: -10,
            duration: 150,
            yoyo: true,
            ease: 'Quad.easeOut',
            onComplete: () => { building.graphics.y = 0; }
        });

        if (building.baseGraphics) {
            this.tweens.add({
                targets: building.baseGraphics,
                y: -5,
                duration: 150,
                yoyo: true,
                ease: 'Quad.easeOut',
                onComplete: () => { if (building.baseGraphics) building.baseGraphics.y = 0; }
            });
        }
    }

    // === BUILDING RANGE INDICATOR ===
    public showBuildingRangeIndicator(building: PlacedBuilding) {
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
        const center = IsoUtils.cartToIso(building.gridX + info.width / 2, building.gridY + info.height / 2);

        // Create range indicator graphics
        const rangeGraphics = this.add.graphics();
        rangeGraphics.setDepth(building.graphics.depth + 2);

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

    public clearBuildingRangeIndicator() {
        if (this.attackModeSelectedBuilding?.rangeIndicator) {
            this.attackModeSelectedBuilding.rangeIndicator.destroy();
            this.attackModeSelectedBuilding.rangeIndicator = undefined;
        }
        this.attackModeSelectedBuilding = null;
    }

    private handleCameraMovement(delta: number) {
        if (!this.cursorKeys) return;
        const speed = 0.5 * delta * this.cameraSensitivity;
        const movedX = this.cursorKeys.left?.isDown || this.cursorKeys.right?.isDown;
        const movedY = this.cursorKeys.up?.isDown || this.cursorKeys.down?.isDown;
        if (this.cursorKeys.left?.isDown) this.cameras.main.scrollX -= speed;
        else if (this.cursorKeys.right?.isDown) this.cameras.main.scrollX += speed;
        if (this.cursorKeys.up?.isDown) this.cameras.main.scrollY -= speed;
        else if (this.cursorKeys.down?.isDown) this.cameras.main.scrollY += speed;
        if (movedX || movedY) {
            this.hasUserMovedCamera = true;
        }
    }

    private updateSelectionHighlight() {
        if (!this.selectionGraphics) return;
        this.selectionGraphics.clear();

        if (this.mode === 'HOME' && this.selectedInWorld) {
            const b = this.selectedInWorld;
            const info = BUILDINGS[b.type];

            // When moving, draw outline at ghost position instead of actual position
            const gx = (this.isMoving && this.ghostGridPos) ? this.ghostGridPos.x : b.gridX;
            const gy = (this.isMoving && this.ghostGridPos) ? this.ghostGridPos.y : b.gridY;

            // Draw bright border around base
            const p1 = IsoUtils.cartToIso(gx, gy);
            const p2 = IsoUtils.cartToIso(gx + info.width, gy);
            const p3 = IsoUtils.cartToIso(gx + info.width, gy + info.height);
            const p4 = IsoUtils.cartToIso(gx, gy + info.height);

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

    private async flushPendingSaveForTransition() {
        const userId = this.userId;
        if (!Backend.hasPendingSave(userId)) return;

        const maxWaitMs = 1200;
        let timeoutHandle: number | null = null;
        const flushPromise = Backend.flushPendingSave();
        const timeoutPromise = new Promise<'timeout'>(resolve => {
            timeoutHandle = window.setTimeout(() => resolve('timeout'), maxWaitMs);
        });

        try {
            const result = await Promise.race([
                flushPromise.then(() => 'flushed' as const),
                timeoutPromise
            ]);
            if (timeoutHandle !== null) {
                window.clearTimeout(timeoutHandle);
            }
            if (result === 'timeout') {
                console.warn(`flushPendingSaveForTransition: continuing after ${maxWaitMs}ms budget`);
                void flushPromise.catch(error => {
                    console.warn('flushPendingSaveForTransition: background flush failed:', error);
                });
            }
        } catch (error) {
            console.warn('Failed to flush pending save before transition:', error);
        }
    }

    private showCloudTransition(onMidpoint: () => void | Promise<void>) {
        // Show React overlay to cover UI.
        gameManager.showCloudOverlay();

        // CSS cloud close animation is 600ms; add a small cushion before swapping scenes.
        const cloudCloseMs = 620;
        // Keep this short to reduce cloud time while still allowing one frame for draw completion.
        const readyBufferMs = 90;

        this.time.delayedCall(cloudCloseMs, () => {
            void Promise.resolve()
                .then(() => onMidpoint())
                .catch(error => {
                    console.error('Cloud transition midpoint failed:', error);
                })
                .finally(() => {
                    this.time.delayedCall(readyBufferMs, () => {
                        gameManager.hideCloudOverlay();
                    });
                });
        });
    }

    private createUI() {
        gameManager.registerScene({
            selectBuilding: (type: string | null) => {
                this.selectedBuildingType = type;
                this.isMoving = false;
                this.ghostGridPos = null;
                if (!this.selectedBuildingType) {
                    this.ghostBuilding.setVisible(false);
                } else {
                    // Immediately show ghost building by triggering onPointerMove
                    if (this.input.activePointer) {
                        this.inputController.onPointerMove(this.input.activePointer);
                    }
                }
            },
            startAttack: () => {
                this.showCloudTransition(async () => {
                    await this.flushPendingSaveForTransition();
                    this.snapshotPlayerBarracksLevel();
                    this.snapshotPlayerLabLevel();
                    // Set UI immediately
                    gameManager.setGameMode('ATTACK');
                    this.mode = 'ATTACK';
                    this.isScouting = false;

                    this.clearScene();
                    await this.generateEnemyVillage();
                    this.centerCamera();
                    // Initialize battle stats
                    this.initialEnemyBuildings = this.getAttackEnemyBuildings().length;
                    this.destroyedBuildings = 0;
                    this.solLooted = 0;
                    this.raidEndScheduled = false; // Reset for new raid
                    this.updateBattleStats();
                });
            },
            startPracticeAttack: () => {
                this.showCloudTransition(async () => {
                    await this.flushPendingSaveForTransition();
                    this.snapshotPlayerBarracksLevel();
                    this.snapshotPlayerLabLevel();
                    // Set UI immediately
                    gameManager.setGameMode('ATTACK');
                    this.mode = 'ATTACK';
                    this.isScouting = false;

                    this.clearScene();
                    // Load player's own base as the enemy
                    let playerWorld: SerializedWorld | null = null;
                    try {
                        playerWorld = await Backend.getWorld(this.userId);
                    } catch (error) {
                        console.error('startPracticeAttack: failed to load player world', error);
                    }

                    let loadedPracticeBase = false;
                    if (playerWorld && Array.isArray(playerWorld.buildings) && playerWorld.buildings.length > 0) {
                        const summary = this.instantiateEnemyWorld(playerWorld, {
                            id: 'practice',
                            username: 'Your Base',
                            isBot: true
                        });
                        loadedPracticeBase = summary.playablePlaced > 0;
                        if (!loadedPracticeBase) {
                            console.warn('startPracticeAttack: player world had no playable structures, using fallback practice base', {
                                worldId: playerWorld.id,
                                summary
                            });
                        }
                    }

                    if (!loadedPracticeBase) {
                        // Fallback to local visual-only base if player world fails to load.
                        // Do not call placeBuilding here, to avoid mutating/saving the player's home world.
                        const fallbackWorld: SerializedWorld = {
                            id: `practice_fallback_${Date.now()}`,
                            ownerId: 'practice',
                            username: 'Default Base',
                            buildings: [
                                { id: Phaser.Utils.String.UUID(), type: 'town_hall', gridX: 11, gridY: 11, level: 1 },
                                { id: Phaser.Utils.String.UUID(), type: 'cannon', gridX: 8, gridY: 11, level: 1 },
                                { id: Phaser.Utils.String.UUID(), type: 'barracks', gridX: 15, gridY: 11, level: 1 },
                                { id: Phaser.Utils.String.UUID(), type: 'army_camp', gridX: 11, gridY: 15, level: 1 },
                                { id: Phaser.Utils.String.UUID(), type: 'solana_collector', gridX: 14, gridY: 14, level: 1 }
                            ],
                            obstacles: [],
                            resources: { sol: 0 },
                            army: {},
                            wallLevel: 1,
                            lastSaveTime: Date.now(),
                            revision: 1
                        };
                        const fallbackSummary = this.instantiateEnemyWorld(fallbackWorld, {
                            id: 'practice',
                            username: 'Default Base',
                            isBot: true
                        });
                        loadedPracticeBase = fallbackSummary.playablePlaced > 0;
                        if (!loadedPracticeBase) {
                            console.error('startPracticeAttack: fallback visual base failed to instantiate', fallbackSummary);
                        }
                        this.currentEnemyWorld = {
                            id: 'practice',
                            username: 'Default Base',
                            isBot: true
                        };
                    }
                    this.updateVillageName();
                    this.centerCamera();
                    // Initialize battle stats
                    this.initialEnemyBuildings = this.getAttackEnemyBuildings().length;
                    this.destroyedBuildings = 0;
                    this.solLooted = 0;
                    this.raidEndScheduled = false;
                    this.updateBattleStats();
                });
            },
            startOnlineAttack: () => {
                this.showCloudTransition(async () => {
                    await this.flushPendingSaveForTransition();
                    this.snapshotPlayerBarracksLevel();
                    this.snapshotPlayerLabLevel();
                    // Set UI immediately
                    gameManager.setGameMode('ATTACK');
                    this.mode = 'ATTACK';
                    this.isScouting = false;

                    this.clearScene();
                    // Load a random online player's base
                    await this.generateOnlineEnemyVillage();
                    this.centerCamera();
                    // Initialize battle stats
                    this.initialEnemyBuildings = this.getAttackEnemyBuildings().length;
                    this.destroyedBuildings = 0;
                    this.solLooted = 0;
                    this.raidEndScheduled = false;
                    this.updateBattleStats();
                });
            },
            startAttackOnUser: (userId: string, username: string) => {
                this.showCloudTransition(async () => {
                    await this.flushPendingSaveForTransition();
                    this.snapshotPlayerBarracksLevel();
                    this.snapshotPlayerLabLevel();
                    // Set UI immediately
                    gameManager.setGameMode('ATTACK');
                    this.mode = 'ATTACK';
                    this.isScouting = false;

                    this.clearScene();
                    // Load the specific user's base
                    const success = await this.generateEnemyVillageFromUser(userId, username);
                    if (!success) {
                        // Fallback to random if user has no base
                        await this.generateOnlineEnemyVillage();
                    }
                    this.centerCamera();
                    // Initialize battle stats
                    this.initialEnemyBuildings = this.getAttackEnemyBuildings().length;
                    this.destroyedBuildings = 0;
                    this.solLooted = 0;
                    this.raidEndScheduled = false;
                    this.updateBattleStats();
                });
            },
            startScoutOnUser: (userId: string, username: string) => {
                this.showCloudTransition(async () => {
                    await this.flushPendingSaveForTransition();
                    this.snapshotPlayerBarracksLevel();
                    this.snapshotPlayerLabLevel();
                    gameManager.setGameMode('ATTACK');
                    this.mode = 'ATTACK';
                    this.isScouting = true;

                    this.clearScene();
                    const success = await this.generateEnemyVillageFromUser(userId, username);
                    if (!success) {
                        await this.generateOnlineEnemyVillage();
                    }
                    this.centerCamera();
                    this.initialEnemyBuildings = this.getAttackEnemyBuildings().length;
                    this.destroyedBuildings = 0;
                    this.solLooted = 0;
                    this.raidEndScheduled = false;
                    this.updateBattleStats();
                });
            },
            findNewMap: () => {
                // Only allow if no troops have been deployed yet
                const deployedTroops = this.troops.filter(t => t.owner === 'PLAYER').length;
                if (deployedTroops > 0) {
                    // Could show feedback here, but for now just don't do anything
                    return;
                }

                this.showCloudTransition(async () => {
                    // Clear and regenerate enemy village
                    this.clearScene();
                    await this.generateEnemyVillage();
                    this.centerCamera();
                    // Reset battle stats for new village
                    this.initialEnemyBuildings = this.getAttackEnemyBuildings().length;
                    this.destroyedBuildings = 0;
                    this.solLooted = 0;
                    this.updateBattleStats();
                });
            },
            deleteSelectedBuilding: () => {
                if (this.selectedInWorld) this.destroyBuilding(this.selectedInWorld);
                this.selectedInWorld = null;
            },
            moveSelectedBuilding: () => {
                if (this.selectedInWorld) {
                    // Unbake the building from ground texture before moving to prevent artifacts
                    this.unbakeBuildingFromGround(this.selectedInWorld);
                }
                this.isMoving = true;
                this.selectedBuildingType = null;
                // Immediate visual feedback
                this.inputController.onPointerMove(this.input.activePointer);
            },
            toggleDummyTroop: () => {
                this.toggleDummyTroop();
            },
            upgradeSelectedBuilding: () => {
                if (this.selectedInWorld) {
                    const prevLevel = this.selectedInWorld.level || 1;
                    const maxLvl = BUILDINGS[this.selectedInWorld.type]?.maxLevel ?? 1;
                    if (prevLevel >= maxLvl) return null;
                    this.selectedInWorld.level = prevLevel + 1;
                    const stats = getBuildingStats(this.selectedInWorld.type as BuildingType, this.selectedInWorld.level);
                    this.selectedInWorld.maxHealth = stats.maxHealth;
                    this.selectedInWorld.health = stats.maxHealth;
                    this.selectedInWorld.graphics.clear();
                    if (this.selectedInWorld.baseGraphics) this.selectedInWorld.baseGraphics.clear();
                    this.drawBuildingVisuals(this.selectedInWorld.graphics, this.selectedInWorld.gridX, this.selectedInWorld.gridY, this.selectedInWorld.type, 1, null, this.selectedInWorld, this.selectedInWorld.baseGraphics);
                    this.updateHealthBar(this.selectedInWorld);

                    // Re-bake base at new level
                    this.unbakeBuildingFromGround(this.selectedInWorld);
                    this.bakeBuildingToGround(this.selectedInWorld);

                    // Play effect for the main building
                    this.playUpgradeEffect(this.selectedInWorld);

                    // COHERENT UPDATE: If Wall, upgrade ALL other walls of the previous level
                    if (this.selectedInWorld.type === 'wall') {
                        this.preferredWallLevel = Math.max(this.preferredWallLevel, this.selectedInWorld.level || 1);
                        this.buildings.forEach(b => {
                            if (b.type === 'wall' && b.id !== this.selectedInWorld!.id && (b.level || 1) === prevLevel) {
                                b.level = this.selectedInWorld!.level;
                                b.maxHealth = stats.maxHealth;
                                b.health = b.maxHealth;
                                b.graphics.clear();
                                if (b.baseGraphics) b.baseGraphics.clear();
                                this.drawBuildingVisuals(b.graphics, b.gridX, b.gridY, b.type, 1, null, b, b.baseGraphics);
                                // Play effect for each wall
                                this.playUpgradeEffect(b);
                            }
                        });
                    }

                    // Refresh camp capacity if an army camp was upgraded
                    if (this.selectedInWorld.type === 'army_camp') {
                        const campLevels = this.buildings.filter(b => b.type === 'army_camp').map(b => b.level ?? 1);
                        gameManager.refreshCampCapacity(campLevels);
                    }
                    if (this.selectedInWorld.type === 'barracks' && this.selectedInWorld.owner === 'PLAYER') {
                        this.playerBarracksLevel = Math.max(this.playerBarracksLevel, this.selectedInWorld.level || 1);
                    }
                    if (this.selectedInWorld.type === 'lab' && this.selectedInWorld.owner === 'PLAYER') {
                        this.playerLabLevel = Math.max(this.playerLabLevel, this.selectedInWorld.level || 1);
                    }

                    // NOTE: Do NOT call Backend.upgradeBuilding here.
                    // App.tsx handleUpgradeBuilding already calls it before
                    // invoking this scene command. Calling it twice would
                    // double-increment the building level in the cached world.

                    return this.selectedInWorld.level;
                }
                return null;
            }
        });
    }

    public async goHome() {
        this.cancelPlacement();
        gameManager.setGameMode('HOME');
        this.mode = 'HOME';
        this.isScouting = false;
        this.hasDeployed = false;
        await this.reloadHomeBase({ refreshOnline: true });
    }


    private clearScene() {
        // Clear all buildings and their associated graphics
        this.buildings.forEach(b => {
            b.graphics.destroy();
            if (b.baseGraphics) b.baseGraphics.destroy();
            if (b.barrelGraphics) b.barrelGraphics.destroy();
            if (b.prismLaserGraphics) b.prismLaserGraphics.destroy();
            if (b.prismLaserCore) b.prismLaserCore.destroy();
            if (b.rangeIndicator) b.rangeIndicator.destroy();
            b.healthBar.destroy();
        });
        this.buildings = [];

        // Clear all troops
        this.troops.forEach(t => { t.gameObject.destroy(); t.healthBar.destroy(); });
        this.troops = [];

        // Clear spike zones
        this.spikeZones.forEach(zone => zone.graphics.destroy());
        this.spikeZones = [];

        // Clear lava zones
        this.lavaZones.forEach(zone => zone.graphics.destroy());
        this.lavaZones = [];

        // Clear rubble and obstacles
        this.clearRubble();
        this.clearObstacles();

        // Reset selection state
        this.dummyTroop = null;
        this.attackModeSelectedBuilding = null;
        this.selectedInWorld = null;
        this.selectedBuildingType = null;
        this.isMoving = false;
        this.ghostGridPos = null;
        this.hasDeployed = false;
        this.lastDeployTime = 0;
        this.deployStartTime = 0;

        // Clear all UI overlay graphics
        this.ghostBuilding.clear();
        this.ghostBuilding.setVisible(false);
        this.selectionGraphics.clear();
        this.deploymentGraphics.clear();
        this.deploymentGraphics.setVisible(false);
        this.forbiddenGraphics.clear();
        this.forbiddenGraphics.setVisible(false);

        this.setVillageNameVisible(true);

        // Reset ground render texture - clear all baked building bases and redraw grass
        this.resetGroundTexture();

        // Update village name for new scene
        this.updateVillageName();
    }

    /**
     * Reset the ground render texture by clearing it and redrawing all grass tiles.
     * Call this when switching between villages to remove baked building bases.
     */
    private resetGroundTexture() {
        if (!this.groundRenderTexture || !this.tempGraphics) return;

        // Clear the entire texture
        this.groundRenderTexture.clear();

        // Redraw all grass tiles
        for (let x = 0; x < this.mapSize; x++) {
            for (let y = 0; y < this.mapSize; y++) {
                this.tempGraphics.clear();
                this.drawIsoTile(this.tempGraphics, x, y);
                this.groundRenderTexture.draw(this.tempGraphics, this.RT_OFFSET_X, this.RT_OFFSET_Y);
            }
        }
    }

    private instantiateEnemyWorld(
        world: SerializedWorld,
        meta: { id: string; username: string; isBot: boolean; attackId?: string }
    ): EnemyInstantiationSummary {
        const enemyBuildings = Array.isArray(world.buildings) ? world.buildings : [];
        const summary: EnemyInstantiationSummary = {
            requested: enemyBuildings.length,
            prepared: 0,
            placed: 0,
            playablePlaced: 0,
            skippedUnknownType: 0,
            skippedOutOfBounds: 0,
            failedInstantiation: 0
        };
        if (enemyBuildings.length === 0) return summary;

        const preparedBuildings: SerializedBuilding[] = [];
        enemyBuildings.forEach(rawBuilding => {
            const normalizedType = this.normalizeBuildingType(String((rawBuilding as { type?: unknown }).type ?? ''));
            if (!normalizedType) {
                summary.skippedUnknownType++;
                return;
            }

            const definition = BUILDINGS[normalizedType];
            const rawX = Number((rawBuilding as { gridX?: unknown }).gridX);
            const rawY = Number((rawBuilding as { gridY?: unknown }).gridY);
            if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
                summary.skippedOutOfBounds++;
                return;
            }

            const gridX = Math.floor(rawX);
            const gridY = Math.floor(rawY);
            const inBounds = gridX >= 0 && gridY >= 0 && gridX + definition.width <= this.mapSize && gridY + definition.height <= this.mapSize;
            if (!inBounds) {
                summary.skippedOutOfBounds++;
                return;
            }

            const rawLevel = Number((rawBuilding as { level?: unknown }).level ?? 1);
            const level = Number.isFinite(rawLevel) ? Math.max(1, Math.floor(rawLevel)) : 1;
            const rawId = (rawBuilding as { id?: unknown }).id;
            const id = typeof rawId === 'string' && rawId.length > 0 ? rawId : Phaser.Utils.String.UUID();

            preparedBuildings.push({
                id,
                type: normalizedType as BuildingType,
                gridX,
                gridY,
                level
            });
        });
        summary.prepared = preparedBuildings.length;
        if (summary.prepared === 0) {
            console.warn('instantiateEnemyWorld: no valid enemy buildings after sanitization', {
                worldId: world.id,
                username: meta.username,
                summary
            });
            return summary;
        }

        this.currentEnemyWorld = meta;
        const lootAmount = Math.max(0, Math.floor(world.resources?.sol ?? 0));
        const lootMap = LootSystem.calculateLootDistribution(preparedBuildings, lootAmount);

        preparedBuildings.forEach(building => {
            try {
                const inst = this.instantiateBuilding(building, 'ENEMY');
                if (!inst) {
                    summary.failedInstantiation++;
                    return;
                }
                inst.loot = lootMap.get(building.id);
                summary.placed++;
                if (inst.type !== 'wall') {
                    summary.playablePlaced++;
                }
            } catch (error) {
                summary.failedInstantiation++;
                console.error('instantiateEnemyWorld: building instantiation failed', {
                    worldId: world.id,
                    buildingId: building.id,
                    buildingType: building.type,
                    error
                });
            }
        });

        if (summary.playablePlaced > 0) {
            this.setVillageNameVisible(true);
            this.updateVillageName();
        } else {
            console.warn('instantiateEnemyWorld: enemy world had no playable buildings after instantiation', {
                worldId: world.id,
                username: meta.username,
                summary
            });
        }

        return summary;
    }

    private spawnEmergencyEnemyVillage() {
        const cx = 11;
        const cy = 11;
        const fallbackWorld: SerializedWorld = {
            id: `bot_fallback_${Date.now()}`,
            ownerId: 'bot',
            username: 'Bot Base',
            buildings: [
                { id: Phaser.Utils.String.UUID(), type: 'town_hall', gridX: cx, gridY: cy, level: 1 },
                { id: Phaser.Utils.String.UUID(), type: 'cannon', gridX: cx - 3, gridY: cy, level: 1 },
                { id: Phaser.Utils.String.UUID(), type: 'barracks', gridX: cx + 4, gridY: cy, level: 1 },
                { id: Phaser.Utils.String.UUID(), type: 'army_camp', gridX: cx, gridY: cy + 4, level: 1 },
                { id: Phaser.Utils.String.UUID(), type: 'solana_collector', gridX: cx + 3, gridY: cy + 3, level: 1 }
            ],
            obstacles: [],
            resources: { sol: 30000 },
            army: {},
            lastSaveTime: Date.now(),
            revision: 1
        };

        const fallbackSummary = this.instantiateEnemyWorld(fallbackWorld, {
            id: fallbackWorld.id,
            username: fallbackWorld.username || 'Bot Base',
            isBot: true
        });
        if (fallbackSummary.playablePlaced === 0) {
            console.error('spawnEmergencyEnemyVillage: fallback world failed to instantiate playable structures', fallbackSummary);
        }
    }

    private async generateEnemyVillage() {
        const maxAttempts = 4;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const enemyWorld = await Backend.generateEnemyWorld();
                // Give fake resources for loot
                enemyWorld.resources = {
                    sol: Math.floor(20000 + Math.random() * 80000)
                };

                const summary = this.instantiateEnemyWorld(enemyWorld, {
                    id: enemyWorld.id,
                    username: enemyWorld.username || 'Bot Base',
                    isBot: true
                });

                if (summary.playablePlaced > 0) return;
                console.warn('generateEnemyVillage: generated world had no playable buildings', {
                    attempt: attempt + 1,
                    worldId: enemyWorld.id,
                    summary
                });
            } catch (error) {
                console.error('generateEnemyVillage: enemy generation attempt failed', {
                    attempt: attempt + 1,
                    error
                });
            }
            this.clearScene();
        }

        this.spawnEmergencyEnemyVillage();
    }

    // Load an online player's base for attack
    public async generateOnlineEnemyVillage(): Promise<boolean> {
        let onlineBase: SerializedWorld | null = null;
        try {
            onlineBase = await Backend.getOnlineBase(this.userId);
        } catch (error) {
            console.error('generateOnlineEnemyVillage: failed to load online base', error);
        }
        if (!onlineBase || !Array.isArray(onlineBase.buildings) || onlineBase.buildings.length === 0) {
            // Fallback to procedural generation if no online bases
            await this.generateEnemyVillage();
            return false;
        }

        const summary = this.instantiateEnemyWorld(onlineBase, {
            id: onlineBase.ownerId,
            username: onlineBase.username || 'Unknown Player',
            isBot: Boolean((onlineBase as { isBot?: boolean }).isBot),
            attackId: Phaser.Utils.String.UUID()
        });
        if (summary.playablePlaced === 0) {
            console.warn('generateOnlineEnemyVillage: online world had no playable buildings, falling back to bot base', {
                worldId: onlineBase.id,
                ownerId: onlineBase.ownerId,
                summary
            });
            this.clearScene();
            await this.generateEnemyVillage();
            return false;
        }
        return true;
    }

    // Load a specific user's base for attack (from leaderboard)
    public async generateEnemyVillageFromUser(userId: string, username: string): Promise<boolean> {
        let userBase: SerializedWorld | null = null;
        try {
            userBase = await Backend.loadFromCloud(userId);
        } catch (error) {
            console.error('generateEnemyVillageFromUser: failed to load user base', { userId, error });
        }
        if (!userBase || !Array.isArray(userBase.buildings) || userBase.buildings.length === 0) {
            return false;
        }

        const summary = this.instantiateEnemyWorld(userBase, {
            id: userId,
            username: username,
            isBot: false,
            attackId: Phaser.Utils.String.UUID()
        });
        if (summary.playablePlaced === 0) {
            console.warn('generateEnemyVillageFromUser: loaded user base had no playable buildings', {
                userId,
                worldId: userBase.id,
                summary
            });
        }
        return summary.playablePlaced > 0;
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
        return TargetingSystem.findTarget(ward, this.buildings);
    }
    public createSmokeEffect(x: number, y: number, count: number = 5, scale: number = 1, duration: number = 800) {
        for (let i = 0; i < count; i++) {
            this.time.delayedCall(i * 40, () => {
                particleManager.spawn({
                    x: x + (Math.random() - 0.5) * 25,
                    y: y + (Math.random() - 0.5) * 15,
                    depth: 10005,
                    duration: duration + Math.random() * (duration * 0.5),
                    rotation: Math.random() * Math.PI * 2,
                    scale: 2.2 * scale,
                    alpha: 0,
                    move: {
                        x: x + (Math.random() - 0.5) * 50 * scale, // note: original logic used smoke.x which was random, so passing approximated random here
                        y: y - (60 + Math.random() * 60) * scale
                    },
                    onDraw: (g) => {
                        const size = (4 + Math.random() * 6) * scale;
                        g.fillStyle(0x757575, 0.35);
                        g.fillRect(-size / 2, -size / 2, size, size);
                    }
                });
            });
        }
    }

    private shootDragonsBreathAt(db: PlacedBuilding, troop: Troop) {
        const info = BUILDING_DEFINITIONS['dragons_breath'];
        const start = IsoUtils.cartToIso(db.gridX + info.width / 2, db.gridY + info.height / 2);
        const stats = this.getDefenseStats(db);
        const range = stats.range || 13;

        // Find all potential targets in range to distribute pods
        const potentialTargets = this.troops.filter(t =>
            t.owner !== db.owner &&
            t.health > 0 &&
            Phaser.Math.Distance.Between(db.gridX, db.gridY, t.gridX, t.gridY) <= range
        );

        // Screenshake for the start of the massive salvo
        this.cameras.main.shake(75, 0.002);

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
        const end = IsoUtils.cartToIso(targetGridX, targetGridY);

        // Create firecracker rocket graphics
        const pod = this.add.graphics();
        const startX = start.x + (Math.random() - 0.5) * 60; // Spread out launch positions
        const startY = start.y - 30;
        pod.setPosition(startX, startY);
        pod.setDepth(5000);

        // Draw the firecracker rocket shape (drawn vertically, then rotated via setRotation)
        const drawRocket = () => {
            pod.clear();

            // Rocket body (red)
            pod.fillStyle(0xcc2222, 1);
            pod.fillRect(-4, -10, 8, 18);

            // Gold bands
            pod.fillStyle(0xffd700, 1);
            pod.fillRect(-5, -10, 10, 3);
            pod.fillRect(-5, 5, 10, 3);

            // Gold tip
            pod.fillStyle(0xb8860b, 1);
            pod.beginPath();
            pod.moveTo(0, -14);
            pod.lineTo(-4, -10);
            pod.lineTo(4, -10);
            pod.closePath();
            pod.fillPath();

            // Exhaust flame
            pod.fillStyle(0xff6600, 0.9);
            pod.beginPath();
            pod.moveTo(-3, 8);
            pod.lineTo(0, 16);
            pod.lineTo(3, 8);
            pod.closePath();
            pod.fillPath();

            pod.fillStyle(0xffff00, 0.8);
            pod.beginPath();
            pod.moveTo(-2, 8);
            pod.lineTo(0, 12);
            pod.lineTo(2, 8);
            pod.closePath();
            pod.fillPath();
        };

        // Initial draw
        drawRocket();

        const midY = (start.y + end.y) / 2 - 200; // Arc height
        const dist = Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y);
        let lastX = startX;
        let lastY = startY;

        this.tweens.add({
            targets: pod,
            x: end.x,
            duration: dist / 0.4 + Math.random() * 100,
            ease: 'Linear',
            onUpdate: (tween) => {
                const t = tween.progress;
                // Bezier curve for arc
                pod.y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * midY + t * t * end.y;

                // Calculate angle for rocket orientation and rotate the graphics object
                const angle = Math.atan2(pod.y - lastY, pod.x - lastX);
                pod.setRotation(angle + Math.PI / 2);
                drawRocket();

                // Dense smoke trail
                if (Math.random() > 0.4) {
                    const smoke = this.add.graphics();
                    const smokeSize = 3 + Math.random() * 4;
                    smoke.fillStyle(0x666666, 0.5);
                    smoke.fillCircle(0, 0, smokeSize);
                    smoke.setPosition(pod.x + (Math.random() - 0.5) * 6, pod.y + 8);
                    smoke.setDepth(4998);

                    this.tweens.add({
                        targets: smoke,
                        y: smoke.y + 15,
                        x: smoke.x + (Math.random() - 0.5) * 20,
                        alpha: 0,
                        scale: 2.5,
                        duration: 400,
                        ease: 'Quad.easeOut',
                        onComplete: () => smoke.destroy()
                    });
                }

                // Fire sparks
                if (Math.random() > 0.7) {
                    const spark = this.add.graphics();
                    spark.fillStyle(0xffaa00, 0.9);
                    spark.fillRect(-1, -1, 2, 2);
                    spark.setPosition(pod.x + (Math.random() - 0.5) * 4, pod.y + 10);
                    spark.setDepth(4999);
                    this.tweens.add({
                        targets: spark,
                        alpha: 0,
                        y: spark.y + 10,
                        scale: 0.5,
                        duration: 150,
                        onComplete: () => spark.destroy()
                    });
                }

                lastX = pod.x;
                lastY = pod.y;
            },
            onComplete: () => {
                pod.destroy();

                // Explosion effect (isometric oval)
                const boom = this.add.graphics();
                boom.fillStyle(0xff4400, 0.8);
                boom.fillEllipse(0, 0, 24, 12);
                boom.setPosition(end.x, end.y);
                boom.setDepth(5001);
                this.tweens.add({ targets: boom, alpha: 0, scale: 2.5, duration: 200, onComplete: () => boom.destroy() });

                // Inner flash
                const flash = this.add.graphics();
                flash.fillStyle(0xffff00, 0.9);
                flash.fillEllipse(0, 0, 12, 6);
                flash.setPosition(end.x, end.y);
                flash.setDepth(5002);
                this.tweens.add({ targets: flash, alpha: 0, scale: 2, duration: 100, onComplete: () => flash.destroy() });

                // Debris sparks
                for (let i = 0; i < 6; i++) {
                    const debris = this.add.graphics();
                    debris.fillStyle(0xff6600, 0.8);
                    debris.fillRect(-1, -1, 2, 2);
                    debris.setPosition(end.x, end.y);
                    debris.setDepth(5000);

                    const angle = Math.random() * Math.PI * 2;
                    const dist = 15 + Math.random() * 20;
                    this.tweens.add({
                        targets: debris,
                        x: end.x + Math.cos(angle) * dist,
                        y: end.y + Math.sin(angle) * dist * 0.5,
                        alpha: 0,
                        duration: 300,
                        onComplete: () => debris.destroy()
                    });
                }

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

    // ===== SPIKE LAUNCHER =====
    public spikeZones: { x: number; y: number; gridX: number; gridY: number; radius: number; damage: number; owner: 'PLAYER' | 'ENEMY'; endTime: number; graphics: Phaser.GameObjects.Graphics; lastTickTime: number }[] = [];

    public lavaZones: { gridX: number; gridY: number; width: number; height: number;
        damage: number; owner: 'PLAYER' | 'ENEMY'; endTime: number;
        graphics: Phaser.GameObjects.Graphics; lastTickTime: number; createdAt: number }[] = [];

    private shootSpikeLauncherAt(launcher: PlacedBuilding, troop: Troop) {
        const info = BUILDINGS['spike_launcher'];
        const stats = this.getDefenseStats(launcher);
        const zoneDamage = stats.damage ?? 38;
        const impactDamage = Math.round(zoneDamage * 1.45);
        const level = launcher.level || 1;
        const zoneRadius = level >= 2 ? 2.4 : 2.1;
        const zoneDuration = 3600 + level * 400;
        const start = IsoUtils.cartToIso(launcher.gridX + info.width / 2, launcher.gridY + info.height / 2);
        const end = IsoUtils.cartToIso(troop.gridX, troop.gridY);
        const targetGridX = troop.gridX;
        const targetGridY = troop.gridY;

        // Calculate angle for trebuchet arm
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        launcher.ballistaAngle = angle;

        // SPIKY projectile - level-dependent appearance
        const bag = this.add.graphics();
        const spikeScale = level >= 4 ? 1.3 : (level >= 3 ? 1.2 : 1.0);
        let coreColor: number, spikeColor: number, highlightColor: number;
        if (level >= 4) {
            // White marble boulder with gold spikes
            coreColor = 0xeeeedd;
            spikeColor = 0xdaa520;
            highlightColor = 0xffd700;
        } else if (level >= 3) {
            // Dark iron with red-hot tips
            coreColor = 0x333333;
            spikeColor = 0x888888;
            highlightColor = 0xcc3300;
        } else {
            // Basic grey
            coreColor = 0x555555;
            spikeColor = 0xaaaaaa;
            highlightColor = 0xcccccc;
        }
        // Core/base
        bag.fillStyle(coreColor, 1);
        bag.fillCircle(0, 0, 6 * spikeScale);
        // Spikes
        bag.fillStyle(spikeColor, 1);
        const s = spikeScale;
        // Top spikes
        bag.fillTriangle(0, -6*s, -3*s, -14*s, 3*s, -14*s);
        bag.fillTriangle(-4*s, -5*s, -8*s, -12*s, -2*s, -10*s);
        bag.fillTriangle(4*s, -5*s, 8*s, -12*s, 2*s, -10*s);
        // Bottom spikes
        bag.fillTriangle(0, 6*s, -3*s, 14*s, 3*s, 14*s);
        bag.fillTriangle(-4*s, 5*s, -8*s, 12*s, -2*s, 10*s);
        bag.fillTriangle(4*s, 5*s, 8*s, 12*s, 2*s, 10*s);
        // Side spikes
        bag.fillTriangle(-6*s, 0, -14*s, -3*s, -14*s, 3*s);
        bag.fillTriangle(6*s, 0, 14*s, -3*s, 14*s, 3*s);
        bag.fillTriangle(-5*s, -4*s, -12*s, -8*s, -10*s, -2*s);
        bag.fillTriangle(5*s, -4*s, 12*s, -8*s, 10*s, -2*s);
        bag.fillTriangle(-5*s, 4*s, -12*s, 8*s, -10*s, 2*s);
        bag.fillTriangle(5*s, 4*s, 12*s, 8*s, 10*s, 2*s);
        // Spike highlights / tips
        bag.fillStyle(highlightColor, 0.8);
        bag.fillTriangle(0, -7*s, -1*s, -12*s, 1*s, -12*s);
        bag.fillTriangle(-6*s, -1*s, -12*s, 0, -12*s, 2*s);
        bag.fillTriangle(6*s, -1*s, 12*s, 0, 12*s, 2*s);

        bag.setPosition(start.x, start.y - 40);
        bag.setDepth(5000);
        bag.setAlpha(0);

        // Fade in AFTER ball is farther from trebuchet (looks natural when shooting down)
        this.tweens.add({
            targets: bag,
            alpha: 1,
            delay: 300, // Wait until ball is a bit away from trebuchet
            duration: 80,
            ease: 'Linear'
        });

        // SHALLOW arc trajectory
        const arcHeight = 60;
        const midY = (start.y + end.y) / 2 - arcHeight;
        const dist = Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y);

        // Spike trail effect
        let lastTrailTime = 0;

        // Delay projectile movement to sync with trebuchet release animation
        this.tweens.add({
            targets: bag,
            x: end.x,
            delay: 150, // Wait for trebuchet to release
            duration: dist / 0.45,
            ease: 'Linear',
            onUpdate: (tween) => {
                const t = tween.progress;
                // Shallow bezier arc
                bag.y = (1 - t) * (1 - t) * (start.y - 40) + 2 * (1 - t) * t * midY + t * t * end.y;
                // Spin rotation
                bag.setRotation(t * Math.PI * 2.5);
                // Scale
                const scale = 0.7 + (1 - Math.abs(t - 0.5) * 2) * 0.4;
                bag.setScale(scale);

                // Drop spike trail every ~80ms
                const now = this.time.now;
                if (now - lastTrailTime > 80 && t > 0.1 && t < 0.9) {
                    lastTrailTime = now;
                    const trailSpike = this.add.graphics();
                    trailSpike.fillStyle(0x888888, 0.7);
                    // Small falling spike
                    trailSpike.fillTriangle(0, -4, -2, 4, 2, 4);
                    trailSpike.setPosition(bag.x + (Math.random() - 0.5) * 10, bag.y);
                    trailSpike.setDepth(4999);
                    trailSpike.setRotation(Math.random() * Math.PI);

                    this.tweens.add({
                        targets: trailSpike,
                        y: trailSpike.y + 40 + Math.random() * 30,
                        alpha: 0,
                        rotation: trailSpike.rotation + Math.PI,
                        duration: 400,
                        onComplete: () => trailSpike.destroy()
                    });
                }
            },
            onComplete: () => {
                bag.destroy();
                this.createSpikeZone(end.x, end.y, targetGridX, targetGridY, launcher.owner, zoneDamage, zoneRadius, zoneDuration, impactDamage);
            }
        });

        // Launch smoke puff
        this.createSmokeEffect(start.x, start.y - 35, 4, 0.5, 600);
    }

    private createSpikeZone(
        x: number,
        y: number,
        gridX: number,
        gridY: number,
        owner: 'PLAYER' | 'ENEMY',
        damage: number,
        radius: number,
        duration: number,
        impactDamage: number = Math.round(damage * 1.45)
    ) {
        // Camera shake on impact
        this.cameras.main.shake(25, 0.00075);

        // IMPACT SMOKE EFFECT (small puffs)
        this.createSmokeEffect(x, y - 5, 5, 0.5, 600);

        // IMPACT DAMAGE - immediate damage to troops in zone
        this.troops.forEach(t => {
            if (t.owner !== owner && t.health > 0) {
                const dist = Phaser.Math.Distance.Between(t.gridX, t.gridY, gridX, gridY);
                if (dist <= radius + 0.5) { // Slightly larger radius for impact
                    t.health -= impactDamage;
                    t.hasTakenDamage = true;
                    this.updateHealthBar(t);

                    // Impact flash
                    const pos = IsoUtils.cartToIso(t.gridX, t.gridY);
                    const flash = this.add.circle(pos.x, pos.y - 15, 8, 0xffaa00, 0.8);
                    flash.setDepth(t.gameObject.depth + 1);
                    this.tweens.add({
                        targets: flash,
                        scale: 2,
                        alpha: 0,
                        duration: 200,
                        onComplete: () => flash.destroy()
                    });

                    if (t.health <= 0) {
                        this.destroyTroop(t);
                    }
                }
            }
        });

        // Create persistent spike zone graphics
        const zoneGraphics = this.add.graphics();
        zoneGraphics.setDepth(2);

        // Draw scattered spikes on ground
        const drawSpikes = (alpha: number) => {
            zoneGraphics.clear();
            const footprintScale = Math.max(0.85, radius / 2);

            // Dark ground patch
            zoneGraphics.fillStyle(0x3a3020, alpha * 0.5);
            zoneGraphics.fillEllipse(x, y + 3, 55 * footprintScale, 28 * footprintScale);

            // Scattered metal spikes (caltrops)
            const spikePositions = [
                { dx: 0, dy: 0 },
                { dx: -15, dy: -5 },
                { dx: 12, dy: -3 },
                { dx: -8, dy: 8 },
                { dx: 18, dy: 6 },
                { dx: -20, dy: 2 },
                { dx: 5, dy: -10 },
                { dx: -12, dy: -8 },
                { dx: 22, dy: -2 },
                { dx: -5, dy: 10 },
                { dx: 10, dy: 9 },
                { dx: -18, dy: 7 }
            ];

            spikePositions.forEach((pos, i) => {
                const sx = x + pos.dx;
                const sy = y + pos.dy;

                // Metal spikes (4-pointed caltrops)
                zoneGraphics.fillStyle(0x666666, alpha);
                // Upward spike
                zoneGraphics.fillTriangle(sx, sy - 6, sx - 2, sy, sx + 2, sy);
                // Side spikes
                zoneGraphics.fillTriangle(sx - 5, sy + 2, sx, sy, sx, sy + 3);
                zoneGraphics.fillTriangle(sx + 5, sy + 2, sx, sy, sx, sy + 3);
                // Highlight
                if (i % 3 === 0) {
                    zoneGraphics.fillStyle(0x999999, alpha * 0.7);
                    zoneGraphics.fillTriangle(sx - 1, sy - 5, sx, sy - 2, sx + 1, sy - 5);
                }
            });
        };

        drawSpikes(1);

        const zone = {
            x, y, gridX, gridY,
            radius,
            damage,
            owner,
            endTime: this.time.now + duration,
            graphics: zoneGraphics,
            lastTickTime: this.time.now
        };

        this.spikeZones.push(zone);
    }

    public updateSpikeZones() {
        const now = this.time.now;
        const toRemove: number[] = [];

        this.spikeZones.forEach((zone, index) => {
            // Check expiration
            if (now >= zone.endTime) {
                // Fade out
                this.tweens.add({
                    targets: zone.graphics,
                    alpha: 0,
                    duration: 500,
                    onComplete: () => zone.graphics.destroy()
                });
                toRemove.push(index);
                return;
            }

            // Damage tick (every 500ms)
            const tickInterval = 500;
            if (now >= zone.lastTickTime + tickInterval) {
                zone.lastTickTime = now;

                // Damage troops in zone
                this.troops.forEach(t => {
                    if (t.owner !== zone.owner && t.health > 0) {
                        const dist = Phaser.Math.Distance.Between(t.gridX, t.gridY, zone.gridX, zone.gridY);
                        if (dist <= zone.radius) {
                            t.health -= zone.damage;
                            t.hasTakenDamage = true;
                            this.updateHealthBar(t);

                            // Small blood/damage effect
                            const pos = IsoUtils.cartToIso(t.gridX, t.gridY);
                            const spark = this.add.circle(pos.x, pos.y - 10, 3, 0xff4444, 0.8);
                            spark.setDepth(t.gameObject.depth + 1);
                            this.tweens.add({
                                targets: spark,
                                y: pos.y - 20,
                                alpha: 0,
                                scale: 0.5,
                                duration: 200,
                                onComplete: () => spark.destroy()
                            });

                            if (t.health <= 0) {
                                this.destroyTroop(t);
                            }
                        }
                    }
                });
            }

            // Fade effect near end
            const remaining = zone.endTime - now;
            if (remaining < 1000) {
                zone.graphics.setAlpha(remaining / 1000);
            }
        });

        // Remove expired zones (reverse order to preserve indices)
        for (let i = toRemove.length - 1; i >= 0; i--) {
            this.spikeZones.splice(toRemove[i], 1);
        }
    }

    // ===== LAVA POOL (Magma Vent death zone) =====

    private createLavaPool(gridX: number, gridY: number, width: number, height: number, owner: 'PLAYER' | 'ENEMY', sourceLevel: number = 1) {
        const duration = 8000;
        const ventStats = getBuildingStats('magmavent', sourceLevel);
        const damage = Math.max(20, Math.round((ventStats.damage ?? 96) * 0.45));

        const zoneGraphics = this.add.graphics();
        zoneGraphics.setDepth(depthForRubble(gridX, gridY, width, height));

        // Initial draw
        RubbleRenderer.drawLavaPool(zoneGraphics, gridX, gridY, width, height, this.time.now, 1);

        const zone = {
            gridX, gridY, width, height,
            damage,
            owner,
            endTime: this.time.now + duration,
            graphics: zoneGraphics,
            lastTickTime: this.time.now,
            createdAt: this.time.now
        };

        this.lavaZones.push(zone);
    }

    public updateLavaZones() {
        const now = this.time.now;
        const toRemove: number[] = [];

        this.lavaZones.forEach((zone, index) => {
            // Check expiration
            if (now >= zone.endTime) {
                zone.graphics.destroy();
                toRemove.push(index);
                return;
            }

            // Damage tick (every 500ms)
            if (now >= zone.lastTickTime + 500) {
                zone.lastTickTime = now;

                // Damage troops standing in the building footprint
                this.troops.forEach(t => {
                    if (t.owner !== zone.owner && t.health > 0) {
                        if (t.gridX >= zone.gridX && t.gridX <= zone.gridX + zone.width &&
                            t.gridY >= zone.gridY && t.gridY <= zone.gridY + zone.height) {
                            t.health -= zone.damage;
                            t.hasTakenDamage = true;
                            this.updateHealthBar(t);

                            // Lava burn effect
                            const tPos = IsoUtils.cartToIso(t.gridX, t.gridY);
                            const burn = this.add.graphics();
                            burn.fillStyle(0xff5500, 0.8);
                            burn.fillCircle(0, 0, 4);
                            burn.fillStyle(0xffaa00, 0.6);
                            burn.fillCircle(0, -2, 2);
                            burn.setPosition(tPos.x, tPos.y - 8);
                            burn.setDepth(t.gameObject.depth + 1);
                            this.tweens.add({
                                targets: burn,
                                y: tPos.y - 25,
                                alpha: 0,
                                duration: 300,
                                onComplete: () => burn.destroy()
                            });

                            if (t.health <= 0) {
                                this.destroyTroop(t);
                            }
                        }
                    }
                });
            }

            // Calculate intensity for fade-out (last 1.5s)
            const remaining = zone.endTime - now;
            const intensity = remaining < 1500 ? remaining / 1500 : 1;

            // Redraw every frame for animation
            zone.graphics.clear();
            zone.graphics.setAlpha(intensity);
            RubbleRenderer.drawLavaPool(zone.graphics, zone.gridX, zone.gridY, zone.width, zone.height, now, intensity);
        });

        // Remove expired zones (reverse order)
        for (let i = toRemove.length - 1; i >= 0; i--) {
            this.lavaZones.splice(toRemove[i], 1);
        }
    }
}
