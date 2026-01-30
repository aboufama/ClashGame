import type { StoredBase, StoredBuilding, StoredObstacle } from './types.js';
import { isValidObstacleType, isValidTroopType, normalizeBuildingType } from './game-defs.js';
import { clampNumber, toInt } from './utils.js';

const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const PASSWORD_MIN = 4;

const MAX_BUILDINGS = 2000;
const MAX_OBSTACLES = 500;
const MAX_ARMY_ENTRIES = 100;

const COORD_MIN = 0;
const COORD_MAX = 200; // generous upper bound for future map sizes
const LEVEL_MIN = 1;
const LEVEL_MAX = 100;

const SOL_MAX = 1_000_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCoord(raw: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    if (!(key in raw)) continue;
    const value = (raw as Record<string, unknown>)[key];
    const parsed = toInt(value, NaN);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

export function validateUsername(value: unknown): string | null {
  const normalized = normalizeUsername(value);
  if (!normalized) return null;
  if (normalized.length < USERNAME_MIN || normalized.length > USERNAME_MAX) return null;
  return normalized;
}

export function validatePassword(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length < PASSWORD_MIN) return null;
  return value;
}

export function sanitizeResources(value: unknown): { sol: number } {
  if (!isRecord(value)) {
    return { sol: 200000 };
  }

  if ('sol' in value) {
    const sol = clampNumber(toInt(value.sol, 200000), 0, SOL_MAX);
    return { sol };
  }

  const legacyGold = clampNumber(toInt((value as Record<string, unknown>).gold, 0), 0, SOL_MAX);
  const legacyElixir = clampNumber(toInt((value as Record<string, unknown>).elixir, 0), 0, SOL_MAX);
  return { sol: clampNumber(legacyGold + legacyElixir, 0, SOL_MAX) };
}

export function sanitizeArmy(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).slice(0, MAX_ARMY_ENTRIES);
  const army: Record<string, number> = {};
  for (const [key, raw] of entries) {
    if (typeof key !== 'string' || !key.trim()) continue;
    if (!isValidTroopType(key)) continue;
    const count = clampNumber(toInt(raw, 0), 0, 9999);
    army[key] = count;
  }
  return army;
}

export function sanitizeDisplayName(value: unknown, fallback: string = 'Unknown'): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.length > USERNAME_MAX ? trimmed.slice(0, USERNAME_MAX) : trimmed;
}

export function sanitizeBuildings(value: unknown): StoredBuilding[] {
  if (!Array.isArray(value)) return [];
  const buildings: StoredBuilding[] = [];
  for (const raw of value.slice(0, MAX_BUILDINGS)) {
    if (!isRecord(raw)) continue;
    let id: string | null = null;
    if (typeof raw.id === 'string' && raw.id.trim()) {
      id = raw.id.trim();
    } else if (typeof raw.id === 'number' && Number.isFinite(raw.id)) {
      id = String(raw.id);
    } else if (typeof raw.id === 'bigint') {
      id = raw.id.toString();
    } else if (typeof raw.uuid === 'string' && raw.uuid.trim()) {
      id = raw.uuid.trim();
    } else if (typeof raw.instanceId === 'string' && raw.instanceId.trim()) {
      id = raw.instanceId.trim();
    }

    const rawType =
      typeof raw.type === 'string' && raw.type.trim()
        ? raw.type
        : typeof raw.buildingType === 'string' && raw.buildingType.trim()
          ? raw.buildingType
          : typeof raw.kind === 'string' && raw.kind.trim()
            ? raw.kind
            : null;

    const gridX = readCoord(raw, ['gridX', 'x', 'grid_x', 'tileX', 'posX']);
    const gridY = readCoord(raw, ['gridY', 'y', 'grid_y', 'tileY', 'posY']);
    if (!id || !rawType) continue;
    if (!Number.isFinite(gridX) || !Number.isFinite(gridY)) continue;
    if (gridX < COORD_MIN || gridY < COORD_MIN || gridX > COORD_MAX || gridY > COORD_MAX) continue;
    const normalizedType = normalizeBuildingType(rawType);
    if (!normalizedType) continue;
    const level = clampNumber(
      toInt('level' in raw ? raw.level : ('lvl' in raw ? (raw as Record<string, unknown>).lvl : 1), 1),
      LEVEL_MIN,
      LEVEL_MAX
    );
    buildings.push({
      id,
      type: normalizedType,
      gridX,
      gridY,
      level,
    });
  }
  return buildings;
}

export function sanitizeObstacles(value: unknown): StoredObstacle[] {
  if (!Array.isArray(value)) return [];
  const obstacles: StoredObstacle[] = [];
  for (const raw of value.slice(0, MAX_OBSTACLES)) {
    if (!isRecord(raw)) continue;
    let id: string | null = null;
    if (typeof raw.id === 'string' && raw.id.trim()) {
      id = raw.id.trim();
    } else if (typeof raw.id === 'number' && Number.isFinite(raw.id)) {
      id = String(raw.id);
    } else if (typeof raw.id === 'bigint') {
      id = raw.id.toString();
    } else if (typeof raw.uuid === 'string' && raw.uuid.trim()) {
      id = raw.uuid.trim();
    } else if (typeof raw.instanceId === 'string' && raw.instanceId.trim()) {
      id = raw.instanceId.trim();
    }

    const rawType =
      typeof raw.type === 'string' && raw.type.trim()
        ? raw.type
        : typeof raw.obstacleType === 'string' && raw.obstacleType.trim()
          ? raw.obstacleType
          : typeof raw.kind === 'string' && raw.kind.trim()
            ? raw.kind
            : null;

    const gridX = readCoord(raw, ['gridX', 'x', 'grid_x', 'tileX', 'posX']);
    const gridY = readCoord(raw, ['gridY', 'y', 'grid_y', 'tileY', 'posY']);
    if (!id || !rawType) continue;
    if (!Number.isFinite(gridX) || !Number.isFinite(gridY)) continue;
    if (gridX < COORD_MIN || gridY < COORD_MIN || gridX > COORD_MAX || gridY > COORD_MAX) continue;
    if (!isValidObstacleType(rawType)) continue;
    obstacles.push({
      id,
      type: rawType,
      gridX,
      gridY,
    });
  }
  return obstacles;
}

export function sanitizeBasePayload(payload: Record<string, unknown>): StoredBase {
  const ownerId = typeof payload.userId === 'string' && payload.userId.trim() ? payload.userId : '';
  const username = sanitizeDisplayName(payload.username, 'Unknown');
  const buildings = sanitizeBuildings(payload.buildings);
  const obstacles = sanitizeObstacles(payload.obstacles);
  const resources = sanitizeResources(payload.resources);
  const army = sanitizeArmy(payload.army);

  return {
    id: ownerId,
    ownerId,
    username,
    buildings,
    obstacles,
    resources,
    army,
    lastSaveTime: Date.now(),
    schemaVersion: 1,
  };
}

export function summarizeBase(base: StoredBase) {
  const buildingCount = base.buildings.length;
  const nonWallCount = base.buildings.filter(b => b.type !== 'wall').length;
  return {
    ownerId: base.ownerId,
    username: base.username,
    buildingCount,
    nonWallCount,
    lastSaveTime: base.lastSaveTime,
  };
}
