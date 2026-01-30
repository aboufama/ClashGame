import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, getBody, jsonError, jsonOk, requireMethod } from '../_lib/http.js';
import { createInitialBase } from '../_lib/bases.js';
import { hashPassword } from '../_lib/passwords.js';
import { getStorage } from '../_lib/storage/index.js';
import { validatePassword, validateUsername } from '../_lib/validators.js';
import { randomId } from '../_lib/utils.js';

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
    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return jsonError(res, 409, 'Username already taken');
    }

    const userId = `user_${Date.now()}_${randomId().slice(0, 8)}`;
    const now = Date.now();

    const user = {
      id: userId,
      username,
      passwordHash: hashPassword(password),
      createdAt: now,
      lastLogin: now,
    };

    await storage.createUser(user);
    await storage.saveBase(createInitialBase(userId, username));

    return jsonOk(res, {
      success: true,
      user: {
        id: userId,
        username: user.username,
        lastLogin: user.lastLogin,
      },
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({
      error: 'Registration failed',
      details: message,
      hint: 'Check if BLOB_READ_WRITE_TOKEN is configured in Vercel',
    });
  }
}
