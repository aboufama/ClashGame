export interface AuthUser {
  id: string;
  username: string;
  deviceSecret: string;
  token?: string;
  tokenExpiresAt?: number;
}

interface AuthResponse {
  user: { id: string; username: string };
  token: string;
  expiresAt: number;
}

const STORAGE_KEY = 'clash.auth';

function randomHex(bytes: number) {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    return Array.from({ length: bytes }, () => Math.floor(Math.random() * 256))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function loadStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function saveStoredUser(user: AuthUser) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
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

  static getToken() {
    return Auth.current?.token ?? null;
  }

  static async ensureUser(): Promise<{ user: AuthUser; online: boolean }> {
    let user = loadStoredUser();
    if (!user) {
      user = {
        id: `p_${randomHex(6)}`,
        username: `Commander-${randomHex(2)}`,
        deviceSecret: randomHex(16)
      };
      saveStoredUser(user);
    }

    const now = Date.now();
    const tokenExpired = !user.token || (user.tokenExpiresAt ?? 0) < now;

    if (tokenExpired) {
      try {
        const login = await postJson<AuthResponse>('/api/auth/login', {
          playerId: user.id,
          deviceSecret: user.deviceSecret
        });
        user = { ...user, token: login.token, tokenExpiresAt: login.expiresAt, username: login.user.username };
        saveStoredUser(user);
        Auth.online = true;
      } catch {
        try {
          const registered = await postJson<AuthResponse>('/api/auth/register', {
            playerId: user.id,
            username: user.username,
            deviceSecret: user.deviceSecret
          });
          user = { ...user, token: registered.token, tokenExpiresAt: registered.expiresAt, username: registered.user.username };
          saveStoredUser(user);
          Auth.online = true;
        } catch (error) {
          console.warn('Auth offline mode:', error);
          Auth.online = false;
        }
      }
    } else {
      Auth.online = true;
    }

    Auth.current = user;
    return { user, online: Auth.online };
  }

  static async login(playerId: string, deviceSecret: string): Promise<AuthUser> {
    const login = await postJson<AuthResponse>('/api/auth/login', {
      playerId,
      deviceSecret
    });
    const user: AuthUser = {
      id: login.user.id,
      username: login.user.username,
      deviceSecret,
      token: login.token,
      tokenExpiresAt: login.expiresAt
    };
    saveStoredUser(user);
    Auth.current = user;
    Auth.online = true;
    return user;
  }

  static async register(username: string, playerId?: string, deviceSecret?: string): Promise<AuthUser> {
    const secret = deviceSecret && deviceSecret.trim().length > 0 ? deviceSecret.trim() : randomHex(16);
    const payload: { playerId?: string; username: string; deviceSecret: string } = {
      username,
      deviceSecret: secret
    };
    if (playerId) payload.playerId = playerId;
    const registered = await postJson<AuthResponse>('/api/auth/register', payload);
    const user: AuthUser = {
      id: registered.user.id,
      username: registered.user.username,
      deviceSecret: secret,
      token: registered.token,
      tokenExpiresAt: registered.expiresAt
    };
    saveStoredUser(user);
    Auth.current = user;
    Auth.online = true;
    return user;
  }

  static async logout(): Promise<void> {
    const token = Auth.current?.token;
    if (token) {
      try {
        await postJson('/api/auth/logout', {}, token);
      } catch (error) {
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
