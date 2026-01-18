import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BlobStorage as Storage } from '../_blobStorage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, username, buildings, obstacles, resources, army } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    const base = {
      id: userId,
      ownerId: userId,
      username: username || 'Unknown',
      buildings: buildings || [],
      obstacles: obstacles || [],
      resources: resources || { gold: 100000, elixir: 100000 },
      army: army || {},
      lastSaveTime: Date.now()
    };

    await Storage.saveBase(base);

    return res.status(200).json({
      success: true,
      lastSaveTime: base.lastSaveTime
    });
  } catch (error) {
    console.error('Save base error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
