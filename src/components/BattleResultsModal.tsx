import { formatSol } from '../game/solana/Currency';

interface BattleStats {
  destruction: number;
  solLooted: number;
}

interface BattleResultsModalProps {
  isOpen: boolean;
  stats: BattleStats;
  onGoHome: () => void;
}

export function BattleResultsModal({ isOpen, stats, onGoHome }: BattleResultsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="battle-results">
        <h1 className="battle-results-title">VICTORY!</h1>
        <div className="battle-results-stats">
          <div className="battle-stat">
            <span className="battle-stat-label">DESTRUCTION:</span>
            <span className="battle-stat-value destruction">{stats.destruction}%</span>
          </div>
          <div className="battle-stat">
            <span className="battle-stat-label">SOL LOOTED:</span>
            <span className="battle-stat-value">
              {formatSol(stats.solLooted)}
            </span>
          </div>
        </div>
        <button className="battle-home-btn" onClick={onGoHome}>
          <span className="btn-icon">🏡</span>
          <span className="btn-label">GO HOME</span>
        </button>
      </div>
    </div>
  );
}
