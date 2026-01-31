import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, getBody, jsonError, jsonOk, requireMethod } from '../_lib/http.js';
import { applyResourceDelta } from '../_lib/resources.js';
import { getStorage } from '../_lib/storage/index.js';
import { createInitialBase } from '../_lib/bases.js';
import { clampNumber, randomId, toInt } from '../_lib/utils.js';
import { readSessionToken, verifySession } from '../_lib/sessions.js';

const SOL_MAX = 1_000_000_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const body = getBody<Record<string, unknown>>(req);
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId) return jsonError(res, 400, 'User ID required');

    const rawDelta = toInt(body.delta, NaN);
    if (!Number.isFinite(rawDelta)) return jsonError(res, 400, 'Delta required');
    const delta = clampNumber(rawDelta, -SOL_MAX, SOL_MAX);

    const reason = typeof body.reason === 'string' ? body.reason.trim() : undefined;
    const refId = typeof body.refId === 'string' && body.refId.trim()
      ? body.refId.trim()
      : randomId('tx_');

    const storage = getStorage();
    const sessionToken = readSessionToken((body as Record<string, unknown>).sessionToken);
    const sessionCheck = await verifySession(storage, userId, sessionToken);
    if (!sessionCheck.ok) {
      return jsonError(res, sessionCheck.status || 401, sessionCheck.message || 'Session invalid', sessionCheck.details);
    }

    let base = await storage.getBase(userId);
    if (!base) {
      const user = sessionCheck.user;
      if (!user) return jsonError(res, 404, 'User not found');
      base = createInitialBase(userId, user.username || 'Unknown');
    }

    const result = applyResourceDelta(base, delta, refId, reason);
    if (result.insufficient) {
      return jsonError(res, 400, 'Insufficient resources');
    }

    if (result.applied) {
      await storage.saveBase(base);
    }

    return jsonOk(res, {
      success: true,
      applied: result.applied,
      sol: result.balance,
      txId: refId,
      deltaApplied: result.applied ? delta : (result.tx?.delta ?? 0),
    });
  } catch (error) {
    console.error('Apply resource delta error:', error);
    return jsonError(res, 500, 'Internal server error');
  }
}
