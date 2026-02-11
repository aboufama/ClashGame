import { useCallback, useEffect, useRef, useState } from 'react';

interface LeaderboardUser {
  id: string;
  username: string;
  buildingCount: number;
}

interface LeaderboardPanelProps {
  currentUserId: string;
  isOnline: boolean;
  onAttackUser: (userId: string, username: string) => void;
  onScoutUser: (userId: string, username: string) => void;
}

interface LeaderboardCacheRecord {
  users: LeaderboardUser[];
  fetchedAt: number;
}

const CACHE_KEY = 'clash.leaderboard.cache.v1';
const REFRESH_INTERVAL_MS = 15000;
const REQUEST_TIMEOUT_MS = 4500;
const REQUEST_RETRIES = 3;
const RETRY_BACKOFF_MS = 180;

let memoryCache: LeaderboardCacheRecord | null = null;

function isLeaderboardUser(value: unknown): value is LeaderboardUser {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LeaderboardUser>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.username === 'string' &&
    Number.isFinite(Number(candidate.buildingCount))
  );
}

function normalizeUsers(input: unknown): LeaderboardUser[] {
  if (!Array.isArray(input)) return [];
  const deduped = new Map<string, LeaderboardUser>();
  input
    .filter(isLeaderboardUser)
    .map(user => ({
      id: user.id,
      username: user.username,
      buildingCount: Math.max(0, Math.floor(Number(user.buildingCount)))
    }))
    .forEach(user => {
      const key = user.username.trim().toLowerCase() || `id:${user.id}`;
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, user);
        return;
      }
      if (user.buildingCount > existing.buildingCount) {
        deduped.set(key, user);
      }
    });
  return Array.from(deduped.values());
}

function readCache(): LeaderboardCacheRecord | null {
  if (memoryCache) return memoryCache;
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LeaderboardCacheRecord>;
    const users = normalizeUsers(parsed.users);
    if (users.length === 0) return null;

    const fetchedAt = Number(parsed.fetchedAt);
    const cache: LeaderboardCacheRecord = {
      users,
      fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : Date.now()
    };
    memoryCache = cache;
    return cache;
  } catch {
    return null;
  }
}

function writeCache(users: LeaderboardUser[]) {
  const cache: LeaderboardCacheRecord = {
    users,
    fetchedAt: Date.now()
  };
  memoryCache = cache;
  if (typeof window !== 'undefined') {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }
}

export function LeaderboardPanel({ currentUserId, isOnline, onAttackUser, onScoutUser }: LeaderboardPanelProps) {
  const initialCache = readCache();
  const [users, setUsers] = useState<LeaderboardUser[]>(initialCache?.users ?? []);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(users.length === 0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef<Promise<LeaderboardUser[] | null> | null>(null);
  const usersRef = useRef<LeaderboardUser[]>(users);
  const mountedRef = useRef(true);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  const wait = useCallback(async (ms: number) => {
    await new Promise(resolve => setTimeout(resolve, ms));
  }, []);

  const fetchUsers = useCallback(async (): Promise<LeaderboardUser[]> => {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= REQUEST_RETRIES; attempt++) {
      abortRef.current?.abort();
      const timeoutController = new AbortController();
      abortRef.current = timeoutController;
      const timeoutId = window.setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch('/api/users/list', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          signal: timeoutController.signal
        });

        if (!response.ok) {
          throw new Error(`Leaderboard request failed (${response.status})`);
        }

        const data = await response.json() as { users?: unknown };
        return normalizeUsers(data.users);
      } catch (loadError) {
        if (timeoutController.signal.aborted) {
          lastError = new Error('Leaderboard request timed out');
        } else {
          lastError = loadError;
        }

        if (attempt < REQUEST_RETRIES) {
          await wait(RETRY_BACKOFF_MS * attempt);
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (abortRef.current === timeoutController) {
          abortRef.current = null;
        }
      }
    }

    throw lastError ?? new Error('Failed to load leaderboard');
  }, [wait]);

  const loadUsers = useCallback(async (showSpinner: boolean = false) => {
    if (!isOnline) return null;

    if (inFlightRef.current) {
      return await inFlightRef.current;
    }

    if (showSpinner && usersRef.current.length === 0) {
      setLoading(true);
    }

    const task = (async () => {
      try {
        const fetched = await fetchUsers();
        if (!mountedRef.current) return fetched;

        setUsers(fetched);
        writeCache(fetched);
        setError(null);
        return fetched;
      } catch (loadError) {
        console.error('Failed to load leaderboard:', loadError);
        if (!mountedRef.current) return null;

        if (usersRef.current.length === 0) {
          const cached = readCache();
          if (cached && cached.users.length > 0) {
            setUsers(cached.users);
            setError(null);
            return cached.users;
          }
          setError('Failed to refresh list. Try again.');
        } else {
          setError(null);
        }

        return null;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    })();

    inFlightRef.current = task;
    try {
      return await task;
    } finally {
      if (inFlightRef.current === task) {
        inFlightRef.current = null;
      }
    }
  }, [fetchUsers, isOnline]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOnline) {
      setLoading(false);
      setError(null);
      return;
    }

    const cached = readCache();
    if (cached && cached.users.length > 0 && usersRef.current.length === 0) {
      setUsers(cached.users);
      setLoading(false);
    }

    void loadUsers(usersRef.current.length === 0);

    const refreshHandle = window.setInterval(() => {
      void loadUsers(false);
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(refreshHandle);
    };
  }, [isOnline, loadUsers]);

  useEffect(() => {
    if (!isOpen || !isOnline) return;
    void loadUsers(usersRef.current.length === 0);
  }, [isOpen, isOnline, loadUsers]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      inFlightRef.current = null;
    };
  }, []);

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setLoading(false);
  };

  if (!isOnline) return null;

  return (
    <div className="leaderboard-container">
      <button className="leaderboard-btn" onClick={handleOpen} title="Leaderboard">
        <div className="btn-icon icon trophy-icon"></div>
      </button>

      {isOpen && (
        <>
          <div className="leaderboard-backdrop" onClick={handleClose}></div>
          <div className="leaderboard-dropdown">
            <div className="leaderboard-header">
              <h3>PLAYER BASES</h3>
              <button className="refresh-btn" onClick={() => void loadUsers(true)} disabled={loading}>
                {loading ? '...' : '↻'}
              </button>
            </div>

            {error && <div className="leaderboard-empty">{error}</div>}

            <div className="leaderboard-list">
              {loading && users.length === 0 ? (
                <div className="leaderboard-loading">Loading...</div>
              ) : users.length === 0 ? (
                <div className="leaderboard-empty">No bases found</div>
              ) : (
                users.map((user, index) => (
                  <div key={user.id} className="leaderboard-item">
                    <div className="rank">#{index + 1}</div>
                    <div className="user-info">
                      <span className="username">{user.username}</span>
                      <span className="buildings">{user.buildingCount} buildings</span>
                    </div>
                    {user.id !== currentUserId && (
                      <div className="leaderboard-actions">
                        <button
                          className="scout-btn"
                          onClick={() => {
                            handleClose();
                            onScoutUser(user.id, user.username);
                          }}
                          title="Scout"
                        >
                          👁️
                        </button>
                        <button
                          className="attack-btn"
                          onClick={() => {
                            handleClose();
                            onAttackUser(user.id, user.username);
                          }}
                          title="Attack"
                        >
                          ⚔️
                        </button>
                      </div>
                    )}
                    {user.id === currentUserId && (
                      <span className="you-badge">YOU</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
