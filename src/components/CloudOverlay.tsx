interface CloudOverlayProps {
  show: boolean;
  opening: boolean;
  loading?: boolean;
  loadingProgress?: number;
}

export function CloudOverlay({
  show,
  opening,
  loading = false,
  loadingProgress = 0,
}: CloudOverlayProps) {
  if (!show) return null;

  const clampedProgress = Math.max(0, Math.min(100, Math.round(loadingProgress)));
  const classes = ['cloud-overlay'];
  if (opening) classes.push('opening');
  if (loading) classes.push('loading');

  return (
    <div className={classes.join(' ')}>
      {loading && (
        <div className="cloud-loading-panel">
          <div className="cloud-loading-track">
            <div className="cloud-loading-fill" style={{ width: `${clampedProgress}%` }} />
          </div>
          <div className="cloud-loading-percent">{clampedProgress}%</div>
        </div>
      )}
    </div>
  );
}
