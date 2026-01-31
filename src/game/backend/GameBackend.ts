
import type { SerializedWorld, SerializedBuilding, SerializedObstacle } from '../data/Models';
import { BUILDING_DEFINITIONS, OBSTACLE_DEFINITIONS, type BuildingType, type ObstacleType, MAP_SIZE, getBuildingStats } from '../config/GameDefinitions';
import { Auth } from './AuthService';

// API base URL
const API_BASE = '';

export class GameBackend {
    private worlds: Map<string, SerializedWorld> = new Map();
    static instance: GameBackend;
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;
    private pendingSave: SerializedWorld | null = null;

    constructor() {
        if (GameBackend.instance) return GameBackend.instance;
        GameBackend.instance = this;
    }

    // Check if we're in online mode
    private isOnline(): boolean {
        return Auth.isOnlineMode();
    }

    private getSessionToken(): string | null {
        return Auth.getCurrentUser()?.sessionToken ?? null;
    }

    private normalizeWorld(world: SerializedWorld): SerializedWorld {
        const canonicalize = (value: string) =>
            value.trim().toLowerCase().replace(/[\s-]+/g, '_');

        const readCoord = (raw: Record<string, unknown>, keys: string[]): number => {
            for (const key of keys) {
                if (!(key in raw)) continue;
                const n = Number(raw[key]);
                if (Number.isFinite(n)) return n;
            }
            return NaN;
        };

        world.buildings = world.buildings.map((building) => {
            const raw = building as unknown as Record<string, unknown>;
            const rawType = typeof raw.type === 'string' ? raw.type : '';
            const canonical = canonicalize(rawType || '');
            let normalizedType = canonical;
            if (normalizedType === 'mine' || normalizedType === 'elixir_collector' || normalizedType === 'gold_mine' || normalizedType === 'elixir_pump' || normalizedType === 'gold_collector' || normalizedType === 'solana_mine') {
                normalizedType = 'solana_collector';
            }

            const gridX = Number.isFinite(building.gridX)
                ? building.gridX
                : readCoord(raw, ['gridX', 'x', 'grid_x', 'tileX', 'posX']);
            const gridY = Number.isFinite(building.gridY)
                ? building.gridY
                : readCoord(raw, ['gridY', 'y', 'grid_y', 'tileY', 'posY']);

            let id = building.id as unknown as string;
            if (typeof id !== 'string' || !id.trim()) {
                if (typeof raw.id === 'number' && Number.isFinite(raw.id)) id = String(raw.id);
                else if (typeof raw.uuid === 'string') id = raw.uuid;
                else if (typeof raw.instanceId === 'string') id = raw.instanceId;
            }

            let level = typeof building.level === 'number' && Number.isFinite(building.level)
                ? building.level
                : typeof raw.level === 'number' && Number.isFinite(raw.level)
                    ? raw.level as number
                    : (typeof raw.lvl === 'number' && Number.isFinite(raw.lvl) ? raw.lvl as number : 1);

            // Clamp level to valid range [1, maxLevel]
            const def = BUILDING_DEFINITIONS[normalizedType as BuildingType];
            if (def) {
                const maxLvl = def.maxLevel ?? 1;
                level = Math.max(1, Math.min(level, maxLvl));
            }

            return {
                ...building,
                id,
                type: normalizedType as BuildingType,
                gridX,
                gridY,
                level
            };
        }).filter((building) => {
            if (!Number.isFinite(building.gridX) || !Number.isFinite(building.gridY)) return false;
            const type = building.type as BuildingType;
            return !!BUILDING_DEFINITIONS[type];
        });

        const resources = (world.resources as unknown as Record<string, unknown>) || {};
        if (typeof resources.sol === 'number' && Number.isFinite(resources.sol)) {
            world.resources = { sol: Math.max(0, resources.sol) };
            return world;
        }

        const legacyGold = typeof resources.gold === 'number' ? resources.gold : 0;
        const legacyElixir = typeof resources.elixir === 'number' ? resources.elixir : 0;
        world.resources = { sol: Math.max(0, legacyGold + legacyElixir) };
        return world;
    }

    public getCachedWorld(id: string): SerializedWorld | null {
        return this.worlds.get(id) ?? null;
    }

