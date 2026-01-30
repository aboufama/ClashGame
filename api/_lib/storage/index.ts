import type { AttackNotification, StoredBase, User } from '../types.js';
import { createBlobStorage } from './blob.js';
import { createMemoryStorage } from './memory.js';

export interface StorageProvider {
  getUser(id: string): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  createUser(user: User): Promise<void>;
  updateUser(user: User): Promise<void>;
  updateUserLogin(id: string): Promise<void>;
  deleteUser(userId: string): Promise<boolean>;
  getAllUsers(): Promise<Array<{ id: string; username: string }>>;

  getBase(userId: string): Promise<StoredBase | null>;
  saveBase(base: StoredBase): Promise<void>;
  getOnlineBases(excludeUserId: string, limit?: number): Promise<StoredBase[]>;
  getAllBases(): Promise<StoredBase[]>;

  addNotification(notification: AttackNotification): Promise<void>;
  getNotifications(userId: string): Promise<AttackNotification[]>;
  markNotificationsRead(userId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;

  deductResources(userId: string, sol: number): Promise<void>;
  wipeBases(): Promise<number>;
  wipeNotifications(): Promise<number>;
}

let cachedStorage: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (cachedStorage) return cachedStorage;

  const explicit = process.env.CLASH_STORAGE;
  if (explicit === 'memory') {
    cachedStorage = createMemoryStorage();
    return cachedStorage;
  }
  if (explicit === 'blob') {
    cachedStorage = createBlobStorage();
    return cachedStorage;
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    cachedStorage = createBlobStorage();
  } else {
    cachedStorage = createMemoryStorage();
  }

  return cachedStorage;
}
