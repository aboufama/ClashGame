interface CloudOverlayProps {
  show: boolean;
  opening: boolean;
}

export function CloudOverlay({ show, opening }: CloudOverlayProps) {
  if (!show) return null;

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
    </div>
  );
}
