import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { requireAuth, sanitizeId } from '../_lib/auth.js';
import { ensurePlayerState, materializeState } from '../_lib/game_state.js';
import { readJson } from '../_lib/blob.js';
import type { UserRecord } from '../_lib/models.js';

interface ScoutBody {
  targetId?: string;
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

    const body = await readJsonBody<ScoutBody>(req);
    const targetId = body.targetId ? sanitizeId(body.targetId) : '';
    if (!targetId) {
      sendError(res, 400, 'targetId required');
      return;
    }

    const targetUser = await readJson<UserRecord>(`users/${targetId}.json`);
    if (!targetUser) {
      sendJson(res, 200, { world: null });
      return;
    }

    await ensurePlayerState(targetId, targetUser.username);
    const targetState = await materializeState(targetId, targetUser.username, Date.now());

    sendJson(res, 200, { world: targetState.world });
  } catch (error) {
    console.error('scout error', error);
    sendError(res, 500, 'Failed to scout base');
  }
}
