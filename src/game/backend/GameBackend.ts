
import type { SerializedWorld, SerializedBuilding, SerializedObstacle } from '../data/Models';
import { BUILDING_DEFINITIONS, OBSTACLE_DEFINITIONS, type BuildingType, type ObstacleType, MAP_SIZE, getBuildingStats } from '../config/GameDefinitions';

export class GameBackend {
    private worlds: Map<string, SerializedWorld> = new Map();

    // Simple singleton pattern for now, could be improved
    static instance: GameBackend;

    constructor() {
        if (GameBackend.instance) return GameBackend.instance;
        GameBackend.instance = this;
    }

    public createWorld(id: string, owner: string): SerializedWorld {
        const w: SerializedWorld = {
            id,
            ownerId: owner,
            buildings: [],
            resources: { gold: 0, elixir: 0 },
            lastSaveTime: Date.now()
        };
        this.saveWorld(w);
        return w;
    }

    public getWorld(id: string): SerializedWorld | null {
        if (!this.worlds.has(id)) {
            // Try load from localstorage
            const saved = localStorage.getItem(`clashIso_world_${id}`);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    // Legacy migration: if it's an array (old save format), wrap it
                    if (Array.isArray(parsed)) {
                        const migrated: SerializedWorld = {
                            id,
                            ownerId: 'PLAYER',
                            buildings: parsed.map((b: any) => ({
                                id: crypto.randomUUID(),
                                type: b.type,
                                gridX: b.gridX,
                                gridY: b.gridY,
                                level: 1
                            })),
                            resources: { gold: 0, elixir: 0 },
                            lastSaveTime: Date.now()
                        };
                        this.worlds.set(id, migrated);
                        return migrated;
                    }

                    this.worlds.set(id, parsed);
                } catch (e) {
                    console.error("Failed to load world", e);
                    return null;
                }
            }
        }
        return this.worlds.get(id) || null;
    }

    public getBuildingCount(worldId: string, type: BuildingType): number {
        const world = this.getWorld(worldId);
        if (!world) return 0;
        return world.buildings.filter(b => b.type === type).length;
    }

    public getBuildingCounts(worldId: string): Record<BuildingType, number> {
        const world = this.getWorld(worldId);
        const counts: Record<string, number> = {};
        if (world) {
            world.buildings.forEach(b => {
                counts[b.type] = (counts[b.type] || 0) + 1;
            });
        }
        return counts as Record<BuildingType, number>;
    }

    public saveWorld(world: SerializedWorld) {
        world.lastSaveTime = Date.now();
        this.worlds.set(world.id, world);
        localStorage.setItem(`clashIso_world_${world.id}`, JSON.stringify(world));
    }

    public updateResources(worldId: string, gold: number, elixir: number): void {
        const world = this.getWorld(worldId);
        if (world) {
            world.resources = { gold, elixir };
            this.saveWorld(world);
        }
    }

    public placeBuilding(worldId: string, type: BuildingType, x: number, y: number): SerializedBuilding | null {
        const world = this.getWorld(worldId);
        if (!world) return null;

        if (!this.isValidPosition(world, type, x, y, null)) return null;

        // Check limits
        const info = BUILDING_DEFINITIONS[type];
        const currentCount = world.buildings.filter(b => b.type === type).length;
        if (currentCount >= info.maxCount) return null;

        // Determine initial level (Auto-upgrade walls)
        let initialLevel = 1;
        if (type === 'wall') {
            const walls = world.buildings.filter(b => b.type === 'wall');
            if (walls.length > 0) {
                initialLevel = Math.max(...walls.map(w => w.level || 1));
            }
        }

        // Create new building instance
        const newB: SerializedBuilding = {
            id: crypto.randomUUID(),
            type,
            gridX: x,
            gridY: y,
            level: initialLevel
        };
        world.buildings.push(newB);
        this.saveWorld(world);
        return newB;
    }

    public removeBuilding(worldId: string, buildingInstanceId: string): boolean {
        const world = this.getWorld(worldId);
        if (!world) return false;

        const idx = world.buildings.findIndex(b => b.id === buildingInstanceId);
        if (idx === -1) return false;

        world.buildings.splice(idx, 1);
        this.saveWorld(world);
        return true;
    }

    public upgradeBuilding(worldId: string, buildingId: string): boolean {
        const world = this.getWorld(worldId);
        if (!world) return false;

        const b = world.buildings.find(b => b.id === buildingId);
        if (!b) return false;

        if (b.type === 'wall') {
            const currentLevel = b.level || 1;
            world.buildings.forEach(wb => {
                if (wb.type === 'wall' && (wb.level || 1) === currentLevel) {
                    wb.level = currentLevel + 1;
                }
            });
        } else {
            b.level += 1;
        }

        this.saveWorld(world);
        return true;
    }

    public sanitizeWalls(worldId: string) {
        const world = this.getWorld(worldId);
        if (!world) return;
        let changed = false;
        world.buildings.forEach(b => {
            if (b.type === 'wall' && (b.level || 1) > 1) {
                b.level = 1;
                changed = true;
            }
        });
        if (changed) {
            console.log("Sanitized walls (reset to 1)");
            this.saveWorld(world);
        }
    }


    public resetWorld(worldId: string): void {
        const world = this.getWorld(worldId);
        if (world) {
            world.buildings = [];
            this.saveWorld(world);
        }
    }

    public moveBuilding(worldId: string, buildingId: string, newX: number, newY: number): boolean {
        const world = this.getWorld(worldId);
        if (!world) return false;

        const building = world.buildings.find(b => b.id === buildingId);
        if (!building) return false;

        if (!this.isValidPosition(world, building.type, newX, newY, buildingId)) return false;

        building.gridX = newX;
        building.gridY = newY;
        this.saveWorld(world);
        return true;
    }

    public isValidPosition(world: SerializedWorld, type: BuildingType, x: number, y: number, ignoreId: string | null): boolean {
        const info = BUILDING_DEFINITIONS[type];
        if (x < 0 || y < 0 || x + info.width > MAP_SIZE || y + info.height > MAP_SIZE) return false;

        for (const b of world.buildings) {
            if (b.id === ignoreId) continue;
            // Assuming string type from serialized matches BuildingType
            const bInfo = BUILDING_DEFINITIONS[b.type];
            if (!bInfo) continue;

            const overlapX = Math.max(0, Math.min(x + info.width, b.gridX + bInfo.width) - Math.max(x, b.gridX));
            const overlapY = Math.max(0, Math.min(y + info.height, b.gridY + bInfo.height) - Math.max(y, b.gridY));
            if (overlapX > 0 && overlapY > 0) return false;
        }
        return true;
    }

    // === OBSTACLE MANAGEMENT ===
    public placeObstacle(worldId: string, type: ObstacleType, x: number, y: number): SerializedObstacle | null {
        const world = this.getWorld(worldId);
        if (!world) return null;

        if (!world.obstacles) world.obstacles = [];

        const info = OBSTACLE_DEFINITIONS[type];
        if (!info) return null;

        // Bounds check
        if (x < 0 || y < 0 || x + info.width > MAP_SIZE || y + info.height > MAP_SIZE) return null;

        const newObstacle: SerializedObstacle = {
            id: crypto.randomUUID(),
            type,
            gridX: x,
            gridY: y
        };

        world.obstacles.push(newObstacle);
        this.saveWorld(world);
        return newObstacle;
    }

    public removeObstacle(worldId: string, obstacleId: string): boolean {
        const world = this.getWorld(worldId);
        if (!world || !world.obstacles) return false;

        const idx = world.obstacles.findIndex(o => o.id === obstacleId);
        if (idx === -1) return false;

        world.obstacles.splice(idx, 1);
        this.saveWorld(world);
        return true;
    }

    public getObstacles(worldId: string): SerializedObstacle[] {
        const world = this.getWorld(worldId);
        return world?.obstacles || [];
    }

    public calculateOfflineProduction(worldId: string): { gold: number, elixir: number } {
        const world = this.getWorld(worldId);
        if (!world || !world.lastSaveTime) return { gold: 0, elixir: 0 };

        const now = Date.now();
        const diffMs = now - world.lastSaveTime;
        // Check for meaningful absence (e.g. > 10 seconds)
        if (diffMs < 10000) return { gold: 0, elixir: 0 };

        const diffSeconds = diffMs / 1000;
        const offlineFactor = 0.2; // 5x slower

        let totalGold = 0;
        let totalElixir = 0;

        world.buildings.forEach(b => {
            const stats = getBuildingStats(b.type, b.level || 1);
            if (stats.productionRate && stats.productionRate > 0) {
                const amount = Math.floor(stats.productionRate * diffSeconds * offlineFactor);
                if (b.type === 'mine') totalGold += amount;
                if (b.type === 'elixir_collector') totalElixir += amount;
            }
        });

        if (totalGold > 0 || totalElixir > 0) {
            world.resources.gold += totalGold;
            world.resources.elixir += totalElixir;
            this.saveWorld(world);
        }

        return { gold: totalGold, elixir: totalElixir };
    }

    public generateEnemyWorld(): SerializedWorld {
        const id = `enemy_${Date.now()}`;
        const world = this.createWorld(id, 'ENEMY');

        const cx = Math.floor(MAP_SIZE / 2);
        const cy = Math.floor(MAP_SIZE / 2);

        // 1. CORE: Town Hall + Elite Defenses
        this.placeBuilding(id, 'town_hall', cx, cy);

        // Add 1-2 Elite Defenses near TH
        const elites: BuildingType[] = ['dragons_breath', 'prism', 'xbow'];
        const eliteCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < eliteCount; i++) {
            const ex = cx + (Math.random() > 0.5 ? 2 : -2);
            const ey = cy + (Math.random() > 0.5 ? 2 : -2);
            const b = this.placeBuilding(id, elites[Math.floor(Math.random() * elites.length)], ex, ey);
            if (b) b.level = 3 + Math.floor(Math.random() * 3); // Level 3-5
        }

        // Inner Core Wall (Tight box)
        this.generateRectWall(id, cx - 3, cy - 3, 7, 7); // Shrink for MAP_SIZE 25


        // 2. INNER RING: Compartments (High Value Defenses + Storage)
        // DENSITY adjusted for small map
        const compCount = 3 + Math.floor(Math.random() * 3);
        const compRadius = 6;

        for (let i = 0; i < compCount; i++) {
            const angle = (i / compCount) * Math.PI * 2 + (Math.random() * 0.5);
            const tx = Math.floor(cx + Math.cos(angle) * compRadius);
            const ty = Math.floor(cy + Math.sin(angle) * compRadius);

            // Determine content: Defense + Resource (Variety++)
            const roll = Math.random();
            const defType = (roll > 0.85 ? 'dragons_breath' :
                roll > 0.7 ? 'magmavent' :
                    roll > 0.55 ? 'xbow' :
                        roll > 0.4 ? 'mortar' :
                            roll > 0.25 ? 'tesla' : 'ballista') as BuildingType;
            const resType = (Math.random() > 0.5 ? 'mine' : 'elixir_collector') as BuildingType;

            const bDef = this.placeBuilding(id, defType, tx, ty);
            if (bDef) bDef.level = 2 + Math.floor(Math.random() * 4); // Level 2-5

            // Try to place resource next to it
            const bRes = this.placeBuilding(id, resType, tx + 1, ty + 1);
            if (bRes) bRes.level = 1 + Math.floor(Math.random() * 5); // Level 1-5

            // Build Wall Compartment around this cluster
            this.generateRectWall(id, tx - 2, ty - 2, 5, 5);
        }

        // 3. OUTER LAYER: Scattered Defenses and Trash
        // Adjusted for small map
        const outerCount = 12 + Math.floor(Math.random() * 8);
        for (let i = 0; i < outerCount; i++) {
            // Random position in outer area
            const r = 9 + Math.random() * 3; // Radius 9-12
            const theta = Math.random() * Math.PI * 2;
            const ox = Math.floor(cx + Math.cos(theta) * r);
            const oy = Math.floor(cy + Math.sin(theta) * r);

            // Mix with more variety
            const roll = Math.random();
            const oType = (roll > 0.9 ? 'magmavent' :
                roll > 0.8 ? 'mortar' :
                    roll > 0.7 ? 'tesla' :
                        roll > 0.5 ? 'cannon' :
                            roll > 0.3 ? 'ballista' :
                                roll > 0.15 ? 'army_camp' : 'mine') as BuildingType;

            const b = this.placeBuilding(id, oType, ox, oy);
            if (b) b.level = 1 + Math.floor(Math.random() * 4); // Level 1-4
        }

        // 4. OUTER PERIMETER WALL
        // Big wall enclosing most things (shrunk for deployment space)
        this.generateRectWall(id, 3, 3, MAP_SIZE - 7, MAP_SIZE - 7);

        // 5. Set Large Resources (Fake loot for incentive)
        world.resources = {
            gold: Math.floor(50000 + Math.random() * 100000),
            elixir: Math.floor(50000 + Math.random() * 100000)
        };

        return world;
    }

    private generateRectWall(id: string, x: number, y: number, w: number, h: number) {
        // Bounds check/clamping handled by placeBuilding mostly, but let's be safe
        const safeX = Math.max(0, x);
        const safeY = Math.max(0, y);
        const safeW = Math.min(MAP_SIZE - 1 - safeX, w);
        const safeH = Math.min(MAP_SIZE - 1 - safeY, h);

        // Top & Bottom
        for (let i = 0; i <= safeW; i++) {
            this.placeBuilding(id, 'wall', safeX + i, safeY);
            this.placeBuilding(id, 'wall', safeX + i, safeY + safeH);
        }
        // Left & Right
        for (let j = 0; j <= safeH; j++) {
            this.placeBuilding(id, 'wall', safeX, safeY + j);
            this.placeBuilding(id, 'wall', safeX + safeW, safeY + j);
        }
    }
}

export const Backend = new GameBackend();
