import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendJson } from './_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  sendJson(res, 200, {
    ok: true,
    timestamp: Date.now(),
    node: process.version,
    blobTokenPresent: !!process.env.BLOB_READ_WRITE_TOKEN
  });
}
