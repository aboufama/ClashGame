import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http.js';
import { deleteJson, writeJson } from '../_lib/blob.js';
import { requireAuth } from '../_lib/auth.js';
import type { UserRecord } from '../_lib/models.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const { user, token } = auth;

    try {
      await deleteJson(`sessions/${token}.json`);
    } catch (error) {
      console.warn('Session delete failed:', error);
    }

    const updated: UserRecord = { ...user, activeSessionId: undefined, sessionExpiresAt: 0 };
    await writeJson(`users/${user.id}.json`, updated);

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('logout error', error);
    sendError(res, 500, 'Logout failed');
  }
}
