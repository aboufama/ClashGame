import type { StoredBase, StoredBuilding } from './types.js';
import { randomId } from './utils.js';

export function createInitialBase(userId: string, username: string): StoredBase {
  return {
    id: userId,
    ownerId: userId,
    username,
    buildings: createStarterBuildings(),
    obstacles: [],
    resources: { sol: 200000 },
    army: {},
    lastSaveTime: Date.now(),
    schemaVersion: 1,
    revision: 1,
  };
}

export function createStarterBuildings(): StoredBuilding[] {
  const starters: Array<Omit<StoredBuilding, 'id'>> = [
    { type: 'town_hall', gridX: 12, gridY: 12, level: 1 },
    { type: 'barracks', gridX: 8, gridY: 12, level: 1 },
    { type: 'army_camp', gridX: 15, gridY: 11, level: 1 },
    { type: 'solana_collector', gridX: 10, gridY: 16, level: 1 },
    { type: 'solana_collector', gridX: 14, gridY: 16, level: 1 },
    { type: 'cannon', gridX: 9, gridY: 10, level: 1 },
    { type: 'cannon', gridX: 15, gridY: 10, level: 1 },
  ];

  return starters.map((b) => ({
    id: `starter_${b.type}_${randomId().slice(0, 8)}`,
    ...b,
  }));
}
