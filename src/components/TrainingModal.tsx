import { useRef, useState } from 'react';
import type { TroopDef, TroopType } from '../game/config/GameDefinitions';
import { getTroopStats } from '../game/config/GameDefinitions';
import { formatSol } from '../game/solana/Currency';

const TROOP_FLAVOR: Record<string, string> = {
    warrior: 'Fast melee fighter. Cheap to train and great in numbers.',
    archer: 'Ranged attacker that picks off targets from a safe distance.',
    giant: 'Slow, heavy-hitting tank that goes straight for defenses.',
    wallbreaker: 'Sprints at walls and detonates on impact. One-way trip.',
    ward: 'Support unit that heals nearby allies and chips away at buildings.',
    recursion: 'Splits into two smaller copies on death. Hard to put down.',
    ram: 'Armored battering ram that charges the Town Hall. 4x wall damage.',
    stormmage: 'Chain lightning hits up to 4 targets per strike.',
    golem: 'Massive stone titan. Nearly indestructible, targets defenses.',
    sharpshooter: 'Elite archer with extended range and heavy single-target damage.',
    mobilemortar: 'Sets up and lobs splash damage shells from long range.',
    davincitank: "Armored war machine that fires cannons in all directions.",
    phalanx: 'Shield formation that splits into 9 Roman soldiers on death.',
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

interface TooltipInfo {
  id: string;
  x: number;
  y: number;
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
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handleMouseEnter = (troopId: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({
      id: troopId,
      x: rect.left + rect.width / 2,
      y: rect.top
    });
  };

  const handleMouseLeave = () => setTooltip(null);

  const tooltipTroop = tooltip ? troops.find(t => t.id === tooltip.id) : null;
  const tooltipScaled = tooltipTroop ? getTroopStats(tooltipTroop.id as TroopType, troopLevel) : null;
  const tooltipFlavor = tooltipTroop ? (TROOP_FLAVOR[tooltipTroop.id] || tooltipTroop.desc) : '';

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

              return (
                <div
                  key={t.id}
                  className={`troop-grid-item ${!isAvailable ? 'disabled' : ''}`}
                  onClick={() => isAvailable && onTrainTroop(t.id)}
                  onMouseEnter={(e) => handleMouseEnter(t.id, e)}
                  onMouseLeave={handleMouseLeave}
                >
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

      {tooltip && tooltipTroop && tooltipScaled && (
        <div
          ref={tooltipRef}
          className="troop-tooltip"
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, calc(-100% - 10px))',
            zIndex: 10000
          }}
        >
          <div className="tooltip-flavor">{tooltipFlavor}</div>
          <div className="tooltip-stats">
            <span>♥ {tooltipScaled.health}</span>
            <span>⚔ {tooltipScaled.damage}</span>
            <span>◎ {tooltipTroop.space}</span>
          </div>
        </div>
      )}
    </div>
  );
}
