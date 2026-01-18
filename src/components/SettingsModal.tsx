import { useState } from 'react';
import { Auth } from '../game/backend/AuthService';

interface SettingsModalProps {
  isOpen: boolean;
  pixelationEnabled: boolean;
  sensitivity: number;
  isOnline: boolean;
  username: string;
  onTogglePixelation: () => void;
  onSensitivityChange: (value: number) => void;
  onResetGame: () => void;
  onLogout: () => void;
  onClose: () => void;
}

export function SettingsModal({
  isOpen,
  pixelationEnabled,
  sensitivity,
  isOnline,
  username,
  onTogglePixelation,
  onSensitivityChange,
  onResetGame,
  onLogout,
  onClose
}: SettingsModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  if (!isOpen) return null;

  const handleDeleteAccount = async () => {
    if (!isOnline) {
      // Offline mode - just clear local data
      const result = await Auth.deleteAccount('');
      if (result.success) {
        window.location.reload();
      }
      return;
    }

    if (!deletePassword) {
      setDeleteError('Password required');
      return;
    }

    setDeleting(true);
    setDeleteError('');

    const result = await Auth.deleteAccount(deletePassword);

    if (result.success) {
      window.location.reload();
    } else {
      setDeleteError(result.error || 'Failed to delete account');
      setDeleting(false);
    }
  };

  const handleClose = () => {
    setShowDeleteConfirm(false);
    setDeletePassword('');
    setDeleteError('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>SETTINGS</h2>
          <button className="close-btn" onClick={handleClose}>×</button>
        </div>
        <div className="settings-body">
          {/* Account Info */}
          <div className="setting-row" style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>LOGGED IN AS</div>
                <div style={{ fontSize: '12px', color: '#fff' }}>{username}</div>
                <div style={{ fontSize: '8px', color: isOnline ? '#44ff44' : '#888', marginTop: '4px' }}>
                  {isOnline ? 'ONLINE MODE' : 'OFFLINE MODE'}
                </div>
              </div>
              <button
                className="action-btn"
                style={{ backgroundColor: '#666', fontSize: '8px', padding: '8px 12px' }}
                onClick={onLogout}
              >
                LOGOUT
              </button>
            </div>
          </div>

          <div className="setting-row">
            <label>PIXELATED AESTHETIC</label>
            <div className="toggle-switch">
              <button
                className={`toggle-btn ${pixelationEnabled ? 'active' : ''}`}
                onClick={onTogglePixelation}
              >
                {pixelationEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          <div className="setting-row">
            <label>CAMERA SENSITIVITY</label>
            <div className="slider-container">
              <input
                type="range"
                min="0.2"
                max="3.0"
                step="0.1"
                value={sensitivity}
                onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
              />
              <span className="val-text">{sensitivity.toFixed(1)}x</span>
            </div>
          </div>

          <div className="setting-row" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #333' }}>
            <button
              className="action-btn"
              style={{ backgroundColor: '#ff4444', width: '100%' }}
              onClick={onResetGame}
            >
              RESET GAME DATA
            </button>
          </div>

          {/* Delete Account Section */}
          <div className="setting-row" style={{ marginTop: '16px' }}>
            {!showDeleteConfirm ? (
              <button
                className="action-btn"
                style={{ backgroundColor: '#880000', width: '100%', fontSize: '8px' }}
                onClick={() => setShowDeleteConfirm(true)}
              >
                DELETE ACCOUNT
              </button>
            ) : (
              <div style={{ width: '100%' }}>
                <div style={{ fontSize: '9px', color: '#ff6666', marginBottom: '8px', textAlign: 'center' }}>
                  ⚠️ This will permanently delete your account and all data!
                </div>
                {isOnline && (
                  <input
                    type="password"
                    placeholder="Enter password to confirm"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      marginBottom: '8px',
                      background: '#1a1410',
                      border: '2px solid #333',
                      color: '#fff',
                      fontFamily: 'inherit',
                      fontSize: '10px'
                    }}
                    disabled={deleting}
                  />
                )}
                {deleteError && (
                  <div style={{ fontSize: '8px', color: '#ff4444', marginBottom: '8px', textAlign: 'center' }}>
                    {deleteError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="action-btn"
                    style={{ flex: 1, backgroundColor: '#444', fontSize: '8px' }}
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeletePassword('');
                      setDeleteError('');
                    }}
                    disabled={deleting}
                  >
                    CANCEL
                  </button>
                  <button
                    className="action-btn"
                    style={{ flex: 1, backgroundColor: '#ff0000', fontSize: '8px' }}
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                  >
                    {deleting ? 'DELETING...' : 'CONFIRM DELETE'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
