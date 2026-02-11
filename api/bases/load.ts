import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { ensurePlayerState, materializeState } from '../_lib/game_state.js';
import type { SerializedWorld } from '../_lib/models.js';

function normalizeTypeKey(type: unknown) {
  return String(type ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function isRenderableHomeWorld(world: SerializedWorld | null | undefined) {
  if (!world || !Array.isArray(world.buildings) || world.buildings.length === 0) return false;

  let hasTownHall = false;
  let hasPositionedBuilding = false;
  for (const building of world.buildings) {
    const typeKey = normalizeTypeKey((building as { type?: unknown }).type);
    const gridX = Number((building as { gridX?: unknown }).gridX);
    const gridY = Number((building as { gridY?: unknown }).gridY);
    if (!Number.isFinite(gridX) || !Number.isFinite(gridY)) continue;
    hasPositionedBuilding = true;
    if (typeKey === 'townhall') {
      hasTownHall = true;
    }
  }

  return hasTownHall && hasPositionedBuilding;
}

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
    await ensurePlayerState(user.id, user.username);
    const maxAttempts = 4;
    let world: SerializedWorld | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const state = await materializeState(user.id, user.username, Date.now());
      world = state.world;
      if (isRenderableHomeWorld(world)) {
        break;
      }
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 120 * attempt));
      }
    }

    if (!isRenderableHomeWorld(world)) {
      console.warn('load base returned non-renderable world after retries', {
        userId: user.id,
        buildingCount: Array.isArray(world?.buildings) ? world?.buildings.length : 0
      });
      sendError(res, 503, 'Base state not ready');
      return;
    }

    sendJson(res, 200, { world });
  } catch (error) {
    console.error('load error', error);
    sendError(res, 500, 'Failed to load base');
  }
}
