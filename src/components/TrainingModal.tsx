import type { TroopDef } from '../game/config/GameDefinitions';
import { formatSol } from '../game/solana/Currency';

interface TrainingModalProps {
  isOpen: boolean;
  showCloudOverlay: boolean;
  capacity: { current: number; max: number };
  resources: { sol: number };
  army: Record<string, number>;
  troops: TroopDef[];
  isOnline: boolean;
  onClose: () => void;
  onStartPractice: () => void;
  onFindMatch: () => void;
  onAttackOnline: () => void;
  onTrainTroop: (type: string) => void | Promise<void>;
  onUntrainTroop: (type: string) => void | Promise<void>;
}

export function TrainingModal({
  isOpen,
  showCloudOverlay,
  capacity,
  resources,
  army,
  troops,
  isOnline,
  onClose,
  onStartPractice,
  onFindMatch,
  onAttackOnline,
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
              <div className="btn-icon icon practice-icon"></div>
              <span className="btn-label">PRACTICE</span>
            </button>
            <button
              className={`raid-btn hurry ${capacity.current === 0 ? 'disabled' : ''}`}
              onClick={onFindMatch}
              disabled={capacity.current === 0}
            >
              <div className="btn-icon icon findmatch-icon"></div>
              <span className="btn-label">FIND MATCH</span>
            </button>
            {isOnline && (
              <button
                className={`attack-online-btn ${capacity.current === 0 ? 'disabled' : ''}`}
                onClick={onAttackOnline}
                disabled={capacity.current === 0}
                style={{ marginLeft: '10px' }}
              >
                <span className="online-indicator"></span>
                <span className="btn-label">ATTACK ONLINE</span>
              </button>
            )}
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
              const canAfford = resources.sol >= t.cost;
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
                    {formatSol(t.cost)}
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
