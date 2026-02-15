import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { readJson, writeJson } from '../_lib/blob.js';
import { requireAuth, sanitizeId } from '../_lib/auth.js';
import {
  clamp,
  sanitizeBuilding,
  sanitizeUsername,
  type AttackReplayFrame,
  type AttackReplayRecord,
  type AttackReplayStatus,
  type LiveAttackSession,
  type LiveAttackStore,
  type SerializedBuilding,
  type SerializedWorld
} from '../_lib/models.js';

const MAX_REPLAY_FRAMES = 900;
const LIVE_STALE_MS = 25_000;

type ReplayAction = 'start' | 'frame' | 'end' | 'incoming' | 'state' | 'replay';

interface ReplayBody {
  action?: ReplayAction;
  attackId?: string;
  victimId?: string;
  attackerId?: string;
  attackerName?: string;
  enemyWorld?: Partial<SerializedWorld> | null;
  frame?: Partial<AttackReplayFrame> | null;
  status?: AttackReplayStatus;
  destruction?: number;
  solLooted?: number;
  afterT?: number;
  limit?: number;
}

function sanitizeAttackId(input: unknown) {
  const raw = String(input ?? '').trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
  return cleaned.length > 0 ? cleaned : '';
}

function replayPath(attackId: string) {
  return `attack_replays/${attackId}.json`;
}

function livePath(victimId: string) {
  return `attack_live/${victimId}.json`;
}

function sanitizeEnemyWorld(input: Partial<SerializedWorld> | null | undefined, victimId: string, attackerName: string): SerializedWorld | null {
  if (!input || !Array.isArray(input.buildings) || input.buildings.length === 0) return null;

  const buildings = input.buildings
    .map(raw => {
      const candidate = raw as Partial<SerializedBuilding>;
      return sanitizeBuilding({
        id: String(candidate.id ?? ''),
        type: String(candidate.type ?? ''),
        gridX: Number(candidate.gridX ?? 0) || 0,
        gridY: Number(candidate.gridY ?? 0) || 0,
        level: Number(candidate.level ?? 1) || 1
      });
    })
    .filter(building => typeof building.type === 'string' && building.type.length > 0);

  if (buildings.length === 0) return null;

  return {
    id: String(input.id || `replay_world_${victimId}`).slice(0, 120),
    ownerId: victimId,
    username: sanitizeUsername(input.username || attackerName || 'Enemy'),
    buildings,
    obstacles: [],
    resources: { sol: Math.max(0, Math.floor(Number(input.resources?.sol ?? 0) || 0)) },
    army: {},
    wallLevel: Math.max(1, Math.floor(Number(input.wallLevel ?? 1) || 1)),
    lastSaveTime: Date.now(),
    revision: 1
  };
}

