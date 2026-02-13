import type { SerializedWorld } from '../data/Models';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

interface AuthResponse {
  user: AuthUser;
  world?: SerializedWorld | null;
}

interface SessionResponse {
  authenticated?: boolean;
  user?: AuthUser;
  world?: SerializedWorld | null;
}

const STORAGE_KEY = 'clash.auth';

function loadStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.username !== 'string' || typeof parsed.email !== 'string') {
      return null;
    }
    return {
      id: parsed.id,
      username: parsed.username,
      email: parsed.email
    };
  } catch {
    return null;
  }
}

function saveStoredUser(user: AuthUser) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    credentials: 'same-origin'
  });
  if (!response.ok) {
    const raw = await response.text();
    let message = `Request failed: ${response.status}`;
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch {
      if (raw) message = raw;
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin'
  });
  if (!response.ok) {
    const raw = await response.text();
    let message = `Request failed: ${response.status}`;
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch {
      if (raw) message = raw;
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export class Auth {
  private static current: AuthUser | null = null;
  private static online = false;

  static getCurrentUser() {
    return Auth.current;
  }

  static isOnlineMode() {
    return Auth.online;
  }

  static async ensureUser(): Promise<{ user: AuthUser | null; online: boolean; world: SerializedWorld | null }> {
    const stored = loadStoredUser();
    if (stored) {
      Auth.current = stored;
    }

    try {
      const session = await getJson<SessionResponse>('/api/auth/session');
      if (!session.authenticated || !session.user) {
        throw new Error('No active session');
      }
      saveStoredUser(session.user);
      Auth.current = session.user;
      Auth.online = true;
      return { user: session.user, online: true, world: session.world ?? null };
    } catch (error) {
      const expectedUnauthenticated = error instanceof Error && (
        error.message.includes('401') ||
        error.message.includes('Missing auth session') ||
        error.message.includes('Session expired') ||
        error.message.includes('Session superseded') ||
        error.message.includes('Invalid session')
      );
      if (!expectedUnauthenticated && error instanceof Error) {
        console.warn('Auth offline mode:', error.message);
      } else if (!expectedUnauthenticated) {
        console.warn('Auth offline mode:', error);
      }
      Auth.online = false;
      if (stored) {
        Auth.current = stored;
        return { user: stored, online: false, world: null };
      }
      Auth.current = null;
      return { user: null, online: false, world: null };
    }
  }

  static async login(identifier: string, password: string): Promise<{ user: AuthUser; world: SerializedWorld | null }> {
    const login = await postJson<AuthResponse>('/api/auth/login', {
      identifier,
      password
    });
    saveStoredUser(login.user);
    Auth.current = login.user;
    Auth.online = true;
    return {
      user: login.user,
      world: login.world ?? null
    };
  }

  static async register(email: string, username: string, password: string): Promise<{ user: AuthUser; world: SerializedWorld | null }> {
    const registered = await postJson<AuthResponse>('/api/auth/register', {
      email,
      username,
      password
    });
    saveStoredUser(registered.user);
    Auth.current = registered.user;
    Auth.online = true;
    return {
      user: registered.user,
      world: registered.world ?? null
    };
  }

  static async logout(): Promise<void> {
    try {
      await postJson('/api/auth/logout', {});
    } catch (error) {
      const expectedUnauthenticated = error instanceof Error && error.message.includes('401');
      if (!expectedUnauthenticated) {
        console.warn('Logout request failed:', error);
      }
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    Auth.current = null;
    Auth.online = false;
  }
}
