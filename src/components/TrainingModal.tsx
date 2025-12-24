import type { TroopDef } from '../game/config/GameDefinitions';

interface TrainingModalProps {
  isOpen: boolean;
  showCloudOverlay: boolean;
  capacity: { current: number; max: number };
  resources: { gold: number; elixir: number };
  army: Record<string, number>;
  troops: TroopDef[];
  onClose: () => void;
  onStartPractice: () => void;
  onFindMatch: () => void;
  onTrainTroop: (type: string) => void;
  onUntrainTroop: (type: string) => void;
}

export function TrainingModal({
  isOpen,
  showCloudOverlay,
  capacity,
  resources,
  army,
  troops,
  onClose,
  onStartPractice,
  onFindMatch,
  onTrainTroop,
  onUntrainTroop
}: TrainingModalProps) {
  if (!isOpen) return null;

  return (
    <div className={`modal-overlay ${showCloudOverlay ? 'hidden-ui' : ''}`} onClick={onClose}>
      <div className="training-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Get ready for battle...</h2>
          <div className="header-actions">
            <button
              className={`raid-btn practice ${capacity.current === 0 ? 'disabled' : ''}`}
              onClick={onStartPractice}
              disabled={capacity.current === 0}
              style={{ marginRight: '10px' }}
            >
              <span className="btn-icon">🎯</span>
              <span className="btn-label">PRACTICE</span>
            </button>
            <button
              className={`raid-btn hurry ${capacity.current === 0 ? 'disabled' : ''}`}
              onClick={onFindMatch}
              disabled={capacity.current === 0}
            >
              <span className="btn-icon">🔍</span>
              <span className="btn-label">FIND MATCH</span>
            </button>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <span className="queue-label" style={{ margin: 0, color: capacity.current >= capacity.max ? '#ff4444' : '#fff' }}>
              {capacity.current}/{capacity.max}
            </span>
          </div>
          <div className="army-queue">
            {Object.entries(army).filter(([_, count]) => count > 0).map(([type, count]) => (
              <div key={type} className="queue-item">
                <button className="remove-btn" onClick={() => onUntrainTroop(type)}>×</button>
                <div className={`icon ${type}-icon`}></div>
                <div className="count">{count}</div>
              </div>
            ))}
            {capacity.current === 0 && <div className="hint" style={{ width: '100%', opacity: 0.5 }}>Army is empty. Train some troops below!</div>}
          </div>

          <div className="troop-grid">
            {troops.map(t => {
              const canAfford = resources.elixir >= t.cost;
              const hasSpace = capacity.current + t.space <= capacity.max;
              const isAvailable = canAfford && hasSpace;

              return (
                <div
                  key={t.id}
                  className={`troop-grid-item ${!isAvailable ? 'disabled' : ''}`}
                  onClick={() => isAvailable && onTrainTroop(t.id)}
                >
                  <div className="count-badge">{t.space}</div>
                  <div className={`icon ${t.id}-icon large`}></div>
                  <span className="name" style={{ fontSize: '0.7rem', fontWeight: 900 }}>{t.name}</span>
                  <div className="cost-badge">
                    <div className="icon elixir-icon" style={{ width: '12px', height: '12px' }}></div>
                    {t.cost}
                  </div>
                  {!hasSpace && <div style={{ fontSize: '8px', color: '#ff4444', position: 'absolute', bottom: '2px' }}>NO SPACE</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
