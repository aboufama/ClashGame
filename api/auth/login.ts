import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { writeJson } from '../_lib/blob.js';
import { createSession, createSessionCookie, findUserByIdentifier, hashPassword, upsertUserAuthLookups, verifyPassword } from '../_lib/auth.js';
import { ensurePlayerState, materializeState } from '../_lib/game_state.js';
import type { UserRecord } from '../_lib/models.js';
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
      sendError(res, 404, 'User not found');
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
      sendError(res, 403, 'Invalid credentials');
      return;
    }

    const session = await createSession(user.id);
    const now = Date.now();

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

    // Best-effort state/index refresh. Auth success should not fail because of game-state repair.
    void (async () => {
      try {
        await ensurePlayerState(updated.id, updated.username);
        const state = await materializeState(updated.id, updated.username, now);
        await upsertUserIndex({
          id: updated.id,
          username: updated.username,
          buildingCount: state.world.buildings.length,
          lastSeen: now,
          trophies: updated.trophies ?? 0
        });
      } catch (error) {
        console.warn('login post-auth state sync failed', { userId: updated.id, error });
      }
    })();

    sendJson(res, 200, {
      user: { id: updated.id, email: updated.email, username: updated.username },
      expiresAt: session.expiresAt
    });
  } catch (error) {
    console.error('login error', error);
    sendError(res, 500, 'Login failed');
  }
}
