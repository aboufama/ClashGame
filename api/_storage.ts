// Simple in-memory storage for Vercel serverless functions
// In production, replace with Vercel KV or Postgres

interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
  lastLogin: number;
}

interface StoredBase {
  id: string;
  ownerId: string;
  username: string;
  buildings: any[];
  obstacles?: any[];
  resources: { gold: number; elixir: number };
  army?: Record<string, number>;
  lastSaveTime: number;
}

interface AttackNotification {
  id: string;
  victimId: string;
  attackerId: string;
  attackerName: string;
  goldLost: number;
  elixirLost: number;
  destruction: number;
  timestamp: number;
  read: boolean;
}

// Global storage (persists between warm invocations)
const globalStorage = (globalThis as any).__clashStorage || {
  users: new Map<string, User>(),
  bases: new Map<string, StoredBase>(),
  notifications: new Map<string, AttackNotification[]>(),
};
(globalThis as any).__clashStorage = globalStorage;

export const Storage = {
  // User operations
  async getUser(id: string): Promise<User | null> {
    return globalStorage.users.get(id) || null;
  },

  async getUserByUsername(username: string): Promise<User | null> {
    for (const user of globalStorage.users.values()) {
      if (user.username.toLowerCase() === username.toLowerCase()) {
        return user;
      }
    }
    return null;
  },

  async createUser(user: User): Promise<void> {
    globalStorage.users.set(user.id, user);
  },

  async updateUserLogin(id: string): Promise<void> {
    const user = globalStorage.users.get(id);
    if (user) {
      user.lastLogin = Date.now();
    }
  },

  // Base operations
  async getBase(userId: string): Promise<StoredBase | null> {
    return globalStorage.bases.get(userId) || null;
  },

  async saveBase(base: StoredBase): Promise<void> {
    globalStorage.bases.set(base.ownerId, base);
  },

  async getOnlineBases(excludeUserId: string, limit: number = 10): Promise<StoredBase[]> {
    const bases: StoredBase[] = [];
    for (const base of globalStorage.bases.values()) {
      if (base.ownerId !== excludeUserId && base.buildings.length > 0) {
        bases.push(base);
      }
    }
    // Shuffle and limit
    const shuffled = bases.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, limit);
  },

  async getAllBases(): Promise<StoredBase[]> {
    return Array.from(globalStorage.bases.values());
  },

  // Notification operations
  async addNotification(notification: AttackNotification): Promise<void> {
    const existing = globalStorage.notifications.get(notification.victimId) || [];
    existing.unshift(notification);
    // Keep only last 50 notifications
    if (existing.length > 50) existing.length = 50;
    globalStorage.notifications.set(notification.victimId, existing);
  },

  async getNotifications(userId: string): Promise<AttackNotification[]> {
    return globalStorage.notifications.get(userId) || [];
  },

  async markNotificationsRead(userId: string): Promise<void> {
    const notifications = globalStorage.notifications.get(userId);
    if (notifications) {
      notifications.forEach((n: AttackNotification) => n.read = true);
    }
  },

  async getUnreadCount(userId: string): Promise<number> {
    const notifications = globalStorage.notifications.get(userId) || [];
    return notifications.filter((n: AttackNotification) => !n.read).length;
  },

  // Delete user account and all associated data
  async deleteUser(userId: string): Promise<boolean> {
    const user = globalStorage.users.get(userId);
    if (!user) return false;

    // Delete user
    globalStorage.users.delete(userId);
    // Delete their base
    globalStorage.bases.delete(userId);
    // Delete their notifications
    globalStorage.notifications.delete(userId);

    return true;
  },

  // Loot operations - deduct resources from victim after attack
  async deductResources(userId: string, gold: number, elixir: number): Promise<void> {
    const base = globalStorage.bases.get(userId);
    if (base) {
      base.resources.gold = Math.max(0, base.resources.gold - gold);
      base.resources.elixir = Math.max(0, base.resources.elixir - elixir);
    }
  }
};

// Simple hash function for passwords (in production, use bcrypt)
export function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16) + '_' + password.length;
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}
