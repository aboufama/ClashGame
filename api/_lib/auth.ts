import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readJson, writeJson } from './blob.js';
import { sendError } from './http.js';
import type { SessionRecord, UserRecord } from './models.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export function hashSecret(secret: string) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function randomId(prefix = '') {
  return `${prefix}${crypto.randomBytes(12).toString('hex')}`;
}

export function sanitizeId(input: string, fallbackPrefix = 'p_') {
  const cleaned = input.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return cleaned.length > 0 ? cleaned : randomId(fallbackPrefix);
}

function getBearerToken(req: VercelRequest) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return null;
  return token;
}

export async function createSession(userId: string): Promise<SessionRecord> {
  const token = randomId('sess_');
  const now = Date.now();
  const record: SessionRecord = {
    token,
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  };
  await writeJson(`sessions/${token}.json`, record);
  return record;
}

export async function requireAuth(req: VercelRequest, res: VercelResponse): Promise<{ user: UserRecord; token: string } | null> {
  const token = getBearerToken(req);
  if (!token) {
    sendError(res, 401, 'Missing auth token');
    return null;
  }

  const session = await readJson<SessionRecord>(`sessions/${token}.json`);
  if (!session || session.expiresAt < Date.now()) {
    sendError(res, 401, 'Session expired');
    return null;
  }

  const user = await readJson<UserRecord>(`users/${session.userId}.json`);
  if (!user) {
    sendError(res, 401, 'Invalid session');
    return null;
  }

  if (user.activeSessionId !== token || (user.sessionExpiresAt ?? 0) < Date.now()) {
    sendError(res, 401, 'Session superseded');
    return null;
  }

  return { user, token };
}
