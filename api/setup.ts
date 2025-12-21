import { sql } from '@vercel/postgres';

export default async function handler(request: Request) {
    try {
        // Create Users Table
        await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

        // Create Worlds Table
        await sql`
      CREATE TABLE IF NOT EXISTS worlds (
        user_id UUID PRIMARY KEY REFERENCES users(id),
        username VARCHAR(255), -- Denormalized for fast map lookups
        world_x INTEGER,
        world_y INTEGER,
        data JSONB NOT NULL,
        last_updated TIMESTAMP DEFAULT NOW()
      );
    `;

        // Enable UUID extension if not exists
        await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`;

        return new Response(JSON.stringify({ message: 'Database initialized successfully' }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
