import type { BuildingType } from '../game/config/GameDefinitions';
import type { GameMode } from '../game/types/GameMode';
import { InfoPanel } from './InfoPanel';

interface BattleStats {
  destruction: number;
  goldLooted: number;
  elixirLooted: number;
}

interface HudProps {
  view: GameMode;
  resources: { gold: number; elixir: number };
  battleStats: BattleStats;
  battleStarted: boolean;
  capacity: { current: number; max: number };
  visibleTroops: string[];
  selectedTroopType: string;
  army: Record<string, number>;
  selectedBuildingInfo: { id: string; type: BuildingType; level: number } | null;
  isExiting: boolean;
  wallUpgradeCostOverride?: number;
  showCloudOverlay: boolean;
  onOpenSettings: () => void;
  onOpenBuild: () => void;
  onOpenTrain: () => void;
  onStartAttack: () => void;
  onSelectTroop: (type: string) => void;
  onNextMap: () => void;
  onGoHome: () => void;
  onDeleteBuilding: () => void;
  onUpgradeBuilding: () => void;
  onMoveBuilding: () => void;
}

export function Hud({
  view,
  resources,
  battleStats,
  battleStarted,
  capacity,
  visibleTroops,
  selectedTroopType,
  army,
  selectedBuildingInfo,
  isExiting,
  wallUpgradeCostOverride,
  showCloudOverlay,
  onOpenSettings,
  onOpenBuild,
  onOpenTrain,
  onStartAttack,
  onSelectTroop,
  onNextMap,
  onGoHome,
  onDeleteBuilding,
  onUpgradeBuilding,
  onMoveBuilding
}: HudProps) {
  return (
    <div className={`hud ${showCloudOverlay ? 'hidden-ui' : ''}`}>
      <div className="hud-top">
        {view === 'HOME' ? (
          <>
            <div className="resources">
              <div className="res-item gold">
                <div className="icon gold-icon"></div> {resources.gold.toLocaleString()}
              </div>
              <div className="res-item elixir">
                <div className="icon elixir-icon"></div> {resources.elixir.toLocaleString()}
              </div>
            </div>
            <button className="settings-btn" onClick={onOpenSettings}>
              <span className="btn-icon">⚙️</span>
            </button>
          </>
        ) : (
          <>
            {battleStarted && (
              <>
                <div className="battle-stats">
                  <div className="destruction-meter">
                    <div className="destruction-bar">
                      <div className="destruction-fill" style={{ width: `${battleStats.destruction}%` }}></div>
                    </div>
                    <span className="destruction-text">{battleStats.destruction}%</span>
                  </div>
                </div>
                <div className="loot-display">
                  <div className="loot-item gold">
                    <div className="icon gold-icon"></div>
                    <span>+{battleStats.goldLooted}</span>
                  </div>
                  <div className="loot-item elixir">
                    <div className="icon elixir-icon"></div>
                    <span>+{battleStats.elixirLooted}</span>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {selectedBuildingInfo && view === 'HOME' && (
        <InfoPanel
          type={selectedBuildingInfo.type}
          level={selectedBuildingInfo.level}
          resources={resources}
          isExiting={isExiting}
          onDelete={onDeleteBuilding}
          onUpgrade={onUpgradeBuilding}
          onMove={onMoveBuilding}
          upgradeCost={wallUpgradeCostOverride}
          key={selectedBuildingInfo.id}
        />
      )}

      <div className="build-menu">
        {view === 'HOME' ? (
          <div className="menu-inner">
            <div className="btn-group main-actions">
              <button className="action-btn build" onClick={onOpenBuild}>
                <span className="btn-icon">🔨</span>
                <span className="btn-label">BUILD</span>
              </button>
              <button className="action-btn train" onClick={onOpenTrain}>
                <span className="btn-icon">⚒️</span>
                <span className="btn-label">TRAIN</span>
              </button>
              <button
                className={`action-btn enemy ${capacity.current === 0 ? 'disabled' : ''}`}
                onClick={onStartAttack}
                disabled={capacity.current === 0}
                style={{ marginRight: '10px' }}
              >
                <span className="btn-icon">⚔️</span>
                <span className="btn-label">RAID</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="menu-inner raid">
            <div className="troop-selector">
              {visibleTroops.map(t => {
                const count = army[t];
                return (
                  <button
                    key={t}
                    className={`troop-sel-btn ${t} ${selectedTroopType === t ? 'active' : ''} ${count <= 0 ? 'disabled' : ''}`}
                    disabled={count <= 0}
                    onClick={() => count > 0 && onSelectTroop(t)}
                  >
                    <div className={`icon ${t}-icon`}></div> {count}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {view === 'ATTACK' && !battleStarted && (
        <div className="scout-panel">
          <button className="action-btn next-map" onClick={onNextMap}>
            <span className="btn-icon">🗺️</span>
            <span className="btn-label">NEXT</span>
          </button>
        </div>
      )}

      {view === 'ATTACK' && (
        <div className="home-panel">
          <button className="action-btn home" onClick={onGoHome}>
            <span className="btn-icon">🏠</span>
            <span className="btn-label">HOME</span>
          </button>
        </div>
      )}
    </div>
  );
}
