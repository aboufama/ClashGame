interface SettingsModalProps {
  isOpen: boolean;
  pixelationEnabled: boolean;
  sensitivity: number;
  onTogglePixelation: () => void;
  onSensitivityChange: (value: number) => void;
  onResetGame: () => void;
  onClose: () => void;
}

export function SettingsModal({
  isOpen,
  pixelationEnabled,
  sensitivity,
  onTogglePixelation,
  onSensitivityChange,
  onResetGame,
  onClose
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>SETTINGS</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="settings-body">
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
        </div>
      </div>
    </div>
  );
}
