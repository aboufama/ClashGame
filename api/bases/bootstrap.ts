import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, getBody, jsonError, jsonOk, requireMethod } from '../_lib/http.js';
import { createInitialBase } from '../_lib/bases.js';
import { readSessionToken, verifySession } from '../_lib/sessions.js';
import { getStorage } from '../_lib/storage/index.js';
import { sanitizeBaseForOutput } from '../_lib/validators.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const body = getBody<Record<string, unknown>>(req);
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId) return jsonError(res, 400, 'User ID required');

    const storage = getStorage();
    const sessionToken = readSessionToken((body as Record<string, unknown>).sessionToken);
    const sessionCheck = await verifySession(storage, userId, sessionToken);
    if (!sessionCheck.ok) {
      return jsonError(res, sessionCheck.status || 401, sessionCheck.message || 'Session invalid', sessionCheck.details);
    }

    let base = await storage.getBase(userId);
    if (!base || !base.buildings || base.buildings.length === 0) {
      const username = sessionCheck.user?.username || base?.username || 'Unknown';
      base = createInitialBase(userId, username);
      await storage.saveBase(base);
    }

    const normalized = sanitizeBaseForOutput(base);
    return jsonOk(res, { success: true, base: normalized });
  } catch (error) {
    console.error('Bootstrap base error:', error);
    return jsonError(res, 500, 'Internal server error');
  }
}
