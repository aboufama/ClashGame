import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateBotBase } from '../_lib/bots.js';
import { handleOptions, getQueryParam, jsonError, jsonOk, requireMethod } from '../_lib/http.js';
import { getStorage } from '../_lib/storage/index.js';
import { sanitizeBaseForOutput } from '../_lib/validators.js';
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

    let normalized = sanitizeBaseForOutput(selected);

    if (!normalized.buildings.length) {
      const fallback = generateBotBase(0);
      normalized = sanitizeBaseForOutput(fallback);
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
