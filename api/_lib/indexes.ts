import { readJson, writeJson } from './blob.js';
import type { UsersIndex, UserIndexEntry } from './models.js';

const INDEX_PATH = 'indexes/users.json';

export async function readUsersIndex(): Promise<UsersIndex> {
  const existing = await readJson<UsersIndex>(INDEX_PATH);
  if (existing && Array.isArray(existing.users)) {
    return existing;
  }
  return { users: [], updatedAt: Date.now() };
}

export async function upsertUserIndex(entry: UserIndexEntry): Promise<void> {
  const index = await readUsersIndex();
  const nextUsers = index.users.filter(u => u.id !== entry.id);
  nextUsers.push(entry);
  nextUsers.sort((a, b) => b.lastSeen - a.lastSeen);
  const updated: UsersIndex = { users: nextUsers, updatedAt: Date.now() };
  await writeJson(INDEX_PATH, updated);
}

export async function removeUserFromIndex(userId: string): Promise<void> {
  const index = await readUsersIndex();
  const nextUsers = index.users.filter(u => u.id !== userId);
  const updated: UsersIndex = { users: nextUsers, updatedAt: Date.now() };
  await writeJson(INDEX_PATH, updated);
}
