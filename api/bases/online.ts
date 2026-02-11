import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { readUsersIndex } from '../_lib/indexes.js';
import { readJson } from '../_lib/blob.js';
import { ensurePlayerState, materializeState } from '../_lib/game_state.js';
import type { UserRecord } from '../_lib/models.js';

function normalizeUsernameKey(username: string) {
  return username.trim().toLowerCase();
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
    const index = await readUsersIndex();
    const dedupedByUsername = new Map<string, (typeof index.users)[number]>();
    index.users.forEach(entry => {
      if (!entry || entry.id === user.id || entry.buildingCount <= 0) return;
      const key = normalizeUsernameKey(entry.username) || `id:${entry.id}`;
      const existing = dedupedByUsername.get(key);
      if (!existing) {
        dedupedByUsername.set(key, entry);
        return;
      }
      const existingLastSeen = Number(existing.lastSeen || 0);
      const entryLastSeen = Number(entry.lastSeen || 0);
      if (entryLastSeen > existingLastSeen) {
        dedupedByUsername.set(key, entry);
      }
    });

    const candidates = Array.from(dedupedByUsername.values());

    if (candidates.length === 0) {
      sendJson(res, 200, { world: null });
      return;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const targetUser = await readJson<UserRecord>(`users/${pick.id}.json`);
    const username = targetUser?.username || pick.username;

    await ensurePlayerState(pick.id, username);
    const targetState = await materializeState(pick.id, username, Date.now());

    sendJson(res, 200, { world: targetState.world });
  } catch (error) {
    console.error('online error', error);
    sendError(res, 500, 'Failed to find online base');
  }
}
