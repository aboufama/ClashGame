import { deleteJson, deletePrefix, listPathnames, readJson, writeJson } from './blob.js';
import {
  MAX_BALANCE,
  STARTING_BALANCE,
  buildStarterWorld,
  clamp,
  isWorldPatchEmpty,
  normalizeWorldInput,
  sanitizeArmy,
  sanitizeBuilding,
  sanitizeObstacle,
  type GameEvent,
  type GameSnapshot,
  type MaterializedState,
  type SerializedBuilding,
  type SerializedObstacle,
  type SerializedWorld,
  type WalletRecord,
  type WorldPatch,
  type WorldPatchEventPayload
} from './models.js';
import { producedBetween } from './production.js';

const GAME_ROOT = 'game';
const LEGACY_SCHEMA_VERSION = 1 as const;
const STATE_SCHEMA_VERSION = 2 as const;
const MAX_REQUEST_KEYS = 400;

interface StoredPlayerState {
  schemaVersion: typeof STATE_SCHEMA_VERSION;
  updatedAt: number;
  world: SerializedWorld;
  requestKeys: string[];
}

function statePath(userId: string) {
  return `${GAME_ROOT}/${userId}/state.json`;
}

function legacySnapshotPath(userId: string) {
  return `${GAME_ROOT}/${userId}/snapshot.json`;
}

