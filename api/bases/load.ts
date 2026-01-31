import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, getQueryParam, jsonError, jsonOk, requireMethod } from '../_lib/http.js';
import { getStorage } from '../_lib/storage/index.js';
import { ensureTownHall, sanitizeArmy, sanitizeBuildings, sanitizeObstacles, sanitizeResources } from '../_lib/validators.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'GET')) return;

  try {
    const userId = getQueryParam(req, 'userId');
    if (!userId) {
      return jsonError(res, 400, 'User ID required');
    }

    const storage = getStorage();
    const base = await storage.getBase(userId);
    if (!base) {
      return jsonError(res, 404, 'Base not found');
    }

    const normalized = ensureTownHall({
      ...base,
      buildings: sanitizeBuildings((base as unknown as Record<string, unknown>).buildings),
      obstacles: sanitizeObstacles((base as unknown as Record<string, unknown>).obstacles),
      resources: sanitizeResources((base as unknown as Record<string, unknown>).resources),
      army: sanitizeArmy((base as unknown as Record<string, unknown>).army),
    });

    return jsonOk(res, { success: true, base: normalized });
  } catch (error) {
    console.error('Load base error:', error);
    return jsonError(res, 500, 'Internal server error');
  }
}
