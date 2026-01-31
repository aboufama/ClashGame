import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, getBody, jsonError, jsonOk, requireMethod } from '../_lib/http.js';
import { createInitialBase } from '../_lib/bases.js';
import { verifyPassword } from '../_lib/passwords.js';
import { getStorage } from '../_lib/storage/index.js';
import { ensureTownHall, sanitizeArmy, sanitizeBuildings, sanitizeObstacles, sanitizeResources, validatePassword, validateUsername } from '../_lib/validators.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const body = getBody<{ username?: string; password?: string }>(req);
    const username = validateUsername(body.username);
    const password = validatePassword(body.password);

    if (!username || !password) {
      return jsonError(res, 400, 'Username and password required');
    }

    const storage = getStorage();
    const user = await storage.getUserByUsername(username);
    if (!user) {
      return jsonError(res, 401, 'Invalid username or password');
    }

    const { valid, upgradedHash } = verifyPassword(password, user.passwordHash);
    if (!valid) {
      return jsonError(res, 401, 'Invalid username or password');
    }

    const now = Date.now();
    user.lastLogin = now;
    if (upgradedHash) {
      user.passwordHash = upgradedHash;
    }
    await storage.updateUser(user);

    let base = await storage.getBase(user.id);
    if (!base) {
      base = createInitialBase(user.id, user.username);
      await storage.saveBase(base);
    }
    const normalizedBase = ensureTownHall({
      ...base,
      buildings: sanitizeBuildings((base as unknown as Record<string, unknown>).buildings),
      obstacles: sanitizeObstacles((base as unknown as Record<string, unknown>).obstacles),
      resources: sanitizeResources((base as unknown as Record<string, unknown>).resources),
      army: sanitizeArmy((base as unknown as Record<string, unknown>).army),
    });

    return jsonOk(res, {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        lastLogin: now,
      },
      base: normalizedBase,
    });
  } catch (error) {
    console.error('Login error:', error);
    return jsonError(res, 500, 'Internal server error');
  }
}
