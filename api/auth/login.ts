import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { readJson, writeJson } from '../_lib/blob.js';
import { createSession, createSessionCookie, findUserByIdentifier, getAuthSessionToken, hashPassword, upsertUserAuthLookups, verifyPassword } from '../_lib/auth.js';
import { resolveHomeWorld } from '../_lib/home_world.js';
import type { SessionRecord, UserRecord } from '../_lib/models.js';
import { upsertUserIndex } from '../_lib/indexes.js';

interface LoginBody {
  identifier?: string;
  password?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const body = await readJsonBody<LoginBody>(req);
    const identifier = body.identifier?.trim() ?? '';
    const password = body.password ?? '';

    if (!identifier || !password) {
      sendError(res, 400, 'identifier and password required');
      return;
    }

    const user = await findUserByIdentifier(identifier);
    if (!user) {
      sendError(res, 404, 'No account found for that username or email');
      return;
    }

    const legacyPassword = typeof (user as any).password === 'string' ? String((user as any).password) : '';
    const storedHash = typeof user.passwordHash === 'string' ? user.passwordHash : '';

    let verified = false;
    let migratedHash = storedHash;
    if (storedHash) {
      verified = verifyPassword(password, storedHash);
    } else if (legacyPassword) {
      verified = legacyPassword.startsWith('scrypt:')
        ? verifyPassword(password, legacyPassword)
        : legacyPassword === password;
      if (verified) {
        migratedHash = hashPassword(password);
      }
    }

    if (!verified) {
      sendError(res, 403, 'Incorrect password');
      return;
    }

    const now = Date.now();
    const incomingToken = getAuthSessionToken(req);
    const activeSessionId = typeof user.activeSessionId === 'string' ? user.activeSessionId : '';
    if (activeSessionId && activeSessionId !== incomingToken) {
      const activeSession = await readJson<SessionRecord>(`sessions/${activeSessionId}.json`).catch(() => null);
      const activeStillValid = !!activeSession &&
        activeSession.userId === user.id &&
        Number(activeSession.expiresAt) > now;

      if (activeStillValid) {
        sendError(res, 409, 'This account is already logged in on another session');
        return;
      }
    }

    const session = await createSession(user.id);

    const updated: UserRecord = {
      ...user,
      lastSeen: now,
      activeSessionId: session.token,
      sessionExpiresAt: session.expiresAt,
      passwordHash: migratedHash
    };

    await writeJson(`users/${updated.id}.json`, updated);
    await upsertUserAuthLookups(updated).catch(error => {
      console.warn('login lookup repair failed', { userId: updated.id, error });
    });

    res.setHeader('Set-Cookie', createSessionCookie(session.token));

    const resolved = await resolveHomeWorld(updated.id, updated.username, {
      now,
      source: 'login',
      materializeAttempts: 8,
      historyDepth: 12
    }).catch(error => {
      console.warn('login home world resolve failed; returning null world', { userId: updated.id, error });
      return null;
    });

    const world = resolved?.world ?? null;
    const buildingCount = world?.buildings.length ?? 0;

    await upsertUserIndex({
      id: updated.id,
      username: updated.username,
      buildingCount,
      lastSeen: now,
      trophies: updated.trophies ?? 0
    }).catch(error => {
      console.warn('login index sync failed', { userId: updated.id, error });
    });

    sendJson(res, 200, {
      user: { id: updated.id, email: updated.email, username: updated.username },
      expiresAt: session.expiresAt,
      world
    });
  } catch (error) {
    console.error('login error', error);
    sendError(res, 500, 'Unable to log in right now');
  }
}