function legacyEventsPrefix(userId: string) {
  return `${GAME_ROOT}/${userId}/events/`;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toFiniteInt(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function fallbackUsernameFor(userId: string) {
  const suffix = String(userId || 'player').slice(-6);
  return `Player-${suffix || 'guest'}`;
}

function normalizedRequestKey(requestKey: string | undefined) {
  if (!requestKey) return undefined;
  const trimmed = requestKey.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 160);
}

function normalizeRequestKeys(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    const normalized = normalizedRequestKey(typeof item === 'string' ? item : undefined);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  if (out.length <= MAX_REQUEST_KEYS) return out;
  return out.slice(out.length - MAX_REQUEST_KEYS);
}

function normalizeWorldForStorage(world: SerializedWorld, userId: string, username: string): SerializedWorld {
  const normalized = normalizeWorldInput(world, userId, username);

  const requestedSol = Number((world.resources as { sol?: unknown } | undefined)?.sol);
  const fallbackSol = Number((normalized.resources as { sol?: unknown } | undefined)?.sol);
  const sol = Number.isFinite(requestedSol)
    ? requestedSol
    : (Number.isFinite(fallbackSol) ? fallbackSol : STARTING_BALANCE);

  normalized.id = String(world.id || normalized.id || `world_${userId}`).slice(0, 120);
  normalized.ownerId = userId;
  normalized.username = username;
  normalized.resources.sol = clamp(Math.floor(sol), 0, MAX_BALANCE);
  normalized.lastSaveTime = Math.max(0, toFiniteInt(world.lastSaveTime, Date.now()));
  normalized.revision = Math.max(1, toFiniteInt(world.revision, 1));

  return normalized;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isGameEvent(value: unknown): value is GameEvent {
  if (!isObject(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (value.kind !== 'world_patch' && value.kind !== 'resource_delta') return false;
  if (!Number.isFinite(Number(value.at))) return false;
  if (!('payload' in value)) return false;
  return true;
}

function applyWorldPatch(world: SerializedWorld, patch: WorldPatch) {
  const removeBuildingIds = new Set(patch.removeBuildingIds);
  const upsertBuildings = new Map<string, SerializedBuilding>();
  for (const b of patch.upsertBuildings) {
    upsertBuildings.set(b.id, sanitizeBuilding(b));
  }

  const nextBuildings: SerializedBuilding[] = [];
  for (const current of world.buildings) {
    if (removeBuildingIds.has(current.id)) continue;
    const replacement = upsertBuildings.get(current.id);
    if (replacement) {
      nextBuildings.push(replacement);
      upsertBuildings.delete(current.id);
    } else {
      nextBuildings.push(sanitizeBuilding(current));
    }
  }
  for (const added of upsertBuildings.values()) {
    nextBuildings.push(added);
  }
  world.buildings = Array.from(new Map(nextBuildings.map(b => [b.id, sanitizeBuilding(b)])).values())
    .sort((a, b) => a.id.localeCompare(b.id));

  const currentObstacles = Array.isArray(world.obstacles) ? world.obstacles : [];
  const removeObstacleIds = new Set(patch.removeObstacleIds);
  const upsertObstacles = new Map<string, SerializedObstacle>();
  for (const o of patch.upsertObstacles) {
    upsertObstacles.set(o.id, sanitizeObstacle(o));
  }

  const nextObstacles: SerializedObstacle[] = [];
  for (const current of currentObstacles) {
    if (removeObstacleIds.has(current.id)) continue;
    const replacement = upsertObstacles.get(current.id);
    if (replacement) {
      nextObstacles.push(replacement);
      upsertObstacles.delete(current.id);
    } else {
      nextObstacles.push(sanitizeObstacle(current));
    }
  }
  for (const added of upsertObstacles.values()) {
    nextObstacles.push(added);
  }
  world.obstacles = Array.from(new Map(nextObstacles.map(o => [o.id, sanitizeObstacle(o)])).values())
    .sort((a, b) => a.id.localeCompare(b.id));

  if (typeof patch.army !== 'undefined') {
    world.army = sanitizeArmy(patch.army);
  }
  if (typeof patch.wallLevel !== 'undefined') {
    world.wallLevel = Math.max(1, toFiniteInt(patch.wallLevel, 1));
  }
}

function applyLegacyEvent(world: SerializedWorld, balance: number, event: GameEvent): number {
  if (event.kind === 'world_patch') {
    const payload = event.payload as Partial<WorldPatchEventPayload>;
    const patch = payload.patch;
    if (patch) {
      applyWorldPatch(world, {
        upsertBuildings: Array.isArray(patch.upsertBuildings) ? patch.upsertBuildings.map(sanitizeBuilding) : [],
        removeBuildingIds: Array.isArray(patch.removeBuildingIds) ? patch.removeBuildingIds.map(String) : [],
        upsertObstacles: Array.isArray(patch.upsertObstacles) ? patch.upsertObstacles.map(sanitizeObstacle) : [],
        removeObstacleIds: Array.isArray(patch.removeObstacleIds) ? patch.removeObstacleIds.map(String) : [],
        army: typeof patch.army === 'undefined' ? undefined : sanitizeArmy(patch.army),
        wallLevel: typeof patch.wallLevel === 'undefined' ? undefined : Math.max(1, toFiniteInt(patch.wallLevel, 1))
      });
    }
    return balance;
  }

  if (event.kind === 'resource_delta') {
    const payload = event.payload as { delta?: unknown };
    const delta = Number(payload.delta ?? 0);
    if (!Number.isFinite(delta)) return balance;
    return clamp(Math.floor(balance + delta), 0, MAX_BALANCE);
  }

  return balance;
}

async function readLegacySnapshot(userId: string, username: string): Promise<GameSnapshot | null> {
  const now = Date.now();

  const existing = await readJson<GameSnapshot>(legacySnapshotPath(userId));
  if (existing && existing.schemaVersion === LEGACY_SCHEMA_VERSION && existing.world) {
    const world = normalizeWorldForStorage(existing.world, userId, username);
    const createdAt = Math.max(0, toFiniteInt(existing.createdAt, world.lastSaveTime));
    const baseBalance = clamp(toFiniteInt(existing.baseBalance, world.resources.sol), 0, MAX_BALANCE);
    world.resources.sol = baseBalance;
    return {
      schemaVersion: LEGACY_SCHEMA_VERSION,
      createdAt,
      world,
      baseBalance
    };
  }

  const [legacyWorld, legacyWallet] = await Promise.all([
    readJson<SerializedWorld>(`bases/${userId}.json`),
    readJson<WalletRecord>(`wallets/${userId}.json`)
  ]);

  if (!legacyWorld || !Array.isArray(legacyWorld.buildings)) return null;

  const world = normalizeWorldForStorage(legacyWorld, userId, username);
  const baseBalance = clamp(
    Math.floor(Number(legacyWallet?.balance ?? legacyWorld.resources?.sol ?? STARTING_BALANCE)),
    0,
    MAX_BALANCE
  );
  world.resources.sol = baseBalance;

  const createdAt = Math.max(0, toFiniteInt(legacyWorld.lastSaveTime ?? legacyWallet?.updatedAt, now));
  return {
    schemaVersion: LEGACY_SCHEMA_VERSION,
    createdAt,
    world,
    baseBalance
  };
}

async function loadLegacyEvents(userId: string): Promise<GameEvent[]> {
  const prefix = legacyEventsPrefix(userId);
  const pathnames = await listPathnames(prefix).catch(error => {
    console.warn('legacy events list failed', { userId, error });
    return [] as string[];
  });
  if (pathnames.length === 0) return [];

  const raw = await Promise.all(
    pathnames.map(pathname =>
      readJson<GameEvent>(pathname).catch(error => {
        console.warn('legacy event read failed', { userId, pathname, error });
        return null;
      })
    )
  );

  const events = raw.filter(isGameEvent);
  events.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    return a.id.localeCompare(b.id);
  });
  return events;
}

async function materializeLegacyState(userId: string, username: string, at: number): Promise<MaterializedState> {
  const legacySnapshot = await readLegacySnapshot(userId, username);
  const starter = buildStarterWorld(userId, username);

  const snapshot = legacySnapshot ?? {
    schemaVersion: LEGACY_SCHEMA_VERSION,
    createdAt: starter.lastSaveTime,
    world: starter,
    baseBalance: STARTING_BALANCE
  };

  const events = await loadLegacyEvents(userId);

  const world = deepClone(normalizeWorldForStorage(snapshot.world, userId, username));
  let balance = clamp(toFiniteInt(snapshot.baseBalance, world.resources.sol), 0, MAX_BALANCE);
  let worldRevision = Math.max(1, toFiniteInt(world.revision, 1));
  let cursor = Math.max(0, toFiniteInt(snapshot.createdAt, world.lastSaveTime));
  let lastMutationAt = cursor;
  const requestKeys = new Set<string>();

  for (const event of events) {
    const eventAt = Math.max(cursor, toFiniteInt(event.at, cursor));
    const produced = producedBetween(world, cursor, eventAt);
    balance = clamp(balance + produced, 0, MAX_BALANCE);
    cursor = eventAt;

    balance = applyLegacyEvent(world, balance, event);
    worldRevision += 1;
    lastMutationAt = eventAt;

    const requestKey = normalizedRequestKey(event.requestKey);
    if (requestKey) requestKeys.add(requestKey);
  }

  const now = Math.max(cursor, toFiniteInt(at, Date.now()));
  const productionSinceLastMutation = producedBetween(world, cursor, now);
  balance = clamp(balance + productionSinceLastMutation, 0, MAX_BALANCE);

  world.ownerId = userId;
  world.username = username;
  world.resources.sol = balance;
  world.lastSaveTime = Math.max(0, toFiniteInt(lastMutationAt, now));
  world.revision = Math.max(1, toFiniteInt(worldRevision, 1));

  return {
    world,
    balance,
    revision: world.revision,
    lastMutationAt: world.lastSaveTime,
    productionSinceLastMutation,
    requestKeys
  };
}

function materializeFromStoredState(stored: StoredPlayerState, at: number): MaterializedState {
  const baseWorld = deepClone(stored.world);
  const baseBalance = clamp(toFiniteInt(baseWorld.resources.sol, STARTING_BALANCE), 0, MAX_BALANCE);
  const lastMutationAt = Math.max(0, toFiniteInt(baseWorld.lastSaveTime, Date.now()));
  const now = Math.max(lastMutationAt, toFiniteInt(at, Date.now()));
  const productionSinceLastMutation = producedBetween(baseWorld, lastMutationAt, now);
  const balance = clamp(baseBalance + productionSinceLastMutation, 0, MAX_BALANCE);

  baseWorld.resources.sol = balance;
  baseWorld.lastSaveTime = lastMutationAt;
  baseWorld.revision = Math.max(1, toFiniteInt(baseWorld.revision, 1));

  return {
    world: baseWorld,
    balance,
    revision: baseWorld.revision,
    lastMutationAt,
    productionSinceLastMutation,
    requestKeys: new Set(normalizeRequestKeys(stored.requestKeys))
  };
}

async function readStoredState(userId: string, username: string): Promise<StoredPlayerState | null> {
  const stored = await readJson<StoredPlayerState>(statePath(userId));
  if (!stored || stored.schemaVersion !== STATE_SCHEMA_VERSION || !stored.world) return null;

  const effectiveUsername = typeof stored.world.username === 'string' && stored.world.username.trim()
    ? stored.world.username.trim()
    : username;
  const world = normalizeWorldForStorage(stored.world, userId, effectiveUsername);
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    updatedAt: Math.max(0, toFiniteInt(stored.updatedAt, Date.now())),
    world,
    requestKeys: normalizeRequestKeys(stored.requestKeys)
  };
}

async function writeStoredState(userId: string, state: StoredPlayerState): Promise<void> {
  const username = state.world.username?.trim() || fallbackUsernameFor(userId);
  const payload: StoredPlayerState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    updatedAt: Date.now(),
    world: normalizeWorldForStorage(state.world, userId, username),
    requestKeys: normalizeRequestKeys(state.requestKeys)
  };
  await writeJson(statePath(userId), payload);
}

