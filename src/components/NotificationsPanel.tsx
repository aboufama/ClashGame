import { useState, useEffect } from 'react';
import { Backend } from '../game/backend/GameBackend';

interface Notification {
  id: string;
  attackerName: string;
  goldLost: number;
  elixirLost: number;
  destruction: number;
  timestamp: number;
  read: boolean;
}

interface NotificationsPanelProps {
  userId: string;
  isOnline: boolean;
}

export function NotificationsPanel({ userId, isOnline }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOnline) return;

    const loadNotifications = async () => {
      const count = await Backend.getUnreadNotificationCount(userId);
      setUnreadCount(count);
    };

    loadNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [userId, isOnline]);

  const handleOpen = async () => {
    if (!isOnline) return;

    const notifs = await Backend.getNotifications(userId);
    setNotifications(notifs);
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleMarkAllRead = async () => {
    await Backend.markNotificationsRead(userId);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const formatTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (!isOnline) return null;

  return (
    <div className="notifications-container">
      <button className="notifications-btn" onClick={handleOpen}>
        <span className="bell-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="notifications-backdrop" onClick={handleClose}></div>
          <div className="notifications-dropdown">
            <div className="notifications-header">
              <h3>DEFENSE LOG</h3>
              {notifications.some(n => !n.read) && (
                <button className="mark-read-btn" onClick={handleMarkAllRead}>
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="no-notifications">
                No attacks yet. Your base is safe!
              </div>
            ) : (
              notifications.map(notif => (
                <div key={notif.id} className={`notification-item ${!notif.read ? 'unread' : ''}`}>
                  <div className="attacker">{notif.attackerName} raided you!</div>
                  <div className="loot-info">
                    <span>-{notif.goldLost} Gold</span>
                    <span>-{notif.elixirLost} Elixir</span>
                    <span>{notif.destruction}% destroyed</span>
                  </div>
                  <div className="timestamp">{formatTimeAgo(notif.timestamp)}</div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
