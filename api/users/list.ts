import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BlobStorage as Storage } from '../_blobStorage.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const users = await Storage.getAllUsers();

        // Get base info for each user to show building count
        const usersWithBases = await Promise.all(
            users.map(async (user) => {
                const base = await Storage.getBase(user.id);
                return {
                    id: user.id,
                    username: user.username,
                    buildingCount: base ? base.buildings.length : 0,
                    hasBase: !!base && base.buildings.length > 0
                };
            })
        );

        // Filter to only users with bases and sort by building count
        const validUsers = usersWithBases
            .filter(u => u.hasBase)
            .sort((a, b) => b.buildingCount - a.buildingCount);

        return res.status(200).json({
            success: true,
            users: validUsers
        });
    } catch (error) {
        console.error('List users error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
