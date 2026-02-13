import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http.js';
import { requireAuth } from '../_lib/auth.js';
import { resolveHomeWorld } from '../_lib/home_world.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const now = Date.now();
    const world = await resolveHomeWorld(auth.user.id, auth.user.username, {
      now,
      source: 'session',
      materializeAttempts: 6,
      historyDepth: 10
    })
      .then(result => result.world)
      .catch(error => {
        console.warn('session home world resolve failed; returning user without world snapshot', {
          userId: auth.user.id,
          error
        });
        return null;
      });

    sendJson(res, 200, {
      authenticated: true,
      user: {
        id: auth.user.id,
        email: auth.user.email,
        username: auth.user.username
      },
      world
    });
  } catch (error) {
    console.error('session error', error);
    sendError(res, 500, 'Session check failed');
  }
}
