import type { StoredBase } from './types.js';
import { randomId } from './utils.js';

export function createInitialBase(userId: string, username: string): StoredBase {
  return {
    id: userId,
    ownerId: userId,
    username,
    buildings: [
      {
        id: `th_${randomId().slice(0, 8)}`,
        type: 'town_hall',
        gridX: 12,
        gridY: 12,
        level: 1,
      },
    ],
    obstacles: [],
    resources: { sol: 200000 },
    army: {},
    lastSaveTime: Date.now(),
    schemaVersion: 1,
    revision: 1,
  };
}
