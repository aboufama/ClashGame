import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http';
import { readUsersIndex } from '../_lib/indexes';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const index = await readUsersIndex();
    const users = index.users
      .filter(entry => entry.buildingCount > 0)
      .slice(0, 50)
      .map(entry => ({
        id: entry.id,
        username: entry.username,
        buildingCount: entry.buildingCount
      }));

    sendJson(res, 200, { users });
  } catch (error) {
    console.error('list users error', error);
    sendError(res, 500, 'Failed to load users');
  }
}
