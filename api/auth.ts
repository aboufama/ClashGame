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
        const { action, username, password } = await request.json();

        if (action === 'register') {
            // Check if exists
            const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
            if (existing.rowCount > 0) {
                return new Response(JSON.stringify({ error: 'Username taken' }), { status: 409, headers });
            }

            // Create user
            // In production, bcrypt hash the password. Here preserving plain/simple as requested for prototype.
            const result = await sql`
                INSERT INTO users (username, password)
                VALUES (${username}, ${password})
                RETURNING id, username, created_at;
            `;

            const user = result.rows[0];
            return new Response(JSON.stringify(user), { headers });
        }

        if (action === 'login') {
            const result = await sql`
                SELECT id, username FROM users 
                WHERE username = ${username} AND password = ${password}
            `;

            if (result.rowCount === 0) {
                return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers });
            }

            const user = result.rows[0];
            return new Response(JSON.stringify(user), { headers });
        }

        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
}
