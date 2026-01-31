import type { StorageProvider } from './storage/index.js';
import type { User } from './types.js';

export function readSessionToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  if (!token) return null;
  return token.length > 256 ? token.slice(0, 256) : token;
}

export async function verifySession(storage: StorageProvider, userId: string, token: string | null): Promise<{
  ok: boolean;
  user?: User;
  status?: number;
  message?: string;
  details?: string;
}> {
  const user = await storage.getUser(userId);
  if (!user) {
    return { ok: false, status: 404, message: 'User not found' };
  }

  const storedToken = typeof user.sessionToken === 'string' ? user.sessionToken.trim() : '';
  if (!storedToken) {
    // Legacy accounts without a session token are allowed until they log in again.
    return { ok: true, user };
  }

  if (!token) {
    return { ok: false, status: 401, message: 'Session token required', details: 'SESSION_REQUIRED' };
  }

  if (token !== storedToken) {
    return { ok: false, status: 401, message: 'Session invalid', details: 'SESSION_INVALID' };
  }

  return { ok: true, user };
}
