import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, getBody, getQueryParam, jsonError, jsonOk } from '../_lib/http.js';
import { verifyPassword } from '../_lib/passwords.js';
import { getStorage } from '../_lib/storage/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  if (!(req.method === 'DELETE' || req.method === 'POST')) {
    return jsonError(res, 405, 'Method not allowed');
  }

  try {
    const body = getBody<{ userId?: string; password?: string }>(req);
    const userId = body.userId || getQueryParam(req, 'userId');
    const password = body.password || getQueryParam(req, 'password');

    if (!userId || !password) {
      return jsonError(res, 400, 'User ID and password required');
    }

    const storage = getStorage();
    const user = await storage.getUser(userId);
    if (!user) {
      return jsonError(res, 404, 'User not found');
    }

    const { valid } = verifyPassword(password, user.passwordHash);
    if (!valid) {
      return jsonError(res, 401, 'Invalid password');
    }

    const deleted = await storage.deleteUser(userId);
    if (!deleted) {
      return jsonError(res, 500, 'Failed to delete account');
    }

    return jsonOk(res, { success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    return jsonError(res, 500, 'Internal server error');
  }
}
