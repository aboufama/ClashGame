import { readJson, writeJson } from './blob.js';
import type { UserIndexEntry, UsersIndex } from './models.js';

const INDEX_PATH = 'indexes/users.json';
let indexWriteQueue: Promise<void> = Promise.resolve();

async function withIndexWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = indexWriteQueue;
  let releaseCurrent!: () => void;
  const current = new Promise<void>(resolve => {
    releaseCurrent = resolve;
  });
  indexWriteQueue = previous.catch(() => undefined).then(() => current);

  await previous.catch(() => undefined);

  try {
    return await task();
  } finally {
    releaseCurrent();
  }
}

export function resetUsersIndexTestState() {
  indexWriteQueue = Promise.resolve();
}

export async function readUsersIndex(): Promise<UsersIndex> {
  try {
    const existing = await readJson<UsersIndex>(INDEX_PATH);
    if (existing && Array.isArray(existing.users)) {
      return {
        users: existing.users,
        updatedAt: Number(existing.updatedAt || Date.now())
      };
    }
  } catch (error) {
    console.warn('readUsersIndex failed, using empty fallback', error);
  }
  return { users: [], updatedAt: Date.now() };
}

export async function upsertUserIndex(entry: UserIndexEntry): Promise<void> {
  await withIndexWriteLock(async () => {
    const index = await readUsersIndex();
    const users = index.users.filter(u => u.id !== entry.id);
    users.push(entry);
    users.sort((a, b) => b.lastSeen - a.lastSeen);
    await writeJson(INDEX_PATH, { users, updatedAt: Date.now() });
  });
}

export async function removeUserFromIndex(userId: string): Promise<void> {
  await withIndexWriteLock(async () => {
    const index = await readUsersIndex();
    const users = index.users.filter(u => u.id !== userId);
    await writeJson(INDEX_PATH, { users, updatedAt: Date.now() });
  });
}
