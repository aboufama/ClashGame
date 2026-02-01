import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { readJson, writeJson } from '../_lib/blob.js';
import { requireAuth } from '../_lib/auth.js';
import type { NotificationStore } from '../_lib/models.js';

interface NotificationsBody {
  action?: 'list' | 'markRead' | 'unreadCount';
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

    const body = await readJsonBody<NotificationsBody>(req);
    const action = body?.action ?? 'list';

    const notifPath = `notifications/${auth.user.id}.json`;
    const store = (await readJson<NotificationStore>(notifPath)) ?? { items: [] };

    if (action === 'markRead') {
      store.items = store.items.map(item => ({ ...item, read: true }));
      await writeJson(notifPath, store);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (action === 'unreadCount') {
      const unread = store.items.filter(item => !item.read).length;
      sendJson(res, 200, { unread });
      return;
    }

    sendJson(res, 200, { items: store.items });
  } catch (error) {
    console.error('notifications error', error);
    sendError(res, 500, 'Failed to load notifications');
  }
}
