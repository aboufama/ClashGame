import { BUILDING_DEFINITIONS, MAP_SIZE, type BuildingType, type ObstacleType } from '../config/GameDefinitions';
import type { SerializedBuilding, SerializedObstacle, SerializedWorld } from '../data/Models';
import { Auth } from './Auth';

const CACHE_PREFIX = 'clash.base.';

type ResourceDeltaResult = { applied: boolean; sol: number };
export type AttackNotification = {
  id: string;
  attackId?: string;
  attackerName: string;
  solLost?: number;
  goldLost?: number;
  elixirLost?: number;
  destruction: number;
  timestamp: number;
  read: boolean;
  replayAvailable?: boolean;
};

type NotificationListItem = Record<string, unknown> & Partial<AttackNotification> & {
  time?: number;
};

export type ReplayBuildingSnapshot = {
  id: string;
  health: number;
  isDestroyed: boolean;
};

export type ReplayTroopSnapshot = {
  id: string;
  type: string;
  level: number;
  owner: 'PLAYER' | 'ENEMY';
  gridX: number;
  gridY: number;
  health: number;
  maxHealth: number;
  recursionGen?: number;
  facingAngle?: number;
  hasTakenDamage?: boolean;
};

export type ReplayFrameSnapshot = {
  t: number;
  destruction: number;
  solLooted: number;
  buildings: ReplayBuildingSnapshot[];
  troops: ReplayTroopSnapshot[];
};

export type IncomingAttackSession = {
  attackId: string;
  attackerId: string;
  attackerName: string;
  victimId: string;
  startedAt: number;
  updatedAt: number;
};

export type AttackReplayState = {
  attackId: string;
  attackerId: string;
  attackerName: string;
  victimId: string;
  victimName?: string;
  status: 'live' | 'finished' | 'aborted';
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  enemyWorld: SerializedWorld;
  finalResult?: {
    destruction: number;
    solLooted: number;
  };
  frameCount: number;
  latestFrame: ReplayFrameSnapshot | null;
  frames?: ReplayFrameSnapshot[];
};

function getCacheKey(userId: string) {
  return `${CACHE_PREFIX}${userId}`;
}

