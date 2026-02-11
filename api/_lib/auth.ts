import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readJson, writeJson } from './blob.js';
import { sendError } from './http.js';
import type { SessionRecord, UserRecord } from './models.js';
import { randomId } from './models.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SESSION_COOKIE_NAME = 'clash_session';
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_BYTES = 64;
const LOOKUP_RECORD_VERSION = 1;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,18}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface UserLookupRecord {
  userId: string;
  version: number;
  updatedAt: number;
}

export function sanitizeId(input: string, fallbackPrefix = 'p_') {
  const cleaned = String(input || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return cleaned.length > 0 ? cleaned : randomId(fallbackPrefix);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeUsernameKey(username: string) {
  return username.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(normalizeEmail(email));
}

export function isValidUsername(username: string) {
  return USERNAME_PATTERN.test(username.trim());
}

function hashLookupKey(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function emailLookupPath(email: string) {
  return `indexes/auth/email/${hashLookupKey(normalizeEmail(email))}.json`;
}

function usernameLookupPath(username: string) {
  return `indexes/auth/username/${hashLookupKey(normalizeUsernameKey(username))}.json`;
}

function getCookieValue(req: VercelRequest, key: string) {
  const header = req.headers.cookie;
  if (!header || typeof header !== 'string') return null;

  const pairs = header.split(';');
  for (const pair of pairs) {
    const [rawName, ...rest] = pair.split('=');
    if (!rawName || rest.length === 0) continue;
    if (rawName.trim() !== key) continue;
    const value = rest.join('=').trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

function getBearerToken(req: VercelRequest) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return null;
  return token;
}

function getSessionToken(req: VercelRequest) {
  return getCookieValue(req, SESSION_COOKIE_NAME) ?? getBearerToken(req);
}

function secureCookieSuffix() {
  return process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

export function createSessionCookie(token: string) {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureCookieSuffix()}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieSuffix()}`;
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES);
  const derived = crypto.scryptSync(password, salt, PASSWORD_KEY_BYTES);
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const [, saltHex, expectedHex] = parts;
  if (!saltHex || !expectedHex) return false;

  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(expectedHex, 'hex');
    if (salt.length === 0 || expected.length === 0) return false;
    const actual = crypto.scryptSync(password, salt, expected.length);
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function readLookup(pathname: string): Promise<string | null> {
  const record = await readJson<UserLookupRecord>(pathname);
  if (!record || typeof record.userId !== 'string' || !record.userId) return null;
  return record.userId;
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  if (!isValidEmail(email)) return null;
  return await readLookup(emailLookupPath(email));
}

export async function findUserIdByUsername(username: string): Promise<string | null> {
  if (!username.trim()) return null;
  return await readLookup(usernameLookupPath(username));
}

export async function findUserByIdentifier(identifier: string): Promise<UserRecord | null> {
  const normalized = identifier.trim();
  if (!normalized) return null;

  const candidates: string[] = [];
  if (normalized.includes('@')) {
    const emailId = await findUserIdByEmail(normalized);
    if (emailId) candidates.push(emailId);
  }

  const usernameId = await findUserIdByUsername(normalized);
  if (usernameId && !candidates.includes(usernameId)) candidates.push(usernameId);

  for (const userId of candidates) {
    const user = await readJson<UserRecord>(`users/${userId}.json`);
    if (user) return user;
  }

  return null;
}

export async function upsertUserAuthLookups(user: UserRecord): Promise<void> {
  const record: UserLookupRecord = {
    userId: user.id,
    version: LOOKUP_RECORD_VERSION,
    updatedAt: Date.now()
  };

  await Promise.all([
    writeJson(emailLookupPath(user.email), record),
    writeJson(usernameLookupPath(user.username), record)
  ]);
}

export async function createSession(userId: string): Promise<SessionRecord> {
  const token = randomId('sess_');
  const now = Date.now();
  const session: SessionRecord = {
    token,
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  };

  await writeJson(`sessions/${token}.json`, session);
  return session;
}

export async function requireAuth(req: VercelRequest, res: VercelResponse): Promise<{ user: UserRecord; token: string } | null> {
  const token = getSessionToken(req);
  if (!token) {
    sendError(res, 401, 'Missing auth session');
    return null;
  }

  const session = await readJson<SessionRecord>(`sessions/${token}.json`);
  if (!session || session.expiresAt <= Date.now()) {
    sendError(res, 401, 'Session expired');
    return null;
  }

  const user = await readJson<UserRecord>(`users/${session.userId}.json`);
  if (!user) {
    sendError(res, 401, 'Invalid session');
    return null;
  }

  if (user.activeSessionId !== token || (user.sessionExpiresAt ?? 0) <= Date.now()) {
    sendError(res, 401, 'Session superseded');
    return null;
  }

  return { user, token };
}
