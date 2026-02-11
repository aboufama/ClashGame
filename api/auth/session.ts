import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    sendJson(res, 200, {
      authenticated: true,
      user: {
        id: auth.user.id,
        email: auth.user.email,
        username: auth.user.username
      }
    });
  } catch (error) {
    console.error('session error', error);
    sendError(res, 500, 'Session check failed');
  }
}
