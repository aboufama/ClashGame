import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { ensurePlayerState, materializeState, saveWorldState } from '../_lib/game_state.js';
import { upsertUserIndex } from '../_lib/indexes.js';
import { buildStarterWorld, worldHasTownHall, type SerializedWorld } from '../_lib/models.js';
import { readJsonHistory } from '../_lib/blob.js';

interface StoredStateSnapshot {
  world?: SerializedWorld;
}

function buildingCount(world: SerializedWorld | null | undefined) {
  if (!world || !Array.isArray(world.buildings)) return 0;
  return world.buildings.length;
}

function isRenderableWorld(world: SerializedWorld | null | undefined) {
  return buildingCount(world) > 0;
}

function pickBestHistoryWorld(history: StoredStateSnapshot[], userId: string, username: string): SerializedWorld | null {
  let best: SerializedWorld | null = null;
  for (const entry of history) {
    const candidate = entry?.world;
    if (!candidate || !Array.isArray(candidate.buildings) || candidate.buildings.length === 0) continue;
    const normalizedCandidate: SerializedWorld = {
      ...candidate,
      ownerId: userId,
      username
    };
    if (!best) {
      best = normalizedCandidate;
      continue;
    }
    const candidateCount = buildingCount(normalizedCandidate);
    const bestCount = buildingCount(best);
    const candidateHasTownHall = worldHasTownHall(normalizedCandidate);
    const bestHasTownHall = worldHasTownHall(best);
    if (
      candidateCount > bestCount ||
      (candidateCount === bestCount && candidateHasTownHall && !bestHasTownHall)
    ) {
      best = normalizedCandidate;
    }
  }
  return best;
}

function shouldRestoreFromHistory(current: SerializedWorld, historical: SerializedWorld) {
  const currentCount = buildingCount(current);
  const historicalCount = buildingCount(historical);
  if (historicalCount <= 0) return false;
  if (currentCount <= 0) return true;
  if (currentCount <= 1 && historicalCount >= 5) return true;
  if (historicalCount >= 20 && currentCount <= Math.floor(historicalCount * 0.2)) return true;
  if (!worldHasTownHall(current) && worldHasTownHall(historical)) return true;
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const { user } = auth;
    const now = Date.now();
    await ensurePlayerState(user.id, user.username);
    let world: SerializedWorld = (await materializeState(user.id, user.username, now)).world;

    for (let attempt = 1; attempt <= 8; attempt++) {
      if (isRenderableWorld(world)) break;
      await new Promise(resolve => setTimeout(resolve, 120 * attempt));
      world = (await materializeState(user.id, user.username, Date.now())).world;
    }

    let recoveredFromHistory = false;
    const currentCount = buildingCount(world);
    if (!isRenderableWorld(world) || currentCount <= 1) {
      const history = await readJsonHistory<StoredStateSnapshot>(`game/${user.id}/state.json`, 10).catch(error => {
        console.warn('load history lookup failed', { userId: user.id, error });
        return [] as StoredStateSnapshot[];
      });
      const bestHistoryWorld = pickBestHistoryWorld(history, user.id, user.username);
      if (bestHistoryWorld && shouldRestoreFromHistory(world, bestHistoryWorld)) {
        world = bestHistoryWorld;
        recoveredFromHistory = true;
        console.warn('load base recovered state from history snapshot', {
          userId: user.id,
          recoveredBuildingCount: buildingCount(world),
          recoveredHasTownHall: worldHasTownHall(world)
        });
      }
    }

    const hasBuildings = Array.isArray(world.buildings) && world.buildings.length > 0;
    const hasTownHall = hasBuildings && worldHasTownHall(world);

    if (!hasBuildings || !hasTownHall) {
      const starter = buildStarterWorld(user.id, user.username);
      const existingBuildings = Array.isArray(world.buildings) ? world.buildings : [];
      const repairedBuildings = !hasBuildings
        ? starter.buildings
        : (hasTownHall ? existingBuildings : [...existingBuildings, starter.buildings[0]]);
      const repaired: SerializedWorld = {
        ...world,
        id: world.id || starter.id,
        ownerId: user.id,
        username: user.username,
        buildings: repairedBuildings.length > 0 ? repairedBuildings : starter.buildings,
        obstacles: Array.isArray(world.obstacles) ? world.obstacles : [],
        resources: {
          sol: Math.max(0, Math.floor(Number(world.resources?.sol ?? starter.resources.sol) || starter.resources.sol))
        },
        army: world.army ?? {},
        wallLevel: Math.max(1, Math.floor(Number(world.wallLevel ?? starter.wallLevel ?? 1) || 1)),
        lastSaveTime: now,
        revision: Math.max(1, Math.floor(Number(world.revision ?? starter.revision ?? 1) || 1))
      };

      console.warn('load base repaired invalid world payload', {
        userId: user.id,
        originalBuildingCount: existingBuildings.length,
        repairedBuildingCount: repaired.buildings.length,
        hadTownHall: hasTownHall
      });

      world = await saveWorldState(user.id, user.username, repaired, `repair_load_${now}`).catch(error => {
        console.warn('load repair save failed; returning in-memory repaired world', { userId: user.id, error });
        return repaired;
      });
    } else if (recoveredFromHistory) {
      world = await saveWorldState(user.id, user.username, world, `recover_load_${now}`).catch(error => {
        console.warn('load history recovery save failed; returning in-memory recovered world', { userId: user.id, error });
        return world;
      });
    }

    await upsertUserIndex({
      id: user.id,
      username: user.username,
      buildingCount: Array.isArray(world.buildings) ? world.buildings.length : 0,
      lastSeen: now,
      trophies: user.trophies ?? 0
    }).catch(error => {
      console.warn('load index sync failed', { userId: user.id, error });
    });

    sendJson(res, 200, { world });
  } catch (error) {
    console.error('load error', error);
    sendError(res, 500, 'Failed to load base');
  }
}
