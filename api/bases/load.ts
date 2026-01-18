import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BlobStorage as Storage } from '../_blobStorage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    const base = await Storage.getBase(userId);

    if (!base) {
      return res.status(404).json({ error: 'Base not found' });
    }

    return res.status(200).json({
      success: true,
      base: base
    });
  } catch (error) {
    console.error('Load base error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
