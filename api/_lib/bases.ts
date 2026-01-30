import type { StoredBase } from './types.js';

export function createInitialBase(userId: string, username: string): StoredBase {
  return {
    id: userId,
    ownerId: userId,
    username,
    buildings: [],
    obstacles: [],
    resources: { gold: 100000, elixir: 100000 },
    army: {},
    lastSaveTime: Date.now(),
    schemaVersion: 1,
  };
}