function randomId(prefix = 'b_') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID()}`;
  }
  return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeRequestId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class Backend {
  private static memoryCache = new Map<string, SerializedWorld>();
  private static saveTimers = new Map<string, number>();
  private static inFlightSaves = new Map<string, Promise<void>>();
  private static cacheKeyPrefix = CACHE_PREFIX;
  private static lastConfirmedRemoteBuildingCount = new Map<string, number>();

  private static async wait(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private static async apiPostWithRetry<T>(path: string, body: unknown, attempts = 3): Promise<T> {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await Backend.apiPost<T>(path, body);
      } catch (error) {
        lastError = error;
        if (attempt >= attempts) break;
        await Backend.wait(150 * attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`API ${path} failed`);
  }

  private static clampWallLevel(level: number): number {
    const maxWallLevel = BUILDING_DEFINITIONS.wall.maxLevel ?? 1;
    return Math.max(1, Math.min(maxWallLevel, Math.floor(level)));
  }

  private static getMaxPlacedWallLevel(world: SerializedWorld): number {
    if (!Array.isArray(world.buildings) || world.buildings.length === 0) return 0;
    let maxLevel = 0;
    for (const building of world.buildings) {
      if (building.type !== 'wall') continue;
      const level = Math.max(1, Math.floor(Number(building.level) || 1));
      if (level > maxLevel) maxLevel = level;
    }
    return maxLevel;
  }

  private static resolveWallPlacementLevel(world: SerializedWorld): number {
    const inferred = Backend.getMaxPlacedWallLevel(world);
    if (inferred > 0) {
      return Backend.clampWallLevel(inferred);
    }

    const stored = Number(world.wallLevel ?? 0);
    if (Number.isFinite(stored) && stored > 0) {
      return Backend.clampWallLevel(stored);
    }

    return 1;
  }

  private static normalizeWallLevel(world: SerializedWorld) {
    const inferred = Backend.getMaxPlacedWallLevel(world);
    if (inferred > 0) {
      world.wallLevel = Backend.clampWallLevel(inferred);
      return;
    }
    const stored = Number(world.wallLevel ?? 0);
    world.wallLevel = Number.isFinite(stored) && stored > 0
      ? Backend.clampWallLevel(stored)
      : 1;
  }

  private static normalizeTypeKey(type: unknown): string {
    return String(type ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  }

  private static hasTownHall(world: SerializedWorld): boolean {
    return Array.isArray(world.buildings) && world.buildings.some(building => Backend.normalizeTypeKey(building.type) === 'townhall');
  }

  private static isWorldStructurallyValid(world: SerializedWorld): boolean {
    return Array.isArray(world.buildings) && world.buildings.length > 0 && Backend.hasTownHall(world);
  }

  private static markConfirmedRemoteWorld(userId: string, world: SerializedWorld | null | undefined) {
    if (!world || !Array.isArray(world.buildings)) return;
    const count = Math.max(0, Math.floor(Number(world.buildings.length) || 0));
    if (count > 0) {
      Backend.lastConfirmedRemoteBuildingCount.set(userId, count);
    }
  }

  private static isSuspiciousDownsize(userId: string, world: SerializedWorld): boolean {
    const lastConfirmed = Backend.lastConfirmedRemoteBuildingCount.get(userId);
    if (!lastConfirmed || lastConfirmed < 20) return false;
    const currentCount = Array.isArray(world.buildings) ? world.buildings.length : 0;
    return currentCount > 0 && currentCount <= Math.floor(lastConfirmed * 0.2);
  }

  private static canSaveWorld(userId: string, world: SerializedWorld): boolean {
    if (!Backend.isWorldStructurallyValid(world)) {
      console.warn('Save blocked: world payload failed structural validation', {
        userId,
        buildingCount: Array.isArray(world.buildings) ? world.buildings.length : 0
      });
      return false;
    }
    if (Backend.isSuspiciousDownsize(userId, world)) {
      console.warn('Save blocked: suspicious base downsize detected', {
        userId,
        previousCount: Backend.lastConfirmedRemoteBuildingCount.get(userId),
        nextCount: world.buildings.length
      });
      return false;
    }
    return true;
  }

  static hasPendingSave(userId?: string): boolean {
    if (userId) {
      return Backend.saveTimers.has(userId) || Backend.inFlightSaves.has(userId);
    }
    return Backend.saveTimers.size > 0 || Backend.inFlightSaves.size > 0;
  }

  private static armiesEqual(
    left: Record<string, number> | undefined,
    right: Record<string, number> | undefined
  ): boolean {
    const a = left ?? {};
    const b = right ?? {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const av = Math.max(0, Math.floor(Number(a[key]) || 0));
      const bv = Math.max(0, Math.floor(Number(b[key]) || 0));
      if (av !== bv) return false;
    }
    return true;
  }

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

  /** Migrate legacy saves: keep only one barracks (highest level), remove extras. */
  private static migrateBarracks(world: SerializedWorld) {
    if (!Array.isArray(world.buildings)) return;
    const barracks = world.buildings.filter(b => b.type === 'barracks');
    if (barracks.length <= 1) return;
    // Keep the highest-level barracks
    barracks.sort((a, b) => (b.level || 1) - (a.level || 1));
    const keepId = barracks[0].id;
    world.buildings = world.buildings.filter(b => b.type !== 'barracks' || b.id === keepId);
  }

  private static setCachedWorld(userId: string, world: SerializedWorld, persist = true) {
    Backend.normalizeWallLevel(world);
    Backend.migrateBarracks(world);
    Backend.memoryCache.set(userId, world);
    if (persist && typeof window !== 'undefined') {
      localStorage.setItem(getCacheKey(userId), JSON.stringify(world));
    }
  }

  static primeWorldCache(userId: string, world: SerializedWorld | null | undefined) {
    if (!world) return;
    Backend.markConfirmedRemoteWorld(userId, world);
    Backend.setCachedWorld(userId, world);
  }

  private static scheduleSave(userId: string) {
    if (!Auth.isOnlineMode()) return;
    void Backend.saveImmediate(userId);
  }

  /**
   * Cancel any pending debounce timer and enqueue an immediate save.
   * Saves are serialized per-user to keep revision/order stable.
   */
  private static saveImmediate(userId: string): Promise<void> {
    if (!Auth.isOnlineMode()) return Promise.resolve();

    const existing = Backend.saveTimers.get(userId);
    if (existing) {
      window.clearTimeout(existing);
      Backend.saveTimers.delete(userId);
    }

    const queued = Backend.inFlightSaves.get(userId) ?? Promise.resolve();
    const task = queued
      .catch(() => undefined)
      .then(() => Backend.saveWorldDirect(userId));

    Backend.inFlightSaves.set(userId, task);
    return task.finally(() => {
      const current = Backend.inFlightSaves.get(userId);
      if (current === task) {
        Backend.inFlightSaves.delete(userId);
      }
    });
  }

  /**
   * Merge server metadata (revision, resources, lastSaveTime) into the
   * current local cache WITHOUT overwriting buildings/obstacles/army.
   * The local cache is always the authority for building data.
   */
  private static mergeServerResponse(userId: string, serverWorld: SerializedWorld) {
    const current = Backend.getCachedWorld(userId);
    Backend.markConfirmedRemoteWorld(userId, serverWorld);
    if (!current) {
      Backend.setCachedWorld(userId, serverWorld);
      return;
    }
    current.revision = serverWorld.revision;
    current.resources = serverWorld.resources;
    current.lastSaveTime = serverWorld.lastSaveTime;
    if (typeof serverWorld.wallLevel === 'number') {
      current.wallLevel = Backend.clampWallLevel(serverWorld.wallLevel);
    }
    Backend.normalizeWallLevel(current);
    Backend.setCachedWorld(userId, current);
  }

  /**
   * Save directly without waiting for any queued/in-flight saves.
   * Used by saveImmediate for critical building operations that must
   * reach the server ASAP. Handles 409 conflicts via a single retry.
   */
  private static async saveWorldDirect(userId: string): Promise<void> {
    const world = Backend.getCachedWorld(userId);
    if (!world || !Auth.isOnlineMode()) return;
    if (!Backend.canSaveWorld(userId, world)) return;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const requestId = makeRequestId('save');

      const res = await fetch('/api/bases/save', {
        method: 'POST',
        headers,
        body: JSON.stringify({ world, ifMatchRevision: world.revision ?? 0, requestId }),
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
              body: JSON.stringify({ world: merged, ifMatchRevision: merged.revision ?? 0, requestId }),
              cache: 'no-store',
              keepalive: true,
              credentials: 'same-origin'
            });
            if (retryRes.ok) {
              const retryData = await retryRes.json() as { ok?: boolean; world?: SerializedWorld };
              if (retryData.world) Backend.mergeServerResponse(userId, retryData.world);
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
      console.warn('Direct save failed:', error);
    }
  }

  static async flushPendingSave(): Promise<void> {
    const pendingUserIds = new Set<string>([
      ...Backend.saveTimers.keys(),
      ...Backend.inFlightSaves.keys()
    ]);

    // Cancel any pending debounce timers so they don't fire after we flush
    Backend.saveTimers.forEach(timer => window.clearTimeout(timer));
    Backend.saveTimers.clear();

    const tasks = Array.from(Backend.inFlightSaves.values());
    await Promise.all(tasks);

    // If no timer or in-flight save existed, there's nothing new to flush.
    if (pendingUserIds.size === 0) {
      return;
    }

    await Promise.all(Array.from(pendingUserIds).map(userId => Backend.saveImmediate(userId)));
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
    if (!Backend.canSaveWorld(userId, world)) return;

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
    Backend.lastConfirmedRemoteBuildingCount.delete(userId);
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
    Backend.lastConfirmedRemoteBuildingCount.clear();
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
    const response = await Backend.apiPostWithRetry<{ world: SerializedWorld | null }>('/api/bases/bootstrap', {});
    if (response.world) {
      Backend.markConfirmedRemoteWorld(userId, response.world);
      Backend.setCachedWorld(userId, response.world);
    }
    return response.world ?? null;
  }

  static async forceLoadFromCloud(userId: string): Promise<SerializedWorld | null> {
    if (!Auth.isOnlineMode()) return null;
    const response = await Backend.apiPostWithRetry<{ world: SerializedWorld | null }>('/api/bases/load', {});
    if (response.world) {
      Backend.markConfirmedRemoteWorld(userId, response.world);
      Backend.setCachedWorld(userId, response.world);
    }
    return response.world ?? null;
  }

  static async refreshWorldFromCloud(userId: string): Promise<SerializedWorld | null> {
    const remote = await Backend.forceLoadFromCloud(userId);
    if (!remote) return null;
    Backend.markConfirmedRemoteWorld(userId, remote);
    Backend.setCachedWorld(userId, remote);
    return remote;
  }

  static async loadFromCloud(userId: string): Promise<SerializedWorld | null> {
    if (!Auth.isOnlineMode()) return null;
    const response = await Backend.apiPostWithRetry<{ world: SerializedWorld | null }>('/api/bases/scout', { targetId: userId });
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
      wallLevel: 1,
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
      const response = await Backend.apiPostWithRetry<{ wallet: { balance: number; updatedAt: number }; added?: number }>('/api/resources/balance', {});
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

    const response = await Backend.apiPost<{ applied: boolean; sol: number; revision?: number }>('/api/resources/apply', { delta, reason, refId, requestId });
    const world = Backend.getCachedWorld(userId);
    if (world && typeof response.sol === 'number') {
      world.resources.sol = response.sol;
      if (typeof response.revision === 'number' && Number.isFinite(response.revision)) {
        world.revision = Math.max(1, Math.floor(response.revision));
      }
      world.lastSaveTime = Date.now();
      Backend.setCachedWorld(userId, world);
    }
    return { applied: response.applied, sol: response.sol };
  }

  static updateResources(userId: string, sol: number) {
    const world = Backend.getCachedWorld(userId);
    if (!world) return;
    const nextSol = Math.max(0, Math.floor(Number(sol) || 0));
    if (world.resources.sol === nextSol) return;
    world.resources.sol = nextSol;
    world.lastSaveTime = Date.now();
    Backend.setCachedWorld(userId, world);
    void Backend.saveImmediate(userId);
  }

  static updateArmy(userId: string, army: Record<string, number>) {
    const world = Backend.getCachedWorld(userId);
    if (!world) return;
    if (Backend.armiesEqual(world.army, army)) return;
    world.army = { ...army };
    world.lastSaveTime = Date.now();
    Backend.setCachedWorld(userId, world);
    void Backend.saveImmediate(userId);
  }

  static async placeBuilding(userId: string, type: BuildingType, gridX: number, gridY: number): Promise<SerializedBuilding | null> {
    const world = Backend.getCachedWorld(userId);
    if (!world) return null;
    const definition = BUILDING_DEFINITIONS[type];
    if (!definition) return null;
    if (gridX < 0 || gridY < 0 || gridX + definition.width > MAP_SIZE || gridY + definition.height > MAP_SIZE) {
      return null;
    }
    for (const existing of world.buildings) {
      const existingDef = BUILDING_DEFINITIONS[existing.type as BuildingType];
      if (!existingDef) continue;
      const overlapX = Math.max(0, Math.min(gridX + definition.width, existing.gridX + existingDef.width) - Math.max(gridX, existing.gridX));
      const overlapY = Math.max(0, Math.min(gridY + definition.height, existing.gridY + existingDef.height) - Math.max(gridY, existing.gridY));
      if (overlapX > 0 && overlapY > 0) {
        return null;
      }
    }
    const level = type === 'wall' ? Backend.resolveWallPlacementLevel(world) : 1;
    const building: SerializedBuilding = { id: randomId(), type, gridX, gridY, level };
    world.buildings.push(building);
    if (type === 'wall') {
      world.wallLevel = level;
    }
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
      world.wallLevel = Backend.clampWallLevel(nextLevel);
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
    const chance = (probability: number) => Math.random() < probability;
    const tileKey = (x: number, y: number) => `${x},${y}`;

    const shuffle = <T,>(items: readonly T[]) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = randInt(0, i);
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    };

    type Difficulty = 'easy' | 'intermediate' | 'hard' | 'crazy';
    type Rect = { minX: number; minY: number; maxX: number; maxY: number };
    type Zone = Rect & { minRadius?: number; maxRadius?: number };
    type LevelFactory = number | (() => number);

    const difficultyRoll = Math.random();
    const difficulty: Difficulty =
      difficultyRoll < 0.40 ? 'easy' :
      difficultyRoll < 0.85 ? 'intermediate' :
      difficultyRoll < 0.95 ? 'hard' :
      'crazy'; // Keep "insane" (crazy) at 5%.

    const botNameByDifficulty: Record<Difficulty, string> = {
      easy: 'Bot Easy Base',
      intermediate: 'Bot Intermediate Base',
      hard: 'Bot Hard Fortress',
      crazy: 'Bot Crazy Max Base'
    };

    const lootByDifficulty: Record<Difficulty, { base: number; variance: number; perBuilding: number }> = {
      easy: { base: 9000, variance: 8000, perBuilding: 140 },
      intermediate: { base: 23000, variance: 18000, perBuilding: 220 },
      hard: { base: 52000, variance: 42000, perBuilding: 320 },
      crazy: { base: 110000, variance: 90000, perBuilding: 500 }
    };

    const fullRect: Rect = {
      minX: margin,
      minY: margin,
      maxX: mapSize - margin - 1,
      maxY: mapSize - margin - 1
    };

    const buildings: SerializedBuilding[] = [];
    const occupied = new Set<string>();
    const structureOccupied = new Set<string>();
    const wallIndexByTile = new Map<string, number>();
    const placedCount = new Map<BuildingType, number>();
    let wallLevel = 1;
    const enforceStructureGap = difficulty !== 'crazy';

    const getPlacedCount = (type: BuildingType) => placedCount.get(type) ?? 0;
    const bumpPlacedCount = (type: BuildingType) => {
      placedCount.set(type, getPlacedCount(type) + 1);
    };

    const maxLevelFor = (type: BuildingType) => BUILDING_DEFINITIONS[type].maxLevel ?? 1;
    const normalizeLevel = (type: BuildingType, level: number) => clamp(level, 1, maxLevelFor(type));
    const isDefenseType = (type: BuildingType) => {
      const info = BUILDING_DEFINITIONS[type];
      return info.category === 'defense' && type !== 'wall';
    };
    const advancedDefenseTypes = new Set<BuildingType>([
      'prism',
      'magmavent',
      'dragons_breath',
      'spike_launcher'
    ]);
    const clampRect = (rect: Rect): Rect => {
      const minX = clamp(rect.minX, margin, mapSize - margin - 3);
      const minY = clamp(rect.minY, margin, mapSize - margin - 3);
      const maxX = clamp(rect.maxX, minX + 2, mapSize - margin - 1);
      const maxY = clamp(rect.maxY, minY + 2, mapSize - margin - 1);
      return { minX, minY, maxX, maxY };
    };
    const insetRect = (rect: Rect, inset: number): Rect => {
      const safeInset = Math.max(0, Math.floor(inset));
      return clampRect({
        minX: rect.minX + safeInset,
        minY: rect.minY + safeInset,
        maxX: rect.maxX - safeInset,
        maxY: rect.maxY - safeInset
      });
    };
    const defenseLevelFactory = (type: BuildingType): (() => number) => {
      const max = maxLevelFor(type);
      if (!isDefenseType(type) || max <= 1) return () => 1;

      return () => {
        let minLevel = 1;
        let maxLevel = max;

        if (difficulty === 'easy') {
          maxLevel = Math.min(max, 2);
        } else if (difficulty === 'intermediate') {
          maxLevel = Math.min(max, 3);
          minLevel = maxLevel >= 2 && chance(0.55) ? 2 : 1;
        } else if (difficulty === 'hard') {
          maxLevel = Math.min(max, 4);
          minLevel = Math.max(1, Math.min(maxLevel, 2));
        } else {
          minLevel = Math.max(1, max - 1);
          maxLevel = max;
        }

        if (advancedDefenseTypes.has(type)) {
          if (difficulty === 'intermediate') {
            minLevel = Math.max(minLevel, Math.max(1, maxLevel - 1));
          } else if (difficulty === 'hard') {
            minLevel = Math.max(minLevel, Math.max(1, maxLevel - 1));
            if (chance(0.35)) return maxLevel;
          } else if (difficulty === 'crazy') {
            minLevel = Math.max(minLevel, maxLevel - 1);
            if (chance(0.7)) return maxLevel;
          }
        }

        return randInt(minLevel, maxLevel);
      };
    };

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

    const canPlaceWithStructureGap = (x: number, y: number, width: number, height: number) => {
      if (!enforceStructureGap) return true;
      const gapTiles = 1;
      for (let dx = -gapTiles; dx < width + gapTiles; dx++) {
        for (let dy = -gapTiles; dy < height + gapTiles; dy++) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx < 0 || ty < 0 || tx >= mapSize || ty >= mapSize) continue;
          if (structureOccupied.has(tileKey(tx, ty))) return false;
        }
      }
      return true;
    };

    const occupyStructureRect = (x: number, y: number, width: number, height: number) => {
      if (!enforceStructureGap) return;
      for (let dx = 0; dx < width; dx++) {
        for (let dy = 0; dy < height; dy++) {
          structureOccupied.add(tileKey(x + dx, y + dy));
        }
      }
    };

    const distanceToCenter = (x: number, y: number, width: number, height: number) => {
      const px = x + width / 2;
      const py = y + height / 2;
      return Math.hypot(px - centerX, py - centerY);
    };

    const placeBuilding = (type: BuildingType, x: number, y: number, level: number): boolean => {
      const definition = BUILDING_DEFINITIONS[type];
      if (getPlacedCount(type) >= definition.maxCount) return false;

      if (type === 'wall' && wallIndexByTile.has(tileKey(x, y))) {
        return true;
      }

      const normalizedLevel = normalizeLevel(type, level);
      if (!inBounds(x, y, definition.width, definition.height)) return false;
      if (!canPlaceRect(x, y, definition.width, definition.height)) return false;
      if (type !== 'wall' && !canPlaceWithStructureGap(x, y, definition.width, definition.height)) return false;

      const idx = buildings.push({
        id: randomId(),
        type,
        gridX: x,
        gridY: y,
        level: normalizedLevel
      }) - 1;

      occupyRect(x, y, definition.width, definition.height);
      if (type !== 'wall') {
        occupyStructureRect(x, y, definition.width, definition.height);
      }
      bumpPlacedCount(type);
      if (type === 'wall') {
        wallIndexByTile.set(tileKey(x, y), idx);
      }
      return true;
    };

    const tryPlaceInZones = (
      type: BuildingType,
      level: number,
      zones: Zone[],
      attempts = 260
    ) => {
      const definition = BUILDING_DEFINITIONS[type];
      if (zones.length === 0) return false;

      for (let attempt = 0; attempt < attempts; attempt++) {
        const zone = zones[randInt(0, zones.length - 1)];
        const minX = zone.minX;
        const maxX = zone.maxX - definition.width + 1;
        const minY = zone.minY;
        const maxY = zone.maxY - definition.height + 1;
        if (maxX < minX || maxY < minY) continue;

        const x = randInt(minX, maxX);
        const y = randInt(minY, maxY);
        const dist = distanceToCenter(x, y, definition.width, definition.height);
        if (typeof zone.minRadius === 'number' && dist < zone.minRadius) continue;
        if (typeof zone.maxRadius === 'number' && dist > zone.maxRadius) continue;
        if (placeBuilding(type, x, y, level)) return true;
      }

      return false;
    };

    const resolveLevel = (type: BuildingType, levelFactory: LevelFactory) => {
      const rawLevel = typeof levelFactory === 'number' ? levelFactory : levelFactory();
      return normalizeLevel(type, rawLevel);
    };

    const placeMany = (
      type: BuildingType,
      targetCount: number,
      levelFactory: LevelFactory,
      primaryZones: Zone[],
      fallbackZones: Zone[] = [fullRect],
      primaryAttempts = 260
    ) => {
      let placed = 0;
      for (let i = 0; i < targetCount; i++) {
        const level = resolveLevel(type, levelFactory);
        if (tryPlaceInZones(type, level, primaryZones, primaryAttempts)) {
          placed++;
          continue;
        }
        if (tryPlaceInZones(type, level, fallbackZones, primaryAttempts * 2)) {
          placed++;
        }
      }
      return placed;
    };

    const placeAtPreferred = (
      type: BuildingType,
      levelFactory: LevelFactory,
      preferredPositions: Array<{ x: number; y: number }>,
      fallbackZones: Zone[]
    ) => {
      const level = resolveLevel(type, levelFactory);
      for (const point of shuffle(preferredPositions)) {
        if (placeBuilding(type, point.x, point.y, level)) return true;
      }
      return tryPlaceInZones(type, level, fallbackZones, 900);
    };

    const addWallRing = (
      rect: Rect,
      gateCount: number,
      gateSpan = 2
    ) => {
      if (rect.maxX - rect.minX < 2 || rect.maxY - rect.minY < 2) return;

      type Edge = 'top' | 'bottom' | 'left' | 'right';
      const gateTiles = new Set<string>();
      const edges: Edge[] = ['top', 'bottom', 'left', 'right'];

      for (let i = 0; i < gateCount; i++) {
        const edge = edges[randInt(0, edges.length - 1)];

        if (edge === 'top' || edge === 'bottom') {
          const y = edge === 'top' ? rect.minY : rect.maxY;
          const startX = randInt(rect.minX + 1, rect.maxX - 1);
          for (let offset = 0; offset < gateSpan; offset++) {
            const x = clamp(startX + offset, rect.minX + 1, rect.maxX - 1);
            gateTiles.add(tileKey(x, y));
          }
        } else {
          const x = edge === 'left' ? rect.minX : rect.maxX;
          const startY = randInt(rect.minY + 1, rect.maxY - 1);
          for (let offset = 0; offset < gateSpan; offset++) {
            const y = clamp(startY + offset, rect.minY + 1, rect.maxY - 1);
            gateTiles.add(tileKey(x, y));
          }
        }
      }

      for (let x = rect.minX; x <= rect.maxX; x++) {
        if (!gateTiles.has(tileKey(x, rect.minY))) placeBuilding('wall', x, rect.minY, wallLevel);
        if (!gateTiles.has(tileKey(x, rect.maxY))) placeBuilding('wall', x, rect.maxY, wallLevel);
      }

      for (let y = rect.minY + 1; y <= rect.maxY - 1; y++) {
        if (!gateTiles.has(tileKey(rect.minX, y))) placeBuilding('wall', rect.minX, y, wallLevel);
        if (!gateTiles.has(tileKey(rect.maxX, y))) placeBuilding('wall', rect.maxX, y, wallLevel);
      }
    };

    const addVerticalDivider = (
      x: number,
      minY: number,
      maxY: number,
      gapCenterY: number,
      gapRadius = 1
    ) => {
      for (let y = minY; y <= maxY; y++) {
        if (Math.abs(y - gapCenterY) <= gapRadius) continue;
        placeBuilding('wall', x, y, wallLevel);
      }
    };

    const addHorizontalDivider = (
      y: number,
      minX: number,
      maxX: number,
      gapCenterX: number,
      gapRadius = 1
    ) => {
      for (let x = minX; x <= maxX; x++) {
        if (Math.abs(x - gapCenterX) <= gapRadius) continue;
        placeBuilding('wall', x, y, wallLevel);
      }
    };

    const fillWallsTo = (targetCount: number, zones: Zone[]) => {
      const wallMax = BUILDING_DEFINITIONS.wall.maxCount;
      const cappedTarget = clamp(targetCount, 0, wallMax);
      let guard = 0;
      while (getPlacedCount('wall') < cappedTarget && guard < cappedTarget * 100) {
        guard++;
        if (!tryPlaceInZones('wall', wallLevel, zones, 1)) continue;
      }
    };

    const coreRect: Rect = { minX: 9, minY: 9, maxX: 15, maxY: 15 };
    const innerRect: Rect = { minX: 7, minY: 7, maxX: 17, maxY: 17 };
    const midRect: Rect = { minX: 5, minY: 5, maxX: 19, maxY: 19 };
    const outerRect: Rect = { minX: 2, minY: 2, maxX: 22, maxY: 22 };

    const coreZones: Zone[] = [{ ...coreRect, maxRadius: 6.5 }];
    const innerZones: Zone[] = [{ ...innerRect, minRadius: 1.5, maxRadius: 8.8 }];
    const midZones: Zone[] = [{ ...midRect, minRadius: 5.2, maxRadius: 12.2 }];
    const outerZones: Zone[] = [{ ...outerRect, minRadius: 8.2 }];
    const fullZones: Zone[] = [{ ...fullRect }];

    const townHallDef = BUILDING_DEFINITIONS.town_hall;
    const townHallX = centerX - Math.floor(townHallDef.width / 2);
    const townHallY = centerY - Math.floor(townHallDef.height / 2);

    if (difficulty === 'easy') {
      // Easy: compact, lightly defended, still procedural.
      const easyHalf = randInt(4, 5);
      const easyCompactRect = clampRect({
        minX: centerX - easyHalf + randInt(-1, 1),
        minY: centerY - easyHalf + randInt(-1, 1),
        maxX: centerX + easyHalf + randInt(-1, 1),
        maxY: centerY + easyHalf + randInt(-1, 1)
      });
      const easyCompactZones: Zone[] = [{ ...easyCompactRect, maxRadius: 6.4 + Math.random() * 0.9 }];

      placeBuilding('town_hall', townHallX, townHallY, 1);
      placeMany('cannon', 2, defenseLevelFactory('cannon'), easyCompactZones, easyCompactZones);
      if (chance(0.55)) placeMany('mortar', 1, defenseLevelFactory('mortar'), easyCompactZones, easyCompactZones);
      if (chance(0.4)) placeMany('tesla', 1, defenseLevelFactory('tesla'), easyCompactZones, easyCompactZones);

      placeMany('army_camp', 1, 1, easyCompactZones, easyCompactZones);
      placeMany('barracks', 1, 5, easyCompactZones, easyCompactZones);
      placeMany('solana_collector', randInt(2, 3), 1, easyCompactZones, easyCompactZones);
    } else if (difficulty === 'intermediate') {
      // Intermediate: full wall ring + varied defense levels.
      wallLevel = 2;
      placeBuilding('town_hall', townHallX, townHallY, 2);

      const mediumRingRect = clampRect({
        minX: centerX - randInt(6, 7) + randInt(-1, 1),
        minY: centerY - randInt(6, 7) + randInt(-1, 1),
        maxX: centerX + randInt(6, 7) + randInt(-1, 1),
        maxY: centerY + randInt(6, 7) + randInt(-1, 1)
      });
      addWallRing(mediumRingRect, 0, 1); // Fully closed wall ring for medium bases.

      const mediumInnerRect = insetRect(mediumRingRect, 1);
      const defenseZones: Zone[] = [{ ...mediumInnerRect, maxRadius: 8.8 + Math.random() * 0.8 }];
      const supportZones: Zone[] = [{ ...fullRect, minRadius: 6.8 + Math.random() * 1.2 }];

      placeMany('ballista', 1, defenseLevelFactory('ballista'), defenseZones, innerZones);
      placeMany('xbow', 1, defenseLevelFactory('xbow'), defenseZones, innerZones);
      placeMany('mortar', randInt(1, 2), defenseLevelFactory('mortar'), defenseZones, innerZones);
      placeMany('cannon', randInt(3, 4), defenseLevelFactory('cannon'), defenseZones, midZones);
      placeMany('tesla', randInt(1, 2), defenseLevelFactory('tesla'), defenseZones, innerZones);

      placeMany('army_camp', 2, 2, supportZones, midZones);
      placeMany('barracks', 1, 8, supportZones, midZones);
      placeMany('lab', 1, 1, supportZones, midZones);
      placeMany('solana_collector', randInt(4, 5), 2, supportZones, fullZones);
    } else if (difficulty === 'hard') {
      // Hard: layered procedural walls and heavier advanced-defense presence.
      wallLevel = chance(0.5) ? 4 : 3;
      placeBuilding('town_hall', townHallX, townHallY, 2);

      const hardOuterRing = clampRect({
        minX: 5 + randInt(-1, 1),
        minY: 5 + randInt(-1, 1),
        maxX: 19 + randInt(-1, 1),
        maxY: 19 + randInt(-1, 1)
      });
      const hardMidRing = insetRect(hardOuterRing, randInt(3, 4));
      const hardInnerRing = insetRect(hardMidRing, randInt(2, 3));
      const hardCoreRect = insetRect(hardInnerRing, 1);

      const hardCoreZones: Zone[] = [{ ...hardCoreRect, maxRadius: 6.0 + Math.random() * 1.0 }];
      const hardDefenseZones: Zone[] = [{ ...insetRect(hardOuterRing, 1), maxRadius: 9.0 + Math.random() * 1.2 }];
      const hardSupportZones: Zone[] = [{ ...fullRect, minRadius: 6.6 + Math.random() * 1.2 }];

      const magmaventPlaced = placeAtPreferred(
        'magmavent',
        defenseLevelFactory('magmavent'),
        [
          { x: centerX - 5 + randInt(-1, 1), y: centerY - 1 + randInt(-1, 1) },
          { x: centerX + 2 + randInt(-1, 1), y: centerY - 1 + randInt(-1, 1) },
          { x: centerX - 1 + randInt(-1, 1), y: centerY - 5 + randInt(-1, 1) },
          { x: centerX - 1 + randInt(-1, 1), y: centerY + 2 + randInt(-1, 1) }
        ],
        hardDefenseZones
      );

      addWallRing(hardOuterRing, randInt(2, 3), 2);
      addWallRing(hardMidRing, randInt(1, 2), 2);
      addWallRing(hardInnerRing, chance(0.45) ? 1 : 0, 2);

      const dividerX = clamp(centerX + randInt(-1, 1), hardInnerRing.minX + 1, hardInnerRing.maxX - 1);
      const dividerY = clamp(centerY + randInt(-1, 1), hardInnerRing.minY + 1, hardInnerRing.maxY - 1);
      addVerticalDivider(dividerX, hardInnerRing.minY + 1, hardInnerRing.maxY - 1, dividerY, 1);
      addHorizontalDivider(dividerY, hardInnerRing.minX + 1, hardInnerRing.maxX - 1, dividerX, 1);

      let advancedPlaced = 0;
      if (magmaventPlaced) advancedPlaced++;
      if (!magmaventPlaced && placeMany('magmavent', 1, defenseLevelFactory('magmavent'), hardDefenseZones, fullZones, 1200) > 0) {
        advancedPlaced++;
      }
      if (chance(0.35)) {
        advancedPlaced += placeMany('dragons_breath', 1, defenseLevelFactory('dragons_breath'), hardCoreZones, hardDefenseZones, 900) > 0 ? 1 : 0;
      }
      advancedPlaced += placeMany('spike_launcher', chance(0.75) ? 2 : 1, defenseLevelFactory('spike_launcher'), hardDefenseZones, midZones) > 0 ? 1 : 0;
      advancedPlaced += placeMany('prism', 1, defenseLevelFactory('prism'), hardCoreZones, hardDefenseZones, 700) > 0 ? 1 : 0;
      if (advancedPlaced < 2) {
        if (placeMany('dragons_breath', 1, defenseLevelFactory('dragons_breath'), hardDefenseZones, fullZones, 1200) > 0) advancedPlaced++;
        if (advancedPlaced < 2 && placeMany('prism', 1, defenseLevelFactory('prism'), hardDefenseZones, fullZones, 1200) > 0) advancedPlaced++;
      }

      placeMany('xbow', randInt(2, 3), defenseLevelFactory('xbow'), hardDefenseZones, innerZones);
      placeMany('ballista', randInt(2, 3), defenseLevelFactory('ballista'), hardDefenseZones, innerZones);
      placeMany('mortar', randInt(2, 3), defenseLevelFactory('mortar'), hardDefenseZones, innerZones);
      placeMany('tesla', randInt(2, 3), defenseLevelFactory('tesla'), hardDefenseZones, innerZones);
      placeMany('cannon', randInt(4, 5), defenseLevelFactory('cannon'), hardDefenseZones, midZones);

      placeMany('army_camp', 4, 3, hardSupportZones, midZones);
      placeMany('barracks', 1, 11, hardSupportZones, midZones);
      placeMany('lab', 1, 2, hardSupportZones, midZones);
      placeMany('solana_collector', randInt(6, 9), 2, hardSupportZones, outerZones);

      fillWallsTo(randInt(90, 98), [{ ...insetRect(hardOuterRing, 1), minRadius: 4.2, maxRadius: 12.8 }]);
    } else {
      // Crazy (5%): still insane, but procedural layout and slight level variation.
      wallLevel = 4;
      const crazyOuterRing = clampRect({
        minX: 4 + randInt(-1, 1),
        minY: 4 + randInt(-1, 1),
        maxX: 20 + randInt(-1, 1),
        maxY: 20 + randInt(-1, 1)
      });
      const crazyMidRing = insetRect(crazyOuterRing, randInt(3, 4));
      const crazyInnerRing = insetRect(crazyMidRing, randInt(1, 2));

      addWallRing(crazyOuterRing, randInt(3, 4), randInt(2, 3));
      addWallRing(crazyMidRing, randInt(1, 2), 2);
      addWallRing(crazyInnerRing, chance(0.5) ? 1 : 0, 2);

      const dragonX = clamp(centerX - 2 + randInt(-1, 1), margin, mapSize - margin - BUILDING_DEFINITIONS.dragons_breath.width);
      const dragonY = clamp(centerY - 2 + randInt(-1, 1), margin, mapSize - margin - BUILDING_DEFINITIONS.dragons_breath.height);
      if (!placeBuilding('dragons_breath', dragonX, dragonY, defenseLevelFactory('dragons_breath')())) {
        placeMany('dragons_breath', 1, defenseLevelFactory('dragons_breath'), coreZones, innerZones, 900);
      }

      const crazyDefenseZones: Zone[] = [{ ...insetRect(crazyOuterRing, 2) }];
      const crazySupportZones: Zone[] = [{ ...fullRect }];

      placeAtPreferred(
        'town_hall',
        maxLevelFor('town_hall'),
        [
          { x: centerX - 1 + randInt(-1, 1), y: centerY + 3 + randInt(-1, 1) },
          { x: centerX - 1 + randInt(-1, 1), y: centerY - 6 + randInt(-1, 1) },
          { x: centerX + 3 + randInt(-1, 1), y: centerY - 1 + randInt(-1, 1) },
          { x: centerX - 6 + randInt(-1, 1), y: centerY - 1 + randInt(-1, 1) }
        ],
        crazyDefenseZones
      );
      if (getPlacedCount('town_hall') === 0) {
        placeMany('town_hall', 1, maxLevelFor('town_hall'), fullZones, fullZones, 1200);
      }

      placeAtPreferred(
        'magmavent',
        defenseLevelFactory('magmavent'),
        [
          { x: centerX - 5 + randInt(-1, 1), y: centerY - 1 + randInt(-1, 1) },
          { x: centerX + 2 + randInt(-1, 1), y: centerY - 1 + randInt(-1, 1) },
          { x: centerX - 1 + randInt(-1, 1), y: centerY - 5 + randInt(-1, 1) },
          { x: centerX - 1 + randInt(-1, 1), y: centerY + 2 + randInt(-1, 1) }
        ],
        crazyDefenseZones
      );
      if (getPlacedCount('magmavent') === 0) {
        placeMany('magmavent', 1, defenseLevelFactory('magmavent'), crazyDefenseZones, fullZones, 1200);
      }

      placeMany('spike_launcher', BUILDING_DEFINITIONS.spike_launcher.maxCount, defenseLevelFactory('spike_launcher'), crazyDefenseZones, fullZones);
      placeMany('xbow', BUILDING_DEFINITIONS.xbow.maxCount, defenseLevelFactory('xbow'), crazyDefenseZones, fullZones);
      placeMany('ballista', BUILDING_DEFINITIONS.ballista.maxCount, defenseLevelFactory('ballista'), crazyDefenseZones, fullZones);
      placeMany('mortar', BUILDING_DEFINITIONS.mortar.maxCount, defenseLevelFactory('mortar'), crazyDefenseZones, fullZones);
      placeMany('army_camp', BUILDING_DEFINITIONS.army_camp.maxCount, maxLevelFor('army_camp'), crazySupportZones, fullZones);
      placeMany('solana_collector', randInt(9, 11), maxLevelFor('solana_collector'), crazySupportZones, fullZones);
      placeMany('barracks', 1, maxLevelFor('barracks'), crazySupportZones, fullZones);
      placeMany('lab', 1, maxLevelFor('lab'), crazySupportZones, fullZones);
      placeMany('cannon', BUILDING_DEFINITIONS.cannon.maxCount, defenseLevelFactory('cannon'), crazySupportZones, fullZones);
      placeMany('tesla', BUILDING_DEFINITIONS.tesla.maxCount, defenseLevelFactory('tesla'), crazySupportZones, fullZones);
      placeMany('prism', BUILDING_DEFINITIONS.prism.maxCount, defenseLevelFactory('prism'), crazyDefenseZones, fullZones);

      fillWallsTo(BUILDING_DEFINITIONS.wall.maxCount, [
        { ...fullRect, minRadius: 4.0, maxRadius: 13.5 },
        { ...outerRect, minRadius: 6.0 }
      ]);
    }

    const hasNonWallBuilding = buildings.some(building => building.type !== 'wall');
    if (!hasNonWallBuilding) {
      // Absolute guard: ensure generated bot bases always have playable structures.
      buildings.length = 0;
      const cx = centerX - 1;
      const cy = centerY - 1;
      buildings.push(
        { id: randomId(), type: 'town_hall', gridX: cx, gridY: cy, level: 1 },
        { id: randomId(), type: 'cannon', gridX: cx - 3, gridY: cy, level: 1 },
        { id: randomId(), type: 'barracks', gridX: cx + 4, gridY: cy, level: 1 },
        { id: randomId(), type: 'army_camp', gridX: cx, gridY: cy + 4, level: 1 },
        { id: randomId(), type: 'solana_collector', gridX: cx + 3, gridY: cy + 3, level: 1 }
      );
    }

    const lootConfig = lootByDifficulty[difficulty];
    const resourceSol = Math.floor(
      lootConfig.base +
      Math.random() * lootConfig.variance +
      buildings.length * lootConfig.perBuilding
    );

    return {
      id: `bot_${randomId('world_')}`,
      ownerId: 'bot',
      username: botNameByDifficulty[difficulty],
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
  ): Promise<{ lootApplied: number; attackerBalance: number; attackerRevision?: number } | null> {
    if (!Auth.isOnlineMode()) return null;
    const response = await Backend.apiPost<{ lootApplied: number; attackerBalance: number; attackerRevision?: number }>('/api/attacks/resolve', {
      victimId,
      attackerId,
      attackerName,
      solLooted,
      destruction,
      attackId
    });
    const world = Backend.getCachedWorld(attackerId);
    if (world) {
      world.resources.sol = Math.max(0, Math.floor(Number(response.attackerBalance) || 0));
      if (typeof response.attackerRevision === 'number' && Number.isFinite(response.attackerRevision)) {
        world.revision = Math.max(1, Math.floor(response.attackerRevision));
      }
      world.lastSaveTime = Date.now();
      Backend.setCachedWorld(attackerId, world);
    }
    return response;
  }

  private static normalizeReplayFrame(input: Partial<ReplayFrameSnapshot> | null | undefined): ReplayFrameSnapshot | null {
    if (!input) return null;

    const buildings = Array.isArray(input.buildings)
      ? input.buildings
        .map(item => {
          const id = typeof item?.id === 'string' ? item.id : '';
          if (!id) return null;
          return {
            id,
            health: Math.max(0, Math.floor(Number(item.health) || 0)),
            isDestroyed: Boolean(item.isDestroyed)
          };
        })
        .filter((item): item is ReplayBuildingSnapshot => item !== null)
      : [];

    const troops = Array.isArray(input.troops)
      ? input.troops
        .map(item => {
          const id = typeof item?.id === 'string' ? item.id : '';
          const type = typeof item?.type === 'string' ? item.type : '';
          if (!id || !type) return null;
          return {
            id,
            type,
            level: Math.max(1, Math.floor(Number(item.level) || 1)),
            owner: item.owner === 'ENEMY' ? 'ENEMY' : 'PLAYER',
            gridX: Number(item.gridX) || 0,
            gridY: Number(item.gridY) || 0,
            health: Math.max(0, Number(item.health) || 0),
            maxHealth: Math.max(1, Number(item.maxHealth) || 1),
            recursionGen: Number.isFinite(Number(item.recursionGen)) ? Math.max(0, Math.floor(Number(item.recursionGen))) : undefined,
            facingAngle: Number.isFinite(Number(item.facingAngle)) ? Number(item.facingAngle) : undefined,
            hasTakenDamage: Boolean(item.hasTakenDamage)
          } as ReplayTroopSnapshot;
        })
        .filter((item): item is ReplayTroopSnapshot => item !== null)
      : [];

    return {
      t: Math.max(0, Math.floor(Number(input.t) || 0)),
      destruction: Math.max(0, Math.min(100, Number(input.destruction) || 0)),
      solLooted: Math.max(0, Math.floor(Number(input.solLooted) || 0)),
      buildings,
      troops
    };
  }

  private static normalizeAttackReplayState(input: Record<string, unknown> | null | undefined): AttackReplayState | null {
    if (!input) return null;
    const attackId = typeof input.attackId === 'string' ? input.attackId : '';
    const attackerId = typeof input.attackerId === 'string' ? input.attackerId : '';
    const attackerName = typeof input.attackerName === 'string' ? input.attackerName : 'Unknown';
    const victimId = typeof input.victimId === 'string' ? input.victimId : '';
    const statusRaw = typeof input.status === 'string' ? input.status : 'live';
    const status = statusRaw === 'finished' || statusRaw === 'aborted' ? statusRaw : 'live';
    const enemyWorld = input.enemyWorld as SerializedWorld | undefined;
    if (!attackId || !attackerId || !victimId || !enemyWorld || !Array.isArray(enemyWorld.buildings)) return null;

    const rawFrames = Array.isArray(input.frames) ? input.frames : [];
    const frames = rawFrames
      .map(frame => Backend.normalizeReplayFrame(frame as Partial<ReplayFrameSnapshot> | null | undefined))
      .filter((frame): frame is ReplayFrameSnapshot => frame !== null);
    const latestFrame = Backend.normalizeReplayFrame(input.latestFrame as Partial<ReplayFrameSnapshot> | null | undefined)
      ?? (frames.length > 0 ? frames[frames.length - 1] : null);

    const finalResultRaw = (input.finalResult as Record<string, unknown> | undefined) ?? undefined;
    const finalResult = finalResultRaw
      ? {
        destruction: Math.max(0, Math.min(100, Number(finalResultRaw.destruction) || 0)),
        solLooted: Math.max(0, Math.floor(Number(finalResultRaw.solLooted) || 0))
      }
      : undefined;

    return {
      attackId,
      attackerId,
      attackerName,
      victimId,
      victimName: typeof input.victimName === 'string' ? input.victimName : undefined,
      status,
      startedAt: Math.max(0, Math.floor(Number(input.startedAt) || Date.now())),
      updatedAt: Math.max(0, Math.floor(Number(input.updatedAt) || Date.now())),
      endedAt: Number.isFinite(Number(input.endedAt)) ? Math.max(0, Math.floor(Number(input.endedAt))) : undefined,
      enemyWorld,
      finalResult,
      frameCount: Math.max(0, Math.floor(Number(input.frameCount) || frames.length || (latestFrame ? 1 : 0))),
      latestFrame,
      frames: frames.length > 0 ? frames : undefined
    };
  }

  static async startAttackReplaySession(
    attackId: string,
    victimId: string,
    attackerId: string,
    attackerName: string,
    enemyWorld: SerializedWorld
  ): Promise<boolean> {
    if (!Auth.isOnlineMode()) return false;
    if (!attackId || !victimId || !attackerId) return false;
    await Backend.apiPost('/api/attacks/replay', {
      action: 'start',
      attackId,
      victimId,
      attackerId,
      attackerName,
      enemyWorld
    });
    return true;
  }

  static async pushAttackReplayFrame(
    attackId: string,
    frame: ReplayFrameSnapshot
  ): Promise<number> {
    if (!Auth.isOnlineMode()) return 0;
    if (!attackId) return 0;
    const response = await Backend.apiPost<{ ok?: boolean; frameCount?: number }>('/api/attacks/replay', {
      action: 'frame',
      attackId,
      frame
    });
    return Math.max(0, Math.floor(Number(response.frameCount) || 0));
  }

  static async endAttackReplaySession(
    attackId: string,
    status: 'finished' | 'aborted',
    destruction: number,
    solLooted: number
  ): Promise<void> {
    if (!Auth.isOnlineMode()) return;
    if (!attackId) return;
    await Backend.apiPost('/api/attacks/replay', {
      action: 'end',
      attackId,
      status,
      destruction,
      solLooted
    });
  }

  static async getIncomingAttacks(userId: string): Promise<IncomingAttackSession[]> {
    void userId;
    if (!Auth.isOnlineMode()) return [];
    const response = await Backend.apiPost<{ sessions?: Array<Record<string, unknown>> }>('/api/attacks/replay', { action: 'incoming' });
    return (response.sessions ?? [])
      .map(item => {
        const attackId = typeof item.attackId === 'string' ? item.attackId : '';
        const attackerId = typeof item.attackerId === 'string' ? item.attackerId : '';
        const victimId = typeof item.victimId === 'string' ? item.victimId : '';
        if (!attackId || !attackerId || !victimId) return null;
        return {
          attackId,
          attackerId,
          attackerName: typeof item.attackerName === 'string' && item.attackerName ? item.attackerName : 'Unknown',
          victimId,
          startedAt: Math.max(0, Math.floor(Number(item.startedAt) || Date.now())),
          updatedAt: Math.max(0, Math.floor(Number(item.updatedAt) || Date.now()))
        } as IncomingAttackSession;
      })
      .filter((item): item is IncomingAttackSession => item !== null);
  }

  static async getLiveAttackState(attackId: string): Promise<AttackReplayState | null> {
    if (!Auth.isOnlineMode()) return null;
    if (!attackId) return null;
    const response = await Backend.apiPost<{ replay?: Record<string, unknown> }>('/api/attacks/replay', {
      action: 'state',
      attackId
    });
    return Backend.normalizeAttackReplayState(response.replay ?? null);
  }

  static async getAttackReplay(attackId: string): Promise<AttackReplayState | null> {
    if (!Auth.isOnlineMode()) return null;
    if (!attackId) return null;
    const response = await Backend.apiPost<{ replay?: Record<string, unknown> }>('/api/attacks/replay', {
      action: 'replay',
      attackId
    });
    return Backend.normalizeAttackReplayState(response.replay ?? null);
  }

  static async getUnreadNotificationCount(userId: string): Promise<number> {
    void userId;
    if (!Auth.isOnlineMode()) return 0;
    const response = await Backend.apiPost<{ unread: number }>('/api/notifications/attack', { action: 'unreadCount' });
    return response.unread ?? 0;
  }

  static async getNotifications(userId: string): Promise<AttackNotification[]> {
    void userId;
    if (!Auth.isOnlineMode()) return [];
    const response = await Backend.apiPost<{ items: NotificationListItem[] }>('/api/notifications/attack', { action: 'list' });
    return (response.items ?? []).map(item => {
      const timestamp = Math.max(0, Math.floor(Number(item.timestamp ?? item.time ?? Date.now()) || Date.now()));
      return {
        id: typeof item.id === 'string' && item.id ? item.id : makeRequestId('notif'),
        attackId: typeof item.attackId === 'string'
          ? item.attackId
          : (typeof item.id === 'string' && item.id ? item.id : undefined),
        attackerName: typeof item.attackerName === 'string' && item.attackerName ? item.attackerName : 'Unknown',
        solLost: typeof item.solLost === 'number' ? item.solLost : undefined,
        goldLost: typeof item.goldLost === 'number' ? item.goldLost : undefined,
        elixirLost: typeof item.elixirLost === 'number' ? item.elixirLost : undefined,
        destruction: Math.max(0, Math.floor(Number(item.destruction) || 0)),
        timestamp,
        read: Boolean(item.read),
        replayAvailable: Boolean(item.replayAvailable) || typeof item.attackId === 'string'
      };
    });
  }

  static async markNotificationsRead(userId: string) {
    void userId;
    if (!Auth.isOnlineMode()) return;
    await Backend.apiPost('/api/notifications/attack', { action: 'markRead' });
  }
}
