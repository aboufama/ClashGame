import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http';
import { readJson } from '../_lib/blob';
import { requireAuth } from '../_lib/auth';
import type { SerializedWorld, WalletRecord } from '../_lib/models';

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
    const basePath = `bases/${user.id}.json`;
    const world = await readJson<SerializedWorld>(basePath);
    if (!world) {
      sendJson(res, 200, { world: null });
      return;
    }

    const wallet = await readJson<WalletRecord>(`wallets/${user.id}.json`);
    if (wallet) {
      world.resources.sol = wallet.balance;
    }
    world.username = user.username;

    sendJson(res, 200, { world });
  } catch (error) {
    console.error('load error', error);
    sendError(res, 500, 'Failed to load base');
  }
}
