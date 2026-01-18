import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BlobStorage as Storage, hashPassword } from '../_blobStorage.js';

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

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    // Check if username already exists
    const existing = await Storage.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    // Create user
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const user = {
      id: userId,
      username: username.trim(),
      passwordHash: hashPassword(password),
      createdAt: Date.now(),
      lastLogin: Date.now()
    };

    await Storage.createUser(user);

    // Create initial base for user
    const initialBase = {
      id: userId,
      ownerId: userId,
      username: username.trim(),
      buildings: [],
      obstacles: [],
      resources: { gold: 100000, elixir: 100000 },
      army: {},
      lastSaveTime: Date.now()
    };
    await Storage.saveBase(initialBase);

    return res.status(201).json({
      success: true,
      user: {
        id: userId,
        username: user.username,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({
      error: 'Registration failed',
      details: errorMessage,
      hint: 'Check if BLOB_READ_WRITE_TOKEN is configured in Vercel'
    });
  }
}
