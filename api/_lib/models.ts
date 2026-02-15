import crypto from 'crypto';

export const STARTING_BALANCE = 1000;
export const MAX_BALANCE = 1_000_000_000;

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
  wallLevel?: number;
  lastSaveTime: number;
  revision?: number;
}

export interface UserRecord {
  id: string;
  email: string;
  username: string;
  createdAt: number;
  lastSeen: number;
  passwordHash: string;
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

export interface NotificationRecord {
  id: string;
  attackId?: string;
  attackerId: string;
  attackerName: string;
  solLost: number;
  destruction: number;
  time: number;
  read: boolean;
  replayAvailable?: boolean;
}

export interface NotificationStore {
  items: NotificationRecord[];
}

export type AttackReplayStatus = 'live' | 'finished' | 'aborted';

export interface AttackReplayBuildingState {
  id: string;
  health: number;
  isDestroyed: boolean;
}

export interface AttackReplayTroopState {
  id: string;
  type: string;
  level: number;
  owner: 'PLAYER' | 'ENEMY';
  gridX: number;
  gridY: number;
  health: number;
  maxHealth: number;
  recursionGen?: number;
  facingAngle?: number;
  hasTakenDamage?: boolean;
}

export interface AttackReplayTroopPathPoint {
  t: number;
  gridX: number;
  gridY: number;
  health: number;
  facingAngle?: number;
  hasTakenDamage?: boolean;
}

export interface AttackReplayTroopPath {
  id: string;
  type: string;
  level: number;
  owner: 'PLAYER' | 'ENEMY';
  maxHealth: number;
  recursionGen?: number;
  points: AttackReplayTroopPathPoint[];
}

export interface AttackReplayFrame {
  t: number;
  destruction: number;
  solLooted: number;
  buildings: AttackReplayBuildingState[];
  troops: AttackReplayTroopState[];
  troopPaths?: AttackReplayTroopPath[];
}

export interface AttackReplayFinalResult {
  destruction: number;
  solLooted: number;
}

export interface AttackReplayRecord {
  attackId: string;
  attackerId: string;
  attackerName: string;
  victimId: string;
  victimName?: string;
  status: AttackReplayStatus;
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  enemyWorld: SerializedWorld;
  frames: AttackReplayFrame[];
  finalResult?: AttackReplayFinalResult;
}

export interface LiveAttackSession {
  attackId: string;
  attackerId: string;
  attackerName: string;
  victimId: string;
  startedAt: number;
  updatedAt: number;
}

export interface LiveAttackStore {
  sessions: LiveAttackSession[];
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

export interface GameSnapshot {
  schemaVersion: 1;
  createdAt: number;
  world: SerializedWorld;
  baseBalance: number;
}

export interface WorldPatch {
  upsertBuildings: SerializedBuilding[];
  removeBuildingIds: string[];
  upsertObstacles: SerializedObstacle[];
  removeObstacleIds: string[];
  army?: Record<string, number>;
  wallLevel?: number;
}

export interface WorldPatchEventPayload {
  patch: WorldPatch;
}

export interface ResourceDeltaEventPayload {
  delta: number;
  reason: string;
  refId?: string;
}

export type GameEventPayload = WorldPatchEventPayload | ResourceDeltaEventPayload;

export type GameEventKind = 'world_patch' | 'resource_delta';

export interface GameEvent {
  id: string;
  kind: GameEventKind;
  at: number;
  requestKey?: string;
  payload: GameEventPayload;
}

export interface MaterializedState {
  world: SerializedWorld;
  balance: number;
  revision: number;
  lastMutationAt: number;
  productionSinceLastMutation: number;
  requestKeys: Set<string>;
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

function toFiniteInt(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

export function sanitizeBuilding(input: SerializedBuilding): SerializedBuilding {
  return {
    id: String(input.id || randomId('b_')).slice(0, 80),
    type: String(input.type || 'town_hall').slice(0, 64),
    gridX: toFiniteInt(input.gridX, 0),
    gridY: toFiniteInt(input.gridY, 0),
    level: Math.max(1, toFiniteInt(input.level, 1))
  };
}

export function sanitizeObstacle(input: SerializedObstacle): SerializedObstacle {
  return {
    id: String(input.id || randomId('o_')).slice(0, 80),
    type: String(input.type || 'rock_small').slice(0, 64),
    gridX: toFiniteInt(input.gridX, 0),
    gridY: toFiniteInt(input.gridY, 0)
  };
}

export function sanitizeArmy(input: Record<string, number> | undefined): Record<string, number> {
  if (!input || typeof input !== 'object') return {};
  const entries = Object.entries(input)
    .map(([type, count]) => [String(type), Math.max(0, toFiniteInt(count, 0))] as const)
    .filter(([, count]) => count > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const normalized: Record<string, number> = {};
  for (const [type, count] of entries) normalized[type] = count;
  return normalized;
}

export function normalizeWorldInput(input: SerializedWorld, ownerId: string, username: string): SerializedWorld {
  const buildings = Array.isArray(input.buildings) ? input.buildings.map(sanitizeBuilding) : [];
  const obstacles = Array.isArray(input.obstacles) ? input.obstacles.map(sanitizeObstacle) : [];
  const maxPlacedWallLevel = buildings.reduce((max, building) => {
    if (building.type !== 'wall') return max;
    return Math.max(max, building.level ?? 1);
  }, 1);
  const storedWallLevel = toFiniteInt(input.wallLevel, maxPlacedWallLevel);
  const wallLevel = Math.max(1, storedWallLevel);
  const requestedSol = toFiniteInt(input.resources?.sol, STARTING_BALANCE);
  const sol = clamp(requestedSol, 0, MAX_BALANCE);

  return {
    id: String(input.id || `world_${ownerId}`).slice(0, 120),
    ownerId,
    username,
    buildings,
    obstacles,
    resources: { sol },
    army: sanitizeArmy(input.army),
    wallLevel,
    lastSaveTime: toFiniteInt(input.lastSaveTime, Date.now())
  };
}

export function worldHasTownHall(world: SerializedWorld) {
  return world.buildings.some(b => b.type === 'town_hall');
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
    resources: { sol: STARTING_BALANCE },
    army: {},
    wallLevel: 1,
    lastSaveTime: now,
    revision: 1
  };
}

export function isWorldPatchEmpty(patch: WorldPatch): boolean {
  const hasArmy = typeof patch.army !== 'undefined';
  const hasWallLevel = typeof patch.wallLevel !== 'undefined';
  return (
    patch.upsertBuildings.length === 0 &&
    patch.removeBuildingIds.length === 0 &&
    patch.upsertObstacles.length === 0 &&
    patch.removeObstacleIds.length === 0 &&
    !hasArmy &&
    !hasWallLevel
  );
}