async function loadOrCreateState(userId: string, username: string): Promise<StoredPlayerState> {
  const existing = await readStoredState(userId, username);
  if (existing) return existing;

  const legacy = await materializeLegacyState(userId, username, Date.now());
  const migratedWorld = normalizeWorldForStorage(legacy.world, userId, username);
  migratedWorld.resources.sol = clamp(toFiniteInt(legacy.balance, migratedWorld.resources.sol), 0, MAX_BALANCE);
  migratedWorld.lastSaveTime = Math.max(0, toFiniteInt(legacy.lastMutationAt, Date.now()));
  migratedWorld.revision = Math.max(1, toFiniteInt(legacy.revision, 1));

  const migrated: StoredPlayerState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    updatedAt: Date.now(),
    world: migratedWorld,
    requestKeys: normalizeRequestKeys(Array.from(legacy.requestKeys))
  };

  await writeStoredState(userId, migrated);

  void Promise.all([
    deleteJson(legacySnapshotPath(userId)).catch(() => undefined),
    deletePrefix(legacyEventsPrefix(userId)).catch(() => undefined)
  ]);

  return migrated;
}

function sameBuilding(a: SerializedBuilding, b: SerializedBuilding) {
  return a.id === b.id && a.type === b.type && a.gridX === b.gridX && a.gridY === b.gridY && a.level === b.level;
}

