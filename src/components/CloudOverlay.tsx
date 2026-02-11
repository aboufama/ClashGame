import { formatSol } from '../game/solana/Currency';

interface CloudOverlayProps {
  show: boolean;
  opening: boolean;
  loading?: boolean;
  loadingProgress?: number;
  rewardAmount?: number | null;
}

export function CloudOverlay({
  show,
  opening,
  loading = false,
  loadingProgress = 0,
  rewardAmount = null
}: CloudOverlayProps) {
  if (!show) return null;

  const clampedProgress = Math.max(0, Math.min(100, Math.round(loadingProgress)));
  const clampedReward = rewardAmount !== null ? Math.max(0, Math.floor(rewardAmount)) : null;
  const classes = ['cloud-overlay'];
  if (opening) classes.push('opening');
  if (loading) classes.push('loading');

  return (
    <div className={classes.join(' ')}>
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="cloud-part"
          style={{
            left: `${(i % 5) * 25 - 10}%`,
            top: `${Math.floor(i / 5) * 30 - 10}%`,
            width: `${350 + (i % 3) * 50}px`,
            height: `${280 + (i % 2) * 40}px`,
            animationDelay: `${(i % 4) * 0.1}s`
          }}
        />
      ))}
      {loading && (
        <div className="cloud-loading-panel">
          <div className="cloud-loading-track">
            <div className="cloud-loading-fill" style={{ width: `${clampedProgress}%` }} />
          </div>
          <div className="cloud-loading-percent">{clampedProgress}%</div>
        </div>
      )}
      {!loading && clampedReward !== null && clampedReward > 0 && (
        <div className="cloud-reward-panel">
          <div className="cloud-reward-label">LOOT SECURED</div>
          <div className="cloud-reward-value">
            <span className="icon sol-icon"></span>
            <span>+{formatSol(clampedReward, false, false)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
