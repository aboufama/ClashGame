import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deleteJson, listPathnames, readJson, writeJson } from './blob.js';
import { sendError } from './http.js';
import { readUsersIndex } from './indexes.js';
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

function legacyEmailLookupPath(email: string) {
  return `indexes/auth/email/${encodeURIComponent(normalizeEmail(email))}.json`;
}

function legacyUsernameLookupPath(username: string) {
  return `indexes/auth/username/${encodeURIComponent(normalizeUsernameKey(username))}.json`;
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

export function getAuthSessionToken(req: VercelRequest) {
  return getSessionToken(req);
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

function isBlobAlreadyExistsError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; message?: string; code?: string };
  if (err.name === 'BlobAlreadyExistsError') return true;
  if (err.code === 'BlobAlreadyExistsError') return true;
  if (typeof err.message === 'string' && /already exists|exists already|overwrite/i.test(err.message)) return true;
  return false;
}

async function readLookupFromPaths(pathnames: string[]): Promise<string | null> {
  const seen = new Set<string>();
  for (const pathname of pathnames) {
    if (!pathname || seen.has(pathname)) continue;
    seen.add(pathname);
    const found = await readLookup(pathname);
    if (found) return found;
  }
  return null;
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  if (!isValidEmail(email)) return null;
  return await readLookupFromPaths([
    emailLookupPath(email),
    legacyEmailLookupPath(email)
  ]);
}

export async function findUserIdByUsername(username: string): Promise<string | null> {
  if (!username.trim()) return null;
  return await readLookupFromPaths([
    usernameLookupPath(username),
    legacyUsernameLookupPath(username)
  ]);
}

