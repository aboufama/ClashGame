import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BlobStorage as Storage, verifyPassword } from '../_blobStorage.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await Storage.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Update last login
    await Storage.updateUserLogin(user.id);

    // Get user's base
    const base = await Storage.getBase(user.id);

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        lastLogin: Date.now()
      },
      base: base
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
