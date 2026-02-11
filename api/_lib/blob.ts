import crypto from 'crypto';

const JSON_CONTENT_TYPE = 'application/json';
const HISTORY_ROOT = '__history/json';
const HISTORY_KEEP_VERSIONS = 12;

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
    return decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    return null;
  }
}

function normalizePathname(pathname: string) {
  return String(pathname || '').replace(/^\/+/, '');
}

function historyPrefix(pathname: string) {
  const normalized = normalizePathname(pathname);
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return `${HISTORY_ROOT}/${hash}/`;
}

function historyPathname(pathname: string) {
  const suffix = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.json`;
  return `${historyPrefix(pathname)}${suffix}`;
}

function blobUploadedAtMs(value: unknown) {
  if (value instanceof Date) return value.getTime();
  const parsed = Number(new Date(String(value || '')).getTime());
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 0;
}

async function fetchJsonFromBlobUrl<T>(urlString: string): Promise<T | null> {
  const url = new URL(urlString);
  url.searchParams.set('_t', String(Date.now()));
  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

type VersionedJsonEntry<T> = {
  pathname: string;
  uploadedAtMs: number;
  value: T;
};

async function readVersionedJsonEntries<T>(pathname: string, limit: number): Promise<Array<VersionedJsonEntry<T>>> {
  ensureBlobToken();
  const { list } = await getBlobModule();
  const prefix = historyPrefix(pathname);

  const blobs: Array<{ pathname: string; url: string; uploadedAtMs: number }> = [];
  let cursor: string | undefined;

  for (;;) {
    const page = await list({ prefix, limit: 1000, cursor });
    for (const blob of page.blobs) {
      const blobPathname = pathnameFromBlobItem(blob);
      if (!blobPathname || typeof blob.url !== 'string' || !blob.url) continue;
      blobs.push({
        pathname: blobPathname,
        url: blob.url,
        uploadedAtMs: blobUploadedAtMs((blob as { uploadedAt?: unknown }).uploadedAt)
      });
    }
    if (!page.hasMore || !page.cursor) break;
    cursor = page.cursor;
  }

  blobs.sort((a, b) => {
    if (b.uploadedAtMs !== a.uploadedAtMs) return b.uploadedAtMs - a.uploadedAtMs;
    return b.pathname.localeCompare(a.pathname);
  });

  const out: Array<VersionedJsonEntry<T>> = [];
  for (const blob of blobs) {
    if (out.length >= limit) break;
    const value = await fetchJsonFromBlobUrl<T>(blob.url).catch(() => null);
    if (value === null) continue;
    out.push({
      pathname: blob.pathname,
      uploadedAtMs: blob.uploadedAtMs,
      value
    });
  }
  return out;
}

async function pruneHistory(pathname: string): Promise<void> {
  ensureBlobToken();
  const { list, del } = await getBlobModule();
  const prefix = historyPrefix(pathname);

  const blobs: Array<{ pathname: string; uploadedAtMs: number }> = [];
  let cursor: string | undefined;

  for (;;) {
    const page = await list({ prefix, limit: 1000, cursor });
    for (const blob of page.blobs) {
      const blobPathname = pathnameFromBlobItem(blob);
      if (!blobPathname) continue;
      blobs.push({
        pathname: blobPathname,
        uploadedAtMs: blobUploadedAtMs((blob as { uploadedAt?: unknown }).uploadedAt)
      });
    }
    if (!page.hasMore || !page.cursor) break;
    cursor = page.cursor;
  }

  if (blobs.length <= HISTORY_KEEP_VERSIONS) return;

  blobs.sort((a, b) => {
    if (b.uploadedAtMs !== a.uploadedAtMs) return b.uploadedAtMs - a.uploadedAtMs;
    return b.pathname.localeCompare(a.pathname);
  });

  const stale = blobs.slice(HISTORY_KEEP_VERSIONS).map(blob => blob.pathname);
  if (stale.length > 0) {
    await del(stale);
  }
}

async function deleteHistory(pathname: string): Promise<void> {
  ensureBlobToken();
  const { del } = await getBlobModule();
  const historyPathnames = await listPathnames(historyPrefix(pathname));
  if (historyPathnames.length === 0) return;
  await del(historyPathnames);
}

export async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    const entries = await readVersionedJsonEntries<T>(pathname, 1);
    if (entries.length > 0) return entries[0].value;

    ensureBlobToken();
    const { head } = await getBlobModule();
    const meta = await head(pathname);
    return await fetchJsonFromBlobUrl<T>(meta.url);
  } catch (error) {
    if (isBlobNotFound(error)) return null;
    throw error;
  }
}

export async function readJsonHistory<T>(pathname: string, limit = 8): Promise<T[]> {
  const safeLimit = Math.max(1, Math.min(40, Math.floor(Number(limit) || 8)));
  const entries = await readVersionedJsonEntries<T>(pathname, safeLimit).catch(error => {
    if (isBlobNotFound(error)) return [];
    throw error;
  });
  return entries.map(entry => entry.value);
}

export async function writeJson<T>(pathname: string, data: T, options: WriteOptions = {}): Promise<void> {
  ensureBlobToken();
  const { put } = await getBlobModule();
  const cacheSeconds = options.cacheSeconds ?? 0;
  const allowOverwrite = options.allowOverwrite ?? true;
  const addRandomSuffix = options.addRandomSuffix ?? false;
  const payload = JSON.stringify(data);

  await put(pathname, payload, {
    access: 'public',
    addRandomSuffix,
    allowOverwrite,
    contentType: JSON_CONTENT_TYPE,
    cacheControlMaxAge: cacheSeconds
  });

  try {
    await put(historyPathname(pathname), payload, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: JSON_CONTENT_TYPE,
      cacheControlMaxAge: cacheSeconds
    });
    void pruneHistory(pathname).catch(error => {
      console.warn('blob history prune failed', { pathname, error });
    });
  } catch (error) {
    console.warn('blob history write failed', { pathname, error });
  }
}

export async function deleteJson(pathname: string): Promise<void> {
  ensureBlobToken();
  const { del } = await getBlobModule();
  await del(pathname).catch(error => {
    if (isBlobNotFound(error)) return;
    throw error;
  });
  await deleteHistory(pathname).catch(error => {
    if (isBlobNotFound(error)) return;
    throw error;
  });
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
  await Promise.all(
    pathnames.map(pathname =>
      deleteHistory(pathname).catch(error => {
        if (!isBlobNotFound(error)) {
          console.warn('blob history delete failed', { pathname, error });
        }
      })
    )
  );
}
