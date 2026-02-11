import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { ensurePlayerState, materializeState, saveWorldState } from '../_lib/game_state.js';
import { normalizeWorldInput, worldHasTownHall, type SerializedWorld } from '../_lib/models.js';
import { upsertUserIndex } from '../_lib/indexes.js';

interface SaveBody {
  world?: SerializedWorld;
  ifMatchRevision?: number;
  requestId?: string;
}

function hasRevisionCheck(value: unknown): value is number {
  return Number.isFinite(Number(value));
}

function isSuspiciousDownsize(currentCount: number, incomingCount: number): boolean {
  if (currentCount < 20) return false;
  if (incomingCount <= 0) return true;
  return incomingCount <= Math.floor(currentCount * 0.2);
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

    const normalizedIncoming = normalizeWorldInput(body.world, user.id, user.username);
    if (!worldHasTownHall(normalizedIncoming)) {
      console.warn('save blocked: incoming payload missing town hall', {
        userId: user.id,
        incomingCount: normalizedIncoming.buildings.length
      });
      sendJson(res, 409, { conflict: true, integrity: 'missing_town_hall', world: current.world });
      return;
    }

    if (isSuspiciousDownsize(current.world.buildings.length, normalizedIncoming.buildings.length)) {
      console.warn('save blocked: suspicious downsize detected', {
        userId: user.id,
        currentCount: current.world.buildings.length,
        incomingCount: normalizedIncoming.buildings.length
      });
      sendJson(res, 409, { conflict: true, integrity: 'suspicious_downsize', world: current.world });
      return;
    }

    const requestKey = body.requestId?.trim() || undefined;
    const updated = await saveWorldState(user.id, user.username, normalizedIncoming, requestKey);

    await upsertUserIndex({
      id: user.id,
      username: user.username,
      buildingCount: updated.buildings.length,
      lastSeen: now,
      trophies: user.trophies ?? 0
    }).catch(error => {
      console.warn('save index sync failed', { userId: user.id, error });
    });

    sendJson(res, 200, { ok: true, world: updated });
  } catch (error) {
    console.error('save error', error);
    sendError(res, 500, 'Failed to save base');
  }
}
