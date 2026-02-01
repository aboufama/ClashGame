import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { readJson } from '../_lib/blob.js';
import { requireAuth, sanitizeId } from '../_lib/auth.js';
import type { SerializedWorld, WalletRecord, UserRecord } from '../_lib/models.js';

interface ScoutBody {
  targetId: string;
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
    const targetId = body?.targetId ? sanitizeId(body.targetId) : '';
    if (!targetId) {
      sendError(res, 400, 'targetId required');
      return;
    }

    const targetUser = await readJson<UserRecord>(`users/${targetId}.json`);
    const world = await readJson<SerializedWorld>(`bases/${targetId}.json`);
    if (!world) {
      sendJson(res, 200, { world: null });
      return;
    }

    const wallet = await readJson<WalletRecord>(`wallets/${targetId}.json`);
    if (wallet) world.resources.sol = wallet.balance;
    if (targetUser) world.username = targetUser.username;

    sendJson(res, 200, { world });
  } catch (error) {
    console.error('scout error', error);
    sendError(res, 500, 'Failed to scout base');
  }
}