    public async refreshWorldFromCloud(id: string): Promise<SerializedWorld | null> {
        if (!this.isOnline()) return this.getCachedWorld(id);
        if (id.startsWith('enemy_') || id.startsWith('bot_')) return this.getCachedWorld(id);

        const cached = this.worlds.get(id) ?? null;
        const loaded = await this.loadFromCloud(id);
        if (!loaded) return cached;

        const normalized = this.normalizeWorld(loaded);
        const hasTownHall = normalized.buildings.some(b => b.type === 'town_hall');
        if (normalized.buildings.length === 0 || !hasTownHall) return cached;

        const cachedSave = cached?.lastSaveTime ?? 0;
        const loadedSave = normalized.lastSaveTime ?? 0;
        if (cached && loadedSave <= cachedSave) return cached;

        this.worlds.set(id, normalized);
        return normalized;
    }

    public async deleteWorld(worldId: string): Promise<void> {
        this.worlds.delete(worldId);
        localStorage.removeItem(`clashIso_world_${worldId}`);
    }

    // --- CLOUD SYNC ---

    private async syncToCloud(world: SerializedWorld): Promise<void> {
        if (!this.isOnline() || world.ownerId === 'ENEMY' || world.id.startsWith('enemy_') || world.id.startsWith('bot_')) {
            return;
        }

        try {
            const user = Auth.getCurrentUser();
            if (!user?.id || !user?.username) return;
            const sessionToken = this.getSessionToken();
            const response = await fetch(`${API_BASE}/api/bases/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    username: user.username,
                    buildings: world.buildings,
                    obstacles: world.obstacles,
                    resources: world.resources,
                    army: world.army,
                    revision: world.revision,
                    ...(sessionToken ? { sessionToken } : {})
                })
            });

            if (response.ok) {
                const data = await response.json().catch(() => ({}));
                if (data && typeof data.revision === 'number') {
                    world.revision = data.revision;
                }
                console.log(`Cloud sync successful for ${user?.username} (ID: ${user?.id})`);
            } else {
                if (response.status === 401) {
                    console.warn('Cloud sync rejected (session invalid). Switching to offline mode.');
                    Auth.setOnlineMode(false);
                    return;
                }
                if (response.status === 409) {
                    // Stale revision; keep cache but refresh from cloud in background
                    void this.refreshWorldFromCloud(world.id);
                }
                const errorData = await response.json().catch(() => ({}));
                console.error('Cloud sync failed with status:', response.status, errorData);
            }
        } catch (error) {
            console.error('Failed to sync to cloud:', error);
        }
    }

    public async loadFromCloud(userId: string): Promise<SerializedWorld | null> {
        if (!this.isOnline()) return null;

        try {
            const response = await fetch(`${API_BASE}/api/bases/load?userId=${encodeURIComponent(userId)}`);
            if (response.status === 404) return null; // Base doesn't exist yet
            if (!response.ok) {
                console.error('Cloud load failed with status:', response.status);
                return null;
            }

            const data = await response.json();
            if (data.success && data.base) {
                const normalized = this.normalizeWorld(data.base);
                this.worlds.set(userId, normalized);
                return normalized;
            }
            return null;
        } catch (error) {
            console.error('Failed to load from cloud:', error);
            return null;
        }
    }

    public async bootstrapBase(userId: string): Promise<SerializedWorld | null> {
        if (!this.isOnline()) return null;
        const sessionToken = this.getSessionToken();
        if (!sessionToken) return null;

        try {
            const response = await fetch(`${API_BASE}/api/bases/bootstrap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, sessionToken })
            });
            if (!response.ok) {
                if (response.status === 401) {
                    Auth.setOnlineMode(false);
                }
                return null;
            }
            const data = await response.json();
            if (data && data.success && data.base) {
                const normalized = this.normalizeWorld(data.base);
                this.worlds.set(userId, normalized);
                return normalized;
            }
            return null;
        } catch (error) {
            console.error('Failed to bootstrap base:', error);
            return null;
        }
    }

    /**
     * Force a fresh load from the cloud, bypassing memory cache
     */
    public async forceLoadFromCloud(userId: string): Promise<SerializedWorld | null> {
        const previous = this.worlds.get(userId) || null;
        this.worlds.delete(userId);
        const loaded = await this.loadFromCloud(userId);
        if (loaded) {
            const hasTownHall = loaded.buildings.some(b => b.type === 'town_hall');
            if (loaded.buildings.length > 0 && hasTownHall) {
                return loaded;
            }
            // Reject empty/invalid loads in favor of last known good base.
        }
        if (previous) {
            this.worlds.set(userId, previous);
            return previous;
        }
        return null;
    }

    public async getOnlineBase(excludeUserId: string): Promise<SerializedWorld | null> {
        if (!this.isOnline()) return null;
        try {
            const response = await fetch(`${API_BASE}/api/bases/online?excludeUserId=${encodeURIComponent(excludeUserId)}`);
            if (!response.ok) return null;

            const data = await response.json();
            if (data.success && data.base) {
                return this.normalizeWorld(data.base);
            }
            if (data.success && data.candidate && data.candidate.id) {
                const base = await this.loadFromCloud(data.candidate.id);
                if (base) {
                    return base;
                }
            }
            return null;
        } catch (error) {
            console.error('Failed to get online base:', error);
            return null;
        }
    }

    // Record attack result and notify victim
    public async recordAttack(
        victimId: string,
        attackerId: string,
        attackerName: string,
        solLooted: number,
        destruction: number,
        attackId?: string
    ): Promise<{ lootApplied?: number; attackerBalance?: number } | null> {
        if (!this.isOnline()) return null;
        if (!victimId || victimId.startsWith('bot_') || victimId.startsWith('enemy_')) return null;

        try {
            const sessionToken = this.getSessionToken();
            const response = await fetch(`${API_BASE}/api/notifications/attack`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    victimId,
                    attackerId,
                    attackerName,
                    solLooted,
                    destruction,
                    ...(attackId ? { attackId } : {}),
                    ...(sessionToken ? { sessionToken } : {})
                })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    Auth.setOnlineMode(false);
                }
                return null;
            }
            const data = await response.json();
            return {
                lootApplied: typeof data.lootApplied === 'number' ? data.lootApplied : undefined,
                attackerBalance: typeof data.attackerBalance === 'number' ? data.attackerBalance : undefined
            };
        } catch (error) {
            console.error('Failed to record attack:', error);
            return null;
        }
    }

    // Apply a resource delta in a server-authoritative way (online) or locally (offline)
    public async applyResourceDelta(userId: string, delta: number, reason?: string, refId?: string): Promise<{ sol: number; applied: boolean } | null> {
        if (!this.isOnline()) {
            const world = await this.getWorld(userId);
            if (!world) return null;
            world.resources.sol = Math.max(0, world.resources.sol + delta);
            await this.saveWorld(world);
            return { sol: world.resources.sol, applied: true };
        }

        try {
            const sessionToken = this.getSessionToken();
            const response = await fetch(`${API_BASE}/api/resources/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    delta,
                    reason,
                    refId,
                    ...(sessionToken ? { sessionToken } : {})
                })
            });
            if (!response.ok) {
                if (response.status === 401) {
                    Auth.setOnlineMode(false);
                }
                return null;
            }
            const data = await response.json();
            if (data && typeof data.sol === 'number') {
                return { sol: data.sol, applied: !!data.applied };
            }
            return null;
        } catch (error) {
            console.error('Failed to apply resource delta:', error);
            return null;
        }
    }

    public async getResourceBalance(userId: string): Promise<number | null> {
        if (!this.isOnline()) return null;
        try {
            const response = await fetch(`${API_BASE}/api/resources/balance?userId=${encodeURIComponent(userId)}`);
            if (!response.ok) return null;
            const data = await response.json();
            return typeof data.sol === 'number' ? data.sol : null;
        } catch (error) {
            console.error('Failed to fetch resource balance:', error);
            return null;
        }
    }

    // Get attack notifications
    public async getNotifications(userId: string): Promise<any[]> {
        if (!this.isOnline()) return [];

        try {
            const response = await fetch(`${API_BASE}/api/notifications/attack?userId=${encodeURIComponent(userId)}`);
            if (!response.ok) return [];

            const data = await response.json();
            return data.notifications || [];
        } catch (error) {
            console.error('Failed to get notifications:', error);
            return [];
        }
    }

    public async getUnreadNotificationCount(userId: string): Promise<number> {
        if (!this.isOnline()) return 0;

        try {
            const response = await fetch(`${API_BASE}/api/notifications/attack?userId=${encodeURIComponent(userId)}`);
            if (!response.ok) return 0;

            const data = await response.json();
            return data.unreadCount || 0;
        } catch (error) {
            return 0;
        }
    }

    public async markNotificationsRead(userId: string): Promise<void> {
        if (!this.isOnline()) return;

        try {
            const sessionToken = this.getSessionToken();
            const response = await fetch(`${API_BASE}/api/notifications/attack`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    ...(sessionToken ? { sessionToken } : {})
                })
            });
            if (!response.ok && response.status === 401) {
                Auth.setOnlineMode(false);
            }
        } catch (error) {
            console.error('Failed to mark notifications read:', error);
        }
    }

    // --- LOCAL STORAGE ---

    public async saveWorld(world: SerializedWorld, immediate: boolean = false): Promise<void> {
        world.lastSaveTime = Date.now();
        const normalized = this.normalizeWorld(world);
        this.worlds.set(world.id, normalized);

        // Don't save enemy worlds
        if (world.ownerId === 'ENEMY' || world.id.startsWith('enemy_') || world.id.startsWith('bot_')) return;

        // Save to local storage (offline only)
        if (!this.isOnline()) {
            try {
                localStorage.setItem(`clashIso_world_${world.id}`, JSON.stringify(normalized));
            } catch (error) {
                console.warn('Failed to persist world to localStorage:', error);
            }
        }

        // Cloud sync
        if (this.isOnline()) {
            if (immediate) {
                // Clear any pending timeout
                if (this.saveTimeout) {
                    clearTimeout(this.saveTimeout);
                    this.saveTimeout = null;
                }
                this.pendingSave = null;
                await this.syncToCloud(normalized);
            } else {
                // Debounced cloud sync (every 500ms max for faster persistence)
                this.pendingSave = normalized;
                if (!this.saveTimeout) {
                    this.saveTimeout = setTimeout(async () => {
                        if (this.pendingSave) {
                            await this.syncToCloud(this.pendingSave);
                            this.pendingSave = null;
                        }
                        this.saveTimeout = null;
                    }, 500);
                }
            }
        }
    }

    public async flushPendingSave(): Promise<void> {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        if (!this.pendingSave) return;
        const pending = this.pendingSave;
        this.pendingSave = null;
        if (this.isOnline()) {
            await this.syncToCloud(pending);
        }
    }

    public async getWorld(id: string): Promise<SerializedWorld | null> {
        // 1. Check Memory Cache
        if (this.worlds.has(id)) return this.worlds.get(id)!;

        // 2. Try cloud first if online
        if (this.isOnline() && !id.startsWith('enemy_') && !id.startsWith('bot_')) {
            try {
                const cloudWorld = await this.loadFromCloud(id);
                if (cloudWorld) {
                    const normalized = this.normalizeWorld(cloudWorld);
                    this.worlds.set(id, normalized);
                    return normalized;
                } else {
                    // Cloud returned 404 (null). Explicitly no base found in cloud.
                    // We should return null to trigger fresh placement instead of using stale local storage.
                    return null;
                }
            } catch (error) {
                console.error('getWorld: Cloud load error, will attempt local storage fallback', error);
            }
        }

        // 3. Check Local Storage (offline only)
        if (this.isOnline()) {
            return null;
        }
        const saved = localStorage.getItem(`clashIso_world_${id}`);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const normalized = this.normalizeWorld(parsed);
                this.worlds.set(id, normalized);
                return normalized;
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
        const user = Auth.getCurrentUser();
        const w: SerializedWorld = {
            id,
            ownerId: owner,
            username: user?.username || 'Commander',
            buildings: [],
            resources: { sol: 200000 },
            army: {},
            lastSaveTime: Date.now(),
            revision: 1
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

    public async updateResources(worldId: string, sol: number): Promise<void> {
        const world = await this.getWorld(worldId);
        if (world) {
            world.resources = {
                sol: Math.max(0, sol)
            };
            if (!this.isOnline()) {
                await this.saveWorld(world);
            }
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
        await this.saveWorld(world, true); // Immediate sync for placement
        return newB;
    }

    public async removeBuilding(worldId: string, buildingInstanceId: string): Promise<boolean> {
        const world = await this.getWorld(worldId);
        if (!world) return false;

        const idx = world.buildings.findIndex(b => b.id === buildingInstanceId);
        if (idx === -1) return false;

        world.buildings.splice(idx, 1);
        await this.saveWorld(world, true); // Immediate sync for removal
        return true;
    }

    public async upgradeBuilding(worldId: string, buildingId: string): Promise<boolean> {
        const world = await this.getWorld(worldId);
        if (!world) return false;

        const b = world.buildings.find(b => b.id === buildingId);
        if (!b) return false;

        const def = BUILDING_DEFINITIONS[b.type];
        const maxLevel = def?.maxLevel ?? 1;

        if (b.type === 'wall') {
            const currentLevel = b.level || 1;
            if (currentLevel >= maxLevel) return false;
            world.buildings.forEach(wb => {
                if (wb.type === 'wall' && (wb.level || 1) === currentLevel) {
                    wb.level = currentLevel + 1;
                }
            });
        } else {
            if ((b.level || 1) >= maxLevel) return false;
            b.level = (b.level || 1) + 1;
        }

        await this.saveWorld(world, true); // Immediate sync for upgrade
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
        await this.saveWorld(world, true); // Immediate sync for move
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
        await this.saveWorld(world, true); // Immediate sync
        return newObstacle;
    }

    public async removeObstacle(worldId: string, obstacleId: string): Promise<boolean> {
        const world = await this.getWorld(worldId);
        if (!world || !world.obstacles) return false;

        const idx = world.obstacles.findIndex(o => o.id === obstacleId);
        if (idx === -1) return false;

        world.obstacles.splice(idx, 1);
        await this.saveWorld(world, true); // Immediate sync
        return true;
    }

    public async calculateOfflineProduction(worldId: string): Promise<{ sol: number }> {
        const world = await this.getWorld(worldId);
        if (!world || !world.lastSaveTime) return { sol: 0 };

        const now = Date.now();
        const diffMs = now - world.lastSaveTime;
        if (diffMs < 10000) return { sol: 0 };

        const diffSeconds = diffMs / 1000;
        const offlineFactor = 0.2;

        let totalSol = 0;

        world.buildings.forEach(b => {
            const stats = getBuildingStats(b.type, b.level || 1);
            if (stats.productionRate && stats.productionRate > 0) {
                const amount = Math.floor(stats.productionRate * diffSeconds * offlineFactor);
                totalSol += amount;
            }
        });

        if (totalSol > 0) {
            if (this.isOnline()) {
                const result = await this.applyResourceDelta(worldId, totalSol, 'offline_production');
                if (result) {
                    world.resources.sol = result.sol;
                }
            } else {
                world.resources.sol += totalSol;
                await this.saveWorld(world);
            }
        }

        return { sol: totalSol };
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

        // Random wall level for this base
        const wallMaxLevel = BUILDING_DEFINITIONS.wall.maxLevel ?? 1;
        const wallLevel = 1 + Math.floor(Math.random() * wallMaxLevel);

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

            const defInfo = BUILDING_DEFINITIONS[defType];

            // Smart Placement for 4x4 internal area (tx-1 to tx+2)
            // If defense is small (<=2x2), we can fit both.
            // If defense is large, we center it and skip collector.
            if (defInfo.width <= 2 && defInfo.height <= 2) {
                // Place Defense at Top-Left of comp (tx-1, ty-1)
                const b = await this.placeBuilding(id, defType, tx - 1, ty - 1);
                if (b) b.level = getRandomLevel(defType);

                // Place Collector at Bottom-Right of comp (tx+1, ty+1)
                const collector = await this.placeBuilding(id, 'solana_collector', tx + 1, ty + 1);
                if (collector) collector.level = getRandomLevel('solana_collector');
            } else {
                // Large Defense: Place centered-ish (tx-1, ty-1 covers 3x3 or 4x4 well in 4x4 space)
                const b = await this.placeBuilding(id, defType, tx - 1, ty - 1);
                if (b) b.level = getRandomLevel(defType);
                // Skip collector to avoid overlap
            }

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
            sol: Math.floor(100000 + Math.random() * 200000)
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
