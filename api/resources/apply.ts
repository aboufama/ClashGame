import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { appendResourceDeltaEvent } from '../_lib/game_state.js';

interface ApplyBody {
  delta?: number;
  reason?: string;
  refId?: string;
  requestId?: string;
}

function normalizedRequestKey(body: ApplyBody) {
  const requestId = body.requestId?.trim();
  if (requestId) return requestId.slice(0, 160);
  const refId = body.refId?.trim();
  if (refId) return `ref:${refId.slice(0, 140)}`;
  return undefined;
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

    const body = await readJsonBody<ApplyBody>(req);
    const deltaRaw = Number(body.delta ?? 0);
    if (!Number.isFinite(deltaRaw)) {
      sendError(res, 400, 'Invalid delta');
      return;
    }

    const delta = Math.floor(deltaRaw);
    const reason = (body.reason || 'update').slice(0, 64);

    const { user } = auth;
    const requestKey = normalizedRequestKey(body);
    const mutation = await appendResourceDeltaEvent(user.id, delta, reason, body.refId, requestKey);
    sendJson(res, 200, { applied: mutation.applied, sol: mutation.balance, revision: mutation.revision });
  } catch (error) {
    console.error('apply resource error', error);
    sendError(res, 500, 'Failed to apply resources');
  }
}
