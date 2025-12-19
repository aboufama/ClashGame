
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

        // Create new building instance
        const newB: SerializedBuilding = {
            id: crypto.randomUUID(),
            type,
            gridX: x,
            gridY: y,
            level: 1
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

        b.level += 1;
        this.saveWorld(world);
        return true;
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

        // Use simplified placement calls (ignoring return value)
        const centerX = 8 + Math.floor(Math.random() * 8);
        const centerY = 8 + Math.floor(Math.random() * 8);

        this.placeBuilding(id, 'town_hall', centerX, centerY);

        const defCount = 5 + Math.floor(Math.random() * 3);


        for (let i = 0; i < defCount; i++) {
            const rx = centerX + (Math.random() > 0.5 ? 4 : -4) + Math.floor(Math.random() * 3);
            const ry = centerY + (Math.random() > 0.5 ? 4 : -4) + Math.floor(Math.random() * 3);

            // Simple weighted random
            const r = Math.random();
            const def = r > 0.92 ? 'xbow' :
                r > 0.82 ? 'prism' :
                    r > 0.72 ? 'magmavent' :
                        r > 0.58 ? 'ballista' :
                            r > 0.42 ? 'tesla' :
                                r > 0.22 ? 'cannon' : 'mortar';

            this.placeBuilding(id, def, rx, ry);
        }

        // Mines (3 max)
        for (let i = 0; i < 3; i++) {
            if (Math.random() > 0.7) continue;
            const rx = centerX + (Math.random() > 0.5 ? 5 : -5) + Math.floor(Math.random() * 2);
            const ry = centerY + (Math.random() > 0.5 ? 5 : -5) + Math.floor(Math.random() * 2);
            this.placeBuilding(id, 'mine', rx, ry);
        }
        // Collectors (3 max)
        for (let i = 0; i < 3; i++) {
            if (Math.random() > 0.7) continue;
            const rx = centerX + (Math.random() > 0.5 ? 6 : -6) + Math.floor(Math.random() * 2);
            const ry = centerY + (Math.random() > 0.5 ? 6 : -6) + Math.floor(Math.random() * 2);
            this.placeBuilding(id, 'elixir_collector', rx, ry);
        }

        // Walls
        // Access array directly since placeBuilding pushes to it
        let minX = MAP_SIZE, minY = MAP_SIZE, maxX = 0, maxY = 0;
        let hasBuildings = false;

        world.buildings.forEach(b => {
            const info = BUILDING_DEFINITIONS[b.type as BuildingType];
            if (info) {
                minX = Math.min(minX, b.gridX);
                minY = Math.min(minY, b.gridY);
                maxX = Math.max(maxX, b.gridX + info.width);
                maxY = Math.max(maxY, b.gridY + info.height);
                hasBuildings = true;
            }
        });

        if (hasBuildings) {
            const wx1 = Math.max(1, minX - 2);
            const wy1 = Math.max(1, minY - 2);
            const wx2 = Math.min(MAP_SIZE - 2, maxX + 1);
            const wy2 = Math.min(MAP_SIZE - 2, maxY + 1);

            for (let x = wx1; x <= wx2; x++) {
                for (let y = wy1; y <= wy2; y++) {
                    if (x === wx1 || x === wx2 || y === wy1 || y === wy2) {
                        this.placeBuilding(id, 'wall', x, y);
                    }
                }
            }
        }

        return world;
    }
}

export const Backend = new GameBackend();
