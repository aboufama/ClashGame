import { deleteJson, deletePrefix, listPathnames, readJson, writeJson } from './blob.js';
import {
  MAX_BALANCE,
  STARTING_BALANCE,
  buildStarterWorld,
  clamp,
  isWorldPatchEmpty,
  normalizeWorldInput,
  randomId,
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
const SCHEMA_VERSION = 1 as const;

function snapshotPath(userId: string) {
  return `${GAME_ROOT}/${userId}/snapshot.json`;
}

function eventsPrefix(userId: string) {
  return `${GAME_ROOT}/${userId}/events/`;
}

function makeEventPath(userId: string, event: GameEvent) {
  const ts = String(Math.max(0, Math.floor(event.at))).padStart(13, '0');
  return `${eventsPrefix(userId)}${ts}_${event.id}.json`;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toFiniteInt(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function normalizedRequestKey(requestKey: string | undefined) {
  if (!requestKey) return undefined;
  const trimmed = requestKey.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 160);
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

function sortAndUniqueBuildings(buildings: SerializedBuilding[]): SerializedBuilding[] {
  const byId = new Map<string, SerializedBuilding>();
  for (const b of buildings) {
    byId.set(b.id, sanitizeBuilding(b));
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function sortAndUniqueObstacles(obstacles: SerializedObstacle[]): SerializedObstacle[] {
  const byId = new Map<string, SerializedObstacle>();
  for (const o of obstacles) {
    byId.set(o.id, sanitizeObstacle(o));
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
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
  world.buildings = sortAndUniqueBuildings(nextBuildings);

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
  world.obstacles = sortAndUniqueObstacles(nextObstacles);

  if (typeof patch.army !== 'undefined') {
    world.army = sanitizeArmy(patch.army);
  }
}

function applyEvent(world: SerializedWorld, balance: number, event: GameEvent): number {
  if (event.kind === 'world_patch') {
    const payload = event.payload as Partial<WorldPatchEventPayload>;
    const patch = payload.patch;
    if (patch) {
      applyWorldPatch(world, {
        upsertBuildings: Array.isArray(patch.upsertBuildings) ? patch.upsertBuildings.map(sanitizeBuilding) : [],
        removeBuildingIds: Array.isArray(patch.removeBuildingIds) ? patch.removeBuildingIds.map(String) : [],
        upsertObstacles: Array.isArray(patch.upsertObstacles) ? patch.upsertObstacles.map(sanitizeObstacle) : [],
        removeObstacleIds: Array.isArray(patch.removeObstacleIds) ? patch.removeObstacleIds.map(String) : [],
        army: typeof patch.army === 'undefined' ? undefined : sanitizeArmy(patch.army)
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

function normalizeSnapshotWorld(world: SerializedWorld, userId: string, username: string) {
  const normalized = normalizeWorldInput(world, userId, username);
  normalized.id = world.id || `world_${userId}`;
  normalized.lastSaveTime = Number(world.lastSaveTime || Date.now());
  return normalized;
}

async function readLegacySnapshot(userId: string, username: string): Promise<GameSnapshot | null> {
  const [legacyWorld, legacyWallet] = await Promise.all([
    readJson<SerializedWorld>(`bases/${userId}.json`),
    readJson<WalletRecord>(`wallets/${userId}.json`)
  ]);

  if (!legacyWorld || !Array.isArray(legacyWorld.buildings)) return null;

  const now = Date.now();
  const normalizedWorld = normalizeSnapshotWorld(legacyWorld, userId, username);
  const baseBalance = clamp(
    Math.floor(Number(legacyWallet?.balance ?? legacyWorld.resources?.sol ?? STARTING_BALANCE)),
    0,
    MAX_BALANCE
  );

  normalizedWorld.resources.sol = baseBalance;

  const createdAt = toFiniteInt(legacyWorld.lastSaveTime ?? legacyWallet?.updatedAt, now);
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt,
    world: normalizedWorld,
    baseBalance
  };
}

async function loadSnapshot(userId: string, username: string): Promise<GameSnapshot> {
  const path = snapshotPath(userId);
  const existing = await readJson<GameSnapshot>(path);
  if (existing && existing.schemaVersion === SCHEMA_VERSION && existing.world) {
    const now = Date.now();
    const createdAt = toFiniteInt(existing.createdAt, now);
    const baseBalance = clamp(toFiniteInt(existing.baseBalance, STARTING_BALANCE), 0, MAX_BALANCE);
    return {
      schemaVersion: SCHEMA_VERSION,
      createdAt,
      world: normalizeSnapshotWorld(existing.world, userId, username),
      baseBalance
    };
  }

  const migrated = await readLegacySnapshot(userId, username);
  if (migrated) {
    await writeJson(path, migrated).catch(error => {
      console.warn('snapshot migrate write failed', { userId, error });
    });
    return migrated;
  }

  const starter = buildStarterWorld(userId, username);
  const snapshot: GameSnapshot = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: starter.lastSaveTime,
    world: starter,
    baseBalance: STARTING_BALANCE
  };

  await writeJson(path, snapshot).catch(error => {
    console.warn('starter snapshot write failed', { userId, error });
  });
  return snapshot;
}

async function loadEvents(userId: string): Promise<GameEvent[]> {
  const prefix = eventsPrefix(userId);
  const pathnames = await listPathnames(prefix).catch(error => {
    console.warn('events list failed', { userId, error });
    return [] as string[];
  });
  if (pathnames.length === 0) return [];

  const raw = await Promise.all(
    pathnames.map(pathname =>
      readJson<GameEvent>(pathname).catch(error => {
        console.warn('event read failed', { userId, pathname, error });
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

  return patch;
}

export async function ensurePlayerState(userId: string, username: string): Promise<void> {
  await loadSnapshot(userId, username);
}

export async function materializeState(userId: string, username: string, at = Date.now()): Promise<MaterializedState> {
  const [snapshot, events] = await Promise.all([loadSnapshot(userId, username), loadEvents(userId)]);

  const world = deepClone(normalizeSnapshotWorld(snapshot.world, userId, username));
  let balance = clamp(toFiniteInt(snapshot.baseBalance, STARTING_BALANCE), 0, MAX_BALANCE);
  let worldRevision = 1;
  let cursor = Math.max(0, toFiniteInt(snapshot.createdAt, Date.now()));
  let lastMutationAt = cursor;
  const requestKeys = new Set<string>();

  for (const event of events) {
    const eventAt = Math.max(cursor, toFiniteInt(event.at, cursor));
    const produced = producedBetween(world, cursor, eventAt);
    balance = clamp(balance + produced, 0, MAX_BALANCE);
    cursor = eventAt;

    balance = applyEvent(world, balance, event);
    if (event.kind === 'world_patch') {
      worldRevision += 1;
    }

    lastMutationAt = eventAt;
    const requestKey = normalizedRequestKey(event.requestKey);
    if (requestKey) requestKeys.add(requestKey);
  }

  const now = Math.max(cursor, toFiniteInt(at, Date.now()));
  const productionSinceLastMutation = producedBetween(world, cursor, now);
  balance = clamp(balance + productionSinceLastMutation, 0, MAX_BALANCE);
  if (!Number.isFinite(balance)) {
    balance = clamp(toFiniteInt(snapshot.baseBalance, STARTING_BALANCE), 0, MAX_BALANCE);
  }

  world.ownerId = userId;
  world.username = username;
  world.resources.sol = balance;
  world.lastSaveTime = Math.max(0, toFiniteInt(lastMutationAt, now));
  world.revision = Math.max(1, toFiniteInt(worldRevision, 1));

  return {
    world,
    balance,
    revision: world.revision,
    lastMutationAt,
    productionSinceLastMutation,
    requestKeys
  };
}

async function appendEvent(userId: string, event: GameEvent) {
  const path = makeEventPath(userId, event);
  await writeJson(path, event, { allowOverwrite: false });
}

export async function appendWorldPatchEvent(userId: string, patch: WorldPatch, requestKey?: string): Promise<boolean> {
  if (isWorldPatchEmpty(patch)) return false;

  const event: GameEvent = {
    id: randomId('evt_'),
    kind: 'world_patch',
    at: Date.now(),
    requestKey: normalizedRequestKey(requestKey),
    payload: { patch }
  };

  await appendEvent(userId, event);
  return true;
}

export async function appendResourceDeltaEvent(
  userId: string,
  delta: number,
  reason: string,
  refId?: string,
  requestKey?: string
): Promise<void> {
  const rounded = Math.floor(delta);

  const event: GameEvent = {
    id: randomId('evt_'),
    kind: 'resource_delta',
    at: Date.now(),
    requestKey: normalizedRequestKey(requestKey),
    payload: {
      delta: rounded,
      reason: String(reason || 'update').slice(0, 64),
      refId: refId ? String(refId).slice(0, 160) : undefined
    }
  };

  await appendEvent(userId, event);
}

export function buildPatchFromClientState(current: SerializedWorld, incoming: SerializedWorld, userId: string, username: string) {
  const normalizedIncoming = normalizeWorldInput(incoming, userId, username);
  normalizedIncoming.id = current.id;
  return createPatch(current, normalizedIncoming);
}

export async function deletePlayerState(userId: string): Promise<void> {
  await Promise.all([
    deleteJson(snapshotPath(userId)).catch(() => undefined),
    deletePrefix(eventsPrefix(userId)).catch(() => undefined)
  ]);
}

export async function countPlayerBuildings(userId: string, username: string): Promise<number> {
  const state = await materializeState(userId, username, Date.now());
  return state.world.buildings.length;
}
