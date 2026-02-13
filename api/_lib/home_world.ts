import { readJsonHistory } from './blob.js';
import { ensurePlayerState, materializeState, saveWorldState } from './game_state.js';
import { buildStarterWorld, randomId, type SerializedBuilding, type SerializedWorld } from './models.js';

interface StoredStateSnapshot {
  world?: SerializedWorld;
}

export interface ResolveHomeWorldOptions {
  now?: number;
  source?: string;
  materializeAttempts?: number;
  historyDepth?: number;
}

export interface ResolveHomeWorldResult {
  world: SerializedWorld;
  repaired: boolean;
  recoveredFromHistory: boolean;
  repairReasons: string[];
}

function normalizeTypeKey(type: unknown) {
  return String(type ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function isTownHallType(type: unknown) {
  return normalizeTypeKey(type) === 'townhall';
}

function isWallType(type: unknown) {
  return normalizeTypeKey(type) === 'wall';
}

function buildingCount(world: SerializedWorld | null | undefined) {
  if (!world || !Array.isArray(world.buildings)) return 0;
  return world.buildings.length;
}

function playableBuildingCount(world: SerializedWorld | null | undefined) {
  if (!world || !Array.isArray(world.buildings)) return 0;
  return world.buildings.filter(building => !isWallType((building as { type?: unknown }).type)).length;
}

function hasTownHall(world: SerializedWorld | null | undefined) {
  if (!world || !Array.isArray(world.buildings)) return false;
  return world.buildings.some(building => isTownHallType((building as { type?: unknown }).type));
}

function isRenderableWorld(world: SerializedWorld | null | undefined) {
  return buildingCount(world) > 0 && playableBuildingCount(world) > 0;
}

function toFiniteInt(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function clampPositiveInt(value: unknown, fallback: number) {
  return Math.max(1, toFiniteInt(value, fallback));
}

function cloneWorld(world: SerializedWorld): SerializedWorld {
  return JSON.parse(JSON.stringify(world)) as SerializedWorld;
}

function scoreWorld(world: SerializedWorld) {
  const hasHall = hasTownHall(world) ? 1_000_000_000 : 0;
  const playable = playableBuildingCount(world) * 1_000_000;
  const buildings = buildingCount(world) * 1_000;
  const revision = Math.max(0, toFiniteInt(world.revision, 0));
  return hasHall + playable + buildings + revision;
}

function pickBestHistoryWorld(history: StoredStateSnapshot[], userId: string, username: string): SerializedWorld | null {
  let best: SerializedWorld | null = null;
  let bestScore = -1;
  for (const snapshot of history) {
    const candidate = snapshot?.world;
    if (!candidate || !Array.isArray(candidate.buildings) || candidate.buildings.length === 0) continue;
    const normalizedCandidate: SerializedWorld = {
      ...candidate,
      ownerId: userId,
      username
    };
    const score = scoreWorld(normalizedCandidate);
    if (score > bestScore) {
      best = normalizedCandidate;
      bestScore = score;
    }
  }
  return best;
}

function shouldRestoreFromHistory(current: SerializedWorld, historical: SerializedWorld) {
  const currentCount = buildingCount(current);
  const historicalCount = buildingCount(historical);
  if (historicalCount <= 0) return false;
  if (currentCount <= 0) return true;

  const currentPlayable = playableBuildingCount(current);
  const historicalPlayable = playableBuildingCount(historical);
  if (currentPlayable <= 0 && historicalPlayable > 0) return true;
  if (!hasTownHall(current) && hasTownHall(historical)) return true;
  if (currentCount <= 1 && historicalCount >= 5) return true;
  if (historicalCount >= 20 && currentCount <= Math.floor(historicalCount * 0.2)) return true;
  return false;
}

function cloneStarterBuilding(template: SerializedBuilding, existingIds: Set<string>): SerializedBuilding {
  let nextId = String(template.id || randomId('b_'));
  while (existingIds.has(nextId)) {
    nextId = randomId('b_');
  }
  existingIds.add(nextId);
  return {
    ...template,
    id: nextId
  };
}

function repairWorldPayload(world: SerializedWorld, userId: string, username: string, now: number): { world: SerializedWorld; repairReasons: string[] } {
  const repairReasons: string[] = [];
  const starter = buildStarterWorld(userId, username);

  let buildings = Array.isArray(world.buildings) ? world.buildings.map(building => ({ ...building })) : [];
  if (buildings.length === 0) {
    buildings = starter.buildings.map(building => ({ ...building }));
    repairReasons.push('empty_buildings');
  }

  const existingIds = new Set(buildings.map(building => String((building as { id?: unknown }).id ?? '')));
  const existingTypes = new Set(buildings.map(building => normalizeTypeKey((building as { type?: unknown }).type)));

  if (!buildings.some(building => isTownHallType((building as { type?: unknown }).type))) {
    buildings.unshift(cloneStarterBuilding(starter.buildings[0], existingIds));
    existingTypes.add(normalizeTypeKey(starter.buildings[0].type));
    repairReasons.push('missing_townhall');
  }

  const nonWallCount = buildings.filter(building => !isWallType((building as { type?: unknown }).type)).length;
  if (nonWallCount <= 0) {
    for (const starterBuilding of starter.buildings) {
      if (isWallType(starterBuilding.type)) continue;
      const key = normalizeTypeKey(starterBuilding.type);
      if (existingTypes.has(key)) continue;
      buildings.push(cloneStarterBuilding(starterBuilding, existingIds));
      existingTypes.add(key);
    }
    repairReasons.push('no_playable_structures');
  }

  const resourcesSol = Number((world.resources as { sol?: unknown } | undefined)?.sol);
  const normalizedSol = Number.isFinite(resourcesSol)
    ? Math.max(0, Math.floor(resourcesSol))
    : Math.max(0, Math.floor(starter.resources.sol));
  if (!Number.isFinite(resourcesSol) || resourcesSol < 0) {
    repairReasons.push('invalid_resources');
  }

  const normalizedObstacles = Array.isArray(world.obstacles) ? world.obstacles : [];
  if (!Array.isArray(world.obstacles)) {
    repairReasons.push('invalid_obstacles');
  }

  const rawRevision = Number(world.revision);
  const normalizedRevision = clampPositiveInt(rawRevision, 1);
  if (!Number.isFinite(rawRevision) || rawRevision < 1) {
    repairReasons.push('invalid_revision');
  }

  const rawWallLevel = Number(world.wallLevel);
  const normalizedWallLevel = clampPositiveInt(rawWallLevel, 1);
  if (!Number.isFinite(rawWallLevel) || rawWallLevel < 1) {
    repairReasons.push('invalid_wall_level');
  }

  const rawLastSaveTime = Number(world.lastSaveTime);
  const normalizedLastSaveTime = Number.isFinite(rawLastSaveTime) && rawLastSaveTime > 0
    ? Math.floor(rawLastSaveTime)
    : now;
  if (!Number.isFinite(rawLastSaveTime) || rawLastSaveTime <= 0) {
    repairReasons.push('invalid_last_save_time');
  }

  const normalizedId = String(world.id || starter.id).slice(0, 120);
  if (!world.id) {
    repairReasons.push('missing_world_id');
  }

  if (world.ownerId !== userId) {
    repairReasons.push('owner_mismatch');
  }
  const currentUsername = typeof username === 'string' && username.trim()
    ? username.trim()
    : starter.username ?? username;
  if (typeof world.username !== 'string' || world.username.trim() !== currentUsername) {
    repairReasons.push('username_mismatch');
  }

  const repairedWorld: SerializedWorld = {
    ...world,
    id: normalizedId,
    ownerId: userId,
    username: currentUsername,
    buildings,
    obstacles: normalizedObstacles,
    resources: { sol: normalizedSol },
    army: world.army ?? {},
    wallLevel: normalizedWallLevel,
    lastSaveTime: normalizedLastSaveTime,
    revision: normalizedRevision
  };

  return {
    world: repairedWorld,
    repairReasons: Array.from(new Set(repairReasons))
  };
}

async function wait(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function resolveHomeWorld(userId: string, username: string, options: ResolveHomeWorldOptions = {}): Promise<ResolveHomeWorldResult> {
  const now = options.now ?? Date.now();
  const materializeAttempts = Math.max(1, Math.min(10, Math.floor(Number(options.materializeAttempts) || 6)));
  const historyDepth = Math.max(4, Math.min(30, Math.floor(Number(options.historyDepth) || 12)));
  const source = options.source?.trim() || 'load';

  await ensurePlayerState(userId, username);
  let world = (await materializeState(userId, username, now)).world;

  for (let attempt = 2; attempt <= materializeAttempts; attempt++) {
    if (isRenderableWorld(world) && hasTownHall(world)) break;
    await wait(100 * attempt);
    world = (await materializeState(userId, username, Date.now())).world;
  }

  let recoveredFromHistory = false;
  if (!isRenderableWorld(world) || !hasTownHall(world)) {
    const history = await readJsonHistory<StoredStateSnapshot>(`game/${userId}/state.json`, historyDepth).catch(error => {
      console.warn('home world history lookup failed', { userId, source, error });
      return [] as StoredStateSnapshot[];
    });
    const bestHistoryWorld = pickBestHistoryWorld(history, userId, username);
    if (bestHistoryWorld && shouldRestoreFromHistory(world, bestHistoryWorld)) {
      world = bestHistoryWorld;
      recoveredFromHistory = true;
      console.warn('home world recovered from history snapshot', {
        userId,
        source,
        recoveredBuildingCount: buildingCount(world),
        recoveredPlayableCount: playableBuildingCount(world),
        recoveredHasTownHall: hasTownHall(world)
      });
    }
  }

  const repair = repairWorldPayload(cloneWorld(world), userId, username, now);
  let nextWorld = repair.world;
  const repaired = repair.repairReasons.length > 0;

  if (repaired) {
    console.warn('home world repaired invalid payload', {
      userId,
      source,
      buildingCountBefore: buildingCount(world),
      buildingCountAfter: buildingCount(nextWorld),
      playableCountBefore: playableBuildingCount(world),
      playableCountAfter: playableBuildingCount(nextWorld),
      hadTownHallBefore: hasTownHall(world),
      hasTownHallAfter: hasTownHall(nextWorld),
      repairReasons: repair.repairReasons
    });
  }

  if (recoveredFromHistory || repaired) {
    const mode = recoveredFromHistory ? 'recover' : 'repair';
    const requestKey = `${mode}_${source}_${now}`;
    nextWorld = await saveWorldState(userId, username, nextWorld, requestKey).catch(error => {
      console.warn('home world recovery/repair save failed; returning in-memory world', {
        userId,
        source,
        recoveredFromHistory,
        repairReasons: repair.repairReasons,
        error
      });
      return nextWorld;
    });
  }

  return {
    world: nextWorld,
    repaired,
    recoveredFromHistory,
    repairReasons: repair.repairReasons
  };
}
