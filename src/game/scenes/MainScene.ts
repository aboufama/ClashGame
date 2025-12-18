
import Phaser from 'phaser';

interface BuildingInfo {
    type: string;
    color: number;
    width: number; // in grid cells
    height: number; // in grid cells
    name: string;
}

// Building categories for targeting
type BuildingCategory = 'defense' | 'resource' | 'military' | 'other';

interface BuildingInfoExt extends BuildingInfo {
    category: BuildingCategory;
}

const BUILDINGS: Record<string, BuildingInfoExt> = {
    town_hall: { type: 'town_hall', color: 0x3366ff, width: 2, height: 2, name: 'Town Hall', category: 'other' },
    barracks: { type: 'barracks', color: 0xff3333, width: 1, height: 1, name: 'Barracks', category: 'military' },
    cannon: { type: 'cannon', color: 0x333333, width: 1, height: 1, name: 'Cannon', category: 'defense' },
    ballista: { type: 'ballista', color: 0x8b4513, width: 1, height: 1, name: 'Ballista', category: 'defense' },
    xbow: { type: 'xbow', color: 0x8b008b, width: 2, height: 2, name: 'X-Bow', category: 'defense' },
    mine: { type: 'mine', color: 0xffaa00, width: 1, height: 1, name: 'Gold Mine', category: 'resource' },
    elixir_collector: { type: 'elixir_collector', color: 0x9b59b6, width: 1, height: 1, name: 'Elixir Collector', category: 'resource' },
    mortar: { type: 'mortar', color: 0x555555, width: 2, height: 2, name: 'Mortar', category: 'defense' },
    tesla: { type: 'tesla', color: 0x00ccff, width: 1, height: 1, name: 'Tesla Coil', category: 'defense' },
    wall: { type: 'wall', color: 0xcccccc, width: 1, height: 1, name: 'Wall', category: 'defense' },
    army_camp: { type: 'army_camp', color: 0x884422, width: 3, height: 3, name: 'Army Camp', category: 'military' },
};



interface PlacedBuilding {
    id: string;
    type: string;
    gridX: number;
    gridY: number;
    graphics: Phaser.GameObjects.Graphics;
    barrelGraphics?: Phaser.GameObjects.Graphics;
    healthBar: Phaser.GameObjects.Graphics;
    health: number;
    maxHealth: number;
    owner: 'PLAYER' | 'ENEMY';
    // Ballista-specific properties
    ballistaAngle?: number;        // Current angle in radians (0 = facing right/east)
    ballistaTargetAngle?: number;  // Target angle to smoothly rotate towards
    ballistaStringTension?: number; // 0 = relaxed, 1 = fully drawn back
    ballistaBoltLoaded?: boolean;   // Whether a bolt is ready to fire
    lastFireTime?: number;
    isFiring?: boolean;
}

interface Troop {
    id: string;
    type: 'warrior' | 'archer' | 'giant' | 'ward';
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
}


const TROOP_STATS = {
    warrior: { health: 100, range: 0.8, damage: 10, speed: 0.003, color: 0xffff00, space: 1 },
    archer: { health: 50, range: 4.5, damage: 3.5, speed: 0.0025, color: 0x00ffff, space: 1 },
    giant: { health: 500, range: 0.8, damage: 10, speed: 0.001, color: 0xff8800, space: 5 },
    ward: { health: 300, range: 5.0, damage: 3, speed: 0.0015, color: 0x00ff88, space: 3, healRadius: 7.0, healAmount: 8 }
};




export type GameMode = 'HOME' | 'ATTACK';

export class MainScene extends Phaser.Scene {
    private tileWidth = 64;
    private tileHeight = 32;
    private mapSize = 25;
    private buildings: PlacedBuilding[] = [];
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

    private destroyedBuildings = 0;
    private goldLooted = 0;
    private elixirLooted = 0;
    private hasDeployed = false;


    constructor() {
        super('MainScene');
    }

    preload() { }

    create() {
        this.cameras.main.setBackgroundColor('#2d2d2d');
        this.cameras.main.setZoom(1);

        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);

        this.input.on('wheel', (_pointer: any, _gameObjects: any, _deltaX: number, deltaY: number, _deltaZ: number) => {
            const newZoom = this.cameras.main.zoom - deltaY * 0.001;
            this.cameras.main.setZoom(Phaser.Math.Clamp(newZoom, 0.3, 3));
        });

