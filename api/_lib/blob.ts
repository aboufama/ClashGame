const JSON_CONTENT_TYPE = 'application/json';

type BlobModule = typeof import('@vercel/blob');

type WriteOptions = {
  cacheSeconds?: number;
  allowOverwrite?: boolean;
  addRandomSuffix?: boolean;
};

function ensureBlobToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Missing BLOB_READ_WRITE_TOKEN');
  }
}

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

function pathnameFromBlobItem(item: { pathname?: string; url?: string }) {
  if (item.pathname) return item.pathname;
  if (!item.url) return null;
  try {
    const url = new URL(item.url);
    const path = url.pathname.replace(/^\//, '');
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

export async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    ensureBlobToken();
    const { head } = await getBlobModule();
    const meta = await head(pathname);
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

export async function writeJson<T>(pathname: string, data: T, options: WriteOptions = {}): Promise<void> {
  ensureBlobToken();
  const { put } = await getBlobModule();
  const cacheSeconds = options.cacheSeconds ?? 0;
  const allowOverwrite = options.allowOverwrite ?? true;
  const addRandomSuffix = options.addRandomSuffix ?? false;

  await put(pathname, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix,
    allowOverwrite,
    contentType: JSON_CONTENT_TYPE,
    cacheControlMaxAge: cacheSeconds
  });
}

export async function deleteJson(pathname: string): Promise<void> {
  ensureBlobToken();
  const { del } = await getBlobModule();
  await del(pathname);
}

export async function listPathnames(prefix: string): Promise<string[]> {
  ensureBlobToken();
  const { list } = await getBlobModule();

  const out: string[] = [];
  let cursor: string | undefined;

  for (;;) {
    const page = await list({ prefix, limit: 1000, cursor });
    for (const blob of page.blobs) {
      const pathname = pathnameFromBlobItem(blob);
      if (pathname) out.push(pathname);
    }
    if (!page.hasMore || !page.cursor) break;
    cursor = page.cursor;
  }

  return out;
}

export async function deletePrefix(prefix: string): Promise<void> {
  const pathnames = await listPathnames(prefix);
  if (pathnames.length === 0) return;
  ensureBlobToken();
  const { del } = await getBlobModule();
  await del(pathnames);
}
