
import type { SerializedWorld, SerializedBuilding, SerializedObstacle } from '../data/Models';
import { BUILDING_DEFINITIONS, OBSTACLE_DEFINITIONS, type BuildingType, type ObstacleType, MAP_SIZE, getBuildingStats } from '../config/GameDefinitions';

export class GameBackend {
    private worlds: Map<string, SerializedWorld> = new Map();
    static instance: GameBackend;

    constructor() {
        if (GameBackend.instance) return GameBackend.instance;
        GameBackend.instance = this;
    }

    public async deleteWorld(worldId: string): Promise<void> {
        this.worlds.delete(worldId);
        localStorage.removeItem(`clashIso_world_${worldId}`);
    }

    // --- LOCAL STORAGE ONLY ---

    public async saveWorld(world: SerializedWorld): Promise<void> {
        world.lastSaveTime = Date.now();
        this.worlds.set(world.id, world); // Update local cache
        if (world.ownerId === 'ENEMY' || world.id.startsWith('enemy_')) return;
        localStorage.setItem(`clashIso_world_${world.id}`, JSON.stringify(world));
    }

    public async getWorld(id: string): Promise<SerializedWorld | null> {
        // 1. Check Memory Cache
        if (this.worlds.has(id)) return this.worlds.get(id)!;

        // 2. Check Local Storage
        const saved = localStorage.getItem(`clashIso_world_${id}`);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.worlds.set(id, parsed);
                return parsed;
            } catch { }
        }

        return null;
    }

    public async getBuildingCounts(worldId: string): Promise<Record<string, number>> {
        const world = await this.getWorld(worldId);
        if (!world) return {};
        const counts: Record<string, number> = {};
        world.buildings.forEach(b => {
            counts[b.type] = (counts[b.type] || 0) + 1;
        });
        return counts;
    }

    public async createWorld(id: string, owner: string): Promise<SerializedWorld> {
        const w: SerializedWorld = {
            id,
            ownerId: owner,
            username: 'Player',
            buildings: [],
            resources: { gold: 1000, elixir: 1000 },
            army: {},
            lastSaveTime: Date.now()
        };
        await this.saveWorld(w);
        return w;
    }

    // --- GAME LOGIC ---

    public async updateArmy(worldId: string, army: Record<string, number>): Promise<void> {
        const world = await this.getWorld(worldId);
        if (world) {
            world.army = { ...army };
            await this.saveWorld(world);
        }
    }

    public async updateResources(worldId: string, gold: number, elixir: number): Promise<void> {
        const world = await this.getWorld(worldId);
        if (world) {
            world.resources = {
                gold: Math.max(0, gold),
                elixir: Math.max(0, elixir)
            };
            await this.saveWorld(world);
        }
    }

    public async placeBuilding(worldId: string, type: BuildingType, x: number, y: number): Promise<SerializedBuilding | null> {
        const world = await this.getWorld(worldId);
        if (!world) return null;

        if (!this.isValidPosition(world, type, x, y, null)) return null;

        const info = BUILDING_DEFINITIONS[type];
        const currentCount = world.buildings.filter(b => b.type === type).length;
        if (currentCount >= info.maxCount) return null;

        let initialLevel = 1;
        if (type === 'wall') {
            const walls = world.buildings.filter(b => b.type === 'wall');
            if (walls.length > 0) {
                initialLevel = Math.max(...walls.map(w => w.level || 1));
            }
        }

        const newB: SerializedBuilding = {
            id: crypto.randomUUID(),
            type,
            gridX: x,
            gridY: y,
            level: initialLevel
        };
        world.buildings.push(newB);
        await this.saveWorld(world);
        return newB;
    }

    public async removeBuilding(worldId: string, buildingInstanceId: string): Promise<boolean> {
        const world = await this.getWorld(worldId);
        if (!world) return false;

        const idx = world.buildings.findIndex(b => b.id === buildingInstanceId);
        if (idx === -1) return false;

        world.buildings.splice(idx, 1);
        await this.saveWorld(world);
        return true;
    }

    public async upgradeBuilding(worldId: string, buildingId: string): Promise<boolean> {
        const world = await this.getWorld(worldId);
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

        await this.saveWorld(world);
        return true;
    }

    public async moveBuilding(worldId: string, buildingId: string, newX: number, newY: number): Promise<boolean> {
        const world = await this.getWorld(worldId);
        if (!world) return false;

        const building = world.buildings.find(b => b.id === buildingId);
        if (!building) return false;

        if (!this.isValidPosition(world, building.type, newX, newY, buildingId)) return false;

        building.gridX = newX;
        building.gridY = newY;
        await this.saveWorld(world);
        return true;
    }

    public isValidPosition(world: SerializedWorld, type: BuildingType, x: number, y: number, ignoreId: string | null): boolean {
        const info = BUILDING_DEFINITIONS[type];
        if (x < 0 || y < 0 || x + info.width > MAP_SIZE || y + info.height > MAP_SIZE) return false;

        for (const b of world.buildings) {
            if (b.id === ignoreId) continue;
            const bInfo = BUILDING_DEFINITIONS[b.type];
            if (!bInfo) continue;

            const overlapX = Math.max(0, Math.min(x + info.width, b.gridX + bInfo.width) - Math.max(x, b.gridX));
            const overlapY = Math.max(0, Math.min(y + info.height, b.gridY + bInfo.height) - Math.max(y, b.gridY));
            if (overlapX > 0 && overlapY > 0) return false;
        }
        return true;
    }

    // === OBSTACLE MANAGEMENT ===
    public async placeObstacle(worldId: string, type: ObstacleType, x: number, y: number): Promise<SerializedObstacle | null> {
        const world = await this.getWorld(worldId);
        if (!world) return null;
        if (!world.obstacles) world.obstacles = [];

        const info = OBSTACLE_DEFINITIONS[type];
        if (!info) return null;

        if (x < 0 || y < 0 || x + info.width > MAP_SIZE || y + info.height > MAP_SIZE) return null;

        const newObstacle: SerializedObstacle = {
            id: crypto.randomUUID(),
            type,
            gridX: x,
            gridY: y
        };

        world.obstacles.push(newObstacle);
        await this.saveWorld(world);
        return newObstacle;
    }

    public async removeObstacle(worldId: string, obstacleId: string): Promise<boolean> {
        const world = await this.getWorld(worldId);
        if (!world || !world.obstacles) return false;

        const idx = world.obstacles.findIndex(o => o.id === obstacleId);
        if (idx === -1) return false;

        world.obstacles.splice(idx, 1);
        await this.saveWorld(world);
        return true;
    }

    public async calculateOfflineProduction(worldId: string): Promise<{ gold: number, elixir: number }> {
        const world = await this.getWorld(worldId);
        if (!world || !world.lastSaveTime) return { gold: 0, elixir: 0 };

        const now = Date.now();
        const diffMs = now - world.lastSaveTime;
        if (diffMs < 10000) return { gold: 0, elixir: 0 };

        const diffSeconds = diffMs / 1000;
        const offlineFactor = 0.2;

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
            await this.saveWorld(world);
        }

        return { gold: totalGold, elixir: totalElixir };
    }

    public async generateEnemyWorld(): Promise<SerializedWorld> {
        // Purely local generation for attacks
        const id = `enemy_${Date.now()}`;
        return await this.generateEnemyWorldFull(id);
    }

    private async generateEnemyWorldFull(id: string): Promise<SerializedWorld> {
        const world = await this.createWorld(id, 'ENEMY');
        const cx = Math.floor(MAP_SIZE / 2);
        const cy = Math.floor(MAP_SIZE / 2);

        // Helper to get random level for a building type
        const getRandomLevel = (type: BuildingType): number => {
            const maxLevel = BUILDING_DEFINITIONS[type].maxLevel || 1;
            return 1 + Math.floor(Math.random() * maxLevel);
        };

        // Random wall level for this base (1-3)
        const wallLevel = 1 + Math.floor(Math.random() * 3);

        await this.placeBuilding(id, 'town_hall', cx, cy);

        // Add 2-4 Elite Defenses near TH
        const elites: BuildingType[] = ['dragons_breath', 'prism', 'xbow', 'magmavent', 'spike_launcher'];
        const eliteCount = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < eliteCount; i++) {
            const ex = cx + (Math.random() > 0.5 ? 3 : -3) + Math.floor(Math.random() * 2);
            const ey = cy + (Math.random() > 0.5 ? 3 : -3) + Math.floor(Math.random() * 2);
            const eliteType = elites[Math.floor(Math.random() * elites.length)];
            const b = await this.placeBuilding(id, eliteType, ex, ey);
            if (b) b.level = getRandomLevel(eliteType);
        }

        await this.generateRectWall(id, cx - 3, cy - 3, 7, 7, wallLevel);

        // Add compartments with varied defenses
        const compCount = 3 + Math.floor(Math.random() * 3);
        const compRadius = 6;
        for (let i = 0; i < compCount; i++) {
            const angle = (i / compCount) * Math.PI * 2 + (Math.random() * 0.5);
            const tx = Math.floor(cx + Math.cos(angle) * compRadius);
            const ty = Math.floor(cy + Math.sin(angle) * compRadius);

            // More varied defense types
            const roll = Math.random();
            let defType: BuildingType;
            if (roll > 0.9) defType = 'dragons_breath';
            else if (roll > 0.8) defType = 'magmavent';
            else if (roll > 0.7) defType = 'spike_launcher';
            else if (roll > 0.55) defType = 'xbow';
            else if (roll > 0.4) defType = 'ballista';
            else if (roll > 0.25) defType = 'tesla';
            else defType = 'mortar';

            const b = await this.placeBuilding(id, defType, tx, ty);
            if (b) b.level = getRandomLevel(defType);

            const mine = await this.placeBuilding(id, 'mine', tx + 1, ty + 1);
            if (mine) mine.level = getRandomLevel('mine');

            await this.generateRectWall(id, tx - 2, ty - 2, 5, 5, wallLevel);
        }

        // Outer defenses ring - varied types with random levels
        const outerDefenseTypes: BuildingType[] = ['cannon', 'cannon', 'cannon', 'ballista', 'tesla', 'mortar'];
        const outerCount = 12 + Math.floor(Math.random() * 4);
        for (let i = 0; i < outerCount; i++) {
            const r = 9 + Math.random() * 3;
            const theta = Math.random() * Math.PI * 2;
            const ox = Math.floor(cx + Math.cos(theta) * r);
            const oy = Math.floor(cy + Math.sin(theta) * r);
            const defType = outerDefenseTypes[Math.floor(Math.random() * outerDefenseTypes.length)];
            const b = await this.placeBuilding(id, defType, ox, oy);
            if (b) b.level = getRandomLevel(defType);
        }

        await this.generateRectWall(id, 3, 3, MAP_SIZE - 7, MAP_SIZE - 7, wallLevel);

        world.resources = {
            gold: Math.floor(50000 + Math.random() * 100000),
            elixir: Math.floor(50000 + Math.random() * 100000)
        };
        await this.saveWorld(world);
        return world;
    }

    private async generateRectWall(id: string, x: number, y: number, w: number, h: number, level: number = 1) {
        const safeX = Math.max(0, x);
        const safeY = Math.max(0, y);
        const safeW = Math.min(MAP_SIZE - 1 - safeX, w);
        const safeH = Math.min(MAP_SIZE - 1 - safeY, h);

        for (let i = 0; i <= safeW; i++) {
            const b1 = await this.placeBuilding(id, 'wall', safeX + i, safeY);
            if (b1) b1.level = level;
            const b2 = await this.placeBuilding(id, 'wall', safeX + i, safeY + safeH);
            if (b2) b2.level = level;
        }
        for (let j = 0; j <= safeH; j++) {
            const b1 = await this.placeBuilding(id, 'wall', safeX, safeY + j);
            if (b1) b1.level = level;
            const b2 = await this.placeBuilding(id, 'wall', safeX + safeW, safeY + j);
            if (b2) b2.level = level;
        }
    }
}

export const Backend = new GameBackend();
