import { BlobNotFoundError, head, put, del } from '@vercel/blob';

const JSON_CONTENT_TYPE = 'application/json';

export async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    const meta = await head(pathname);
    const response = await fetch(meta.url, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

export async function writeJson<T>(pathname: string, data: T, cacheSeconds = 1): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: JSON_CONTENT_TYPE,
    cacheControlMaxAge: cacheSeconds
  });
}

export async function deleteJson(pathname: string): Promise<void> {
  await del(pathname);
}
