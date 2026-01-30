import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, getBody, jsonError, jsonOk, requireMethod } from '../_lib/http.js';
import { getStorage } from '../_lib/storage/index.js';
import { sanitizeBasePayload } from '../_lib/validators.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const body = getBody<Record<string, unknown>>(req);
    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (!userId.trim()) {
      return jsonError(res, 400, 'User ID required');
    }

    const storage = getStorage();
    const base = sanitizeBasePayload({ ...body, userId });

    if (!base.username || base.username === 'Unknown') {
      const user = await storage.getUser(userId);
      if (user) base.username = user.username;
    }

    await storage.saveBase(base);

    return jsonOk(res, {
      success: true,
      lastSaveTime: base.lastSaveTime,
    });
  } catch (error) {
    console.error('Save base error:', error);
    return jsonError(res, 500, 'Internal server error');
  }
}
