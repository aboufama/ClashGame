import { readJson, writeJson } from './blob.js';
import type { UserIndexEntry, UsersIndex } from './models.js';

const INDEX_PATH = 'indexes/users.json';

export async function readUsersIndex(): Promise<UsersIndex> {
  const existing = await readJson<UsersIndex>(INDEX_PATH);
  if (existing && Array.isArray(existing.users)) {
    return {
      users: existing.users,
      updatedAt: Number(existing.updatedAt || Date.now())
    };
  }
  return { users: [], updatedAt: Date.now() };
}

export async function upsertUserIndex(entry: UserIndexEntry): Promise<void> {
  const index = await readUsersIndex();
  const users = index.users.filter(u => u.id !== entry.id);
  users.push(entry);
  users.sort((a, b) => b.lastSeen - a.lastSeen);
  await writeJson(INDEX_PATH, { users, updatedAt: Date.now() });
}

export async function removeUserFromIndex(userId: string): Promise<void> {
  const index = await readUsersIndex();
  const users = index.users.filter(u => u.id !== userId);
  await writeJson(INDEX_PATH, { users, updatedAt: Date.now() });
}
