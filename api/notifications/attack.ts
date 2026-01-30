import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, getBody, getQueryParam, jsonError, jsonOk } from '../_lib/http.js';
import { getStorage } from '../_lib/storage/index.js';
import { clampNumber, randomId, toInt } from '../_lib/utils.js';

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
      const attackerName = typeof body.attackerName === 'string' ? body.attackerName : 'Unknown Attacker';
      const solLooted = clampNumber(toInt(body.solLooted, NaN), 0, 1_000_000_000);
      const legacyGold = clampNumber(toInt(body.goldLooted, 0), 0, 1_000_000_000);
      const legacyElixir = clampNumber(toInt(body.elixirLooted, 0), 0, 1_000_000_000);
      const totalSol = Number.isFinite(solLooted) ? solLooted : clampNumber(legacyGold + legacyElixir, 0, 1_000_000_000);
      const destruction = clampNumber(toInt(body.destruction, 0), 0, 100);

      const notification = {
        id: `notif_${randomId()}`,
        victimId,
        attackerId,
        attackerName,
        solLost: totalSol,
        destruction,
        timestamp: Date.now(),
        read: false,
      };

      await storage.addNotification(notification);

      if (totalSol > 0) {
        await storage.deductResources(victimId, totalSol);
      }

      return jsonOk(res, { success: true, notification });
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
      const body = getBody<{ userId?: string }>(req);
      if (!body.userId) {
        return jsonError(res, 400, 'User ID required');
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
