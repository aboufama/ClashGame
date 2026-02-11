import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http.js';
import { listPathnames, readJson } from '../_lib/blob.js';
import { readUsersIndex } from '../_lib/indexes.js';
import type { UserRecord } from '../_lib/models.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const index = await readUsersIndex();
    let users = index.users
      .filter(entry => entry.buildingCount > 0)
      .slice(0, 50)
      .map(entry => ({
        id: entry.id,
        username: entry.username,
        buildingCount: entry.buildingCount
      }));

    // Index fallback: recover from direct user files when index is empty/stale.
    if (users.length === 0) {
      const pathnames = await listPathnames('users/').catch(() => [] as string[]);
      const sample = pathnames
        .filter(pathname => pathname.endsWith('.json'))
        .slice(0, 200);

      const records = await Promise.all(sample.map(pathname => readJson<UserRecord>(pathname).catch(() => null)));
      users = records
        .filter((record): record is UserRecord => !!record && typeof record.id === 'string' && typeof record.username === 'string')
        .map(record => ({
          id: record.id,
          username: record.username,
          buildingCount: 1
        }))
        .slice(0, 50);
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    sendJson(res, 200, { users });
  } catch (error) {
    console.error('list users error', error);
    sendJson(res, 200, { users: [] });
  }
}
