import { query } from './db';

export default async function handler(request: Request) {
  try {
    // Enable UUID extension first (needed for uuids)
    await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Create Users Table
    await query(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                username VARCHAR(255) UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

    // Create Worlds Table
    await query(`
            CREATE TABLE IF NOT EXISTS worlds (
                user_id UUID PRIMARY KEY REFERENCES users(id),
                username VARCHAR(255),
                world_x INTEGER,
                world_y INTEGER,
                data JSONB NOT NULL,
                last_updated TIMESTAMP DEFAULT NOW()
            )
        `);

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
