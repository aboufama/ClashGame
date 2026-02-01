const JSON_CONTENT_TYPE = 'application/json';

function ensureBlobToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Missing BLOB_READ_WRITE_TOKEN');
  }
}

type BlobModule = typeof import('@vercel/blob');

async function getBlobModule(): Promise<BlobModule> {
  try {
    return await import('@vercel/blob');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Blob module load failed: ${message}`);
  }
}

function isBlobNotFound(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; message?: string; code?: string };
  if (err.name === 'BlobNotFoundError') return true;
  if (err.code === 'BlobNotFoundError') return true;
  if (err.message && /does not exist|not found/i.test(err.message)) return true;
  return false;
}

export async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    ensureBlobToken();
    const { head } = await getBlobModule();
    const meta = await head(pathname);
    // Add a cache-busting query parameter to bypass CDN edge caches.
    // Without this, stale data can be served for up to cacheControlMaxAge seconds.
    const url = new URL(meta.url);
    url.searchParams.set('_t', String(Date.now()));
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    if (isBlobNotFound(error)) return null;
    throw error;
  }
}

export async function writeJson<T>(pathname: string, data: T, cacheSeconds = 0): Promise<void> {
  ensureBlobToken();
  const { put } = await getBlobModule();
  await put(pathname, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: JSON_CONTENT_TYPE,
    cacheControlMaxAge: cacheSeconds
  });
}

export async function deleteJson(pathname: string): Promise<void> {
  ensureBlobToken();
  const { del } = await getBlobModule();
  await del(pathname);
}
