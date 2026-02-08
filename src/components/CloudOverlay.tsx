interface CloudOverlayProps {
  show: boolean;
  opening: boolean;
  loading?: boolean;
  loadingText?: string;
  loadingProgress?: number;
}

export function CloudOverlay({
  show,
  opening,
  loading = false,
  loadingText = 'Loading village...',
  loadingProgress = 0
}: CloudOverlayProps) {
  if (!show) return null;

  const clampedProgress = Math.max(0, Math.min(100, Math.round(loadingProgress)));

  return (
    <div className={`cloud-overlay ${opening ? 'opening' : ''}`}>
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
          <div className="cloud-loading-title">{loadingText}</div>
          <div className="cloud-loading-track">
            <div className="cloud-loading-fill" style={{ width: `${clampedProgress}%` }} />
          </div>
          <div className="cloud-loading-percent">{clampedProgress}%</div>
        </div>
      )}
    </div>
  );
}