function sameObstacle(a: SerializedObstacle, b: SerializedObstacle) {
  return a.id === b.id && a.type === b.type && a.gridX === b.gridX && a.gridY === b.gridY;
}

function sameArmy(a: Record<string, number> | undefined, b: Record<string, number> | undefined) {
  const aa = sanitizeArmy(a);
  const bb = sanitizeArmy(b);
  const ak = Object.keys(aa);
  const bk = Object.keys(bb);
  if (ak.length !== bk.length) return false;
  for (const key of ak) {
    if (aa[key] !== bb[key]) return false;
  }
  return true;
}

function createPatch(current: SerializedWorld, incoming: SerializedWorld): WorldPatch {
  const currentBuildings = new Map(current.buildings.map(b => [b.id, sanitizeBuilding(b)]));
  const incomingBuildings = new Map(incoming.buildings.map(b => [b.id, sanitizeBuilding(b)]));

  const upsertBuildings: SerializedBuilding[] = [];
  for (const [id, building] of incomingBuildings.entries()) {
    const existing = currentBuildings.get(id);
    if (!existing || !sameBuilding(existing, building)) {
      upsertBuildings.push(building);
    }
  }

  const removeBuildingIds: string[] = [];
  for (const id of currentBuildings.keys()) {
    if (!incomingBuildings.has(id)) removeBuildingIds.push(id);
  }

  const currentObstacles = new Map((current.obstacles ?? []).map(o => [o.id, sanitizeObstacle(o)]));
  const incomingObstacles = new Map((incoming.obstacles ?? []).map(o => [o.id, sanitizeObstacle(o)]));

  const upsertObstacles: SerializedObstacle[] = [];
  for (const [id, obstacle] of incomingObstacles.entries()) {
    const existing = currentObstacles.get(id);
    if (!existing || !sameObstacle(existing, obstacle)) {
      upsertObstacles.push(obstacle);
    }
  }

  const removeObstacleIds: string[] = [];
  for (const id of currentObstacles.keys()) {
    if (!incomingObstacles.has(id)) removeObstacleIds.push(id);
  }

  const patch: WorldPatch = {
    upsertBuildings: upsertBuildings.sort((a, b) => a.id.localeCompare(b.id)),
    removeBuildingIds: removeBuildingIds.sort((a, b) => a.localeCompare(b)),
    upsertObstacles: upsertObstacles.sort((a, b) => a.id.localeCompare(b.id)),
    removeObstacleIds: removeObstacleIds.sort((a, b) => a.localeCompare(b))
  };

  if (!sameArmy(current.army, incoming.army)) {
    patch.army = sanitizeArmy(incoming.army);
  }
  const currentWallLevel = Math.max(1, toFiniteInt(current.wallLevel, 1));
  const incomingWallLevel = Math.max(1, toFiniteInt(incoming.wallLevel, 1));
  if (incomingWallLevel !== currentWallLevel) {
    patch.wallLevel = incomingWallLevel;
  }

  return patch;
}

export async function ensurePlayerState(userId: string, username: string): Promise<void> {
  await loadOrCreateState(userId, username);
}

