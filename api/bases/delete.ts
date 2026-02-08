import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { deletePlayerState } from '../_lib/game_state.js';
import { upsertUserIndex } from '../_lib/indexes.js';
import { deleteJson } from '../_lib/blob.js';

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
    await deletePlayerState(user.id);
    await Promise.all([
      deleteJson(`bases/${user.id}.json`).catch(() => undefined),
      deleteJson(`wallets/${user.id}.json`).catch(() => undefined)
    ]);

    await upsertUserIndex({
      id: user.id,
      username: user.username,
      buildingCount: 0,
      lastSeen: Date.now(),
      trophies: user.trophies ?? 0
    });

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('delete base error', error);
    sendError(res, 500, 'Failed to delete base');
  }
}
