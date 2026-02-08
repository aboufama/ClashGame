import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { ensurePlayerState, materializeState } from '../_lib/game_state.js';
import { upsertUserIndex } from '../_lib/indexes.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const now = Date.now();
    const { user } = auth;

    await ensurePlayerState(user.id, user.username);
    const state = await materializeState(user.id, user.username, now);

    await upsertUserIndex({
      id: user.id,
      username: user.username,
      buildingCount: state.world.buildings.length,
      lastSeen: now,
      trophies: user.trophies ?? 0
    });

    sendJson(res, 200, { world: state.world });
  } catch (error) {
    console.error('bootstrap error', error);
    sendError(res, 500, 'Failed to bootstrap base');
  }
}
