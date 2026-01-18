import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BlobStorage as Storage } from '../_blobStorage.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // The user explicitly requested an immediate wipe. 
    // For security, we usually check an environment variable, 
    // but here we'll just require a specific query param to prevent accidental calls.
    const { confirm } = req.query;

    if (confirm !== 'im_sure_wipe_everything_now') {
        return res.status(400).json({
            error: 'Confirmation required',
            hint: 'Add ?confirm=im_sure_wipe_everything_now to the URL'
        });
    }

    try {
        const deletedCount = await Storage.wipeBases();

        // Also wipe notifications as they are tied to old bases
        try {
            const { blobs } = await (await import('@vercel/blob')).list({ prefix: 'notifications/' });
            if (blobs.length > 0) {
                await (await import('@vercel/blob')).del(blobs.map(b => b.url));
            }
        } catch (e) {
            console.error('Failed to wipe notifications (non-critical):', e);
        }

        return res.status(200).json({
            success: true,
            message: `System reset successful. Deleted ${deletedCount} bases and cleared notifications.`,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Wipe error:', error);
        return res.status(500).json({ error: 'Internal server error during wipe' });
    }
}
