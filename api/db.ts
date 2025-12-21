
import { Pool } from 'pg';

let pool: Pool;

export function getPool() {
    if (!pool) {
        if (!process.env.POSTGRES_URL) {
            throw new Error("Missing POSTGRES_URL environment variable");
        }

        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: {
                rejectUnauthorized: false // Required for some hosted Postgres providers (including Aurora often)
            },
            max: 20, // Connection pool limit
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
    }
    return pool;
}

export async function query(text: string, params?: any[]) {
    const p = getPool();
    const start = Date.now();
    const res = await p.query(text, params);
    const duration = Date.now() - start;
    // console.log('executed query', { text, duration, rows: res.rowCount });
    return res;
}
