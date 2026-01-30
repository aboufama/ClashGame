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
      const goldLooted = clampNumber(toInt(body.goldLooted, 0), 0, 1_000_000_000);
      const elixirLooted = clampNumber(toInt(body.elixirLooted, 0), 0, 1_000_000_000);
      const destruction = clampNumber(toInt(body.destruction, 0), 0, 100);

      const notification = {
        id: `notif_${randomId()}`,
        victimId,
        attackerId,
        attackerName,
        goldLost: goldLooted,
        elixirLost: elixirLooted,
        destruction,
        timestamp: Date.now(),
        read: false,
      };

      await storage.addNotification(notification);

      if (goldLooted > 0 || elixirLooted > 0) {
        await storage.deductResources(victimId, goldLooted, elixirLooted);
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
      const unreadCount = await storage.getUnreadCount(userId);

      return jsonOk(res, { success: true, notifications, unreadCount });
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
