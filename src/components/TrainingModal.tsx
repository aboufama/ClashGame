import type { TroopDef, TroopType } from '../game/config/GameDefinitions';
import { getTroopStats } from '../game/config/GameDefinitions';
import { formatSol } from '../game/solana/Currency';

const TROOP_FLAVOR: Record<string, string> = {
    warrior: 'Cheap, cheerful, and surprisingly brave for someone with no armor.',
    archer: 'Pew pew from a safe distance. Prefers not to get punched.',
    giant: 'Big, slow, and really mad at defensive buildings.',
    wallbreaker: 'Runs at walls with a bomb. Career expectancy: one attack.',
    ward: 'Keeps everyone alive. Never gets a thank you.',
    recursion: 'Kill it and it multiplies. Basically a work email.',
    ram: 'Has one goal: smash the Town Hall. Very focused individual.',
    stormmage: 'Zaps enemies in a chain. Shocking personality.',
    golem: 'An ancient rock that woke up and chose violence.',
    sharpshooter: 'Like an archer, but actually hits things from far away.',
    mobilemortar: 'Portable splash damage. Sets up shop, then kaboom.',
    davincitank: "Leonardo's finest. Spins and shoots in every direction.",
    phalanx: 'A 3x3 squad of Romans. Splits into 9 angry soldiers on death.',
};

interface TrainingModalProps {
  isOpen: boolean;
  showCloudOverlay: boolean;
  capacity: { current: number; max: number };
  resources: { sol: number };
  army: Record<string, number>;
  troops: TroopDef[];
  troopLevel: number;
  onClose: () => void;
  onStartPractice: () => void;
  onFindMatch: () => void;
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
  troopLevel,
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
              className={`header-btn practice ${capacity.current === 0 ? 'disabled' : ''}`}
              onClick={onStartPractice}
              disabled={capacity.current === 0}
            >
              <div className="btn-icon icon practice-icon"></div>
              <span className="btn-label">PRACTICE</span>
            </button>
            <button
              className={`header-btn find-match ${capacity.current === 0 ? 'disabled' : ''}`}
              onClick={onFindMatch}
              disabled={capacity.current === 0}
            >
              <div className="btn-icon icon findmatch-icon"></div>
              <span className="btn-label">FIND MATCH</span>
            </button>
            <button className="header-btn close" onClick={onClose}>×</button>
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
                <div className="count">x{count}</div>
              </div>
            ))}
            {capacity.current === 0 && <div className="hint" style={{ width: '100%', opacity: 0.5 }}>Army is empty. Train some troops below!</div>}
          </div>

          <div className="troop-grid">
            {troops.map(t => {
              const canAfford = resources.sol >= t.cost;
              const hasSpace = capacity.current + t.space <= capacity.max;
              const isAvailable = canAfford && hasSpace;
              const scaled = getTroopStats(t.id as TroopType, troopLevel);
              const flavor = TROOP_FLAVOR[t.id] || t.desc;

              return (
                <div
                  key={t.id}
                  className={`troop-grid-item ${!isAvailable ? 'disabled' : ''}`}
                  onClick={() => isAvailable && onTrainTroop(t.id)}
                >
                  <div className="troop-tooltip">
                    <div className="tooltip-flavor">{flavor}</div>
                    <div className="tooltip-stats">
                      <span>♥ {scaled.health}</span>
                      <span>⚔ {scaled.damage}</span>
                      <span>◎ {t.space}</span>
                    </div>
                  </div>
                  <div className="level-badge">Lv{troopLevel}</div>
                  <div className={`icon ${t.id}-icon large`}></div>
                  <span className="name" style={{ fontSize: '0.7rem', fontWeight: 900 }}>{t.name}</span>
                  <div className="cost-badge">
                    <span className="icon sol-icon"></span>
                    {formatSol(t.cost, false, false)}
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
