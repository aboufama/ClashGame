import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { readJson, writeJson } from '../_lib/blob.js';
import { createSession, hashSecret, sanitizeId } from '../_lib/auth.js';
import { ensurePlayerState, materializeState } from '../_lib/game_state.js';
import { randomId, sanitizeUsername, type UserRecord } from '../_lib/models.js';
import { upsertUserIndex } from '../_lib/indexes.js';

interface RegisterBody {
  username?: string;
  playerId?: string;
  deviceSecret?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const body = await readJsonBody<RegisterBody>(req);
    const deviceSecret = body.deviceSecret?.trim();
    if (!deviceSecret) {
      sendError(res, 400, 'deviceSecret required');
      return;
    }

    const now = Date.now();
    const playerId = body.playerId ? sanitizeId(body.playerId) : randomId('p_');
    const username = sanitizeUsername(body.username);
    const secretHash = hashSecret(deviceSecret);

    const existing = await readJson<UserRecord>(`users/${playerId}.json`);

    let user: UserRecord;
    if (existing) {
      if (existing.secretHash !== secretHash) {
        sendError(res, 403, 'Invalid credentials');
        return;
      }
      user = {
        ...existing,
        username: existing.username || username,
        lastSeen: now
      };
    } else {
      user = {
        id: playerId,
        username,
        createdAt: now,
        lastSeen: now,
        secretHash,
        trophies: 0
      };
    }

    const session = await createSession(user.id);
    user.activeSessionId = session.token;
    user.sessionExpiresAt = session.expiresAt;

    await writeJson(`users/${user.id}.json`, user);

    await ensurePlayerState(user.id, user.username);
    const state = await materializeState(user.id, user.username, now);

    await upsertUserIndex({
      id: user.id,
      username: user.username,
      buildingCount: state.world.buildings.length,
      lastSeen: now,
      trophies: user.trophies ?? 0
    });

    sendJson(res, 200, {
      user: { id: user.id, username: user.username },
      token: session.token,
      expiresAt: session.expiresAt
    });
  } catch (error) {
    console.error('register error', error);
    sendError(res, 500, 'Registration failed');
  }
}
