import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { deleteJson, listPathnames, readJson, writeJson } from '../_lib/blob.js';
import {
  createSession,
  createSessionCookie,
  findUserByIdentifier,
  hashPassword,
  isValidEmail,
  isValidUsername,
  normalizeEmail,
  normalizeUsernameKey,
  releaseReservedAuthLookups,
  reserveUserAuthLookups
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
    const normalizedUsername = normalizeUsernameKey(username);

    const [emailOwner, usernameOwner] = await Promise.all([
      findUserByIdentifier(email),
      findUserByIdentifier(username)
    ]);

    if (emailOwner && normalizeEmail(emailOwner.email) === email) {
      sendError(res, 409, 'Email already in use');
      return;
    }

    if (usernameOwner && normalizeUsernameKey(usernameOwner.username) === normalizedUsername) {
      sendError(res, 409, 'Username already in use');
      return;
    }

    // Last-line uniqueness guard: full user scan prevents duplicate usernames/emails
    // when lookup/index entries are stale.
    const userPathnames = await listPathnames('users/').catch(() => [] as string[]);
    for (const pathname of userPathnames) {
      if (!pathname.startsWith('users/') || !pathname.endsWith('.json')) continue;
      const record = await readJson<UserRecord>(pathname).catch(() => null);
      if (!record) continue;
      if (normalizeEmail(record.email) === email) {
        sendError(res, 409, 'Email already in use');
        return;
      }
      if (normalizeUsernameKey(record.username) === normalizedUsername) {
        sendError(res, 409, 'Username already in use');
        return;
      }
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

    const lookupReservation = await reserveUserAuthLookups(user);
    if (!lookupReservation.ok) {
      sendError(res, 409, lookupReservation.conflict === 'email' ? 'Email already in use' : 'Username already in use');
      return;
    }

    let sessionToken: string | null = null;
    try {
      const session = await createSession(user.id);
      sessionToken = session.token;
      user.activeSessionId = session.token;
      user.sessionExpiresAt = session.expiresAt;

      await writeJson(`users/${user.id}.json`, user, { allowOverwrite: false });

      res.setHeader('Set-Cookie', createSessionCookie(session.token));
      sendJson(res, 200, {
        user: { id: user.id, email: user.email, username: user.username },
        expiresAt: session.expiresAt
      });

      // Best-effort state/index repair; registration success should not fail because of this.
      void (async () => {
        try {
          await ensurePlayerState(user.id, user.username);
          const state = await materializeState(user.id, user.username, now);
          await upsertUserIndex({
            id: user.id,
            username: user.username,
            buildingCount: state.world.buildings.length,
            lastSeen: now,
            trophies: user.trophies ?? 0
          });
        } catch (error) {
          console.warn('register post-auth state sync failed', { userId: user.id, error });
        }
      })();
    } catch (createError) {
      await releaseReservedAuthLookups(lookupReservation.reservedPathnames);
      if (sessionToken) {
        await deleteJson(`sessions/${sessionToken}.json`).catch(() => undefined);
      }
      throw createError;
    }
  } catch (error) {
    console.error('register error', error);
    sendError(res, 500, 'Registration failed');
  }
}
