import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http.js';
import { listPathnames, readJson } from '../_lib/blob.js';
import { readUsersIndex } from '../_lib/indexes.js';
import type { UserRecord } from '../_lib/models.js';

interface ListedUser {
  id: string;
  username: string;
  buildingCount: number;
}

interface UsersListCache {
  users: ListedUser[];
  expiresAt: number;
}

const MAX_USERS = 50;
const FALLBACK_SAMPLE_SIZE = 120;
const CACHE_TTL_MS = 15000;

let responseCache: UsersListCache | null = null;

function sanitizeListedUser(user: ListedUser): ListedUser {
  return {
    id: String(user.id),
    username: String(user.username),
    buildingCount: Math.max(0, Math.floor(Number(user.buildingCount) || 0))
  };
}

async function readUsersFromIndex(): Promise<ListedUser[]> {
  const index = await readUsersIndex();
  return index.users
    .filter(entry => entry.buildingCount > 0)
    .slice(0, MAX_USERS)
    .map(entry => sanitizeListedUser({
      id: entry.id,
      username: entry.username,
      buildingCount: entry.buildingCount
    }));
}

async function readUsersFromFallback(): Promise<ListedUser[]> {
  const pathnames = await listPathnames('users/').catch(() => [] as string[]);
  const sample = pathnames
    .filter(pathname => pathname.endsWith('.json'))
    .slice(0, FALLBACK_SAMPLE_SIZE);

  const records = await Promise.all(sample.map(pathname => readJson<UserRecord>(pathname).catch(() => null)));
  return records
    .filter((record): record is UserRecord => !!record && typeof record.id === 'string' && typeof record.username === 'string')
    .map(record => sanitizeListedUser({
      id: record.id,
      username: record.username,
      buildingCount: 1
    }))
    .slice(0, MAX_USERS);
}

function writeResponseHeaders(res: VercelResponse) {
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=15, stale-while-revalidate=60');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  const now = Date.now();
  if (responseCache && responseCache.expiresAt > now) {
    writeResponseHeaders(res);
    sendJson(res, 200, { users: responseCache.users });
    return;
  }

  try {
    let users = await readUsersFromIndex();

    // Index fallback: recover from direct user files when index is empty/stale.
    if (users.length === 0) {
      users = await readUsersFromFallback();
    }

    responseCache = {
      users,
      expiresAt: Date.now() + CACHE_TTL_MS
    };

    writeResponseHeaders(res);
    sendJson(res, 200, { users });
  } catch (error) {
    console.error('list users error', error);
    if (responseCache) {
      writeResponseHeaders(res);
      sendJson(res, 200, { users: responseCache.users });
      return;
    }
    sendJson(res, 200, { users: [] });
  }
}
