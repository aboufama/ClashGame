import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http';
import { readJson, writeJson } from '../_lib/blob';
import { createSession, hashSecret, sanitizeId } from '../_lib/auth';
import type { UserRecord } from '../_lib/models';
import { upsertUserIndex } from '../_lib/indexes';

interface LoginBody {
  playerId: string;
  deviceSecret: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const body = await readJsonBody<LoginBody>(req);
    const playerId = body.playerId ? sanitizeId(body.playerId) : '';
    const deviceSecret = body.deviceSecret?.trim();
    if (!playerId || !deviceSecret) {
      sendError(res, 400, 'playerId and deviceSecret required');
      return;
    }

    const user = await readJson<UserRecord>(`users/${playerId}.json`);
    if (!user) {
      sendError(res, 404, 'User not found');
      return;
    }

    const secretHash = hashSecret(deviceSecret);
    if (user.secretHash !== secretHash) {
      sendError(res, 403, 'Invalid credentials');
      return;
    }

    const session = await createSession(user.id);
    const now = Date.now();
    const updated: UserRecord = {
      ...user,
      lastSeen: now,
      activeSessionId: session.token,
      sessionExpiresAt: session.expiresAt
    };
    await writeJson(`users/${user.id}.json`, updated);

    await upsertUserIndex({
      id: updated.id,
      username: updated.username,
      buildingCount: 0,
      lastSeen: now,
      trophies: updated.trophies ?? 0
    });

    sendJson(res, 200, {
      user: { id: updated.id, username: updated.username },
      token: session.token,
      expiresAt: session.expiresAt
    });
  } catch (error) {
    console.error('login error', error);
    sendError(res, 500, 'Login failed');
  }
}