function sanitizeReplayFrame(frame: Partial<AttackReplayFrame> | null | undefined): AttackReplayFrame {
  const safeFrame = frame ?? {};
  const buildings = Array.isArray(safeFrame.buildings)
    ? safeFrame.buildings
      .map(entry => {
        const id = String((entry as { id?: unknown }).id ?? '').trim().slice(0, 96);
        if (!id) return null;
        return {
          id,
          health: Math.max(0, Math.floor(Number((entry as { health?: unknown }).health ?? 0) || 0)),
          isDestroyed: Boolean((entry as { isDestroyed?: unknown }).isDestroyed)
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : [];

  const troops = Array.isArray(safeFrame.troops)
    ? safeFrame.troops
      .map(entry => {
        const id = String((entry as { id?: unknown }).id ?? '').trim().slice(0, 96);
        if (!id) return null;
        const type = String((entry as { type?: unknown }).type ?? '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (!type) return null;
        const ownerRaw = String((entry as { owner?: unknown }).owner ?? 'PLAYER').toUpperCase();
        const owner = ownerRaw === 'ENEMY' ? 'ENEMY' : 'PLAYER';
        return {
          id,
          type,
          level: Math.max(1, Math.floor(Number((entry as { level?: unknown }).level ?? 1) || 1)),
          owner,
          gridX: Number((entry as { gridX?: unknown }).gridX ?? 0) || 0,
          gridY: Number((entry as { gridY?: unknown }).gridY ?? 0) || 0,
          health: Math.max(0, Number((entry as { health?: unknown }).health ?? 0) || 0),
          maxHealth: Math.max(1, Number((entry as { maxHealth?: unknown }).maxHealth ?? 1) || 1),
          recursionGen: Number.isFinite(Number((entry as { recursionGen?: unknown }).recursionGen))
            ? Math.max(0, Math.floor(Number((entry as { recursionGen?: unknown }).recursionGen)))
            : undefined,
          facingAngle: Number.isFinite(Number((entry as { facingAngle?: unknown }).facingAngle))
            ? Number((entry as { facingAngle?: unknown }).facingAngle)
            : undefined,
          hasTakenDamage: Boolean((entry as { hasTakenDamage?: unknown }).hasTakenDamage)
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : [];

  return {
    t: Math.max(0, Math.floor(Number(safeFrame.t ?? 0) || 0)),
    destruction: clamp(Number(safeFrame.destruction ?? 0), 0, 100),
    solLooted: Math.max(0, Math.floor(Number(safeFrame.solLooted ?? 0) || 0)),
    buildings,
    troops
  };
}

async function readReplay(attackId: string) {
  return await readJson<AttackReplayRecord>(replayPath(attackId));
}

async function writeReplay(record: AttackReplayRecord) {
  await writeJson(replayPath(record.attackId), record);
}

async function readLiveStore(victimId: string): Promise<LiveAttackStore> {
  return (await readJson<LiveAttackStore>(livePath(victimId))) ?? { sessions: [] };
}

async function writeLiveStore(victimId: string, store: LiveAttackStore) {
  await writeJson(livePath(victimId), store);
}

async function upsertLiveSession(victimId: string, session: LiveAttackSession) {
  const store = await readLiveStore(victimId);
  const nextSessions = store.sessions.filter(item => item.attackId !== session.attackId);
  nextSessions.unshift(session);
  store.sessions = nextSessions.slice(0, 8);
  await writeLiveStore(victimId, store);
}

async function removeLiveSession(victimId: string, attackId: string) {
  const store = await readLiveStore(victimId);
  const next = store.sessions.filter(item => item.attackId !== attackId);
  if (next.length === store.sessions.length) return;
  store.sessions = next;
  await writeLiveStore(victimId, store);
}

function toFinalStatus(status: AttackReplayStatus | undefined): AttackReplayStatus {
  return status === 'aborted' ? 'aborted' : 'finished';
}

function isParticipant(replay: AttackReplayRecord, userId: string) {
  return replay.attackerId === userId || replay.victimId === userId;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const body = await readJsonBody<ReplayBody>(req);
    const action = body.action ?? 'incoming';

    if (action === 'incoming') {
      const userId = auth.user.id;
      const now = Date.now();
      const store = await readLiveStore(userId);
      const sessions = store.sessions
        .filter(session => now - session.updatedAt <= LIVE_STALE_MS)
        .sort((a, b) => b.updatedAt - a.updatedAt);

      if (sessions.length !== store.sessions.length) {
        await writeLiveStore(userId, { sessions });
      }

      sendJson(res, 200, { sessions });
      return;
    }

    const attackId = sanitizeAttackId(body.attackId);
    if (!attackId) {
      sendError(res, 400, 'attackId required');
      return;
    }

    if (action === 'start') {
      const victimId = body.victimId ? sanitizeId(body.victimId) : '';
      if (!victimId) {
        sendError(res, 400, 'victimId required');
        return;
      }
      if (victimId === auth.user.id) {
        sendError(res, 400, 'Cannot attack yourself');
        return;
      }
      if (body.attackerId && sanitizeId(body.attackerId) !== auth.user.id) {
        sendError(res, 403, 'Invalid attacker');
        return;
      }

      const existing = await readReplay(attackId);
      if (existing) {
        if (!isParticipant(existing, auth.user.id)) {
          sendError(res, 403, 'Forbidden');
          return;
        }
        if (existing.status === 'live') {
          await upsertLiveSession(victimId, {
            attackId: existing.attackId,
            attackerId: existing.attackerId,
            attackerName: existing.attackerName,
            victimId: existing.victimId,
            startedAt: existing.startedAt,
            updatedAt: Date.now()
          });
        }
        sendJson(res, 200, { ok: true, replay: existing });
        return;
      }

      const attackerName = sanitizeUsername(body.attackerName || auth.user.username);
      const enemyWorld = sanitizeEnemyWorld(body.enemyWorld, victimId, attackerName);
      if (!enemyWorld) {
        sendError(res, 400, 'enemyWorld required');
        return;
      }

      const now = Date.now();
      const replay: AttackReplayRecord = {
        attackId,
        attackerId: auth.user.id,
        attackerName,
        victimId,
        victimName: enemyWorld.username,
        status: 'live',
        startedAt: now,
        updatedAt: now,
        enemyWorld,
        frames: []
      };

      await writeReplay(replay);
      await upsertLiveSession(victimId, {
        attackId,
        attackerId: replay.attackerId,
        attackerName: replay.attackerName,
        victimId,
        startedAt: replay.startedAt,
        updatedAt: replay.updatedAt
      });

      sendJson(res, 200, { ok: true, replay });
      return;
    }

    const replay = await readReplay(attackId);
    if (!replay) {
      sendError(res, 404, 'Replay not found');
      return;
    }

    if (!isParticipant(replay, auth.user.id)) {
      sendError(res, 403, 'Forbidden');
      return;
    }

    if (action === 'frame') {
      if (replay.attackerId !== auth.user.id) {
        sendError(res, 403, 'Only attacker can publish frames');
        return;
      }

      if (replay.status !== 'live') {
        sendJson(res, 200, { ok: true, frameCount: replay.frames.length });
        return;
      }

      const frame = sanitizeReplayFrame(body.frame);
      replay.frames.push(frame);
      if (replay.frames.length > MAX_REPLAY_FRAMES) {
        replay.frames = replay.frames.slice(replay.frames.length - MAX_REPLAY_FRAMES);
      }
      replay.updatedAt = Date.now();

      await writeReplay(replay);
      await upsertLiveSession(replay.victimId, {
        attackId: replay.attackId,
        attackerId: replay.attackerId,
        attackerName: replay.attackerName,
        victimId: replay.victimId,
        startedAt: replay.startedAt,
        updatedAt: replay.updatedAt
      });

      sendJson(res, 200, { ok: true, frameCount: replay.frames.length });
      return;
    }

    if (action === 'end') {
      if (replay.attackerId !== auth.user.id) {
        sendError(res, 403, 'Only attacker can end replay session');
        return;
      }

      const now = Date.now();
      replay.updatedAt = now;
      replay.endedAt = now;
      replay.status = toFinalStatus(body.status);
      replay.finalResult = {
        destruction: clamp(Number(body.destruction ?? replay.finalResult?.destruction ?? 0), 0, 100),
        solLooted: Math.max(0, Math.floor(Number(body.solLooted ?? replay.finalResult?.solLooted ?? 0) || 0))
      };

      await writeReplay(replay);
      await removeLiveSession(replay.victimId, replay.attackId);

      sendJson(res, 200, { ok: true });
      return;
    }

    if (action === 'state') {
      const latestFrame = replay.frames.length > 0 ? replay.frames[replay.frames.length - 1] : null;
      const afterT = Number(body.afterT);
      const hasAfterT = Number.isFinite(afterT);
      const requestedLimit = Math.floor(Number(body.limit) || 0);
      const limit = Math.max(1, Math.min(180, requestedLimit || 36));
      let frames: typeof replay.frames = [];

      if (replay.frames.length > 0) {
        if (hasAfterT) {
          frames = replay.frames.filter(frame => frame.t > afterT).slice(0, limit);
        } else {
          frames = replay.frames.slice(Math.max(0, replay.frames.length - limit));
        }
      }

      sendJson(res, 200, {
        replay: {
          attackId: replay.attackId,
          attackerId: replay.attackerId,
          attackerName: replay.attackerName,
          victimId: replay.victimId,
          victimName: replay.victimName,
          status: replay.status,
          startedAt: replay.startedAt,
          updatedAt: replay.updatedAt,
          endedAt: replay.endedAt,
          enemyWorld: replay.enemyWorld,
          finalResult: replay.finalResult,
          frameCount: replay.frames.length,
          latestFrame,
          frames
        }
      });
      return;
    }

    if (action === 'replay') {
      sendJson(res, 200, { replay });
      return;
    }

    sendError(res, 400, 'Unknown action');
  } catch (error) {
    console.error('attack replay error', error);
    sendError(res, 500, 'Failed to process replay request');
  }
}
