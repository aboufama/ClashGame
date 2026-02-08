import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendJson } from '../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  try {
    const mod = await import('@vercel/blob');
    const result = await mod.list({ limit: 1 });
    sendJson(res, 200, {
      ok: true,
      blobs: result.blobs.length,
      hasMore: result.hasMore
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, {
      ok: false,
      error: message
    });
  }
}
