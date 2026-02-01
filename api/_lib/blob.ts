import { BlobNotFoundError, head, put, del } from '@vercel/blob';

const JSON_CONTENT_TYPE = 'application/json';

function ensureBlobToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Missing BLOB_READ_WRITE_TOKEN');
  }
}

export async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    ensureBlobToken();
    const meta = await head(pathname);
    const response = await fetch(meta.url, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

export async function writeJson<T>(pathname: string, data: T, cacheSeconds = 60): Promise<void> {
  ensureBlobToken();
  const safeCacheSeconds = Math.max(60, cacheSeconds);
  await put(pathname, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: JSON_CONTENT_TYPE,
    cacheControlMaxAge: safeCacheSeconds
  });
}

export async function deleteJson(pathname: string): Promise<void> {
  ensureBlobToken();
  await del(pathname);
}
