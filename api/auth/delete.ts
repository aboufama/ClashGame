import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BlobStorage as Storage, verifyPassword } from '../_blobStorage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { userId, password } = req.body;

        if (!userId || !password) {
            return res.status(400).json({ error: 'User ID and password required' });
        }

        // Verify the user exists and password is correct
        const user = await Storage.getUser(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!verifyPassword(password, user.passwordHash)) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        // Delete the account
        const deleted = await Storage.deleteUser(userId);
        if (!deleted) {
            return res.status(500).json({ error: 'Failed to delete account' });
        }

        return res.status(200).json({
            success: true,
            message: 'Account deleted successfully'
        });
    } catch (error) {
        console.error('Delete account error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
