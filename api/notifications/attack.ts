import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Storage } from '../_storage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST - Record attack result and notify victim
  if (req.method === 'POST') {
    try {
      const {
        attackerId,
        attackerName,
        victimId,
        goldLooted,
        elixirLooted,
        destruction
      } = req.body;

      if (!victimId) {
        return res.status(400).json({ error: 'Victim ID required' });
      }

      // Skip notification for bot bases
      if (victimId.startsWith('bot_')) {
        return res.status(200).json({ success: true, skipped: true });
      }

      // Create notification
      const notification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        victimId,
        attackerId: attackerId || 'unknown',
        attackerName: attackerName || 'Unknown Attacker',
        goldLost: goldLooted || 0,
        elixirLost: elixirLooted || 0,
        destruction: destruction || 0,
        timestamp: Date.now(),
        read: false
      };

      await Storage.addNotification(notification);

      // Deduct resources from victim's stored base
      if (goldLooted > 0 || elixirLooted > 0) {
        await Storage.deductResources(victimId, goldLooted, elixirLooted);
      }

      return res.status(200).json({ success: true, notification });
    } catch (error) {
      console.error('Record attack error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET - Fetch notifications for user
  if (req.method === 'GET') {
    try {
      const userId = req.query.userId as string;

      if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
      }

      const notifications = await Storage.getNotifications(userId);
      const unreadCount = await Storage.getUnreadCount(userId);

      return res.status(200).json({
        success: true,
        notifications,
        unreadCount
      });
    } catch (error) {
      console.error('Get notifications error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PUT - Mark notifications as read
  if (req.method === 'PUT') {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
      }

      await Storage.markNotificationsRead(userId);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Mark read error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