        this.createIsoGrid();
        this.createUI();

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
        (window as any).onPlacementCancelled?.();
    }

    update(time: number, delta: number) {
        // Auto-end raid if all troops dead and no reserves
        if (this.mode === 'ATTACK' && this.hasDeployed) {
            const army = (window as any).getArmy ? (window as any).getArmy() : { warrior: 0, archer: 0, giant: 0, ward: 0 };
            const remaining = army.warrior + army.archer + army.giant + army.ward;
            const liveTroops = this.troops.filter(t => t.health > 0).length;

            if (remaining === 0 && liveTroops === 0) {
                // Call UI to end raid
                if ((window as any).onRaidEnded) {
                    (window as any).onRaidEnded(this.goldLooted, this.elixirLooted);
                }
            }
        }
        this.handleCameraMovement(delta);
        this.updateCombat(time);
        this.updateTroops(delta);
        this.updateResources(time);
        this.updateSelectionHighlight();
        this.updateDeploymentHighlight();
        this.updateBuildingAnimations(time);
    }

    private updateBuildingAnimations(_time: number) {
        // Redraw all buildings for idle animations
        this.buildings.forEach(b => {
            if (b.owner === 'PLAYER' || this.mode === 'ATTACK') {
                // Smoothly interpolate ballista and xbow angle towards target
                if ((b.type === 'ballista' || b.type === 'xbow') && b.ballistaTargetAngle !== undefined) {
                    const currentAngle = b.ballistaAngle ?? 0;
                    const targetAngle = b.ballistaTargetAngle;

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

                // Transparency near cursor (ghost building)
                let alpha = 1;
                if (this.mode === 'HOME' && this.selectedBuildingType) {
                    const dist = Phaser.Math.Distance.Between(b.gridX, b.gridY, this.hoverGrid.x, this.hoverGrid.y);
                    if (dist < 4) alpha = 0.4;
                }

                // All buildings now have animations for a lively feel
                b.graphics.clear();
                this.drawBuildingVisuals(b.graphics, b.gridX, b.gridY, b.type, alpha, null, b);
            }
        });
    }


    private saveBase() {
        if (this.mode !== 'HOME') return;
        const baseData = this.buildings
            .filter(b => b.owner === 'PLAYER')
            .map(b => ({
                type: b.type,
                gridX: b.gridX,
                gridY: b.gridY
            }));
        localStorage.setItem('clashIsoBase', JSON.stringify(baseData));
    }

    private loadSavedBase(): boolean {
        const saved = localStorage.getItem('clashIsoBase');
        if (!saved) return false;

        try {
            const baseData = JSON.parse(saved) as Array<{ type: string, gridX: number, gridY: number }>;
            if (!Array.isArray(baseData) || baseData.length === 0) return false;

            baseData.forEach(b => {
                this.placeBuilding(b.gridX, b.gridY, b.type, 'PLAYER');
            });

            const campCount = this.buildings.filter(b => b.type === 'army_camp').length;
            (window as any).refreshCampCapacity?.(campCount);
            return true;
        } catch {
            return false;
        }
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

    private placeBuilding(gridX: number, gridY: number, type: string, owner: 'PLAYER' | 'ENEMY' = 'PLAYER') {
        const info = BUILDINGS[type];
        if (!info) return;

        const graphics = this.add.graphics();
        this.drawBuildingVisuals(graphics, gridX, gridY, type);

        // Building depth: use the bottom-most grid coordinate (gridX+width + gridY+height)
        const depth = (gridX + info.width) + (gridY + info.height);
        graphics.setDepth(depth * 10);

        const building: PlacedBuilding = {
            id: Phaser.Utils.String.UUID(),
            type: type,
            gridX: gridX,
            gridY: gridY,
            graphics: graphics,
            healthBar: this.add.graphics(),
            health: type === 'wall' ? 800 : type === 'town_hall' ? 1000 : 100,
            maxHealth: type === 'wall' ? 800 : type === 'town_hall' ? 1000 : 100,
            owner: owner
        };

        if (type === 'cannon') {
            building.barrelGraphics = this.add.graphics();
            building.barrelGraphics.setDepth(graphics.depth + 1);
            this.drawCannonBarrel(building, 0);
        }

        this.buildings.push(building);
        this.updateHealthBar(building);

        if (type === 'army_camp') {
            const campCount = this.buildings.filter(b => b.type === 'army_camp').length;
            (window as any).refreshCampCapacity?.(campCount);
        }

        // Save base when building is placed
        if (owner === 'PLAYER') {
            this.saveBase();
        }

        return building;
    }


    private drawCannonBarrel(cannon: PlacedBuilding, angle: number) {
        if (!cannon.barrelGraphics) return;
        cannon.barrelGraphics.clear();
        const info = BUILDINGS['cannon'];
        const pos = this.cartToIso(cannon.gridX + info.width / 2, cannon.gridY + info.height / 2);
        const g = cannon.barrelGraphics;

        // Simple rotating cannon barrel using angle math (like xbow)
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const heightOffset = -12;
        const barrelLength = 18;

        // Barrel tip position
        const tipX = pos.x + cos * barrelLength;
        const tipY = pos.y + heightOffset + sin * 0.5 * barrelLength;

        // Draw barrel shadow
        g.lineStyle(8, 0x1a1a1a, 1);
        g.lineBetween(pos.x, pos.y + heightOffset + 2, tipX, tipY + 2);

        // Draw main barrel body
        g.lineStyle(6, 0x3a3a3a, 1);
        g.lineBetween(pos.x, pos.y + heightOffset, tipX, tipY);

        // Barrel highlight
        g.lineStyle(3, 0x5a5a5a, 1);
        g.lineBetween(pos.x, pos.y + heightOffset - 1, tipX, tipY - 1);

        // Muzzle (end of barrel)
        g.fillStyle(0x2a2a2a, 1);
        g.fillCircle(tipX, tipY, 5);
        g.fillStyle(0x111111, 1);
        g.fillCircle(tipX, tipY, 2.5);

        // Barrel rings
        const ring1X = pos.x + cos * 6;
        const ring1Y = pos.y + heightOffset + sin * 0.5 * 6;
        const ring2X = pos.x + cos * 12;
        const ring2Y = pos.y + heightOffset + sin * 0.5 * 12;

        g.fillStyle(0x6a6a6a, 1);
        g.fillCircle(ring1X, ring1Y, 4);
        g.fillCircle(ring2X, ring2Y, 4);

        // Central pivot
        g.fillStyle(0x2a2a2a, 1);
        g.fillCircle(pos.x, pos.y + heightOffset, 5);
        g.fillStyle(0x4a4a4a, 1);
        g.fillCircle(pos.x, pos.y + heightOffset, 3);
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

    private drawBuildingVisuals(graphics: Phaser.GameObjects.Graphics, gridX: number, gridY: number, type: string, alpha: number = 1, tint: number | null = null, building?: PlacedBuilding) {
        const info = BUILDINGS[type];
        const c1 = this.cartToIso(gridX, gridY);
        const c2 = this.cartToIso(gridX + info.width, gridY);
        const c3 = this.cartToIso(gridX + info.width, gridY + info.height);
        const c4 = this.cartToIso(gridX, gridY + info.height);
        const center = this.cartToIso(gridX + info.width / 2, gridY + info.height / 2);

        // Building-specific premium visuals
        switch (type) {
            case 'town_hall':
                this.drawTownHall(graphics, c1, c2, c3, c4, center, alpha, tint);
                break;
            case 'barracks':
                this.drawBarracks(graphics, c1, c2, c3, c4, center, alpha, tint);
                break;
            case 'cannon':
                this.drawCannonBase(graphics, c1, c2, c3, c4, center, alpha, tint);
                break;
            case 'ballista':
                this.drawBallista(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                break;
            case 'mine':
                this.drawGoldMine(graphics, c1, c2, c3, c4, center, alpha, tint);
                break;
            case 'elixir_collector':
                this.drawElixirCollector(graphics, c1, c2, c3, c4, center, alpha, tint);
                break;
            case 'mortar':
                this.drawMortarBuilding(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                break;
            case 'tesla':
                this.drawTeslaCoil(graphics, c1, c2, c3, c4, center, alpha, tint);
                break;
            case 'wall':
                this.drawWall(graphics, center, gridX, gridY, alpha, tint, building);
                break;
            case 'army_camp':
                this.drawArmyCamp(graphics, c1, c2, c3, c4, center, alpha, tint);
                break;
            case 'xbow':
                this.drawXBow(graphics, c1, c2, c3, c4, center, alpha, tint, building);
                break;

            default:
                this.drawGenericBuilding(graphics, c1, c2, c3, c4, center, info, alpha, tint);
        }
    }


    private drawTownHall(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null) {
        const time = this.time.now;
        const height = 65;
        const t1 = new Phaser.Math.Vector2(c1.x, c1.y - height);
        const t2 = new Phaser.Math.Vector2(c2.x, c2.y - height);
        const t3 = new Phaser.Math.Vector2(c3.x, c3.y - height);
        const t4 = new Phaser.Math.Vector2(c4.x, c4.y - height);

        // === ORNATE STONE FOUNDATION ===
        graphics.fillStyle(tint ?? 0x7a6a5a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);
        graphics.lineStyle(2, 0x5a4a3a, 0.6 * alpha);
        graphics.strokePoints([c1, c2, c3, c4], true, true);

        // Foundation stone texture
        graphics.fillStyle(0x6a5a4a, alpha * 0.4);
        for (let i = 0; i < 6; i++) {
            const px = center.x + Math.sin(i * 2.3) * 20;
            const py = center.y + Math.cos(i * 1.7) * 12;
            graphics.fillCircle(px, py, 3 + Math.sin(i) * 1.5);
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

        // === DOORWAY (on front-facing wall) ===
        const doorWidth = 8;
        const doorHeight = 16;
        const doorX = (c3.x + c4.x) / 2;
        const doorY = (c3.y + c4.y) / 2;

        // Door opening (dark interior)
        graphics.fillStyle(0x1a0a0a, alpha);
        graphics.beginPath();
        graphics.moveTo(doorX - doorWidth, doorY);
        graphics.lineTo(doorX + doorWidth, doorY);
        graphics.lineTo(doorX + doorWidth, doorY - doorHeight);
        graphics.lineTo(doorX - doorWidth, doorY - doorHeight);
        graphics.closePath();
        graphics.fillPath();

        // Door frame
        graphics.lineStyle(2, 0x5d4e37, alpha);
        graphics.lineBetween(doorX - doorWidth, doorY, doorX - doorWidth, doorY - doorHeight);
        graphics.lineBetween(doorX + doorWidth, doorY, doorX + doorWidth, doorY - doorHeight);
        graphics.lineBetween(doorX - doorWidth, doorY - doorHeight, doorX + doorWidth, doorY - doorHeight);

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


    private drawCannonBase(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null) {
        // Stone platform
        graphics.fillStyle(tint ?? 0x6a6a6a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);

        // Platform edges
        graphics.lineStyle(1, 0x888888, 0.6 * alpha);
        graphics.lineBetween(c1.x, c1.y, c2.x, c2.y);
        graphics.lineBetween(c1.x, c1.y, c4.x, c4.y);
        graphics.lineStyle(1, 0x3a3a3a, 0.6 * alpha);
        graphics.lineBetween(c2.x, c2.y, c3.x, c3.y);
        graphics.lineBetween(c3.x, c3.y, c4.x, c4.y);

        // Circular turret base (isometric ellipse)
        graphics.fillStyle(0x5a5a5a, alpha);
        graphics.fillEllipse(center.x, center.y - 2, 18, 10);
        graphics.lineStyle(1, 0x3a3a3a, alpha);
        graphics.strokeEllipse(center.x, center.y - 2, 18, 10);
    }

    private drawBallista(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding) {
        // Get ballista state from building if provided
        const angle = building?.ballistaAngle ?? 0; // Default facing right
        const stringTension = building?.ballistaStringTension ?? 0; // 0 = relaxed, 1 = fully drawn
        const boltLoaded = building?.ballistaBoltLoaded ?? true;

        // === STURDY REINFORCED BASE ===
        // Stone foundation platform
        graphics.fillStyle(tint ?? 0x5a5a5a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);
        graphics.lineStyle(2, 0x3a3a3a, 0.6 * alpha);
        graphics.strokePoints([c1, c2, c3, c4], true, true);

        // Stone texture details
        graphics.fillStyle(0x4a4a4a, alpha * 0.5);
        graphics.fillCircle(center.x - 12, center.y + 5, 4);
        graphics.fillCircle(center.x + 10, center.y + 3, 3);
        graphics.fillCircle(center.x - 5, center.y + 8, 3);

        // Large elliptical wooden turret base with metal reinforcement (isometric)
        // Use ellipse with squashed Y for isometric perspective
        const baseRadiusX = 20;
        const baseRadiusY = 12; // Squashed for isometric view
        graphics.fillStyle(0x4a3520, alpha);
        graphics.fillEllipse(center.x, center.y - 2, baseRadiusX, baseRadiusY);
        graphics.lineStyle(3, 0x2a1a10, alpha);
        graphics.strokeEllipse(center.x, center.y - 2, baseRadiusX, baseRadiusY);

        // Metal band reinforcement rings (elliptical)
        graphics.lineStyle(2, 0x555555, alpha);
        graphics.strokeEllipse(center.x, center.y - 2, baseRadiusX - 2, baseRadiusY - 1);
        graphics.lineStyle(1, 0x777777, alpha * 0.6);
        graphics.strokeEllipse(center.x, center.y - 2, baseRadiusX - 5, baseRadiusY - 3);

        // Wood grain pattern on base (curved for ellipse)
        graphics.lineStyle(1, 0x3a2515, alpha * 0.4);
        graphics.lineBetween(center.x - 15, center.y - 2, center.x + 15, center.y - 2);
        graphics.beginPath();
        graphics.arc(center.x, center.y - 2, baseRadiusX - 8, 0.3, Math.PI - 0.3);
        graphics.strokePath();

        // Calculate rotation for the crossbow mechanism
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

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

        // === STURDY BASE SUPPORTS ===
        // Heavy wooden legs
        graphics.fillStyle(0x3a2a15, alpha);
        graphics.fillRect(center.x - 14, center.y + 2, 6, 10);
        graphics.fillRect(center.x + 8, center.y + 2, 6, 10);
        graphics.fillRect(center.x - 3, center.y + 6, 6, 8);

        // Leg shadows
        graphics.fillStyle(0x2a1a05, alpha * 0.5);
        graphics.fillRect(center.x - 14, center.y + 9, 6, 3);
        graphics.fillRect(center.x + 8, center.y + 9, 6, 3);
        graphics.fillRect(center.x - 3, center.y + 11, 6, 3);

        // Metal leg braces
        graphics.fillStyle(0x444444, alpha);
        graphics.fillRect(center.x - 15, center.y + 2, 8, 2);
        graphics.fillRect(center.x + 7, center.y + 2, 8, 2);

        // Central pivot mechanism
        graphics.fillStyle(0x2a2a2a, alpha);
        graphics.fillCircle(center.x, center.y - 2, 6);
        graphics.fillStyle(0x444444, alpha);
        graphics.fillCircle(center.x, center.y - 3, 4);
        graphics.fillStyle(0x666666, alpha * 0.5);
        graphics.fillCircle(center.x - 1, center.y - 4, 2);
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

        // === HEAVY FORTIFIED BASE ===
        graphics.fillStyle(tint ?? 0x6a6a6a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);
        graphics.lineStyle(2, 0x4a4a4a, 0.7 * alpha);
        graphics.strokePoints([c1, c2, c3, c4], true, true);

        // Stone texture
        graphics.fillStyle(0x5a5a5a, alpha * 0.5);
        graphics.fillCircle(center.x - 18, center.y + 8, 5);
        graphics.fillCircle(center.x + 15, center.y + 6, 4);

        // Base Turret
        graphics.fillStyle(0x4a3520, alpha);
        graphics.fillEllipse(center.x, center.y, 26, 16);
        graphics.lineStyle(2, 0x2a1a10, alpha);
        graphics.strokeEllipse(center.x, center.y, 26, 16);

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

        // === CENTRAL PIVOT / MECH ===
        graphics.fillStyle(0x222222, alpha);
        graphics.fillCircle(center.x, center.y + heightOffset, 6);

        // Firing Glow
        const firingGlow = 0.3 + Math.sin(time / 50) * 0.2;
        graphics.fillStyle(0xff8844, alpha * firingGlow);
        graphics.fillCircle(frontX, frontY, 4);

        // Supports
        graphics.fillStyle(0x3a2a15, alpha);
        graphics.fillRect(center.x - 4, center.y + 10, 8, 12);
    }

    private drawGoldMine(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null) {
        const time = this.time.now;

        // === ROCKY GROUND BASE ===
        graphics.fillStyle(tint ?? 0x6b5a4a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);
        graphics.lineStyle(1, 0x4a3a2a, 0.6 * alpha);
        graphics.strokePoints([c1, c2, c3, c4], true, true);

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
        graphics.fillCircle(center.x + 18, center.y - 2, 8);
        graphics.fillCircle(center.x + 22, center.y + 2, 6);

        // Gold chunks in pile
        graphics.fillStyle(0xffd700, alpha);
        graphics.fillCircle(center.x + 16, center.y - 4, 3);
        graphics.fillCircle(center.x + 20, center.y - 1, 4);
        graphics.fillCircle(center.x + 24, center.y + 1, 2);
        graphics.fillCircle(center.x + 18, center.y, 2);

        // Sparkling gold highlights (animated)
        const sparkle1 = 0.5 + Math.sin(time / 150) * 0.5;
        const sparkle2 = 0.5 + Math.sin(time / 180 + 1) * 0.5;
        const sparkle3 = 0.5 + Math.sin(time / 200 + 2) * 0.5;

        graphics.fillStyle(0xffff88, alpha * sparkle1);
        graphics.fillCircle(center.x + 17, center.y - 5, 1.5);
        graphics.fillStyle(0xffff88, alpha * sparkle2);
        graphics.fillCircle(center.x + 21, center.y - 2, 1.5);
        graphics.fillStyle(0xffffaa, alpha * sparkle3);
        graphics.fillCircle(center.x + 19, center.y - 3, 1);

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

    private drawElixirCollector(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null) {
        // Purple/pink theme for elixir
        const purpleDark = tint ?? 0x6c3483;
        const purpleMid = tint ?? 0x8e44ad;
        const purpleLight = tint ?? 0xa569bd;

        // Stone base
        graphics.fillStyle(0x5a5a5a, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);
        graphics.lineStyle(1, 0x3a3a3a, 0.5 * alpha);
        graphics.strokePoints([c1, c2, c3, c4], true, true);

        // Elixir tank (glass container)
        const tankHeight = 30;
        const tankWidth = 18;

        // Tank back (darker)
        graphics.fillStyle(purpleDark, alpha * 0.8);
        graphics.fillEllipse(center.x, center.y - 5, tankWidth, tankWidth * 0.5);

        // Tank body (glass effect)
        graphics.fillStyle(purpleMid, alpha * 0.7);
        graphics.fillRect(center.x - tankWidth / 2, center.y - 5 - tankHeight, tankWidth, tankHeight);

        // Tank shine (glass reflection)
        graphics.fillStyle(0xffffff, 0.2 * alpha);
        graphics.fillRect(center.x - tankWidth / 2 + 3, center.y - 5 - tankHeight + 3, 4, tankHeight - 6);

        // Tank top cap
        graphics.fillStyle(purpleLight, alpha);
        graphics.fillEllipse(center.x, center.y - 5 - tankHeight, tankWidth, tankWidth * 0.5);

        // Pump mechanism on top
        const time = this.time.now / 300;
        const pumpOffset = Math.sin(time) * 3;

        // Pump base
        graphics.fillStyle(0x4a4a4a, alpha);
        graphics.fillRect(center.x - 4, center.y - tankHeight - 20, 8, 10);

        // Pump piston (animated up/down)
        graphics.fillStyle(0x666666, alpha);
        graphics.fillRect(center.x - 2, center.y - tankHeight - 25 + pumpOffset, 4, 8);

        // Pump handle
        graphics.lineStyle(2, 0x555555, alpha);
        graphics.lineBetween(center.x, center.y - tankHeight - 25 + pumpOffset, center.x + 10, center.y - tankHeight - 20 + pumpOffset * 0.5);

        // Elixir bubbles (animated)
        const bubbleTime = this.time.now / 200;
        for (let i = 0; i < 3; i++) {
            const bubbleY = ((bubbleTime + i * 0.5) % 1) * tankHeight;
            const bubbleX = Math.sin(bubbleTime * 2 + i) * 4;
            graphics.fillStyle(0xd7bde2, 0.6 * alpha);
            graphics.fillCircle(center.x + bubbleX, center.y - 5 - bubbleY, 2);
        }

        // Wooden supports
        graphics.fillStyle(0x5d4e37, alpha);
        graphics.fillRect(center.x - tankWidth / 2 - 3, center.y - 5, 3, 8);
        graphics.fillRect(center.x + tankWidth / 2, center.y - 5, 3, 8);
    }


    private drawMortarBuilding(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: PlacedBuilding) {
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

    private drawArmyCamp(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null) {
        const time = this.time.now;

        // === TRAINING GROUND BASE ===
        // Packed dirt/sand arena floor
        graphics.fillStyle(tint ?? 0xb8a080, alpha);
        graphics.fillPoints([c1, c2, c3, c4], true);

        // Inner training circle (worn area)
        graphics.fillStyle(0xa89070, alpha * 0.8);
        graphics.fillEllipse(center.x, center.y + 5, 55, 28);

        // Ground texture - packed earth patterns
        graphics.fillStyle(0x9a8060, alpha * 0.5);
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const dist = 20 + (i % 3) * 12;
            const ox = Math.cos(angle) * dist * 0.8;
            const oy = Math.sin(angle) * dist * 0.4;
            graphics.fillCircle(center.x + ox, center.y + 5 + oy, 2 + (i % 2));
        }

        // Simple border
        graphics.lineStyle(2, 0x8b7355, alpha * 0.7);
        graphics.strokePoints([c1, c2, c3, c4], true, true);

        // === CENTRAL CAMPFIRE ===
        const fireX = center.x;
        const fireY = center.y + 8;

        // Fire pit stones (ring)
        graphics.fillStyle(0x555555, alpha);
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const stoneX = fireX + Math.cos(angle) * 12;
            const stoneY = fireY + Math.sin(angle) * 6;
            graphics.fillEllipse(stoneX, stoneY, 5, 3);
        }

        // Fire pit inner (ash/coals)
        graphics.fillStyle(0x2a2020, alpha);
        graphics.fillEllipse(fireX, fireY, 10, 5);

        // Glowing coals
        const coalGlow = 0.5 + Math.sin(time / 200) * 0.2;
        graphics.fillStyle(0x881100, alpha * coalGlow);
        graphics.fillEllipse(fireX, fireY, 8, 4);
        graphics.fillStyle(0xcc3300, alpha * coalGlow * 0.7);
        graphics.fillEllipse(fireX - 2, fireY, 4, 2);
        graphics.fillEllipse(fireX + 3, fireY + 1, 3, 1.5);

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

    private drawGenericBuilding(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, _center: Phaser.Math.Vector2, info: BuildingInfo, alpha: number, tint: number | null) {
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
        const defenses = this.buildings.filter(b => (b.type === 'cannon' || b.type === 'mortar' || b.type === 'tesla' || b.type === 'ballista' || b.type === 'xbow') && b.health > 0);
        defenses.forEach(defense => {
            let nearestTroop: Troop | null = null;
            // X-Bow has HUGE range (35), ballista 22, mortar 12, tesla 7, cannon 10
            let minDist = defense.type === 'xbow' ? 35 : defense.type === 'mortar' ? 12 : defense.type === 'ballista' ? 22 : defense.type === 'tesla' ? 7 : 10;
            // X-Bow fires 5x per second (200ms), ballista 3500ms, mortar 4000ms, tesla 1500ms, cannon 1000ms
            const interval = defense.type === 'xbow' ? 200 : defense.type === 'mortar' ? 4000 : defense.type === 'ballista' ? 3500 : defense.type === 'tesla' ? 1500 : 1000;
            if (!(defense as any).lastFireTime) (defense as any).lastFireTime = 0;
            if (time < (defense as any).lastFireTime + interval) return;

            this.troops.forEach(troop => {
                if (troop.owner !== defense.owner && troop.health > 0) {
                    const dist = Phaser.Math.Distance.Between(defense.gridX, defense.gridY, troop.gridX, troop.gridY);
                    if (dist < minDist) {
                        if (defense.type === 'mortar' && dist < 5) return; // Larger mortar dead zone
                        minDist = dist; nearestTroop = troop;
                    }
                }
            });

            if (nearestTroop) {
                (defense as any).lastFireTime = time;
                if (defense.type === 'mortar') this.shootMortarAt(defense, nearestTroop);
                else if (defense.type === 'tesla') this.shootTeslaAt(defense, nearestTroop);
                else if (defense.type === 'ballista') this.shootBallistaAt(defense, nearestTroop);
                else if (defense.type === 'xbow') this.shootXBowAt(defense, nearestTroop);
                else this.shootAt(defense, nearestTroop);
            }
        });


        this.troops.forEach(troop => {
            if (troop.health <= 0) return;

            // Ward passive healing aura
            if (troop.type === 'ward') {
                const wardStats = TROOP_STATS.ward;
                this.troops.forEach(ally => {
                    if (ally === troop || ally.owner !== troop.owner || ally.health <= 0) return;
                    const dist = Phaser.Math.Distance.Between(troop.gridX, troop.gridY, ally.gridX, ally.gridY);
                    if (dist <= wardStats.healRadius && ally.health < ally.maxHealth) {
                        ally.health = Math.min(ally.maxHealth, ally.health + wardStats.healAmount * 0.016);
                        this.updateHealthBar(ally);
                    }
                });
            }

            if (!troop.target || troop.target.health <= 0) {
                if (troop.type === 'ward') {
                    troop.target = this.findNearestHighHPAlly(troop);
                    if (!troop.target) troop.target = this.findNearestEnemyBuilding(troop);
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

                if (dist <= stats.range + 0.1 && isEnemy) {
                    if (time > troop.lastAttackTime + troop.attackDelay) {
                        troop.lastAttackTime = time;

                        // Ranged attackers - damage on projectile hit
                        if (troop.type === 'archer') {
                            this.showArcherProjectile(troop, troop.target, stats.damage);
                        } else if (troop.type === 'ward') {
                            this.showWardLaser(troop, troop.target, stats.damage);
                        } else {
                            // Melee: immediate damage
                            troop.target.health -= stats.damage;
                            this.showHitEffect(troop.target.graphics);
                            this.updateHealthBar(troop.target);

                            // Lunge effect for melee
                            const targetPos = this.cartToIso(bx + tw / 2, by + th / 2);
                            const currentPos = this.cartToIso(troop.gridX, troop.gridY);
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
                } else if (troop.type === 'ward' && !isEnemy && time > troop.lastAttackTime + troop.attackDelay) {
                    // Ward Simultaneous Attack Logic:
                    // Prioritize buildings over walls, and prefer what the followed ally is targeting.
                    const stats = TROOP_STATS.ward;
                    const enemies = this.buildings.filter(b => b.owner !== troop.owner && b.health > 0);

                    let nearestEnemy: PlacedBuilding | null = null;
                    let minEnemyDist = stats.range;

                    // Influence: If following an ally, help them if they are targeting an ENEMY building.
                    if (troop.target && !('type' in troop.target) && troop.target.target && troop.target.target.owner !== troop.owner) {
                        const allyTarget = troop.target.target;
                        const adx = Math.max(allyTarget.gridX - troop.gridX, 0, troop.gridX - (allyTarget.gridX + (BUILDINGS[allyTarget.type]?.width || 1)));
                        const ady = Math.max(allyTarget.gridY - troop.gridY, 0, troop.gridY - (allyTarget.gridY + (BUILDINGS[allyTarget.type]?.height || 1)));
                        const ad = Math.sqrt(adx * adx + ady * ady);
                        if (ad <= stats.range && allyTarget.type !== 'wall') {
                            nearestEnemy = allyTarget;
                        }
                    }

                    if (!nearestEnemy) {
                        // Priority 1: Non-wall buildings in range
                        const buildingsInRange = enemies.filter(b => b.type !== 'wall').filter(b => {
                            const info = BUILDINGS[b.type];
                            const bdx = Math.max(b.gridX - troop.gridX, 0, troop.gridX - (b.gridX + info.width));
                            const bdy = Math.max(b.gridY - troop.gridY, 0, troop.gridY - (b.gridY + info.height));
                            return Math.sqrt(bdx * bdx + bdy * bdy) <= stats.range;
                        });

                        if (buildingsInRange.length > 0) {
                            nearestEnemy = buildingsInRange.sort((a, b) => {
                                const distA = Phaser.Math.Distance.Between(troop.gridX, troop.gridY, a.gridX, a.gridY);
                                const distB = Phaser.Math.Distance.Between(troop.gridX, troop.gridY, b.gridX, b.gridY);
                                return distA - distB;
                            })[0];
                        } else {
                            // Priority 2: Walls in range (only if no buildings)
                            enemies.filter(b => b.type === 'wall').forEach(b => {
                                const bdx = Math.max(b.gridX - troop.gridX, 0, troop.gridX - (b.gridX + 1));
                                const bdy = Math.max(b.gridY - troop.gridY, 0, troop.gridY - (b.gridY + 1));
                                const d = Math.sqrt(bdx * bdx + bdy * bdy);
                                if (d <= minEnemyDist) {
                                    minEnemyDist = d;
                                    nearestEnemy = b;
                                }
                            });
                        }
                    }

                    if (nearestEnemy) {
                        troop.lastAttackTime = time;
                        this.showWardLaser(troop, nearestEnemy, stats.damage);
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

        // Muzzle flash effect
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

        this.tweens.add({
            targets: ball, x: end.x, duration: 1400, ease: 'Linear',
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
        this.cameras.main.shake(200, 0.005);

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

        // Fire particles (orange/yellow core)
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const dist = 15 + Math.random() * 25;
            const fireColors = [0xff4400, 0xff6600, 0xff8800, 0xffaa00];
            const fire = this.add.circle(x, y, 6 + Math.random() * 8, fireColors[Math.floor(Math.random() * 4)], 0.9);
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

        // Smoke plume
        for (let i = 0; i < 8; i++) {
            const delay = i * 30;
            this.time.delayedCall(delay, () => {
                const smokeColors = [0x444444, 0x555555, 0x666666];
                const smoke = this.add.circle(
                    x + (Math.random() - 0.5) * 30,
                    y,
                    8 + Math.random() * 12,
                    smokeColors[Math.floor(Math.random() * 3)],
                    0.6
                );
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
        this.troops.forEach(t => {
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

        const info = BUILDINGS['cannon'];
        const start = this.cartToIso(cannon.gridX + info.width / 2, cannon.gridY + info.height / 2);
        const end = this.cartToIso(troop.gridX, troop.gridY);
        const angle = Math.atan2(end.y - (start.y - 20), end.x - start.x);
        this.drawCannonBarrel(cannon, angle);

        // Barrel recoil animation
        if (cannon.barrelGraphics) {
            const recoilDist = 6;
            const recoilX = -Math.cos(angle) * recoilDist;
            const recoilY = -Math.sin(angle) * recoilDist;
            const originalX = cannon.barrelGraphics.x;
            const originalY = cannon.barrelGraphics.y;

            this.tweens.add({
                targets: cannon.barrelGraphics,
                x: originalX + recoilX,
                y: originalY + recoilY,
                duration: 50,
                ease: 'Power2',
                yoyo: true,
                hold: 30
            });
        }

        const ballDepth = cannon.graphics.depth + 50;

        // Muzzle flash
        const flash = this.add.graphics();
        flash.fillStyle(0xffcc00, 0.9);
        flash.fillCircle(start.x + Math.cos(angle) * 12, start.y - 20 + Math.sin(angle) * 12, 10);
        flash.fillStyle(0xffffff, 0.8);
        flash.fillCircle(start.x + Math.cos(angle) * 10, start.y - 20 + Math.sin(angle) * 10, 5);
        flash.setDepth(ballDepth + 10);
        this.tweens.add({ targets: flash, alpha: 0, scale: 1.5, duration: 80, onComplete: () => flash.destroy() });

        // Cannonball
        const ball = this.add.graphics();
        ball.fillStyle(0x1a1a1a, 1);
        ball.fillCircle(0, 0, 7);
        ball.fillStyle(0x3a3a3a, 1);
        ball.fillCircle(-2, -2, 4);
        ball.setPosition(start.x, start.y - 20);
        ball.setDepth(ballDepth);

        // Faster projectile: 150ms
        this.tweens.add({
            targets: ball, x: end.x, y: end.y, duration: 150, ease: 'Quad.easeIn',
            onComplete: () => {
                ball.destroy();
                cannon.isFiring = false;

                // Impact effect
                const impact = this.add.graphics();
                impact.fillStyle(0x8b7355, 0.6);
                impact.fillEllipse(end.x, end.y + 3, 15, 8);
                impact.setDepth(ballDepth - 10); // Draw below ball/smoke but above ground
                this.tweens.add({ targets: impact, alpha: 0, duration: 300, onComplete: () => impact.destroy() });

                // Damage (ensure validity)
                if (troop && troop.health > 0) {
                    troop.health -= 15;
                    troop.hasTakenDamage = true;
                    this.updateHealthBar(troop);
                    if (troop.health <= 0) this.destroyTroop(troop);
                }
            }
        });
    }


    private shootTeslaAt(tesla: PlacedBuilding, troop: Troop) {
        const start = this.cartToIso(tesla.gridX + 0.5, tesla.gridY + 0.5);
        start.y -= 40; // From the orb

        // Orb pulse effect
        const orbPulse = this.add.circle(start.x, start.y, 12, 0x88eeff, 0.6);
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

                // Trail for bolt
                let lastTrailTime = 0;

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
                this.tweens.add({
                    targets: bolt,
                    x: end.x,
                    y: end.y,
                    duration: 300,
                    ease: 'Power1',
                    onUpdate: () => {
                        const now = this.time.now;
                        if (now - lastTrailTime > 20) {
                            lastTrailTime = now;
                            const trail = this.add.graphics();
                            trail.lineStyle(4, 0x8b6914, 0.5);
                            trail.lineBetween(-8, 0, 8, 0);
                            trail.setPosition(bolt.x, bolt.y);
                            trail.setRotation(angle);
                            trail.setDepth(19998);
                            this.tweens.add({ targets: trail, alpha: 0, duration: 60, onComplete: () => trail.destroy() });
                        }
                    },
                    onComplete: () => {
                        bolt.destroy();
                        // Deal damage
                        if (targetTroop && targetTroop.health > 0) {
                            targetTroop.health -= 100;
                            targetTroop.hasTakenDamage = true;
                            this.updateHealthBar(targetTroop);
                            if (targetTroop.health <= 0) this.destroyTroop(targetTroop);
                        }
                        // Impact effect
                        const impact = this.add.graphics();
                        impact.fillStyle(0x8b4513, 0.9);
                        impact.fillCircle(0, 0, 10);
                        impact.fillStyle(0xffcc00, 0.5);
                        impact.fillCircle(0, 0, 6);
                        impact.setPosition(end.x, end.y);
                        impact.setDepth(19999);
                        this.tweens.add({
                            targets: impact,
                            scale: 2.5, alpha: 0,
                            duration: 250,
                            onComplete: () => impact.destroy()
                        });
                    }
                });

                // Reload bolt after a delay
                this.time.delayedCall(800, () => {
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

        // Trail
        let lastTrailTime = 0;

        this.tweens.add({
            targets: arrow,
            x: end.x,
            y: end.y,
            duration: 150, // Very fast
            ease: 'Linear',
            onUpdate: () => {
                const now = this.time.now;
                if (now - lastTrailTime > 30) {
                    lastTrailTime = now;
                    const trail = this.add.graphics();
                    trail.lineStyle(1.5, 0xccaa88, 0.4);
                    trail.lineBetween(-4, 0, 4, 0);
                    trail.setPosition(arrow.x, arrow.y);
                    trail.setRotation(angle);
                    trail.setDepth(19998);
                    this.tweens.add({ targets: trail, alpha: 0, duration: 50, onComplete: () => trail.destroy() });
                }
            },
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

    private showWardLaser(troop: Troop, target: PlacedBuilding, damage: number) {
        const start = this.cartToIso(troop.gridX, troop.gridY);
        const info = BUILDINGS[target.type];
        const end = this.cartToIso(target.gridX + info.width / 2, target.gridY + info.height / 2);
        const targetBuilding = target;

        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        troop.facingAngle = angle;
        this.redrawTroop(troop);

        const laser = this.add.graphics();
        laser.lineStyle(4, 0x88ffcc, 0.9);
        laser.lineBetween(start.x + 7, start.y - 17, end.x, end.y - 20);
        laser.lineStyle(2, 0xffffff, 0.6);
        laser.lineBetween(start.x + 7, start.y - 17, end.x, end.y - 20);
        laser.setDepth(25000);

        const orb = this.add.circle(start.x + 7, start.y - 17, 6, 0x88ffcc, 0.8);
        orb.setDepth(25001);

        // DEAL DAMAGE IMMEDIATELY ON LASER SPAWN
        if (targetBuilding && targetBuilding.health > 0) {
            targetBuilding.health -= damage;
            this.showHitEffect(targetBuilding.graphics);
            this.updateHealthBar(targetBuilding);

            if (targetBuilding.health <= 0) {
                this.destroyBuilding(targetBuilding);
                this.troops.forEach(t => {
                    if (t.target && t.target.id === targetBuilding.id) t.target = null;
                });
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
                        // Ward Stay Behind Logic:
                        // If following an ally, target a spot behind them relative to their own target.
                        let finalTarget: any = troop.target;
                        if (troop.type === 'ward' && !isBuilding && troop.target.target) {
                            const ally = troop.target;
                            const allyTarget = ally.target;
                            const itw = ('type' in allyTarget && BUILDINGS[allyTarget.type]) ? BUILDINGS[allyTarget.type].width : 0.5;
                            const ith = ('type' in allyTarget && BUILDINGS[allyTarget.type]) ? BUILDINGS[allyTarget.type].height : 0.5;
                            const atx = allyTarget.gridX + itw / 2;
                            const aty = allyTarget.gridY + ith / 2;

                            const dx = ally.gridX - atx;
                            const dy = ally.gridY - aty;
                            const len = Math.sqrt(dx * dx + dy * dy);
                            if (len > 0.5) {
                                // Target 1.5 tiles behind the ally
                                finalTarget = {
                                    gridX: ally.gridX + (dx / len) * 1.5,
                                    gridY: ally.gridY + (dy / len) * 1.5,
                                    id: 'offset-' + ally.id,
                                    health: 1 // Dummy
                                };
                            }
                        }

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


                        const speed = stats.speed * troop.speedMult * delta;
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

        let targets: PlacedBuilding[] = [];

        if (troop.type === 'giant') {
            // Giants: Prioritize Defenses.
            // 1. Non-Wall Defenses
            targets = enemies.filter(b => !isWall(b) && isDefense(b));
            if (targets.length === 0) {
                // 2. Any Non-Wall (Act as if no logic/Warriors)
                targets = enemies.filter(b => !isWall(b));
                if (targets.length === 0) {
                    // 3. Walls (Absolute last resort - only if NO other buildings exist)
                    targets = enemies.filter(b => isWall(b));
                    if (targets.length === 0) return null;
                }
            }
        } else {
            // Regular: Prioritize Non-Walls
            targets = enemies.filter(b => !isWall(b));
            if (targets.length === 0) {
                // Fallback to walls if nothing else remains
                targets = enemies.filter(b => isWall(b));
                if (targets.length === 0) return null;
            }
        }

        let nearest: PlacedBuilding | null = null;
        let minDist = Infinity;
        targets.forEach(b => {
            const info = BUILDINGS[b.type];
            const dist = Phaser.Math.Distance.Between(troop.gridX, troop.gridY, b.gridX + info.width / 2, b.gridY + info.height / 2);
            if (dist < minDist) { minDist = dist; nearest = b; }
        });

        return nearest;
    }

    private findNearestHighHPAlly(troop: Troop): Troop | null {
        // Higher prioritization for giants (tanks)
        const tanks = this.troops.filter(t => t.owner === troop.owner && t !== troop && t.health > 0 && t.type === 'giant');
        if (tanks.length > 0) {
            // Pick nearest tank
            return tanks.sort((a, b) => {
                const dA = Phaser.Math.Distance.Between(troop.gridX, troop.gridY, a.gridX, a.gridY);
                const dB = Phaser.Math.Distance.Between(troop.gridX, troop.gridY, b.gridX, b.gridY);
                return dA - dB;
            })[0];
        }
        // Fallback to any high HP ally (e.g. ward following ward or archer if no giants)
        const allies = this.troops.filter(t => t.owner === troop.owner && t !== troop && t.health > 0);
        if (allies.length > 0) {
            return allies.sort((a, b) => b.maxHealth - a.maxHealth)[0];
        }
        return null;
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

        const info = BUILDINGS[b.type];
        const pos = this.cartToIso(b.gridX + info.width / 2, b.gridY + info.height / 2);
        const size = Math.max(info.width, info.height);

        // Screen shake proportional to building size
        this.cameras.main.shake(150 + size * 100, 0.003 + size * 0.002);

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

        // Dust cloud
        for (let i = 0; i < 6 + size * 2; i++) {
            this.time.delayedCall(i * 30, () => {
                const dustColors = [0x8b7355, 0x9b8365, 0x7b6345];
                const dust = this.add.circle(
                    pos.x + (Math.random() - 0.5) * 40 * size,
                    pos.y - 10,
                    8 + Math.random() * 10,
                    dustColors[Math.floor(Math.random() * 3)],
                    0.6
                );
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
            // Massive fire and explosion
            for (let i = 0; i < 25; i++) {
                const delay = i * 40;
                this.time.delayedCall(delay, () => {
                    const fireColors = [0xff4400, 0xff6600, 0xff8800, 0xffaa00];
                    const fire = this.add.circle(
                        pos.x + (Math.random() - 0.5) * 80,
                        pos.y - 10 - (Math.random() * 40),
                        8 + Math.random() * 15,
                        fireColors[Math.floor(Math.random() * 4)],
                        0.9
                    );
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

                // Award loot based on building type
                const lootValues: Record<string, { gold: number, elixir: number }> = {
                    town_hall: { gold: 200, elixir: 200 },
                    barracks: { gold: 50, elixir: 50 },
                    cannon: { gold: 30, elixir: 0 },
                    mortar: { gold: 50, elixir: 0 },
                    tesla: { gold: 75, elixir: 0 },
                    mine: { gold: 100, elixir: 0 },
                    elixir_collector: { gold: 0, elixir: 100 },
                    army_camp: { gold: 25, elixir: 25 },
                };
                const loot = lootValues[b.type] || { gold: 20, elixir: 20 };
                this.goldLooted += loot.gold;
                this.elixirLooted += loot.elixir;

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
            // Save base when player building is deleted
            if (b.owner === 'PLAYER') {
                this.saveBase();
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
        const pos = this.cartToIso(t.gridX, t.gridY);

        // Death explosion effect
        const flash = this.add.circle(pos.x, pos.y, 6, 0xffffff, 0.8);
        flash.setDepth(30001);
        this.tweens.add({ targets: flash, scale: 2, alpha: 0, duration: 100, onComplete: () => flash.destroy() });

        // Particle burst
        const particleColors = t.type === 'warrior' ? [0xffff00, 0xffcc00] :
            t.type === 'archer' ? [0x00ccff, 0x0088cc] :
                [0xff8800, 0xcc6600];
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const particle = this.add.circle(pos.x, pos.y, 3, particleColors[i % 2], 0.9);
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

        // Smoke puff
        const smoke = this.add.circle(pos.x, pos.y, 10, 0x666666, 0.5);
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

    private showHitEffect(graphics: Phaser.GameObjects.Graphics) {
        // Flash white then back
        const originalAlpha = graphics.alpha;
        graphics.setAlpha(0.3);
        this.time.delayedCall(30, () => {
            graphics.setAlpha(originalAlpha);
        });
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


    private spawnTroop(gx: number, gy: number, type: 'warrior' | 'archer' | 'giant' | 'ward' = 'warrior', owner: 'PLAYER' | 'ENEMY' = 'PLAYER') {
        const stats = TROOP_STATS[type];
        const pos = this.cartToIso(gx, gy);

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
        troopGraphic.setScale(0.5);
        troopGraphic.y -= 20;
        this.tweens.add({
            targets: troopGraphic,
            scaleX: 1, scaleY: 1,
            y: pos.y,
            duration: 200,
            ease: 'Bounce.easeOut'
        });

        const troop: Troop = {
            id: Phaser.Utils.String.UUID(),
            type: type,
            gameObject: troopGraphic,
            healthBar: this.add.graphics(),
            gridX: gx, gridY: gy,
            health: stats.health, maxHealth: stats.health,
            target: null, owner: owner,
            lastAttackTime: 0,
            attackDelay: 700 + Math.random() * 300,
            speedMult: 0.9 + Math.random() * 0.2,
            hasTakenDamage: false,
            facingAngle: 0
        };

        this.troops.push(troop);
        this.hasDeployed = true;
        this.updateHealthBar(troop);
        troop.target = this.findNearestEnemyBuilding(troop);

        if (this.mode === 'ATTACK') {
            this.deploymentGraphics.setAlpha(0.3);
        }
    }

    private drawTroopVisual(graphics: Phaser.GameObjects.Graphics, type: 'warrior' | 'archer' | 'giant' | 'ward', owner: 'PLAYER' | 'ENEMY', facingAngle: number = 0) {
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
                if (bounds && gridPosFloat.x >= bounds.minX && gridPosFloat.x <= bounds.maxX && gridPosFloat.y >= bounds.minY && gridPosFloat.y <= bounds.maxY) {
                    // Flash the red zone
                    this.tweens.add({
                        targets: this.deploymentGraphics,
                        alpha: 0.8,
                        duration: 100,
                        yoyo: true,
                        onComplete: () => this.deploymentGraphics.setAlpha(0.3)
                    });
                    return; // Forbidden zone
                }
                const army = (window as any).getArmy();
                const selectedType = (window as any).getSelectedTroopType();
                if (selectedType && army[selectedType] > 0) {
                    this.spawnTroop(gridPosFloat.x, gridPosFloat.y, selectedType, 'PLAYER');
                    (window as any).deployTroop(selectedType);
                    this.lastDeployTime = this.time.now;
                }

                return;
            }

            if (this.isMoving && this.selectedInWorld) {
                if (this.isPositionValid(gridPosSnap.x, gridPosSnap.y, this.selectedInWorld.type, this.selectedInWorld.id)) {
                    this.selectedInWorld.gridX = gridPosSnap.x;
                    this.selectedInWorld.gridY = gridPosSnap.y;
                    this.selectedInWorld.graphics.clear();
                    this.drawBuildingVisuals(this.selectedInWorld.graphics, gridPosSnap.x, gridPosSnap.y, this.selectedInWorld.type);
                    const depth = (gridPosSnap.x + BUILDINGS[this.selectedInWorld.type].width) + (gridPosSnap.y + BUILDINGS[this.selectedInWorld.type].height);
                    this.selectedInWorld.graphics.setDepth(depth * 10);
                    if (this.selectedInWorld.barrelGraphics) {
                        this.selectedInWorld.barrelGraphics.setDepth(this.selectedInWorld.graphics.depth + 1);
                        if (this.selectedInWorld.type === 'cannon') this.drawCannonBarrel(this.selectedInWorld, 0);
                    }
                    this.updateHealthBar(this.selectedInWorld);
                    this.isMoving = false;
                    this.ghostBuilding.setVisible(false);
                }
                return;
            }

            if (pointer.rightButtonDown()) {
                this.cancelPlacement();
                return;
            }

            if (this.selectedBuildingType) {
                if (this.isPositionValid(gridPosSnap.x, gridPosSnap.y, this.selectedBuildingType)) {
                    this.placeBuilding(gridPosSnap.x, gridPosSnap.y, this.selectedBuildingType, 'PLAYER');

                    if (this.selectedBuildingType !== 'wall') {
                        this.selectedBuildingType = null;
                        this.ghostBuilding.setVisible(false);
                        (window as any).onPlacementCancelled?.();
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
                this.selectedInWorld = clicked;
                (window as any).onBuildingSelected?.(clicked.id);
            } else {
                this.selectedInWorld = null;
                (window as any).onBuildingSelected?.(null);
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
                    }
                }
            }
            return; // Don't drag camera while deploying
        }

        if (this.isDragging) {
            const dx = pointer.x - this.dragOrigin.x;
            const dy = pointer.y - this.dragOrigin.y;
            this.cameras.main.scrollX -= dx / this.cameras.main.zoom;
            this.cameras.main.scrollY -= dy / this.cameras.main.zoom;
            this.dragOrigin.set(pointer.x, pointer.y);
        }

        this.ghostBuilding.clear();
        if (this.selectedBuildingType || (this.isMoving && this.selectedInWorld)) {
            const type = this.selectedBuildingType || this.selectedInWorld?.type;
            const ignoreId = this.isMoving ? this.selectedInWorld?.id : null;
            if (type && gridPosSnap.x >= 0 && gridPosSnap.x < this.mapSize && gridPosSnap.y >= 0 && gridPosSnap.y < this.mapSize) {
                this.ghostBuilding.setVisible(true);
                const isValid = this.isPositionValid(gridPosSnap.x, gridPosSnap.y, type, ignoreId);
                this.drawBuildingVisuals(this.ghostBuilding, gridPosSnap.x, gridPosSnap.y, type, 0.5, isValid ? null : 0xff0000);

                // Ghost depth should match what placed building would have
                const info = BUILDINGS[type];
                if (info) {
                    const depth = (gridPosSnap.x + info.width) + (gridPosSnap.y + info.height);
                    this.ghostBuilding.setDepth(depth * 10);
                } else {
                    this.ghostBuilding.setDepth(20000);
                }
            } else { this.ghostBuilding.setVisible(false); }
        }
    }

    private onPointerUp() { this.isDragging = false; }

    private handleCameraMovement(delta: number) {
        if (!this.cursorKeys) return;
        const speed = 0.5 * delta;
        if (this.cursorKeys.left?.isDown) this.cameras.main.scrollX -= speed;
        else if (this.cursorKeys.right?.isDown) this.cameras.main.scrollX += speed;
        if (this.cursorKeys.up?.isDown) this.cameras.main.scrollY -= speed;
        else if (this.cursorKeys.down?.isDown) this.cameras.main.scrollY += speed;
    }

    private updateSelectionHighlight() { }

    private showCloudTransition(onMidpoint: () => void) {
        // Show React overlay to cover UI - CSS animation handles timing
        (window as any).showCloudOverlay?.();

        const width = this.scale.width;
        const height = this.scale.height;
        const cloudCount = 40;
        const cloudSprites: Phaser.GameObjects.Arc[] = [];
        for (let i = 0; i < cloudCount; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const radius = 250 + Math.random() * 150;
            const cloud = this.add.circle(x, y, 0, 0xffffff, 0.95);
            cloud.setScrollFactor(0);
            cloud.setDepth(100000);
            cloudSprites.push(cloud);
            this.tweens.add({
                targets: cloud, radius: radius, duration: 800, ease: 'Back.easeOut', delay: i * 30,
                onComplete: () => {
                    if (cloudSprites.indexOf(cloud) === cloudCount - 1) {
                        onMidpoint();
                        cloudSprites.forEach((c, idx) => {
                            this.tweens.add({
                                targets: c, radius: 0, alpha: 0, duration: 500, delay: idx * 25,
                                onComplete: () => {
                                    c.destroy();
                                    // Hide overlay after last cloud fades
                                    if (idx === cloudCount - 1) {
                                        this.time.delayedCall(100, () => {
                                            (window as any).hideCloudOverlay?.();
                                        });
                                    }
                                }
                            });
                        });
                    }
                }
            });
        }
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
                this.updateBattleStats();
                (window as any).setGameMode?.('ATTACK');
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
        (window as any).deselectBuilding = () => {
            this.selectedInWorld = null;
            this.isMoving = false;
        };
    }

    public goHome() {
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
            if (b.barrelGraphics) b.barrelGraphics.destroy();
            b.healthBar.destroy();
        });
        this.troops.forEach(t => { t.gameObject.destroy(); t.healthBar.destroy(); });
        this.buildings = [];
        this.troops = [];
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

        // Resources
        this.placeBuilding(6, 6, 'mine', 'PLAYER');
        this.placeBuilding(15, 12, 'mine', 'PLAYER');
        this.placeBuilding(8, 14, 'elixir_collector', 'PLAYER');
        this.placeBuilding(14, 8, 'elixir_collector', 'PLAYER');

        // Army
        this.placeBuilding(5, 10, 'barracks', 'PLAYER');
        this.placeBuilding(16, 9, 'army_camp', 'PLAYER');
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
        const centerX = 8 + Math.floor(Math.random() * 8);
        const centerY = 8 + Math.floor(Math.random() * 8);
        this.placeBuilding(centerX, centerY, 'town_hall', 'ENEMY');

        // Place defenses including ballista
        const defCount = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < defCount; i++) {
            const rx = centerX + (Math.random() > 0.5 ? 4 : -4) + Math.floor(Math.random() * 3);
            const ry = centerY + (Math.random() > 0.5 ? 4 : -4) + Math.floor(Math.random() * 3);
            const r = Math.random();
            const def = r > 0.9 ? 'xbow' : r > 0.75 ? 'ballista' : r > 0.55 ? 'tesla' : r > 0.3 ? 'cannon' : 'mortar';
            if (this.isPositionValid(rx, ry, def)) this.placeBuilding(rx, ry, def, 'ENEMY');
        }

        // Place gold mines
        const mineCount = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < mineCount; i++) {
            const rx = centerX + (Math.random() > 0.5 ? 5 : -5) + Math.floor(Math.random() * 2);
            const ry = centerY + (Math.random() > 0.5 ? 5 : -5) + Math.floor(Math.random() * 2);
            if (this.isPositionValid(rx, ry, 'mine')) this.placeBuilding(rx, ry, 'mine', 'ENEMY');
        }

        // Place elixir collectors
        const elixirCount = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < elixirCount; i++) {
            const rx = centerX + (Math.random() > 0.5 ? 6 : -6) + Math.floor(Math.random() * 2);
            const ry = centerY + (Math.random() > 0.5 ? 6 : -6) + Math.floor(Math.random() * 2);
            if (this.isPositionValid(rx, ry, 'elixir_collector')) this.placeBuilding(rx, ry, 'elixir_collector', 'ENEMY');
        }

        // Calculate bounds for enclosing wall loop around ALL enemy buildings
        let minX = this.mapSize, minY = this.mapSize, maxX = 0, maxY = 0;
        let hasBuildings = false;

        this.buildings.forEach(b => {
            if (b.owner === 'ENEMY') {
                hasBuildings = true;
                const info = BUILDINGS[b.type];
                minX = Math.min(minX, b.gridX);
                minY = Math.min(minY, b.gridY);
                maxX = Math.max(maxX, b.gridX + info.width);
                maxY = Math.max(maxY, b.gridY + info.height);
            }
        });

        if (hasBuildings) {
            // Buffer of 2 tiles to ensure we surround them with space
            const wx1 = Math.max(1, minX - 2);
            const wy1 = Math.max(1, minY - 2);
            const wx2 = Math.min(this.mapSize - 2, maxX + 1);
            const wy2 = Math.min(this.mapSize - 2, maxY + 1);

            for (let x = wx1; x <= wx2; x++) {
                for (let y = wy1; y <= wy2; y++) {
                    // Draw rect
                    if (x === wx1 || x === wx2 || y === wy1 || y === wy2) {
                        if (this.isPositionValid(x, y, 'wall')) {
                            this.placeBuilding(x, y, 'wall', 'ENEMY');
                        }
                    }
                }
            }
        }
    }
}

