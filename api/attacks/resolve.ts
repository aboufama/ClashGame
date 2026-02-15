import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { readJson, writeJson } from '../_lib/blob.js';
import { requireAuth, sanitizeId } from '../_lib/auth.js';
import { appendResourceDeltaEvent, ensurePlayerState, materializeState } from '../_lib/game_state.js';
import { clamp, type AttackReplayRecord, type LiveAttackStore, type NotificationStore, type UserRecord } from '../_lib/models.js';

interface ResolveBody {
  victimId?: string;
  attackerId?: string;
  attackerName?: string;
  solLooted?: number;
  destruction?: number;
  attackId?: string;
}

interface AttackResult {
  lootApplied: number;
  attackerBalance: number;
  attackerRevision?: number;
}

function attackEventKey(attackId: string, side: 'victim' | 'attacker') {
  return `attack:${attackId}:${side}`;
}

async function finalizeReplayResult(
  attackId: string,
  victimId: string,
  lootApplied: number,
  destruction: number
) {
  const replayPath = `attack_replays/${attackId}.json`;
  const replay = await readJson<AttackReplayRecord>(replayPath);
  if (replay && replay.victimId === victimId) {
    const now = Date.now();
    replay.status = 'finished';
    replay.updatedAt = now;
    replay.endedAt = now;
    replay.finalResult = {
      destruction: clamp(Number(destruction), 0, 100),
      solLooted: Math.max(0, Math.floor(Number(lootApplied) || 0))
    };
    await writeJson(replayPath, replay);
  }

  const livePath = `attack_live/${victimId}.json`;
  const live = await readJson<LiveAttackStore>(livePath);
  if (!live || !Array.isArray(live.sessions)) return;
  const next = live.sessions.filter(session => session.attackId !== attackId);
  if (next.length === live.sessions.length) return;
  live.sessions = next;
  await writeJson(livePath, live);
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

    const body = await readJsonBody<ResolveBody>(req);
    const victimId = body.victimId ? sanitizeId(body.victimId) : '';
    const attackerId = body.attackerId ? sanitizeId(body.attackerId) : '';

    if (!victimId || !attackerId) {
      sendError(res, 400, 'victimId and attackerId required');
      return;
    }

    if (attackerId !== auth.user.id) {
      sendError(res, 403, 'Invalid attacker');
      return;
    }

    if (victimId === attackerId) {
      sendError(res, 400, 'Cannot attack yourself');
      return;
    }

    const attackId = body.attackId?.trim();
    if (attackId) {
      const existing = await readJson<AttackResult>(`attacks/${attackId}.json`);
      if (existing) {
        sendJson(res, 200, existing);
        return;
      }
    }

    const victimUser = await readJson<UserRecord>(`users/${victimId}.json`);
    if (!victimUser) {
      sendError(res, 404, 'Victim not found');
      return;
    }

    const now = Date.now();

    await Promise.all([
      ensurePlayerState(victimId, victimUser.username),
      ensurePlayerState(attackerId, auth.user.username)
    ]);

    const [victimState, attackerState] = await Promise.all([
      materializeState(victimId, victimUser.username, now),
      materializeState(attackerId, auth.user.username, now)
    ]);

    const requestedLoot = Number(body.solLooted ?? 0);
    const lootApplied = clamp(Math.floor(Number.isFinite(requestedLoot) ? requestedLoot : 0), 0, victimState.balance);

    if (lootApplied > 0) {
      const victimRequestKey = attackId ? attackEventKey(attackId, 'victim') : undefined;
      const attackerRequestKey = attackId ? attackEventKey(attackId, 'attacker') : undefined;

      if (!victimRequestKey || !victimState.requestKeys.has(victimRequestKey)) {
        await appendResourceDeltaEvent(victimId, -lootApplied, 'raid_loss', attackId, victimRequestKey);
      }

      if (!attackerRequestKey || !attackerState.requestKeys.has(attackerRequestKey)) {
        await appendResourceDeltaEvent(attackerId, lootApplied, 'raid_loot', attackId, attackerRequestKey);
      }
    }

    const attackerAfter = await materializeState(attackerId, auth.user.username, Date.now());

    const destruction = clamp(Number(body.destruction ?? 0), 0, 100);

    if (attackId) {
      await finalizeReplayResult(attackId, victimId, lootApplied, destruction).catch(error => {
        console.warn('Failed to finalize replay state during resolve', { attackId, victimId, error });
      });
    }

    const notifPath = `notifications/${victimId}.json`;
    const notifications = (await readJson<NotificationStore>(notifPath)) ?? { items: [] };
    const notificationId = attackId || `atk_${Date.now().toString(36)}`;
    const alreadyExists = notifications.items.some(item => item.id === notificationId);

    if (!alreadyExists) {
      notifications.items.unshift({
        id: notificationId,
        attackId: attackId || notificationId,
        attackerId,
        attackerName: body.attackerName?.trim() || auth.user.username || 'Unknown',
        solLost: lootApplied,
        destruction,
        time: Date.now(),
        read: false,
        replayAvailable: Boolean(attackId)
      });

      if (notifications.items.length > 50) {
        notifications.items = notifications.items.slice(0, 50);
      }

      await writeJson(notifPath, notifications);
    }

    const result: AttackResult = {
      lootApplied,
      attackerBalance: attackerAfter.balance,
      attackerRevision: attackerAfter.revision
    };

    if (attackId) {
      await writeJson(`attacks/${attackId}.json`, result);
    }

    sendJson(res, 200, result);
  } catch (error) {
    console.error('attack resolve error', error);
    sendError(res, 500, 'Failed to resolve attack');
  }
}
