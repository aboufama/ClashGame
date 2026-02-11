import { BUILDING_DEFINITIONS, type BuildingType, type ObstacleType } from '../config/GameDefinitions';
import type { SerializedBuilding, SerializedObstacle, SerializedWorld } from '../data/Models';
import { Auth } from './Auth';

const CACHE_PREFIX = 'clash.base.';
const SAVE_DELAY_MS = 350;

type ResourceDeltaResult = { applied: boolean; sol: number };

function getCacheKey(userId: string) {
  return `${CACHE_PREFIX}${userId}`;
}

function randomId(prefix = 'b_') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID()}`;
  }
  return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class Backend {
  private static memoryCache = new Map<string, SerializedWorld>();
  private static saveTimers = new Map<string, number>();
  private static inFlightSaves = new Map<string, Promise<void>>();
  private static cacheKeyPrefix = CACHE_PREFIX;

  private static async apiPost<T>(path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const response = await fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!response.ok) {
      throw new Error(`API ${path} failed (${response.status})`);
    }
    return (await response.json()) as T;
  }

  static getCachedWorld(userId: string): SerializedWorld | null {
    const memory = Backend.memoryCache.get(userId);
    if (memory) return memory;
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(getCacheKey(userId));
    if (!raw) return null;
    try {
      const world = JSON.parse(raw) as SerializedWorld;
      Backend.memoryCache.set(userId, world);
      return world;
    } catch {
      return null;
    }
  }

  private static setCachedWorld(userId: string, world: SerializedWorld, persist = true) {
    Backend.memoryCache.set(userId, world);
    if (persist && typeof window !== 'undefined') {
      localStorage.setItem(getCacheKey(userId), JSON.stringify(world));
    }
  }

  private static scheduleSave(userId: string) {
    if (!Auth.isOnlineMode()) return;
    const existing = Backend.saveTimers.get(userId);
    if (existing) window.clearTimeout(existing);
    const handle = window.setTimeout(() => {
      void Backend.saveWorld(userId);
    }, SAVE_DELAY_MS);
    Backend.saveTimers.set(userId, handle);
  }

  /**
   * Cancel any pending debounce timer and fire a save immediately.
   * Returns a Promise that resolves once the server confirms.
   * Does NOT queue behind in-flight saves (uses saveWorldDirect).
   */
  private static saveImmediate(userId: string): Promise<void> {
    if (!Auth.isOnlineMode()) return Promise.resolve();
    const existing = Backend.saveTimers.get(userId);
    if (existing) {
      window.clearTimeout(existing);
      Backend.saveTimers.delete(userId);
    }
    return Backend.saveWorldDirect(userId);
  }

  /**
   * Merge server metadata (revision, resources, lastSaveTime) into the
   * current local cache WITHOUT overwriting buildings/obstacles/army.
   * The local cache is always the authority for building data.
   */
  private static mergeServerResponse(userId: string, serverWorld: SerializedWorld) {
    const current = Backend.getCachedWorld(userId);
    if (!current) {
      Backend.setCachedWorld(userId, serverWorld);
      return;
    }
    current.revision = serverWorld.revision;
    current.resources = serverWorld.resources;
    current.lastSaveTime = serverWorld.lastSaveTime;
    Backend.setCachedWorld(userId, current);
  }

  private static async saveWorld(userId: string) {
    // Wait for any in-flight save to finish BEFORE reading the cache.
    // This ensures we have the latest revision number.
    const previous = Backend.inFlightSaves.get(userId);
    if (previous) await previous;

    // Read the cache AFTER the previous save settled so we get the
    // up-to-date revision and the latest local building changes.
    const world = Backend.getCachedWorld(userId);
    if (!world || !Auth.isOnlineMode()) return;

    const task = (async () => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };

        const res = await fetch('/api/bases/save', {
          method: 'POST',
          headers,
          body: JSON.stringify({ world, ifMatchRevision: world.revision ?? 0 }),
          cache: 'no-store',
          keepalive: true,
          credentials: 'same-origin'
        });

        if (res.ok) {
          const data = await res.json() as { ok?: boolean; world?: SerializedWorld };
          if (data.world) {
            // Only adopt revision/resources/timestamp — never overwrite
            // local buildings/obstacles/army which may have been modified
            // while this save was in-flight.
            Backend.mergeServerResponse(userId, data.world);
          }
        } else if (res.status === 409) {
          // Conflict: server has a newer revision. Adopt the server's
          // revision into our latest local cache and retry once.
          const data = await res.json() as { conflict: boolean; world?: SerializedWorld };
          if (data.world) {
            Backend.mergeServerResponse(userId, data.world);
            // Re-read the cache (now with correct revision but local buildings intact)
            const merged = Backend.getCachedWorld(userId);
            if (merged) {
              const retryRes = await fetch('/api/bases/save', {
                method: 'POST',
                headers,
                body: JSON.stringify({ world: merged, ifMatchRevision: merged.revision ?? 0 }),
                cache: 'no-store',
                keepalive: true,
                credentials: 'same-origin'
              });
              if (retryRes.ok) {
                const retryData = await retryRes.json() as { ok?: boolean; world?: SerializedWorld };
                if (retryData.world) {
                  Backend.mergeServerResponse(userId, retryData.world);
                }
              } else {
                console.warn('Save retry failed:', retryRes.status);
              }
            }
          }
        } else if (res.status === 401) {
          console.warn('Save rejected: session expired or superseded');
        } else {
          console.warn('Save failed:', res.status);
        }
      } catch (error) {
        console.warn('Save failed:', error);
      }
    })();

    Backend.inFlightSaves.set(userId, task);
    await task;
    Backend.inFlightSaves.delete(userId);
  }

  /**
   * Save directly without waiting for any queued/in-flight saves.
   * Used by saveImmediate for critical building operations that must
   * reach the server ASAP. Handles 409 conflicts via a single retry.
   */
  private static async saveWorldDirect(userId: string): Promise<void> {
    const world = Backend.getCachedWorld(userId);
    if (!world || !Auth.isOnlineMode()) return;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const res = await fetch('/api/bases/save', {
        method: 'POST',
        headers,
        body: JSON.stringify({ world, ifMatchRevision: world.revision ?? 0 }),
        cache: 'no-store',
        keepalive: true,
        credentials: 'same-origin'
      });

      if (res.ok) {
        const data = await res.json() as { ok?: boolean; world?: SerializedWorld };
        if (data.world) Backend.mergeServerResponse(userId, data.world);
      } else if (res.status === 409) {
        const data = await res.json() as { conflict: boolean; world?: SerializedWorld };
        if (data.world) {
          Backend.mergeServerResponse(userId, data.world);
          const merged = Backend.getCachedWorld(userId);
          if (merged) {
            const retryRes = await fetch('/api/bases/save', {
              method: 'POST',
              headers,
              body: JSON.stringify({ world: merged, ifMatchRevision: merged.revision ?? 0 }),
              cache: 'no-store',
              keepalive: true,
              credentials: 'same-origin'
            });
            if (retryRes.ok) {
              const retryData = await retryRes.json() as { ok?: boolean; world?: SerializedWorld };
              if (retryData.world) Backend.mergeServerResponse(userId, retryData.world);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Direct save failed:', error);
    }
  }

  static async flushPendingSave(): Promise<void> {
    // Cancel any pending debounce timers so they don't fire after we flush
    Backend.saveTimers.forEach(timer => window.clearTimeout(timer));
    Backend.saveTimers.clear();

    const tasks = Array.from(Backend.inFlightSaves.values());
    await Promise.all(tasks);
    const user = Auth.getCurrentUser();
    if (user) {
      await Backend.saveWorld(user.id);
    }
  }

  /**
   * Fire-and-forget save for use in `beforeunload`.
   * Uses `keepalive: true` so the request survives page navigation.
   */
  static flushBeforeUnload() {
    const user = Auth.getCurrentUser();
    if (!user || !Auth.isOnlineMode()) return;
    const userId = user.id;

    // Cancel any pending debounce timer
    const existing = Backend.saveTimers.get(userId);
    if (existing) {
      window.clearTimeout(existing);
      Backend.saveTimers.delete(userId);
    }

    const world = Backend.getCachedWorld(userId);
    if (!world) return;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    try {
      // Omit ifMatchRevision so the server skips the revision check.
      // This guarantees the save succeeds even if an in-flight save
      // already bumped the revision. Acceptable for page-unload since
      // the local cache always has the latest building data.
      fetch('/api/bases/save', {
        method: 'POST',
        headers,
        body: JSON.stringify({ world }),
        keepalive: true,
        credentials: 'same-origin'
      });
    } catch {
      // Nothing to do — page is unloading
    }
  }

  static clearCacheForUser(userId: string) {
    Backend.memoryCache.delete(userId);
    const timer = Backend.saveTimers.get(userId);
    if (timer) {
      window.clearTimeout(timer);
      Backend.saveTimers.delete(userId);
    }
    Backend.inFlightSaves.delete(userId);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(getCacheKey(userId));
    }
  }

  static clearAllCaches() {
    Backend.memoryCache.clear();
    Backend.saveTimers.forEach(timer => window.clearTimeout(timer));
    Backend.saveTimers.clear();
    Backend.inFlightSaves.clear();
    if (typeof window !== 'undefined') {
      Object.keys(localStorage)
        .filter(key => key.startsWith(Backend.cacheKeyPrefix))
        .forEach(key => localStorage.removeItem(key));
    }
  }

  static async bootstrapBase(userId: string): Promise<SerializedWorld | null> {
    if (!Auth.isOnlineMode()) return null;
    const response = await Backend.apiPost<{ world: SerializedWorld | null }>('/api/bases/bootstrap', {});
    if (response.world) {
      Backend.setCachedWorld(userId, response.world);
    }
    return response.world ?? null;
  }

  static async forceLoadFromCloud(userId: string): Promise<SerializedWorld | null> {
    if (!Auth.isOnlineMode()) return null;
    const response = await Backend.apiPost<{ world: SerializedWorld | null }>('/api/bases/load', {});
    if (response.world) {
      Backend.setCachedWorld(userId, response.world);
    }
    return response.world ?? null;
  }

  static async refreshWorldFromCloud(userId: string): Promise<SerializedWorld | null> {
    const remote = await Backend.forceLoadFromCloud(userId);
    if (!remote) return null;
    Backend.setCachedWorld(userId, remote);
    return remote;
  }

  static async loadFromCloud(userId: string): Promise<SerializedWorld | null> {
    if (!Auth.isOnlineMode()) return null;
    const response = await Backend.apiPost<{ world: SerializedWorld | null }>('/api/bases/scout', { targetId: userId });
    return response.world ?? null;
  }

  static async getWorld(userId: string): Promise<SerializedWorld | null> {
    const cached = Backend.getCachedWorld(userId);
    if (cached) return cached;
    if (!Auth.isOnlineMode()) return cached;
    return await Backend.forceLoadFromCloud(userId);
  }

  static async createWorld(userId: string, owner: 'PLAYER' | 'ENEMY'): Promise<SerializedWorld> {
    const cx = 11;
    const cy = 11;
    const world: SerializedWorld = {
      id: `world_${userId}`,
      ownerId: userId,
      buildings: [
        { id: randomId(), type: 'town_hall' as BuildingType, gridX: cx, gridY: cy, level: 1 },
        { id: randomId(), type: 'cannon' as BuildingType, gridX: cx - 3, gridY: cy, level: 1 },
        { id: randomId(), type: 'barracks' as BuildingType, gridX: cx + 4, gridY: cy, level: 1 },
        { id: randomId(), type: 'army_camp' as BuildingType, gridX: cx, gridY: cy + 4, level: 1 },
        { id: randomId(), type: 'solana_collector' as BuildingType, gridX: cx + 3, gridY: cy + 3, level: 1 }
      ],
      obstacles: [],
      resources: { sol: 1000 },
      army: {},
      lastSaveTime: Date.now(),
      revision: 1
    };

    if (owner === 'PLAYER') {
      Backend.setCachedWorld(userId, world);
      Backend.scheduleSave(userId);
    }
    return world;
  }

  static async calculateOfflineProduction(userId: string): Promise<{ sol: number }> {
    if (!Auth.isOnlineMode()) return { sol: 0 };
    try {
      const response = await Backend.apiPost<{ wallet: { balance: number; updatedAt: number }; added?: number }>('/api/resources/balance', {});
      const world = Backend.getCachedWorld(userId);
      if (world && response.wallet) {
        world.resources.sol = response.wallet.balance ?? world.resources.sol;
        Backend.setCachedWorld(userId, world);
      }
      return { sol: response.added ?? 0 };
    } catch (error) {
      console.warn('Offline production skipped:', error);
      return { sol: 0 };
    }
  }

  static async applyResourceDelta(userId: string, delta: number, reason: string, refId?: string, requestId?: string): Promise<ResourceDeltaResult> {
    if (!Auth.isOnlineMode()) {
      const world = Backend.getCachedWorld(userId);
      if (world) {
        world.resources.sol = Math.max(0, world.resources.sol + delta);
        Backend.setCachedWorld(userId, world);
      }
      return { applied: true, sol: world?.resources.sol ?? 0 };
    }

    const response = await Backend.apiPost<{ applied: boolean; sol: number }>('/api/resources/apply', { delta, reason, refId, requestId });
    const world = Backend.getCachedWorld(userId);
    if (world && typeof response.sol === 'number') {
      world.resources.sol = response.sol;
      Backend.setCachedWorld(userId, world);
    }
    return { applied: response.applied, sol: response.sol };
  }

  static updateResources(userId: string, sol: number) {
    const world = Backend.getCachedWorld(userId);
    if (!world) return;
    world.resources.sol = Math.max(0, sol);
    Backend.setCachedWorld(userId, world);
    Backend.scheduleSave(userId);
  }

  static updateArmy(userId: string, army: Record<string, number>) {
    const world = Backend.getCachedWorld(userId);
    if (!world) return;
    world.army = { ...army };
    Backend.setCachedWorld(userId, world);
    Backend.scheduleSave(userId);
  }

  static async placeBuilding(userId: string, type: BuildingType, gridX: number, gridY: number): Promise<SerializedBuilding | null> {
    const world = Backend.getCachedWorld(userId);
    if (!world) return null;
    const building: SerializedBuilding = { id: randomId(), type, gridX, gridY, level: 1 };
    world.buildings.push(building);
    world.lastSaveTime = Date.now();
    Backend.setCachedWorld(userId, world);
    void Backend.saveImmediate(userId);
    return building;
  }

  static async moveBuilding(userId: string, buildingId: string, gridX: number, gridY: number): Promise<boolean> {
    const world = Backend.getCachedWorld(userId);
    if (!world) return false;
    const target = world.buildings.find(b => b.id === buildingId);
    if (!target) return false;
    target.gridX = gridX;
    target.gridY = gridY;
    world.lastSaveTime = Date.now();
    Backend.setCachedWorld(userId, world);
    void Backend.saveImmediate(userId);
    return true;
  }

  static removeBuilding(userId: string, buildingId: string) {
    const world = Backend.getCachedWorld(userId);
    if (!world) return;
    world.buildings = world.buildings.filter(b => b.id !== buildingId);
    world.lastSaveTime = Date.now();
    Backend.setCachedWorld(userId, world);
    void Backend.saveImmediate(userId);
  }

  static upgradeBuilding(userId: string, buildingId: string): Promise<void> {
    const world = Backend.getCachedWorld(userId);
    if (!world) return Promise.resolve();
    const target = world.buildings.find(b => b.id === buildingId);
    if (!target) return Promise.resolve();
    const maxLevel = BUILDING_DEFINITIONS[target.type as BuildingType]?.maxLevel ?? 1;
    const currentLevel = target.level ?? 1;
    const nextLevel = Math.min(currentLevel + 1, maxLevel);

    if (target.type === 'wall') {
      // Wall upgrades are coherent/bulk: upgrade every wall segment at the same level.
      world.buildings.forEach(building => {
        if (building.type === 'wall' && (building.level ?? 1) === currentLevel) {
          building.level = nextLevel;
        }
      });
    } else {
      target.level = nextLevel;
    }

    world.lastSaveTime = Date.now();
    Backend.setCachedWorld(userId, world);
    return Backend.saveImmediate(userId);
  }

  static placeObstacle(userId: string, type: ObstacleType, gridX: number, gridY: number) {
    const world = Backend.getCachedWorld(userId);
    if (!world) return;
    if (!world.obstacles) world.obstacles = [];
    const obstacle: SerializedObstacle = { id: randomId('o_'), type, gridX, gridY };
    world.obstacles.push(obstacle);
    Backend.setCachedWorld(userId, world);
    void Backend.saveImmediate(userId);
  }

  static removeObstacle(userId: string, obstacleId: string) {
    const world = Backend.getCachedWorld(userId);
    if (!world?.obstacles) return;
    world.obstacles = world.obstacles.filter(o => o.id !== obstacleId);
    Backend.setCachedWorld(userId, world);
    void Backend.saveImmediate(userId);
  }

  static async deleteWorld(userId: string) {
    Backend.memoryCache.delete(userId);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(getCacheKey(userId));
    }
    if (!Auth.isOnlineMode()) return;
    try {
      await Backend.apiPost('/api/bases/delete', {});
    } catch (error) {
      console.warn('Failed to delete remote base:', error);
    }
  }

  static async getBuildingCounts(userId: string): Promise<Record<BuildingType, number>> {
    const world = await Backend.getWorld(userId);
    const counts = {} as Record<BuildingType, number>;
    if (!world) return counts;
    for (const building of world.buildings) {
      const key = building.type as BuildingType;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  static async getOnlineBase(userId: string): Promise<SerializedWorld | null> {
    void userId;
    if (!Auth.isOnlineMode()) return null;
    const response = await Backend.apiPost<{ world: SerializedWorld | null }>('/api/bases/online', {});
    return response.world ?? null;
  }

  static async generateEnemyWorld(): Promise<SerializedWorld> {
    const mapSize = 25;
    const margin = 1;
    const centerX = Math.floor(mapSize / 2);
    const centerY = Math.floor(mapSize / 2);

    const randInt = (min: number, max: number) => {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(Math.random() * (hi - lo + 1));
    };

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const tileKey = (x: number, y: number) => `${x},${y}`;

    type Tier = 'outpost' | 'stronghold' | 'fortress';
    type RingConfig = { min: number; max: number };
    type CountConfig = { min: number; max: number };
    type ZoneConfig = { minRadius: number; maxRadius: number };

    type TierProfile = {
      name: string;
      rings: RingConfig;
      dividers: CountConfig;
      miniCompartments: CountConfig;
      collectors: CountConfig;
      barracks: CountConfig;
      camps: CountConfig;
      defenses: Partial<Record<BuildingType, CountConfig>>;
      wallBaseLevel: number;
      lootBase: number;
      lootVariance: number;
    };

    const tierRoll = Math.random();
    const tier: Tier = tierRoll < 0.26 ? 'fortress' : tierRoll < 0.7 ? 'stronghold' : 'outpost';

    const profiles: Record<Tier, TierProfile> = {
      outpost: {
        name: 'Bot Outpost',
        rings: { min: 2, max: 3 },
        dividers: { min: 1, max: 3 },
        miniCompartments: { min: 1, max: 2 },
        collectors: { min: 4, max: 8 },
        barracks: { min: 1, max: 2 },
        camps: { min: 1, max: 2 },
        defenses: {
          cannon: { min: 2, max: 4 },
          mortar: { min: 1, max: 2 },
          tesla: { min: 1, max: 2 },
          ballista: { min: 0, max: 1 },
          xbow: { min: 0, max: 1 },
          spike_launcher: { min: 0, max: 1 },
          prism: { min: 0, max: 1 },
          magmavent: { min: 0, max: 0 },
          dragons_breath: { min: 0, max: 0 }
        },
        wallBaseLevel: 1,
        lootBase: 14000,
        lootVariance: 15000
      },
      stronghold: {
        name: 'Bot Stronghold',
        rings: { min: 3, max: 4 },
        dividers: { min: 3, max: 6 },
        miniCompartments: { min: 2, max: 4 },
        collectors: { min: 7, max: 12 },
        barracks: { min: 2, max: 3 },
        camps: { min: 2, max: 3 },
        defenses: {
          cannon: { min: 4, max: 5 },
          mortar: { min: 2, max: 3 },
          tesla: { min: 2, max: 3 },
          ballista: { min: 1, max: 2 },
          xbow: { min: 1, max: 2 },
          spike_launcher: { min: 1, max: 2 },
          prism: { min: 1, max: 1 },
          magmavent: { min: 0, max: 1 },
          dragons_breath: { min: 0, max: 1 }
        },
        wallBaseLevel: 2,
        lootBase: 30000,
        lootVariance: 35000
      },
      fortress: {
        name: 'Bot Fortress',
        rings: { min: 4, max: 6 },
        dividers: { min: 6, max: 9 },
        miniCompartments: { min: 4, max: 6 },
        collectors: { min: 10, max: 16 },
        barracks: { min: 3, max: 4 },
        camps: { min: 3, max: 4 },
        defenses: {
          cannon: { min: 5, max: 5 },
          mortar: { min: 3, max: 3 },
          tesla: { min: 3, max: 3 },
          ballista: { min: 2, max: 2 },
          xbow: { min: 2, max: 2 },
          spike_launcher: { min: 2, max: 2 },
          prism: { min: 1, max: 1 },
          magmavent: { min: 1, max: 1 },
          dragons_breath: { min: 1, max: 1 }
        },
        wallBaseLevel: 3,
        lootBase: 65000,
        lootVariance: 90000
      }
    };

    const profile = profiles[tier];
    const buildings: SerializedBuilding[] = [];
    const occupied = new Set<string>();
    const wallAt = new Map<string, number>();

    const inBounds = (x: number, y: number, width: number, height: number) => {
      return x >= margin && y >= margin && x + width <= mapSize - margin && y + height <= mapSize - margin;
    };

    const canPlaceRect = (x: number, y: number, width: number, height: number) => {
      for (let dx = 0; dx < width; dx++) {
        for (let dy = 0; dy < height; dy++) {
          if (occupied.has(tileKey(x + dx, y + dy))) return false;
        }
      }
      return true;
    };

    const occupyRect = (x: number, y: number, width: number, height: number) => {
      for (let dx = 0; dx < width; dx++) {
        for (let dy = 0; dy < height; dy++) {
          occupied.add(tileKey(x + dx, y + dy));
        }
      }
    };

    const placeBuilding = (type: BuildingType, x: number, y: number, level: number): boolean => {
      const definition = BUILDING_DEFINITIONS[type];
      const maxLevel = definition.maxLevel ?? 1;
      const normalizedLevel = clamp(level, 1, maxLevel);

      if (type === 'wall') {
        const key = tileKey(x, y);
        const existing = wallAt.get(key);
        if (existing !== undefined) {
          buildings[existing].level = Math.max(buildings[existing].level, normalizedLevel);
          return true;
        }
      }

      if (!inBounds(x, y, definition.width, definition.height)) return false;
      if (!canPlaceRect(x, y, definition.width, definition.height)) return false;

      const idx = buildings.push({
        id: randomId(),
        type,
        gridX: x,
        gridY: y,
        level: normalizedLevel
      }) - 1;

      occupyRect(x, y, definition.width, definition.height);
      if (type === 'wall') {
        wallAt.set(tileKey(x, y), idx);
      }
      return true;
    };

    const distanceToCenter = (x: number, y: number, width: number, height: number) => {
      const px = x + width / 2;
      const py = y + height / 2;
      return Math.hypot(px - centerX, py - centerY);
    };

    const tryPlaceInZone = (
      type: BuildingType,
      zone: ZoneConfig,
      levelMin: number,
      levelMax: number,
      attempts = 240
    ) => {
      const definition = BUILDING_DEFINITIONS[type];
      for (let i = 0; i < attempts; i++) {
        const x = randInt(margin, mapSize - margin - definition.width);
        const y = randInt(margin, mapSize - margin - definition.height);
        const dist = distanceToCenter(x, y, definition.width, definition.height);
        if (dist < zone.minRadius || dist > zone.maxRadius) continue;
        if (placeBuilding(type, x, y, randInt(levelMin, levelMax))) return true;
      }
      return false;
    };

    const placeCountInZone = (
      type: BuildingType,
      count: number,
      zone: ZoneConfig,
      levelMin: number,
      levelMax: number
    ) => {
      let placed = 0;
      for (let i = 0; i < count; i++) {
        if (tryPlaceInZone(type, zone, levelMin, levelMax)) {
          placed++;
        }
      }
      return placed;
    };

    const ringWalls = (
      minX: number,
      minY: number,
      maxX: number,
      maxY: number,
      levelBase: number,
      gateCount: number
    ) => {
      if (minX >= maxX || minY >= maxY) return;

      const gates = new Set<string>();
      const edgePickers = [
        () => [randInt(minX + 1, maxX - 1), minY] as const,
        () => [randInt(minX + 1, maxX - 1), maxY] as const,
        () => [minX, randInt(minY + 1, maxY - 1)] as const,
        () => [maxX, randInt(minY + 1, maxY - 1)] as const
      ];

      for (let i = 0; i < gateCount; i++) {
        const picker = edgePickers[randInt(0, edgePickers.length - 1)];
        const [gx, gy] = picker();
        gates.add(tileKey(gx, gy));
      }

      for (let x = minX; x <= maxX; x++) {
        for (const y of [minY, maxY]) {
          if (gates.has(tileKey(x, y))) continue;
          const levelJitter = randInt(-1, 1);
          placeBuilding('wall', x, y, clamp(levelBase + levelJitter, 1, 3));
        }
      }
      for (let y = minY + 1; y <= maxY - 1; y++) {
        for (const x of [minX, maxX]) {
          if (gates.has(tileKey(x, y))) continue;
          const levelJitter = randInt(-1, 1);
          placeBuilding('wall', x, y, clamp(levelBase + levelJitter, 1, 3));
        }
      }
    };

    const addDivider = (bounds: { minX: number; minY: number; maxX: number; maxY: number }, levelBase: number) => {
      const vertical = Math.random() < 0.5;
      if (vertical) {
        const x = randInt(bounds.minX + 2, bounds.maxX - 2);
        const gapY = randInt(bounds.minY + 2, bounds.maxY - 2);
        for (let y = bounds.minY + 1; y <= bounds.maxY - 1; y++) {
          if (Math.abs(y - gapY) <= 1) continue;
          placeBuilding('wall', x, y, clamp(levelBase + randInt(-1, 1), 1, 3));
        }
      } else {
        const y = randInt(bounds.minY + 2, bounds.maxY - 2);
        const gapX = randInt(bounds.minX + 2, bounds.maxX - 2);
        for (let x = bounds.minX + 1; x <= bounds.maxX - 1; x++) {
          if (Math.abs(x - gapX) <= 1) continue;
          placeBuilding('wall', x, y, clamp(levelBase + randInt(-1, 1), 1, 3));
        }
      }
    };

    const townHallDef = BUILDING_DEFINITIONS.town_hall;
    const townHallX = centerX - Math.floor(townHallDef.width / 2);
    const townHallY = centerY - Math.floor(townHallDef.height / 2);
    placeBuilding('town_hall', townHallX, townHallY, 1);

    const ringCount = randInt(profile.rings.min, profile.rings.max);
    let outerBounds = {
      minX: townHallX - 2,
      minY: townHallY - 2,
      maxX: townHallX + townHallDef.width + 1,
      maxY: townHallY + townHallDef.height + 1
    };

    for (let ring = 0; ring < ringCount; ring++) {
      const extraX = 2 + ring * 2 + randInt(0, 1);
      const extraY = 2 + ring * 2 + randInt(0, 1);
      const jitterX = randInt(-1, 1);
      const jitterY = randInt(-1, 1);
      const minX = clamp(townHallX - extraX + jitterX, margin, mapSize - margin - 2);
      const minY = clamp(townHallY - extraY + jitterY, margin, mapSize - margin - 2);
      const maxX = clamp(townHallX + townHallDef.width + extraX + jitterX, minX + 2, mapSize - margin - 1);
      const maxY = clamp(townHallY + townHallDef.height + extraY + jitterY, minY + 2, mapSize - margin - 1);
      const ringLevel = clamp(profile.wallBaseLevel - Math.floor(ring / 2), 1, 3);
      const gates = clamp(1 + Math.floor(ring / 2) + randInt(0, 1), 1, 4);
      ringWalls(minX, minY, maxX, maxY, ringLevel, gates);
      outerBounds = { minX, minY, maxX, maxY };
    }

    const dividerCount = randInt(profile.dividers.min, profile.dividers.max);
    for (let i = 0; i < dividerCount; i++) {
      addDivider(outerBounds, profile.wallBaseLevel);
    }

    const miniCount = randInt(profile.miniCompartments.min, profile.miniCompartments.max);
    for (let i = 0; i < miniCount; i++) {
      const width = randInt(3, 5);
      const height = randInt(3, 5);
      const minX = clamp(randInt(outerBounds.minX + 1, outerBounds.maxX - width - 1), margin, mapSize - margin - width);
      const minY = clamp(randInt(outerBounds.minY + 1, outerBounds.maxY - height - 1), margin, mapSize - margin - height);
      ringWalls(minX, minY, minX + width, minY + height, clamp(profile.wallBaseLevel - 1, 1, 3), 1);
    }

    const zones: Record<'core' | 'inner' | 'mid' | 'outer', ZoneConfig> = {
      core: { minRadius: 0, maxRadius: 5.8 },
      inner: { minRadius: 3.5, maxRadius: 8.5 },
      mid: { minRadius: 6.5, maxRadius: 11.8 },
      outer: { minRadius: 10, maxRadius: 16.5 }
    };

    const defenseOrder: Array<{ type: BuildingType; zone: keyof typeof zones; levelBias: [number, number] }> = [
      { type: 'dragons_breath', zone: 'core', levelBias: [1, 1] },
      { type: 'magmavent', zone: 'inner', levelBias: [1, 2] },
      { type: 'prism', zone: 'inner', levelBias: [1, 1] },
      { type: 'xbow', zone: 'inner', levelBias: [1, 2] },
      { type: 'ballista', zone: 'mid', levelBias: [1, 2] },
      { type: 'mortar', zone: 'mid', levelBias: [1, 3] },
      { type: 'spike_launcher', zone: 'mid', levelBias: [1, 1] },
      { type: 'tesla', zone: 'outer', levelBias: [1, 2] },
      { type: 'cannon', zone: 'outer', levelBias: [1, 4] }
    ];

    for (const { type, zone, levelBias } of defenseOrder) {
      const requested = profile.defenses[type];
      if (!requested) continue;
      const maxCount = BUILDING_DEFINITIONS[type].maxCount;
      const count = clamp(randInt(requested.min, requested.max), 0, maxCount);
      const defMax = BUILDING_DEFINITIONS[type].maxLevel ?? 1;

      const minLevelByTier =
        tier === 'fortress' ? Math.max(1, Math.min(levelBias[0] + 1, defMax)) :
        tier === 'stronghold' ? Math.max(1, Math.min(levelBias[0], defMax)) :
        1;
      const maxLevelByTier =
        tier === 'fortress' ? defMax :
        tier === 'stronghold' ? Math.max(1, defMax - (Math.random() < 0.25 ? 1 : 0)) :
        Math.max(1, Math.min(defMax, levelBias[1]));

      placeCountInZone(type, count, zones[zone], minLevelByTier, maxLevelByTier);
    }

    const collectorCount = clamp(randInt(profile.collectors.min, profile.collectors.max), 0, BUILDING_DEFINITIONS.solana_collector.maxCount);
    const barracksCount = clamp(randInt(profile.barracks.min, profile.barracks.max), 1, BUILDING_DEFINITIONS.barracks.maxCount);
    const campCount = clamp(randInt(profile.camps.min, profile.camps.max), 1, BUILDING_DEFINITIONS.army_camp.maxCount);

    placeCountInZone('solana_collector', collectorCount, zones.outer, 1, 2);
    placeCountInZone('barracks', barracksCount, zones.outer, 1, 1);
    placeCountInZone('army_camp', campCount, zones.outer, tier === 'fortress' ? 2 : 1, tier === 'fortress' ? 3 : 2);

    // Fill remaining space with extra perimeter walls for tougher pathing on stronger tiers.
    const extraWallBudget = tier === 'fortress' ? 24 : tier === 'stronghold' ? 16 : 8;
    for (let i = 0; i < extraWallBudget; i++) {
      const x = randInt(margin, mapSize - margin - 1);
      const y = randInt(margin, mapSize - margin - 1);
      const dist = Math.hypot(x - centerX, y - centerY);
      if (dist < 5 || dist > 17) continue;
      placeBuilding('wall', x, y, clamp(profile.wallBaseLevel + randInt(-1, 0), 1, 3));
    }

    const resourceSol = Math.floor(
      profile.lootBase +
      profile.lootVariance * Math.random() +
      buildings.length * (tier === 'fortress' ? 320 : tier === 'stronghold' ? 250 : 180)
    );

    return {
      id: `bot_${randomId('world_')}`,
      ownerId: 'bot',
      username: profile.name,
      buildings,
      resources: { sol: resourceSol },
      lastSaveTime: Date.now(),
      revision: 1
    };
  }

  static async recordAttack(
    victimId: string,
    attackerId: string,
    attackerName: string,
    solLooted: number,
    destruction: number,
    attackId?: string
  ): Promise<{ lootApplied: number; attackerBalance: number } | null> {
    if (!Auth.isOnlineMode()) return null;
    const response = await Backend.apiPost<{ lootApplied: number; attackerBalance: number }>('/api/attacks/resolve', {
      victimId,
      attackerId,
      attackerName,
      solLooted,
      destruction,
      attackId
    });
    return response;
  }

  static async getUnreadNotificationCount(userId: string): Promise<number> {
    void userId;
    if (!Auth.isOnlineMode()) return 0;
    const response = await Backend.apiPost<{ unread: number }>('/api/notifications/attack', { action: 'unreadCount' });
    return response.unread ?? 0;
  }

  static async getNotifications(userId: string) {
    void userId;
    if (!Auth.isOnlineMode()) return [];
    const response = await Backend.apiPost<{ items: any[] }>('/api/notifications/attack', { action: 'list' });
    return (response.items ?? []).map(item => ({
      ...item,
      timestamp: item.timestamp ?? item.time ?? Date.now()
    }));
  }

  static async markNotificationsRead(userId: string) {
    void userId;
    if (!Auth.isOnlineMode()) return;
    await Backend.apiPost('/api/notifications/attack', { action: 'markRead' });
  }
}
