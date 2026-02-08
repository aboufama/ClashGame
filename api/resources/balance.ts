import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { ensurePlayerState, materializeState } from '../_lib/game_state.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const now = Date.now();
    const { user } = auth;

    await ensurePlayerState(user.id, user.username);
    const state = await materializeState(user.id, user.username, now);

    sendJson(res, 200, {
      wallet: {
        balance: state.balance,
        updatedAt: now
      },
      added: state.productionSinceLastMutation
    });
  } catch (error) {
    console.error('balance error', error);
    sendError(res, 500, 'Failed to get balance');
  }
}
