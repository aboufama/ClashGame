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
    const existing = await storage.getBase(userId);
    const incomingRevision = typeof body.revision === 'number' && Number.isFinite(body.revision)
      ? Math.trunc(body.revision)
      : undefined;

    if (existing) {
      const existingRevision = typeof existing.revision === 'number' ? existing.revision : 0;
      if (incomingRevision !== undefined && incomingRevision < existingRevision) {
        return jsonError(res, 409, 'Stale base revision', `currentRevision:${existingRevision}`);
      }
      if (existing.buildings.length > 0 && base.buildings.length === 0) {
        return jsonOk(res, {
          success: true,
          ignored: true,
          lastSaveTime: existing.lastSaveTime,
          revision: existingRevision,
        });
      }
      base.resources = existing.resources;
      if (existing.resourceLedger) {
        base.resourceLedger = existing.resourceLedger;
      }
      base.revision = existingRevision + 1;
    } else {
      base.revision = 1;
    }

    if (!base.username || base.username === 'Unknown') {
      const user = await storage.getUser(userId);
      if (user) base.username = user.username;
    }

    await storage.saveBase(base);

    return jsonOk(res, {
      success: true,
      lastSaveTime: base.lastSaveTime,
      revision: base.revision ?? 0,
    });
  } catch (error) {
    console.error('Save base error:', error);
    return jsonError(res, 500, 'Internal server error');
  }
}
