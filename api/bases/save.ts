import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { appendWorldPatchEvent, buildPatchFromClientState, ensurePlayerState, materializeState } from '../_lib/game_state.js';
import type { SerializedWorld } from '../_lib/models.js';
import { upsertUserIndex } from '../_lib/indexes.js';

interface SaveBody {
  world?: SerializedWorld;
  ifMatchRevision?: number;
  requestId?: string;
}

function hasRevisionCheck(value: unknown): value is number {
  return Number.isFinite(Number(value));
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

    const body = await readJsonBody<SaveBody>(req);
    if (!body?.world) {
      sendError(res, 400, 'Missing world payload');
      return;
    }

    const now = Date.now();
    const { user } = auth;

    await ensurePlayerState(user.id, user.username);
    const current = await materializeState(user.id, user.username, now);

    if (hasRevisionCheck(body.ifMatchRevision) && Number(body.ifMatchRevision) !== current.revision) {
      sendJson(res, 409, { conflict: true, world: current.world });
      return;
    }

    const patch = buildPatchFromClientState(current.world, body.world, user.id, user.username);
    const requestKey = body.requestId?.trim() || undefined;
    await appendWorldPatchEvent(user.id, patch, requestKey);

    const updated = await materializeState(user.id, user.username, Date.now());

    await upsertUserIndex({
      id: user.id,
      username: user.username,
      buildingCount: updated.world.buildings.length,
      lastSeen: now,
      trophies: user.trophies ?? 0
    });

    sendJson(res, 200, { ok: true, world: updated.world });
  } catch (error) {
    console.error('save error', error);
    sendError(res, 500, 'Failed to save base');
  }
}
