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

export function LeaderboardPanel({ currentUserId, isOnline, onAttackUser, onScoutUser }: LeaderboardPanelProps) {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const loadUsers = useCallback(async () => {
    if (!isOnline) return;

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/users/list', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Leaderboard request failed (${response.status})`);
      }

      const data = await response.json() as { users?: LeaderboardUser[] };
      if (requestId !== requestIdRef.current) return;
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      console.error('Failed to load leaderboard:', loadError);
      if (requestId === requestIdRef.current) {
        setError('Failed to refresh list. Try again.');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [isOnline]);

  useEffect(() => {
    if (!isOpen || !isOnline) return;
    void loadUsers();
  }, [isOpen, isOnline, loadUsers]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    abortRef.current?.abort();
    setIsOpen(false);
    setLoading(false);
  };

  if (!isOnline) return null;

  return (
    <div className="leaderboard-container">
      <button className="leaderboard-btn" onClick={handleOpen} title="Leaderboard">
        <span className="leaderboard-icon">🏆</span>
      </button>

      {isOpen && (
        <>
          <div className="leaderboard-backdrop" onClick={handleClose}></div>
          <div className="leaderboard-dropdown">
            <div className="leaderboard-header">
              <h3>PLAYER BASES</h3>
              <button className="refresh-btn" onClick={() => void loadUsers()} disabled={loading}>
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
