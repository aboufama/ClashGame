import type { VercelRequest, VercelResponse } from '@vercel/node';

export function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.status(200).end();
    return true;
  }
  return false;
}

export function requireMethod(req: VercelRequest, res: VercelResponse, method: string): boolean {
  if (req.method !== method) {
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }
  return true;
}

export function getBody<T extends Record<string, unknown>>(req: VercelRequest): T {
  if (req.body && typeof req.body === 'object') return req.body as T;
  return {} as T;
}

export function getQueryParam(req: VercelRequest, key: string): string | null {
  const raw = req.query[key];
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === 'string') return raw;
  return null;
}

export function jsonOk(res: VercelResponse, payload: unknown, status: number = 200): void {
  res.status(status).json(payload);
}

export function jsonError(res: VercelResponse, status: number, message: string, details?: string): void {
  res.status(status).json({ error: message, ...(details ? { details } : {}) });
}
