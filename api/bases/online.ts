import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateBotBase } from '../_lib/bots.js';
import { handleOptions, getQueryParam, jsonError, jsonOk, requireMethod } from '../_lib/http.js';
import { getStorage } from '../_lib/storage/index.js';
import { ensureTownHall, sanitizeArmy, sanitizeBuildings, sanitizeObstacles, sanitizeResources } from '../_lib/validators.js';
import { pickRandom } from '../_lib/utils.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'GET')) return;

  try {
    const excludeUserId = getQueryParam(req, 'excludeUserId') || '';
    const limitRaw = getQueryParam(req, 'limit');
    const limit = Math.min(Math.max(parseInt(limitRaw || '5', 10) || 5, 1), 10);

    const storage = getStorage();
    let bases = await storage.getOnlineBases(excludeUserId, limit);

    if (!bases.length) {
      const botCount = Math.min(limit, 5);
      bases = Array.from({ length: botCount }, (_, i) => generateBotBase(i));
    }

    bases = bases.filter((base) => {
      if (!base.buildings || base.buildings.length === 0) return false;
      return base.buildings.some((b) => b.type !== 'wall');
    });

    if (!bases.length) {
      bases.push(generateBotBase(0));
    }

    const selected = pickRandom(bases);
    if (!selected) {
      return jsonError(res, 500, 'Failed to select base');
    }

    let normalized = ensureTownHall({
      ...selected,
      buildings: sanitizeBuildings((selected as unknown as Record<string, unknown>).buildings),
      obstacles: sanitizeObstacles((selected as unknown as Record<string, unknown>).obstacles),
      resources: sanitizeResources((selected as unknown as Record<string, unknown>).resources),
      army: sanitizeArmy((selected as unknown as Record<string, unknown>).army),
    });

    if (!normalized.buildings.length) {
      const fallback = generateBotBase(0);
      normalized = ensureTownHall({
        ...fallback,
        buildings: sanitizeBuildings((fallback as unknown as Record<string, unknown>).buildings),
        obstacles: sanitizeObstacles((fallback as unknown as Record<string, unknown>).obstacles),
        resources: sanitizeResources((fallback as unknown as Record<string, unknown>).resources),
        army: sanitizeArmy((fallback as unknown as Record<string, unknown>).army),
      });
    }

    const candidate = {
      id: selected.ownerId,
      username: selected.username,
      isBot: !!(selected as any).isBot,
    };

    return jsonOk(res, {
      success: true,
      candidate,
      ...(candidate.isBot ? { base: normalized } : {}),
      totalAvailable: bases.length,
    });
  } catch (error) {
    console.error('Get online bases error:', error);
    return jsonError(res, 500, 'Internal server error');
  }
}