export async function findUserByIdentifier(identifier: string): Promise<UserRecord | null> {
  const normalized = identifier.trim();
  if (!normalized) return null;

  const normalizedEmail = normalizeEmail(normalized);
  const normalizedUsername = normalizeUsernameKey(normalized);

  const matchesIdentifier = (user: UserRecord) => {
    if (!user || typeof user.id !== 'string') return false;
    const userEmail = typeof user.email === 'string' ? normalizeEmail(user.email) : '';
    const userUsername = typeof user.username === 'string' ? normalizeUsernameKey(user.username) : '';
    return user.id === normalized || userEmail === normalizedEmail || userUsername === normalizedUsername;
  };

  const seenIds = new Set<string>();
  const candidates: string[] = [];
  if (normalized.includes('@')) {
    const emailId = await findUserIdByEmail(normalized);
    if (emailId) candidates.push(emailId);
  }

  const usernameId = await findUserIdByUsername(normalized);
  if (usernameId && !candidates.includes(usernameId)) candidates.push(usernameId);

  for (const userId of candidates) {
    if (!userId || seenIds.has(userId)) continue;
    seenIds.add(userId);
    const user = await readJson<UserRecord>(`users/${userId}.json`);
    if (user && matchesIdentifier(user)) {
      await upsertUserAuthLookups(user).catch(() => undefined);
      return user;
    }
  }

  // Legacy/stale fallback: recover by scanning users index when auth lookups are missing.
  const usersIndex = await readUsersIndex().catch(() => null);
  const indexUsers = usersIndex && Array.isArray(usersIndex.users) ? usersIndex.users : [];

  const matchingUsernameEntries = indexUsers.filter(entry =>
    normalizeUsernameKey(entry.username) === normalizedUsername
  );
  for (const entry of matchingUsernameEntries) {
    if (!entry?.id || seenIds.has(entry.id)) continue;
    seenIds.add(entry.id);
    const user = await readJson<UserRecord>(`users/${entry.id}.json`);
    if (user && matchesIdentifier(user)) {
      await upsertUserAuthLookups(user).catch(() => undefined);
      return user;
    }
  }

  if (normalized.includes('@')) {
    for (const entry of indexUsers) {
      if (!entry?.id || seenIds.has(entry.id)) continue;
      seenIds.add(entry.id);
      const user = await readJson<UserRecord>(`users/${entry.id}.json`);
      if (user && matchesIdentifier(user)) {
        await upsertUserAuthLookups(user).catch(() => undefined);
        return user;
      }
    }
  }

  // Last-resort recovery: scan user records directly when both lookup and index are stale.
  const userPathnames = await listPathnames('users/').catch(() => [] as string[]);
  for (const pathname of userPathnames) {
    if (!pathname.endsWith('.json')) continue;
    const id = pathname.slice('users/'.length, -'.json'.length);
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    const user = await readJson<UserRecord>(pathname);
    if (user && matchesIdentifier(user)) {
      await upsertUserAuthLookups(user).catch(() => undefined);
      return user;
    }
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

type LookupReservationResult = {
  ok: boolean;
  reservedPathnames: string[];
  conflict?: 'email' | 'username';
};

async function reserveLookupPath(pathname: string, userId: string) {
  const record: UserLookupRecord = {
    userId,
    version: LOOKUP_RECORD_VERSION,
    updatedAt: Date.now()
  };

  try {
    await writeJson(pathname, record, { allowOverwrite: false });
    return { status: 'reserved' as const };
  } catch (error) {
    if (!isBlobAlreadyExistsError(error)) {
      throw error;
    }
  }

  const existingUserId = await readLookup(pathname);
  if (!existingUserId || existingUserId !== userId) {
    return { status: 'conflict' as const };
  }
  return { status: 'already_owned' as const };
}

export async function reserveUserAuthLookups(user: Pick<UserRecord, 'id' | 'email' | 'username'>): Promise<LookupReservationResult> {
  const reservedPathnames: string[] = [];
  const emailPath = emailLookupPath(user.email);
  const usernamePath = usernameLookupPath(user.username);

  const emailReservation = await reserveLookupPath(emailPath, user.id);
  if (emailReservation.status === 'conflict') {
    return { ok: false, conflict: 'email', reservedPathnames };
  }
  if (emailReservation.status === 'reserved') {
    reservedPathnames.push(emailPath);
  }

  const usernameReservation = await reserveLookupPath(usernamePath, user.id);
  if (usernameReservation.status === 'conflict') {
    if (reservedPathnames.length > 0) {
      await Promise.all(reservedPathnames.map(pathname => deleteJson(pathname).catch(() => undefined)));
    }
    return { ok: false, conflict: 'username', reservedPathnames: [] };
  }
  if (usernameReservation.status === 'reserved') {
    reservedPathnames.push(usernamePath);
  }

  return { ok: true, reservedPathnames };
}

export async function releaseReservedAuthLookups(pathnames: string[]): Promise<void> {
  if (!Array.isArray(pathnames) || pathnames.length === 0) return;
  await Promise.all(pathnames.map(pathname => deleteJson(pathname).catch(() => undefined)));
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
  const now = Date.now();
  if (!session || session.expiresAt <= now) {
    sendError(res, 401, 'Session expired');
    return null;
  }

  const user = await readJson<UserRecord>(`users/${session.userId}.json`);
  if (!user) {
    sendError(res, 401, 'Invalid session');
    return null;
  }

  const activeSessionId = typeof user.activeSessionId === 'string' ? user.activeSessionId : '';
  const sessionExpiresAt = Number(user.sessionExpiresAt ?? 0);

  if (activeSessionId && activeSessionId !== token) {
    const activeSession = await readJson<SessionRecord>(`sessions/${activeSessionId}.json`).catch(() => null);
    const activeStillValid = !!activeSession &&
      activeSession.userId === user.id &&
      Number(activeSession.expiresAt) > now;

    if (activeStillValid) {
      const currentCreatedAt = Number(session.createdAt ?? 0);
      const activeCreatedAt = Number(activeSession.createdAt ?? 0);
      const currentSessionIsNewer = Number.isFinite(currentCreatedAt) &&
        Number.isFinite(activeCreatedAt) &&
        currentCreatedAt >= activeCreatedAt;

      // Eventual consistency guard:
      // if the presented token is newer than the stale active pointer, accept and repair.
      if (!currentSessionIsNewer) {
        sendError(res, 401, 'Session superseded');
        return null;
      }
    }
  }

  const needsRepair =
    activeSessionId !== token ||
    !Number.isFinite(sessionExpiresAt) ||
    sessionExpiresAt < now;

  if (needsRepair) {
    const repaired: UserRecord = {
      ...user,
      activeSessionId: token,
      sessionExpiresAt: session.expiresAt,
      lastSeen: Math.max(now, Number(user.lastSeen || 0))
    };
    await writeJson(`users/${user.id}.json`, repaired).catch(error => {
      console.warn('requireAuth session repair failed', { userId: user.id, error });
    });
    return { user: repaired, token };
  }

  return { user, token };
}
