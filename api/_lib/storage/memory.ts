import type { AttackNotification, StoredBase, User } from '../types.js';
import { shuffle } from '../utils.js';

interface MemoryStore {
  users: Map<string, User>;
  usernames: Map<string, string>; // lowercase username -> userId
  bases: Map<string, StoredBase>;
  notifications: Map<string, AttackNotification[]>;
}

const globalStore = (globalThis as any).__clashMemoryStore as MemoryStore | undefined;

function createStore(): MemoryStore {
  if (globalStore) return globalStore;
  const store: MemoryStore = {
    users: new Map(),
    usernames: new Map(),
    bases: new Map(),
    notifications: new Map(),
  };
  (globalThis as any).__clashMemoryStore = store;
  return store;
}

export function createMemoryStorage() {
  const store = createStore();

  return {
    async getUser(id: string): Promise<User | null> {
      return store.users.get(id) || null;
    },

    async getUserByUsername(username: string): Promise<User | null> {
      const key = username.toLowerCase();
      const userId = store.usernames.get(key);
      if (userId) return store.users.get(userId) || null;
      for (const user of store.users.values()) {
        if (user.username.toLowerCase() === key) return user;
      }
      return null;
    },

    async createUser(user: User): Promise<void> {
      store.users.set(user.id, user);
      store.usernames.set(user.username.toLowerCase(), user.id);
    },

    async updateUser(user: User): Promise<void> {
      store.users.set(user.id, user);
      store.usernames.set(user.username.toLowerCase(), user.id);
    },

    async updateUserLogin(id: string): Promise<void> {
      const user = store.users.get(id);
      if (user) user.lastLogin = Date.now();
    },

    async deleteUser(userId: string): Promise<boolean> {
      const user = store.users.get(userId);
      if (!user) return false;
      store.users.delete(userId);
      store.usernames.delete(user.username.toLowerCase());
      store.bases.delete(userId);
      store.notifications.delete(userId);
      return true;
    },

    async getAllUsers(): Promise<Array<{ id: string; username: string }>> {
      return Array.from(store.users.values()).map((user) => ({
        id: user.id,
        username: user.username,
      }));
    },

    async getBase(userId: string): Promise<StoredBase | null> {
      return store.bases.get(userId) || null;
    },

    async saveBase(base: StoredBase): Promise<void> {
      store.bases.set(base.ownerId, base);
    },

    async getOnlineBases(excludeUserId: string, limit: number = 10): Promise<StoredBase[]> {
      const bases: StoredBase[] = [];
      for (const base of store.bases.values()) {
        if (base.ownerId === excludeUserId) continue;
        if (!base.buildings || base.buildings.length === 0) continue;
        const nonWall = base.buildings.some((b) => b.type !== 'wall');
        if (!nonWall) continue;
        bases.push(base);
      }
      return shuffle(bases).slice(0, limit);
    },

    async getAllBases(): Promise<StoredBase[]> {
      return Array.from(store.bases.values());
    },

    async addNotification(notification: AttackNotification): Promise<void> {
      const existing = store.notifications.get(notification.victimId) || [];
      existing.unshift(notification);
      if (existing.length > 50) existing.length = 50;
      store.notifications.set(notification.victimId, existing);
    },

    async getNotifications(userId: string): Promise<AttackNotification[]> {
      return store.notifications.get(userId) || [];
    },

    async markNotificationsRead(userId: string): Promise<void> {
      const notifications = store.notifications.get(userId) || [];
      notifications.forEach((notification) => {
        notification.read = true;
      });
    },

    async getUnreadCount(userId: string): Promise<number> {
      const notifications = store.notifications.get(userId) || [];
      return notifications.filter((notification) => !notification.read).length;
    },

    async deductResources(userId: string, gold: number, elixir: number): Promise<void> {
      const base = store.bases.get(userId);
      if (!base) return;
      base.resources.gold = Math.max(0, base.resources.gold - gold);
      base.resources.elixir = Math.max(0, base.resources.elixir - elixir);
      store.bases.set(userId, base);
    },

    async wipeBases(): Promise<number> {
      const count = store.bases.size;
      store.bases.clear();
      return count;
    },

    async wipeNotifications(): Promise<number> {
      const count = store.notifications.size;
      store.notifications.clear();
      return count;
    },
  };
}
