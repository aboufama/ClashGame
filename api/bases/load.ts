import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { ensurePlayerState, materializeState, saveWorldState } from '../_lib/game_state.js';
import { upsertUserIndex } from '../_lib/indexes.js';
import { buildStarterWorld, worldHasTownHall, type SerializedWorld } from '../_lib/models.js';

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
    const state = await materializeState(user.id, user.username, now);
    let world = state.world as SerializedWorld;

    const hasBuildings = Array.isArray(world.buildings) && world.buildings.length > 0;
    const hasTownHall = hasBuildings && worldHasTownHall(world);

    if (!hasBuildings || !hasTownHall) {
      const starter = buildStarterWorld(user.id, user.username);
      const existingBuildings = Array.isArray(world.buildings) ? world.buildings : [];
      const repairedBuildings = hasTownHall ? existingBuildings : [...existingBuildings, starter.buildings[0]];
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
