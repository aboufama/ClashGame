import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http';
import { deleteJson } from '../_lib/blob';
import { requireAuth } from '../_lib/auth';
import { upsertUserIndex } from '../_lib/indexes';

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
    await deleteJson(`bases/${user.id}.json`);

    await upsertUserIndex({
      id: user.id,
      username: user.username,
      buildingCount: 0,
      lastSeen: Date.now(),
      trophies: user.trophies ?? 0
    });

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('delete base error', error);
    sendError(res, 500, 'Failed to delete base');
  }
}
