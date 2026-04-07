import { EventEmitter } from 'node:events';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function blobAlreadyExistsError(pathname) {
  const error = new Error(`Blob already exists: ${pathname}`);
  error.name = 'BlobAlreadyExistsError';
  error.code = 'BlobAlreadyExistsError';
  return error;
}

export function createMemoryBlobHarness() {
  const store = new Map();
  const history = new Map();
  const stats = {
    readJson: 0,
    readJsonHistory: 0,
    writeJson: 0,
    deleteJson: 0,
    listPathnames: 0,
    deletePrefix: 0
  };

  const adapter = {
    async readJson(pathname) {
      stats.readJson += 1;
      return clone(store.get(pathname) ?? null);
    },
    async readJsonHistory(pathname, limit) {
      stats.readJsonHistory += 1;
      return (history.get(pathname) ?? []).slice(0, limit).map(clone);
    },
    async writeJson(pathname, data, options = {}) {
      stats.writeJson += 1;
      if (options.allowOverwrite === false && store.has(pathname)) {
        throw blobAlreadyExistsError(pathname);
      }
      const payload = clone(data);
      store.set(pathname, payload);
      if (options.writeHistory ?? true) {
        const existing = history.get(pathname) ?? [];
        existing.unshift(clone(payload));
        history.set(pathname, existing.slice(0, 64));
      }
    },
    async deleteJson(pathname) {
      stats.deleteJson += 1;
      store.delete(pathname);
    },
    async listPathnames(prefix) {
      stats.listPathnames += 1;
      return Array.from(store.keys())
        .filter(pathname => pathname.startsWith(prefix))
        .sort((a, b) => a.localeCompare(b));
    },
    async deletePrefix(prefix) {
      stats.deletePrefix += 1;
      for (const pathname of Array.from(store.keys())) {
        if (pathname.startsWith(prefix)) {
          store.delete(pathname);
        }
      }
    }
  };

  return {
    adapter,
    stats,
    get(pathname) {
      return clone(store.get(pathname) ?? null);
    },
    set(pathname, value) {
      store.set(pathname, clone(value));
    },
    setHistory(pathname, values) {
      history.set(pathname, values.map(clone));
    },
    getHistory(pathname) {
      return (history.get(pathname) ?? []).map(clone);
    },
    has(pathname) {
      return store.has(pathname);
    },
    pathnames(prefix = '') {
      return Array.from(store.keys())
        .filter(pathname => pathname.startsWith(prefix))
        .sort((a, b) => a.localeCompare(b));
    },
    clear() {
      store.clear();
      history.clear();
      for (const key of Object.keys(stats)) {
        stats[key] = 0;
      }
    }
  };
}

export function installBlobHarness(modules) {
  const harness = createMemoryBlobHarness();
  resetBackendTestState(modules);
  modules.blob.setBlobTestAdapter(harness.adapter);
  return harness;
}

export function resetBackendTestState(modules) {
  modules.blob.resetBlobTestAdapter();
  modules.gameState?.resetGameStateTestState?.();
  modules.indexes?.resetUsersIndexTestState?.();
  modules.usersList?.resetUsersListCacheForTests?.();
}

export function withFakeNow(initialNow, run) {
  const originalNow = Date.now;
  let now = initialNow;
  Date.now = () => now;
  const clock = {
    get now() {
      return now;
    },
    set(value) {
      now = value;
    },
    tick(delta) {
      now += delta;
      return now;
    }
  };
  return Promise.resolve()
    .then(() => run(clock))
    .finally(() => {
      Date.now = originalNow;
    });
}

export function createRequest({ method = 'POST', body, headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.body = body;
  req.headers = headers;
  return req;
}

export function createResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: undefined,
    headers,
    ended: false,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
      return this;
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    end(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    }
  };
}

export async function callHandler(handler, requestInit = {}) {
  const req = createRequest(requestInit);
  const res = createResponse();
  await handler(req, res);
  return res;
}

export function sessionCookie(token) {
  return `clash_session=${encodeURIComponent(token)}`;
}

export function seedUser(harness, {
  id,
  email = `${id}@example.com`,
  username = id,
  createdAt = Date.now(),
  lastSeen = Date.now(),
  passwordHash = 'hash',
  trophies = 0,
  activeSessionId,
  sessionExpiresAt
}) {
  const user = {
    id,
    email,
    username,
    createdAt,
    lastSeen,
    passwordHash,
    trophies,
    ...(activeSessionId ? { activeSessionId } : {}),
    ...(sessionExpiresAt ? { sessionExpiresAt } : {})
  };
  harness.set(`users/${id}.json`, user);
  return user;
}

export function seedSession(harness, {
  token,
  userId,
  createdAt = Date.now(),
  expiresAt = createdAt + 1000 * 60 * 60 * 24
}) {
  const session = { token, userId, createdAt, expiresAt };
  harness.set(`sessions/${token}.json`, session);
  const user = harness.get(`users/${userId}.json`);
  if (user) {
    harness.set(`users/${userId}.json`, {
      ...user,
      activeSessionId: token,
      sessionExpiresAt: expiresAt
    });
  }
  return session;
}
