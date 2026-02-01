import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http.js';
import { readJson, writeJson } from '../_lib/blob.js';
import { requireAuth } from '../_lib/auth.js';
import type { WalletRecord } from '../_lib/models.js';

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
    const walletPath = `wallets/${user.id}.json`;
    let wallet = await readJson<WalletRecord>(walletPath);
    if (!wallet) {
      wallet = { balance: 1000, updatedAt: Date.now() };
      await writeJson(walletPath, wallet);
    }

    sendJson(res, 200, { wallet });
  } catch (error) {
    console.error('balance error', error);
    sendError(res, 500, 'Failed to get balance');
  }
}
