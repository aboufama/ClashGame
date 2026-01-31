import crypto from 'crypto';

export interface PlayerResources {
  sol: number;
}

export interface SerializedBuilding {
  id: string;
  type: string;
  gridX: number;
  gridY: number;
  level: number;
}

export interface SerializedObstacle {
  id: string;
  type: string;
  gridX: number;
  gridY: number;
}

export interface SerializedWorld {
  id: string;
  ownerId: string;
  username?: string;
  buildings: SerializedBuilding[];
  obstacles?: SerializedObstacle[];
  resources: PlayerResources;
  army?: Record<string, number>;
  lastSaveTime: number;
  revision?: number;
}

export interface UserRecord {
  id: string;
  username: string;
  createdAt: number;
  lastSeen: number;
  secretHash: string;
  activeSessionId?: string;
  sessionExpiresAt?: number;
  trophies?: number;
}

export interface SessionRecord {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface WalletRecord {
  balance: number;
  updatedAt: number;
}

export interface LedgerEvent {
  id: string;
  delta: number;
  reason: string;
  refId?: string;
  time: number;
}

export interface LedgerRecord {
  events: LedgerEvent[];
}

export interface NotificationRecord {
  id: string;
  attackerId: string;
  attackerName: string;
  solLost: number;
  destruction: number;
  time: number;
  read: boolean;
}

export interface NotificationStore {
  items: NotificationRecord[];
}

export interface UserIndexEntry {
  id: string;
  username: string;
  buildingCount: number;
  lastSeen: number;
  trophies?: number;
}

export interface UsersIndex {
  users: UserIndexEntry[];
  updatedAt: number;
}

export function randomId(prefix = '') {
  return `${prefix}${crypto.randomBytes(8).toString('hex')}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function sanitizeUsername(username?: string) {
  const trimmed = (username ?? '').trim();
  if (trimmed.length >= 3) return trimmed.slice(0, 18);
  return `Player-${crypto.randomBytes(2).toString('hex')}`;
}

export function buildStarterWorld(userId: string, username: string): SerializedWorld {
  const now = Date.now();
  const cx = 11;
  const cy = 11;
  return {
    id: `world_${userId}`,
    ownerId: userId,
    username,
    buildings: [
      { id: randomId('b_'), type: 'town_hall', gridX: cx, gridY: cy, level: 1 },
      { id: randomId('b_'), type: 'cannon', gridX: cx - 3, gridY: cy, level: 1 },
      { id: randomId('b_'), type: 'barracks', gridX: cx + 4, gridY: cy, level: 1 },
      { id: randomId('b_'), type: 'army_camp', gridX: cx, gridY: cy + 4, level: 1 },
      { id: randomId('b_'), type: 'solana_collector', gridX: cx + 3, gridY: cy + 3, level: 1 }
    ],
    obstacles: [],
    resources: { sol: 1000 },
    army: {},
    lastSaveTime: now,
    revision: 1
  };
}

export function normalizeWorld(input: SerializedWorld, username: string, fallbackResources: PlayerResources): SerializedWorld {
  return {
    ...input,
    username,
    buildings: Array.isArray(input.buildings) ? input.buildings : [],
    obstacles: Array.isArray(input.obstacles) ? input.obstacles : [],
    resources: input.resources ?? fallbackResources
  };
}

export function computeBuildingCount(world: SerializedWorld): number {
  return Array.isArray(world.buildings) ? world.buildings.length : 0;
}
