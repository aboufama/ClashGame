import type { StoredBase } from './types.js';

export function createInitialBase(userId: string, username: string): StoredBase {
  return {
    id: userId,
    ownerId: userId,
    username,
    buildings: [],
    obstacles: [],
    resources: { sol: 200000 },
    army: {},
    lastSaveTime: Date.now(),
    schemaVersion: 1,
    revision: 1,
  };
}
