import type { VercelRequest, VercelResponse } from '@vercel/node';

export function allowCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function handleOptions(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    allowCors(res);
    res.status(204).end();
    return true;
  }
  return false;
}

export function sendJson(res: VercelResponse, status: number, data: unknown) {
  allowCors(res);
  res.status(status).json(data);
}

export function sendError(res: VercelResponse, status: number, message: string, details?: unknown) {
  sendJson(res, status, details ? { error: message, details } : { error: message });
}

export async function readJsonBody<T>(req: VercelRequest): Promise<T> {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      return JSON.parse(req.body) as T;
    }
    return req.body as T;
  }

  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(data) as T);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}
