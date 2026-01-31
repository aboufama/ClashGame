import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, getBody, getQueryParam, jsonError, jsonOk } from '../_lib/http.js';
import { getStorage } from '../_lib/storage/index.js';
import { applyResourceDelta, clampLootAmount, findResourceTx } from '../_lib/resources.js';
import { readSessionToken, verifySession } from '../_lib/sessions.js';
import { sanitizeDisplayName } from '../_lib/validators.js';
import { clampNumber, randomId, toInt } from '../_lib/utils.js';

const MAX_LOOT_PCT = 0.2;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  const storage = getStorage();

  if (req.method === 'POST') {
    try {
      const body = getBody<Record<string, unknown>>(req);
      const victimId = typeof body.victimId === 'string' ? body.victimId : '';
      if (!victimId.trim()) {
        return jsonError(res, 400, 'Victim ID required');
      }

      if (victimId.startsWith('bot_')) {
        return jsonOk(res, { success: true, skipped: true });
      }

      const attackerId = typeof body.attackerId === 'string' ? body.attackerId : 'unknown';
      const attackerName = sanitizeDisplayName(body.attackerName, 'Unknown Attacker');
      const attackId = typeof body.attackId === 'string' && body.attackId.trim()
        ? body.attackId.trim().slice(0, 64)
        : `attack_${randomId()}`;
      const solLooted = clampNumber(toInt(body.solLooted, NaN), 0, 1_000_000_000);
      const legacyGold = clampNumber(toInt(body.goldLooted, 0), 0, 1_000_000_000);
      const legacyElixir = clampNumber(toInt(body.elixirLooted, 0), 0, 1_000_000_000);
      const totalSol = Number.isFinite(solLooted) ? solLooted : clampNumber(legacyGold + legacyElixir, 0, 1_000_000_000);
      const destruction = clampNumber(toInt(body.destruction, 0), 0, 100);

      const sessionToken = readSessionToken((body as Record<string, unknown>).sessionToken);
      if (attackerId && attackerId !== 'unknown' && !attackerId.startsWith('bot_') && !attackerId.startsWith('enemy_')) {
        const sessionCheck = await verifySession(storage, attackerId, sessionToken);
        if (!sessionCheck.ok) {
          return jsonError(res, sessionCheck.status || 401, sessionCheck.message || 'Session invalid', sessionCheck.details);
        }
      }

      const victimBase = await storage.getBase(victimId);
      const attackerBase = attackerId && attackerId !== 'unknown'
        ? await storage.getBase(attackerId)
        : null;

      let actualLoot = 0;
      let existingNotification = null as null | Record<string, unknown>;

      if (attackId) {
        const existing = await storage.getNotifications(victimId);
        existingNotification = existing.find((notif) => notif.attackId === attackId) || null;
      }

      if (victimBase && attackerBase) {
        const victimTxId = `attack:${attackId}:victim`;
        const attackerTxId = `attack:${attackId}:attacker`;
        const existingVictimTx = findResourceTx(victimBase, victimTxId);
        const existingAttackerTx = findResourceTx(attackerBase, attackerTxId);
        const existingAmount = existingVictimTx
          ? Math.abs(existingVictimTx.delta)
          : existingAttackerTx
            ? Math.abs(existingAttackerTx.delta)
            : null;

        if (existingAmount !== null) {
          actualLoot = existingAmount;
        } else if (existingNotification && typeof existingNotification.solLost === 'number') {
          actualLoot = existingNotification.solLost;
        } else {
          actualLoot = clampLootAmount(victimBase.resources.sol, totalSol, MAX_LOOT_PCT);
        }

        const victimResult = applyResourceDelta(victimBase, -actualLoot, victimTxId, 'battle_loss');
        if (victimResult.insufficient) {
          actualLoot = 0;
        }
        const attackerResult = applyResourceDelta(attackerBase, actualLoot, attackerTxId, 'battle_loot');

        if (victimResult.applied) {
          await storage.saveBase(victimBase);
        }
        if (attackerResult.applied) {
          await storage.saveBase(attackerBase);
        }
      }

      const notification = existingNotification || {
        id: `notif_${randomId()}`,
        victimId,
        attackerId,
        attackerName,
        solLost: actualLoot,
        destruction,
        ...(attackId ? { attackId } : {}),
        timestamp: Date.now(),
        read: false,
      };

      if (!existingNotification) {
        await storage.addNotification(notification);
      }

      return jsonOk(res, {
        success: true,
        notification,
        lootApplied: actualLoot,
        attackerBalance: attackerBase?.resources.sol ?? null,
        victimBalance: victimBase?.resources.sol ?? null,
      });
    } catch (error) {
      console.error('Record attack error:', error);
      return jsonError(res, 500, 'Internal server error');
    }
  }

  if (req.method === 'GET') {
    try {
      const userId = getQueryParam(req, 'userId');
      if (!userId) {
        return jsonError(res, 400, 'User ID required');
      }

      const notifications = await storage.getNotifications(userId);
      const normalized = notifications.map((notif: Record<string, unknown>) => {
        const solLost = typeof notif.solLost === 'number'
          ? notif.solLost
          : clampNumber(toInt((notif as Record<string, unknown>).goldLost, 0), 0, 1_000_000_000)
            + clampNumber(toInt((notif as Record<string, unknown>).elixirLost, 0), 0, 1_000_000_000);
        return {
          ...notif,
          solLost,
        };
      });
      const unreadCount = await storage.getUnreadCount(userId);

      return jsonOk(res, { success: true, notifications: normalized, unreadCount });
    } catch (error) {
      console.error('Get notifications error:', error);
      return jsonError(res, 500, 'Internal server error');
    }
  }

  if (req.method === 'PUT') {
    try {
      const body = getBody<{ userId?: string; sessionToken?: string }>(req);
      if (!body.userId) {
        return jsonError(res, 400, 'User ID required');
      }

      const sessionToken = readSessionToken(body.sessionToken);
      const sessionCheck = await verifySession(storage, body.userId, sessionToken);
      if (!sessionCheck.ok) {
        return jsonError(res, sessionCheck.status || 401, sessionCheck.message || 'Session invalid', sessionCheck.details);
      }

      await storage.markNotificationsRead(body.userId);
      return jsonOk(res, { success: true });
    } catch (error) {
      console.error('Mark read error:', error);
      return jsonError(res, 500, 'Internal server error');
    }
  }

  return jsonError(res, 405, 'Method not allowed');
}
