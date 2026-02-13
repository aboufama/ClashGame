import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { resolveHomeWorld } from '../_lib/home_world.js';
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

    const { user } = auth;
    const now = Date.now();
    const resolved = await resolveHomeWorld(user.id, user.username, {
      now,
      source: 'load',
      materializeAttempts: 8,
      historyDepth: 12
    });
    const world = resolved.world;

    await upsertUserIndex({
      id: user.id,
      username: user.username,
      buildingCount: world.buildings.length,
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
