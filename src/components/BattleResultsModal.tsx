interface BattleStats {
  destruction: number;
  goldLooted: number;
  elixirLooted: number;
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
            <span className="battle-stat-label">GOLD LOOTED:</span>
            <span className="battle-stat-value">
              <div className="icon gold-icon" style={{ display: 'inline-block', marginRight: '8px' }}></div>
              {stats.goldLooted}
            </span>
          </div>
          <div className="battle-stat">
            <span className="battle-stat-label">ELIXIR LOOTED:</span>
            <span className="battle-stat-value">
              <div className="icon elixir-icon" style={{ display: 'inline-block', marginRight: '8px' }}></div>
              {stats.elixirLooted}
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
