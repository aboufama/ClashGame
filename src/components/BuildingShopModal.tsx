import type { BuildingDef } from '../game/config/GameDefinitions';

interface BuildingShopModalProps {
  isOpen: boolean;
  showCloudOverlay: boolean;
  buildingList: BuildingDef[];
  buildingCounts: Record<string, number>;
  resources: { gold: number; elixir: number };
  shopWallLevel: number;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export function BuildingShopModal({
  isOpen,
  showCloudOverlay,
  buildingList,
  buildingCounts,
  resources,
  shopWallLevel,
  onClose,
  onSelect
}: BuildingShopModalProps) {
  if (!isOpen) return null;

  return (
    <div className={`modal-overlay ${showCloudOverlay ? 'hidden-ui' : ''}`} onClick={onClose}>
      <div className="training-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Building Shop</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="building-grid">
            {buildingList.map(b => {
              let cost = b.cost;
              let name = b.name;

              // Dynamic Wall Cost/Level in Shop
              if (b.id === 'wall' && shopWallLevel > 1) {
                cost = b.cost * shopWallLevel;
                name = `${b.name} (Lvl ${shopWallLevel})`;
              }

              const isDisabled = resources.gold < cost || (buildingCounts[b.id] || 0) >= b.maxCount;
              return (
                <div
                  key={b.id}
                  className={`building-grid-item ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => {
                    if (!isDisabled) {
                      onSelect(b.id);
                    }
                  }}
                >
                  <div className="count-badge">{buildingCounts[b.id] || 0}/{b.maxCount}</div>
                  <div className={`icon ${b.id}-icon large`}></div>
                  <span className="name">{name}</span>
                  <span className="desc-text" style={{ fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '4px' }}>{b.desc}</span>
                  <div className="cost-badge">
                    <div className="icon gold-icon" style={{ width: '12px', height: '12px' }}></div>
                    {cost}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
