import { del, list, put } from '@vercel/blob';
import type { AttackNotification, StoredBase, User } from '../types.js';
import { shuffle } from '../utils.js';

const JSON_HEADERS = { 'content-type': 'application/json' } as const;
const USERS_PREFIX = 'users/';
const BASES_PREFIX = 'bases/';
const NOTIFICATIONS_PREFIX = 'notifications/';
const USERNAME_INDEX_PATH = 'indexes/usernames.json';

async function fetchBlobJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: JSON_HEADERS });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function putJson(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

async function listAll(prefix: string, maxItems: number = 2000): Promise<Array<{ url: string; pathname: string }>> {
  const blobs: Array<{ url: string; pathname: string }> = [];
  let cursor: string | undefined;
  let remaining = maxItems;

  while (remaining > 0) {
    const result = await list({ prefix, limit: Math.min(1000, remaining), cursor });
    blobs.push(...result.blobs.map((blob) => ({ url: blob.url, pathname: blob.pathname })));
    if (!result.hasMore) break;
    cursor = result.cursor;
    remaining -= result.blobs.length;
    if (!cursor) break;
  }

  return blobs;
}

async function findBlobUrl(pathname: string): Promise<string | null> {
  try {
    const result = await list({ prefix: pathname, limit: 1 });
    const match = result.blobs.find((blob) => blob.pathname === pathname);
    return match?.url ?? null;
  } catch {
    return null;
  }
}

async function loadUsernameIndex(): Promise<Record<string, string>> {
  const url = await findBlobUrl(USERNAME_INDEX_PATH);
  if (!url) return {};
  const data = await fetchBlobJson<Record<string, string>>(url);
  return data || {};
}

async function saveUsernameIndex(index: Record<string, string>): Promise<void> {
  await putJson(USERNAME_INDEX_PATH, index);
}

export function createBlobStorage() {
  const getUser = async (id: string): Promise<User | null> => {
    const url = await findBlobUrl(`${USERS_PREFIX}${id}.json`);
    if (!url) return null;
    return fetchBlobJson<User>(url);
  };

  const updateUser = async (user: User): Promise<void> => {
    await putJson(`${USERS_PREFIX}${user.id}.json`, user);
    try {
      const index = await loadUsernameIndex();
      index[user.username.toLowerCase()] = user.id;
      await saveUsernameIndex(index);
    } catch {
      // best effort only
    }
  };

  const getBase = async (userId: string): Promise<StoredBase | null> => {
    const url = await findBlobUrl(`${BASES_PREFIX}${userId}.json`);
    if (!url) return null;
    return fetchBlobJson<StoredBase>(url);
  };

  const saveBase = async (base: StoredBase): Promise<void> => {
    await putJson(`${BASES_PREFIX}${base.ownerId}.json`, base);
  };

  const getNotifications = async (userId: string): Promise<AttackNotification[]> => {
    const url = await findBlobUrl(`${NOTIFICATIONS_PREFIX}${userId}.json`);
    if (!url) return [];
    const notifications = await fetchBlobJson<AttackNotification[]>(url);
    return notifications || [];
  };

  return {
    getUser,

    async getUserByUsername(username: string): Promise<User | null> {
      const key = username.toLowerCase();
      try {
        const index = await loadUsernameIndex();
        const userId = index[key];
        if (userId) {
          return await getUser(userId);
        }
      } catch {
        // fall through to scan
      }

      try {
        const blobs = await listAll(USERS_PREFIX, 2000);
        for (const blob of blobs) {
          const user = await fetchBlobJson<User>(blob.url);
          if (user && user.username.toLowerCase() === key) {
            return user;
          }
        }
      } catch {
        return null;
      }

      return null;
    },

    async createUser(user: User): Promise<void> {
      await putJson(`${USERS_PREFIX}${user.id}.json`, user);
      try {
        const index = await loadUsernameIndex();
        index[user.username.toLowerCase()] = user.id;
        await saveUsernameIndex(index);
      } catch {
        // best effort only
      }
    },

    updateUser,

    async updateUserLogin(id: string): Promise<void> {
      const user = await getUser(id);
      if (!user) return;
      user.lastLogin = Date.now();
      await updateUser(user);
    },

    async deleteUser(userId: string): Promise<boolean> {
      try {
        const user = await getUser(userId);
        const userUrl = await findBlobUrl(`${USERS_PREFIX}${userId}.json`);
        if (userUrl) await del(userUrl);

        const baseUrl = await findBlobUrl(`${BASES_PREFIX}${userId}.json`);
        if (baseUrl) await del(baseUrl);

        const notifUrl = await findBlobUrl(`${NOTIFICATIONS_PREFIX}${userId}.json`);
        if (notifUrl) await del(notifUrl);

        if (user) {
          try {
            const index = await loadUsernameIndex();
            delete index[user.username.toLowerCase()];
            await saveUsernameIndex(index);
          } catch {
            // best effort
          }
        }

        return true;
      } catch {
        return false;
      }
    },

    async getAllUsers(): Promise<Array<{ id: string; username: string }>> {
      try {
        const index = await loadUsernameIndex();
        const entries = Object.entries(index);
        if (entries.length > 0) {
          return entries.map(([username, id]) => ({ id, username }));
        }
      } catch {
        // fallback
      }

      try {
        const blobs = await listAll(USERS_PREFIX, 2000);
        const users: Array<{ id: string; username: string }> = [];
        for (const blob of blobs) {
          const user = await fetchBlobJson<User>(blob.url);
          if (user) {
            users.push({ id: user.id, username: user.username });
          }
        }
        return users;
      } catch {
        return [];
      }
    },

    getBase,

    saveBase,

    async getOnlineBases(excludeUserId: string, limit: number = 10): Promise<StoredBase[]> {
      try {
        const blobs = await listAll(BASES_PREFIX, 1000);
        const shuffled = shuffle(blobs);
        const bases: StoredBase[] = [];
        for (const blob of shuffled) {
          if (bases.length >= limit * 3) break;
          const base = await fetchBlobJson<StoredBase>(blob.url);
          if (!base) continue;
          if (base.ownerId === excludeUserId) continue;
          if (!base.buildings || base.buildings.length === 0) continue;
          const nonWall = base.buildings.some((b) => b.type !== 'wall');
          if (!nonWall) continue;
          bases.push(base);
        }
        return shuffle(bases).slice(0, limit);
      } catch {
        return [];
      }
    },

    async getAllBases(): Promise<StoredBase[]> {
      try {
        const blobs = await listAll(BASES_PREFIX, 2000);
        const bases: StoredBase[] = [];
        for (const blob of blobs) {
          const base = await fetchBlobJson<StoredBase>(blob.url);
          if (base) bases.push(base);
        }
        return bases;
      } catch {
        return [];
      }
    },

    async addNotification(notification: AttackNotification): Promise<void> {
      const existing = await getNotifications(notification.victimId);
      existing.unshift(notification);
      if (existing.length > 50) existing.length = 50;
      await putJson(`${NOTIFICATIONS_PREFIX}${notification.victimId}.json`, existing);
    },

    getNotifications,

    async markNotificationsRead(userId: string): Promise<void> {
      const notifications = await getNotifications(userId);
      if (!notifications.length) return;
      notifications.forEach((notification) => { notification.read = true; });
      await putJson(`${NOTIFICATIONS_PREFIX}${userId}.json`, notifications);
    },

    async getUnreadCount(userId: string): Promise<number> {
      const notifications = await getNotifications(userId);
      return notifications.filter((notification) => !notification.read).length;
    },

    async deductResources(userId: string, sol: number): Promise<void> {
      const base = await getBase(userId);
      if (!base) return;
      const resources = base.resources as unknown as Record<string, unknown>;
      if (typeof resources.sol !== 'number') {
        const legacyGold = typeof resources.gold === 'number' ? resources.gold : 0;
        const legacyElixir = typeof resources.elixir === 'number' ? resources.elixir : 0;
        base.resources = { sol: legacyGold + legacyElixir };
      }
      base.resources.sol = Math.max(0, base.resources.sol - sol);
      await saveBase(base);
    },

    async wipeBases(): Promise<number> {
      const blobs = await listAll(BASES_PREFIX, 2000);
      if (!blobs.length) return 0;
      await del(blobs.map((blob) => blob.url));
      return blobs.length;
    },

    async wipeNotifications(): Promise<number> {
      const blobs = await listAll(NOTIFICATIONS_PREFIX, 2000);
      if (!blobs.length) return 0;
      await del(blobs.map((blob) => blob.url));
      return blobs.length;
    },
  };
}
