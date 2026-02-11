import { useEffect, useRef, useState } from 'react';
import type { BuildingType, TroopType } from '../game/config/GameDefinitions';
import { TROOP_DEFINITIONS } from '../game/config/GameDefinitions';
import type { GameMode } from '../game/types/GameMode';
import { formatSol } from '../game/solana/Currency';
import { InfoPanel } from './InfoPanel';

interface BattleStats {
  destruction: number;
  solLooted: number;
}

interface HudProps {
  view: GameMode;
  resources: { sol: number };
  battleStats: BattleStats;
  battleStarted: boolean;
  capacity: { current: number; max: number };  // Used for future capacity display
  visibleTroops: string[];
  selectedTroopType: string;
  army: Record<string, number>;
  selectedBuildingInfo: { id: string; type: BuildingType; level: number } | null;
  isExiting: boolean;
  wallUpgradeCostOverride?: number;
  showCloudOverlay: boolean;
  isMobile: boolean;
  isScouting: boolean;
  lootAnimating: { amount: number } | null;
  onLootAnimationDone: () => void;
  onOpenSettings: () => void;
  onOpenBuild: () => void;
  onOpenTrain: () => void;
  onStartAttack: () => void;  // Used for quick attack shortcut
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
  capacity: _capacity,  // Reserved for future capacity display
  visibleTroops,
  selectedTroopType,
  army,
  selectedBuildingInfo,
  isExiting,
  wallUpgradeCostOverride,
  showCloudOverlay,
  isMobile,
  isScouting,
  lootAnimating,
  onLootAnimationDone,
  onOpenSettings,
  onOpenBuild,
  onOpenTrain,
  onStartAttack: _onStartAttack,  // Reserved for quick attack shortcut
  onSelectTroop,
  onNextMap,
  onGoHome,
  onDeleteBuilding,
  onUpgradeBuilding,
  onMoveBuilding
}: HudProps) {
  // Unused props (kept for interface compatibility):
  void _capacity;
  void _onStartAttack;
  // Get troop name for mobile display
  const getTroopName = (type: string): string => {
    const def = TROOP_DEFINITIONS[type as TroopType];
    return def?.name || type;
  };
  const showAttackTroopBar = !(isScouting && visibleTroops.length === 0);

  // Count-up animation for resource display
  const [displaySol, setDisplaySol] = useState(resources.sol);
  const [isBouncing, setIsBouncing] = useState(false);
  const animFrameRef = useRef<number>(0);

  // Keep displaySol in sync when not animating
  useEffect(() => {
    if (!lootAnimating) {
      setDisplaySol(resources.sol);
    }
  }, [resources.sol, lootAnimating]);

  // Count-up effect when loot animation is active and view is HOME
  useEffect(() => {
    if (!lootAnimating || view !== 'HOME') return;

    const startSol = resources.sol - lootAnimating.amount;
    const endSol = resources.sol;
    const duration = 800;
    let startTime: number | null = null;

    setDisplaySol(startSol);
    setIsBouncing(true);

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplaySol(Math.round(startSol + (endSol - startSol) * eased));

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setIsBouncing(false);
      }
    };

    // Small delay so the fly-in element is visible first
    const timeout = setTimeout(() => {
      animFrameRef.current = requestAnimationFrame(animate);
    }, 200);

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(animFrameRef.current);
      setIsBouncing(false);
    };
  }, [lootAnimating, view, resources.sol]);

  return (
    <div className={`hud ${showCloudOverlay ? 'hidden-ui' : ''} ${isMobile ? 'mobile' : ''}`}>
      {/* Loot fly-in element */}
      {lootAnimating && view === 'HOME' && (
        <div
          className="loot-fly-in"
          onAnimationEnd={onLootAnimationDone}
        >
          +{formatSol(lootAnimating.amount, false, false)}
        </div>
      )}

      <div className="hud-top">
        {view === 'HOME' ? (
          <>
            <div className="resources">
              <div className={`res-item sol ${isBouncing ? 'bounce' : ''}`}>
                <span className="icon sol-icon" />
                <span>{formatSol(displaySol, isMobile, false)}</span>
              </div>
            </div>
            <button className="settings-btn" onClick={onOpenSettings}>
              <div className="btn-icon icon settings-icon"></div>
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
                  <div className="loot-item sol">
                    <span className="icon sol-icon" />
                    <span>+{formatSol(battleStats.solLooted, isMobile, false)}</span>
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
          isMobile={isMobile}
        />
      )}

      {(view === 'HOME' || showAttackTroopBar) && (
        <div className="build-menu">
          {view === 'HOME' ? (
          <div className="menu-inner">
            <div className="btn-group main-actions">
              <button className="action-btn build" onClick={onOpenBuild}>
                <div className="btn-icon icon build-icon"></div>
                <span className="btn-label">{isMobile ? '' : 'BUILD'}</span>
              </button>
              <button className="action-btn raid" onClick={onOpenTrain}>
                <div className="btn-icon icon raid-icon"></div>
                <span className="btn-label">{isMobile ? '' : 'RAID'}</span>
              </button>
            </div>
          </div>
          ) : (
            <div className="menu-inner raid">
              <div className={`troop-selector ${isMobile ? 'mobile-troop-selector' : ''}`}>
                {visibleTroops.map(t => {
                  const count = army[t];
                  return (
                    <button
                      key={t}
                      className={`troop-sel-btn ${t} ${selectedTroopType === t ? 'active' : ''} ${count <= 0 ? 'disabled' : ''}`}
                      disabled={count <= 0}
                      onClick={() => count > 0 && onSelectTroop(t)}
                    >
                      <div className={`icon ${t}-icon`}></div>
                      <span className="troop-count-badge">{count}</span>
                      {isMobile && selectedTroopType === t && (
                        <span className="mobile-troop-name">{getTroopName(t)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile floating action buttons for ATTACK mode */}
      {view === 'ATTACK' && isMobile && (
        <>
          <button
            className={`mobile-action-btn home-btn ${battleStarted ? 'battle-active' : ''}`}
            onClick={onGoHome}
          >
            <div className="icon home-icon"></div>
          </button>
          {!battleStarted && (
            <button className="mobile-action-btn next-btn" onClick={onNextMap}>
              <div className="icon findmatch-icon"></div>
            </button>
          )}
        </>
      )}

      {/* Desktop scout/home panels */}
      {view === 'ATTACK' && !battleStarted && !isMobile && (
        <div className="scout-panel">
          <button className="action-btn next-map" onClick={onNextMap}>
            <div className="btn-icon icon findmatch-icon"></div>
            <span className="btn-label">NEXT</span>
          </button>
        </div>
      )}

      {view === 'ATTACK' && !isMobile && (
        <div className="home-panel">
          <button className="action-btn home" onClick={onGoHome}>
            <div className="btn-icon icon home-icon"></div>
            <span className="btn-label">HOME</span>
          </button>
        </div>
      )}
    </div>
  );
}

// formatSol handles compact formatting for mobile.
