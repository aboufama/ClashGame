import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { writeJson } from '../_lib/blob.js';
import {
  createSession,
  createSessionCookie,
  findUserIdByEmail,
  findUserIdByUsername,
  hashPassword,
  isValidEmail,
  isValidUsername,
  normalizeEmail,
  upsertUserAuthLookups
} from '../_lib/auth.js';
import { ensurePlayerState, materializeState } from '../_lib/game_state.js';
import { randomId, type UserRecord } from '../_lib/models.js';
import { upsertUserIndex } from '../_lib/indexes.js';

interface RegisterBody {
  email?: string;
  username?: string;
  password?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const body = await readJsonBody<RegisterBody>(req);
    const emailInput = body.email?.trim() ?? '';
    const username = body.username?.trim() ?? '';
    const password = body.password ?? '';

    if (!isValidEmail(emailInput)) {
      sendError(res, 400, 'Valid email required');
      return;
    }

    if (!isValidUsername(username)) {
      sendError(res, 400, 'Username must be 3-18 chars using letters, numbers, "_" or "-"');
      return;
    }

    if (password.trim().length < 8) {
      sendError(res, 400, 'Password must be at least 8 characters');
      return;
    }

    const email = normalizeEmail(emailInput);

    const [emailOwner, usernameOwner] = await Promise.all([
      findUserIdByEmail(email),
      findUserIdByUsername(username)
    ]);

    if (emailOwner) {
      sendError(res, 409, 'Email already in use');
      return;
    }

    if (usernameOwner) {
      sendError(res, 409, 'Username already in use');
      return;
    }

    const now = Date.now();
    const user: UserRecord = {
      id: randomId('u_'),
      email,
      username,
      createdAt: now,
      lastSeen: now,
      passwordHash: hashPassword(password),
      trophies: 0
    };

    const session = await createSession(user.id);
    user.activeSessionId = session.token;
    user.sessionExpiresAt = session.expiresAt;

    await writeJson(`users/${user.id}.json`, user);
    await upsertUserAuthLookups(user);

    await ensurePlayerState(user.id, user.username);
    const state = await materializeState(user.id, user.username, now);

    await upsertUserIndex({
      id: user.id,
      username: user.username,
      buildingCount: state.world.buildings.length,
      lastSeen: now,
      trophies: user.trophies ?? 0
    });

    res.setHeader('Set-Cookie', createSessionCookie(session.token));
    sendJson(res, 200, {
      user: { id: user.id, email: user.email, username: user.username },
      expiresAt: session.expiresAt
    });
  } catch (error) {
    console.error('register error', error);
    sendError(res, 500, 'Registration failed');
  }
}
