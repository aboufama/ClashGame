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

  private static async apiPost<T>(path: string, body: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = Auth.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store'
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
        const token = Auth.getToken();
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch('/api/bases/save', {
          method: 'POST',
          headers,
          body: JSON.stringify({ world, ifMatchRevision: world.revision ?? 0 }),
          cache: 'no-store',
          keepalive: true
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
                keepalive: true
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
      const token = Auth.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/bases/save', {
        method: 'POST',
        headers,
        body: JSON.stringify({ world, ifMatchRevision: world.revision ?? 0 }),
        cache: 'no-store',
        keepalive: true
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
              keepalive: true
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
    const token = Auth.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      // Omit ifMatchRevision so the server skips the revision check.
      // This guarantees the save succeeds even if an in-flight save
      // already bumped the revision. Acceptable for page-unload since
      // the local cache always has the latest building data.
      fetch('/api/bases/save', {
        method: 'POST',
        headers,
        body: JSON.stringify({ world }),
        keepalive: true
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

  static async applyResourceDelta(userId: string, delta: number, reason: string, refId?: string): Promise<ResourceDeltaResult> {
    if (!Auth.isOnlineMode()) {
      const world = Backend.getCachedWorld(userId);
      if (world) {
        world.resources.sol = Math.max(0, world.resources.sol + delta);
        Backend.setCachedWorld(userId, world);
      }
      return { applied: true, sol: world?.resources.sol ?? 0 };
    }

    const response = await Backend.apiPost<{ applied: boolean; sol: number }>('/api/resources/apply', { delta, reason, refId });
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
    target.level = Math.min((target.level ?? 1) + 1, maxLevel);
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
    const cx = 11;
    const cy = 11;
    const buildings: SerializedBuilding[] = [
      { id: randomId(), type: 'town_hall', gridX: cx, gridY: cy, level: 1 },
      { id: randomId(), type: 'cannon', gridX: cx - 4, gridY: cy, level: 1 },
      { id: randomId(), type: 'cannon', gridX: cx + 4, gridY: cy + 1, level: 1 },
      { id: randomId(), type: 'barracks', gridX: cx + 2, gridY: cy - 4, level: 1 },
      { id: randomId(), type: 'solana_collector', gridX: cx - 2, gridY: cy + 4, level: 1 }
    ];

    return {
      id: `bot_${randomId('world_')}`,
      ownerId: 'bot',
      username: 'Bot Base',
      buildings,
      resources: { sol: Math.floor(5000 + Math.random() * 10000) },
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
