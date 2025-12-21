import { sql } from '@vercel/postgres';

export default async function handler(request: Request) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers });
    }

    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');

        if (request.method === 'GET' && action === 'load') {
            const userId = searchParams.get('userId');
            if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers });

            const result = await sql`
                SELECT data FROM worlds WHERE user_id = ${userId}
            `;

            if (result.rowCount === 0) {
                return new Response(JSON.stringify({ found: false }), { headers });
            }

            return new Response(JSON.stringify(result.rows[0].data), { headers });
        }

        if (request.method === 'GET' && action === 'map') {
            // Get all worlds for map (lightweight)
            // Limit to 100 for now, optimizing later
            const result = await sql`
                SELECT user_id as id, username, world_x as "worldX", world_y as "worldY" 
                FROM worlds 
                ORDER BY last_updated DESC 
                LIMIT 100
            `;
            return new Response(JSON.stringify(result.rows), { headers });
        }

        // Attack Data Fetch (Full world by ID)
        if (request.method === 'GET' && action === 'attack') {
            const targetId = searchParams.get('targetId');
            if (!targetId) return new Response(JSON.stringify({ error: 'Missing targetId' }), { status: 400, headers });

            const result = await sql`
                SELECT data FROM worlds WHERE user_id = ${targetId}
            `;
            if (result.rowCount === 0) return new Response(JSON.stringify({ found: false }), { headers });
            return new Response(JSON.stringify(result.rows[0].data), { headers });
        }

        if (request.method === 'POST') {
            const { userId, worldData } = await request.json();

            // Extract coordinates for indexing
            const worldX = worldData.worldX || 0;
            const worldY = worldData.worldY || 0;
            const username = worldData.username;

            await sql`
                INSERT INTO worlds (user_id, username, world_x, world_y, data, last_updated)
                VALUES (${userId}, ${username}, ${worldX}, ${worldY}, ${worldData}, NOW())
                ON CONFLICT (user_id) 
                DO UPDATE SET 
                    data = ${worldData}, 
                    username = ${username},
                    world_x = ${worldX}, 
                    world_y = ${worldY},
                    last_updated = NOW();
            `;

            return new Response(JSON.stringify({ success: true }), { headers });
        }

        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
}