export async function materializeState(userId: string, username: string, at = Date.now()): Promise<MaterializedState> {
  const stored = await loadOrCreateState(userId, username);
  return materializeFromStoredState(stored, at);
}

export async function saveWorldState(
  userId: string,
  username: string,
  incoming: SerializedWorld,
  requestKey?: string
): Promise<SerializedWorld> {
  const key = normalizedRequestKey(requestKey);
  const stored = await loadOrCreateState(userId, username);

  if (key && stored.requestKeys.includes(key)) {
    return materializeFromStoredState(stored, Date.now()).world;
  }

  const now = Date.now();
  const materialized = materializeFromStoredState(stored, now);
  const normalizedIncoming = normalizeWorldForStorage(incoming, userId, username);

  const requestedSol = Number((incoming.resources as { sol?: unknown } | undefined)?.sol);
  normalizedIncoming.resources.sol = Number.isFinite(requestedSol)
    ? clamp(Math.floor(requestedSol), 0, MAX_BALANCE)
    : materialized.balance;

  normalizedIncoming.id = materialized.world.id || normalizedIncoming.id;
  normalizedIncoming.lastSaveTime = now;
  normalizedIncoming.revision = materialized.revision + 1;

  const nextState: StoredPlayerState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    updatedAt: now,
    world: normalizedIncoming,
    requestKeys: key
      ? normalizeRequestKeys([...stored.requestKeys, key])
      : stored.requestKeys
  };

  await writeStoredState(userId, nextState);
  return deepClone(normalizedIncoming);
}

export async function appendWorldPatchEvent(userId: string, patch: WorldPatch, requestKey?: string): Promise<boolean> {
  if (isWorldPatchEmpty(patch)) return false;

  const key = normalizedRequestKey(requestKey);
  const stored = await loadOrCreateState(userId, fallbackUsernameFor(userId));

  if (key && stored.requestKeys.includes(key)) {
    return false;
  }

  const now = Date.now();
  const materialized = materializeFromStoredState(stored, now);
  const nextWorld = deepClone(materialized.world);
  applyWorldPatch(nextWorld, patch);
  nextWorld.resources.sol = materialized.balance;
  nextWorld.lastSaveTime = now;
  nextWorld.revision = materialized.revision + 1;

  const nextState: StoredPlayerState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    updatedAt: now,
    world: nextWorld,
    requestKeys: key
      ? normalizeRequestKeys([...stored.requestKeys, key])
      : stored.requestKeys
  };

  await writeStoredState(userId, nextState);
  return true;
}

export async function appendResourceDeltaEvent(
  userId: string,
  delta: number,
  reason: string,
  refId?: string,
  requestKey?: string
): Promise<void> {
  void reason;
  void refId;

  const key = normalizedRequestKey(requestKey);
  const rounded = Math.floor(delta);

  if (!key && rounded === 0) return;

  const stored = await loadOrCreateState(userId, fallbackUsernameFor(userId));
  if (key && stored.requestKeys.includes(key)) {
    return;
  }

  const now = Date.now();
  const materialized = materializeFromStoredState(stored, now);
  const nextBalance = clamp(materialized.balance + rounded, 0, MAX_BALANCE);
  const nextWorld = deepClone(materialized.world);
  nextWorld.resources.sol = nextBalance;
  nextWorld.lastSaveTime = now;
  nextWorld.revision = materialized.revision + 1;

  const nextState: StoredPlayerState = {
    schemaVersion: STATE_SCHEMA_VERSION,
    updatedAt: now,
    world: nextWorld,
    requestKeys: key
      ? normalizeRequestKeys([...stored.requestKeys, key])
      : stored.requestKeys
  };

  await writeStoredState(userId, nextState);
}

export function buildPatchFromClientState(current: SerializedWorld, incoming: SerializedWorld, userId: string, username: string) {
  const normalizedIncoming = normalizeWorldInput(incoming, userId, username);
  normalizedIncoming.id = current.id;
  return createPatch(current, normalizedIncoming);
}

export async function deletePlayerState(userId: string): Promise<void> {
  await Promise.all([
    deleteJson(statePath(userId)).catch(() => undefined),
    deleteJson(legacySnapshotPath(userId)).catch(() => undefined),
    deletePrefix(legacyEventsPrefix(userId)).catch(() => undefined)
  ]);
}

export async function countPlayerBuildings(userId: string, username: string): Promise<number> {
  const state = await materializeState(userId, username, Date.now());
  return state.world.buildings.length;
}
