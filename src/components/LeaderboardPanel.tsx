import { useState } from 'react';

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

    const loadUsers = async () => {
        if (!isOnline) return;

        setLoading(true);
        try {
            const response = await fetch('/api/users/list');
            if (response.ok) {
                const data = await response.json();
                setUsers(data.users || []);
            }
        } catch (error) {
            console.error('Failed to load leaderboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpen = () => {
        setIsOpen(true);
        loadUsers();
    };

    const handleClose = () => {
        setIsOpen(false);
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
                            <button className="refresh-btn" onClick={loadUsers} disabled={loading}>
                                {loading ? '...' : '↻'}
                            </button>
                        </div>

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
