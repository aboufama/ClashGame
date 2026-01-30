import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, getBody, getQueryParam, jsonError, jsonOk } from '../_lib/http.js';
import { getStorage } from '../_lib/storage/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  if (!(req.method === 'GET' || req.method === 'POST')) {
    return jsonError(res, 405, 'Method not allowed');
  }

  const confirm = getQueryParam(req, 'confirm') || getBody<{ confirm?: string }>(req).confirm;
  if (confirm !== 'im_sure_wipe_everything_now') {
    return jsonError(res, 400, 'Confirmation required', 'Add ?confirm=im_sure_wipe_everything_now to the URL');
  }

  try {
    const storage = getStorage();
    const deletedCount = await storage.wipeBases();
    const notifDeleted = await storage.wipeNotifications();

    return jsonOk(res, {
      success: true,
      message: `System reset successful. Deleted ${deletedCount} bases and cleared ${notifDeleted} notification sets.`,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Wipe error:', error);
    return jsonError(res, 500, 'Internal server error during wipe');
  }
}
