
import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { GameConfig } from './game/GameConfig';
import type { GameMode } from './game/scenes/MainScene';
import { BUILDING_DEFINITIONS, TROOP_DEFINITIONS, type BuildingType, getBuildingStats } from './game/config/GameDefinitions';
import { InfoPanel } from './components/InfoPanel';
import { Backend } from './game/backend/GameBackend';

import './App.css';



function App() {
  const gameRef = useRef<Phaser.Game | null>(null);

  const [resources, setResources] = useState(() => {
    // Load saved resources and check offline production
    const saved = Backend.getWorld('player_home');
    if (saved) {
      // Offline production
      const offline = Backend.calculateOfflineProduction('player_home');
      const initialResources = {
        gold: saved.resources.gold + offline.gold,
        elixir: saved.resources.elixir + offline.elixir
      };
      if (offline.gold > 0 || offline.elixir > 0) {
        console.log(`Offline Production: ${offline.gold} Gold, ${offline.elixir} Elixir`);
      }
      return initialResources;
    }
    return { gold: 1000, elixir: 5000 };
  });

  // Persist resources
  useEffect(() => {
    // Create world if it doesn't exist (first load)
    if (!Backend.getWorld('player_home')) {
      Backend.createWorld('player_home', 'PLAYER');
      Backend.updateResources('player_home', resources.gold, resources.elixir);
    } else {
      Backend.updateResources('player_home', resources.gold, resources.elixir);
    }
  }, [resources]);
  const [army, setArmy] = useState({ warrior: 0, archer: 0, giant: 0, ward: 0, recursion: 0, chronoswarm: 0, ram: 0, stormmage: 0 });
  const [capacity, setCapacity] = useState({ current: 0, max: 20 });
  const [selectedTroopType, setSelectedTroopType] = useState<'warrior' | 'archer' | 'giant' | 'ward' | 'recursion' | 'chronoswarm' | 'ram' | 'stormmage'>('warrior');
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);
  const [isBuildingOpen, setIsBuildingOpen] = useState(false);
  const [view, setView] = useState<GameMode>('HOME');
  const [selectedInMap, setSelectedInMap] = useState<string | null>(null);
  const [selectedBuildingInfo, setSelectedBuildingInfo] = useState<{ id: string; type: BuildingType; level: number } | null>(null);
  const [battleStats, setBattleStats] = useState({ destruction: 0, goldLooted: 0, elixirLooted: 0 });
  const [showCloudOverlay, setShowCloudOverlay] = useState(false);
  const [battleStarted, setBattleStarted] = useState(false); // Track if first troop deployed
  const [isExiting, setIsExiting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pixelationEnabled, setPixelationEnabled] = useState(true);
  const [sensitivity, setSensitivity] = useState(1.0);
  const [buildingCounts, setBuildingCounts] = useState<Record<BuildingType, number>>({} as Record<BuildingType, number>);
  const [gameTooltip, setGameTooltip] = useState<{ title: string; desc: string; x: number; y: number; buildingWidth: number } | null>(null);
  const selectedInMapRef = useRef<string | null>(null);

  useEffect(() => {
    selectedInMapRef.current = selectedInMap;
  }, [selectedInMap]);

  useEffect(() => {
    if (gameRef.current) return;
    gameRef.current = new Phaser.Game(GameConfig);

    // Cloud overlay controls
    (window as any).showCloudOverlay = () => setShowCloudOverlay(true);
    (window as any).hideCloudOverlay = () => setShowCloudOverlay(false);

    (window as any).addGold = (amount: number) => {
      setResources(prev => ({ ...prev, gold: prev.gold + amount }));
    };

    (window as any).addElixir = (amount: number) => {

      setResources(prev => ({ ...prev, elixir: prev.elixir + amount }));
    };

    (window as any).setGameMode = (mode: GameMode) => {
      setView(mode);
      if (mode === 'ATTACK') {
        setBattleStats({ destruction: 0, goldLooted: 0, elixirLooted: 0 });
        setBattleStarted(false); // Reset when entering attack mode

        // Auto-select first available troop
        const availableTroops: Array<'warrior' | 'archer' | 'giant' | 'ward' | 'recursion' | 'chronoswarm' | 'ram' | 'stormmage'> =
          ['warrior', 'archer', 'giant', 'ward', 'recursion', 'chronoswarm', 'ram', 'stormmage'];
        const firstAvailable = availableTroops.find(type => army[type] > 0);
        if (firstAvailable) {
          setSelectedTroopType(firstAvailable);
        }
      }
    };

    (window as any).updateBattleStats = (destruction: number, gold: number, elixir: number) => {
      setBattleStats({ destruction, goldLooted: gold, elixirLooted: elixir });
    };

    (window as any).onBuildingSelected = (data: { id: string; type: BuildingType; level: number } | null) => {
      // Handle legacy calls that might strictly pass a string ID (just in case) or the new object
      const id = data && typeof data === 'object' ? data.id : (typeof data === 'string' ? data : null);

      if (selectedInMapRef.current && id && selectedInMapRef.current !== id) {
        // Switching selection
        setIsExiting(true);
        setTimeout(() => {
          setSelectedInMap(id);
          if (data && typeof data === 'object') setSelectedBuildingInfo(data);
          setIsExiting(false);
        }, 200);
      } else if (selectedInMapRef.current && id === null) {
        // Deselecting - Animate out
        setIsExiting(true);
        setTimeout(() => {
          setSelectedInMap(null);
          setSelectedBuildingInfo(null);
          setIsExiting(false);
        }, 200);
      } else {
        // Selecting new (from nothing)
        setSelectedInMap(id);
        if (data && typeof data === 'object') setSelectedBuildingInfo(data);
        else if (id === null) setSelectedBuildingInfo(null);
        setIsExiting(false);
      }
    };

    // 'M' Keybind for moving
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && selectedInMapRef.current) {
        (window as any).moveSelectedBuilding();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);

    (window as any).onPlacementCancelled = () => {
      setSelectedInMap(null);
    };

    // Note: loot is collected via updateBattleStats -> setBattleStats, then collected separately
    (window as any).onRaidEnded = (goldLooted: number, elixirLooted: number) => {
      setResources(prev => ({
        ...prev,
        gold: prev.gold + goldLooted,
        elixir: prev.elixir + elixirLooted
      }));
      const scene = gameRef.current?.scene.getScene('MainScene') as any;
      if (scene) {
        scene.showCloudTransition(() => {
          setView('HOME');
          setSelectedInMap(null);
          scene.goHome();
        });
      }
    };

    // Game tooltip callback (renders above pixelation layer)
    (window as any).updateGameTooltip = (data: { title: string; desc: string; x: number; y: number; buildingWidth: number } | null) => {
      setGameTooltip(data);
    };

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);



  useEffect(() => {
    (window as any).getArmy = () => army;
    (window as any).getSelectedTroopType = () => selectedTroopType;
    (window as any).deployTroop = (type: keyof typeof army) => {
      setBattleStarted(true); // Battle has started!
      setArmy(prev => {
        const def = TROOP_DEFINITIONS[type as keyof typeof TROOP_DEFINITIONS];
        if (def) {
          setCapacity(c => ({ ...c, current: Math.max(0, c.current - def.space) }));
        }
        return { ...prev, [type]: prev[type] - 1 };
      });
    };

    (window as any).refreshCampCapacity = (campLevels: number[]) => {
      // L1 = 20 space, L2+ = 25 space per camp
      const totalCapacity = 10 + campLevels.reduce((sum, level) => sum + (level >= 2 ? 25 : 20), 0);
      setCapacity(prev => ({ ...prev, max: totalCapacity }));
    };
  }, [army, selectedTroopType]);


  const refreshBuildingCounts = () => {
    const counts = Backend.getBuildingCounts('player_home');
    setBuildingCounts(counts);
  };

  useEffect(() => {
    if (isBuildingOpen) refreshBuildingCounts();
  }, [isBuildingOpen]);

  useEffect(() => {
    (window as any).refreshBuildingCounts = refreshBuildingCounts;
    (window as any).onBuildingPlaced = (type: string) => {
      const def = (BUILDING_DEFINITIONS as any)[type];
      if (def) {
        setResources(prev => ({ ...prev, gold: prev.gold - def.cost }));
      }
      refreshBuildingCounts();
    };
  }, []);

  const handleSelect = (type: string) => {
    (window as any).selectBuilding(type);
    // Refresh counts after selection (in case placement happens immediately or on cancel? 
    // Actually placement happens later, but we should refresh when re-opening shop)
  };

  const handleTrainTroop = (type: 'warrior' | 'archer' | 'giant' | 'ward' | 'recursion' | 'chronoswarm' | 'ram' | 'stormmage') => {
    const def = TROOP_DEFINITIONS[type];
    const cost = def.cost;
    const space = def.space;

    if (resources.elixir < cost) {
      alert("Not enough Elixir!");
      return;
    }
    if (capacity.current + space > capacity.max) {
      alert("Not enough housing space! Build more Army Camps!");
      return;
    }

    setArmy(prev => ({ ...prev, [type]: prev[type] + 1 }));
    setResources(prev => ({ ...prev, elixir: prev.elixir - cost }));
    setCapacity(prev => ({ ...prev, current: prev.current + space }));
  };

  const handleUntrainTroop = (type: any) => {
    if (army[type as keyof typeof army] <= 0) return;
    const def = TROOP_DEFINITIONS[type as keyof typeof TROOP_DEFINITIONS];
    const cost = def.cost;
    const space = def.space;

    setArmy(prev => ({ ...prev, [type]: prev[type as keyof typeof army] - 1 }));
    setResources(prev => ({ ...prev, elixir: prev.elixir + cost }));
    setCapacity(prev => ({ ...prev, current: prev.current - space }));
  };

  const handleStartAttack = () => {
    if (capacity.current === 0) return;
    // Don't set view here - the game will call setGameMode when transition is complete
    (window as any).startAttack();
  };


  const handleGoHome = () => {
    const scene = gameRef.current?.scene.getScene('MainScene') as any;
    if (scene) {
      scene.showCloudTransition(() => {
        setView('HOME');
        setSelectedInMap(null);
        scene.goHome();
      });
    } else {
      setView('HOME');
      setSelectedInMap(null);
    }
  };

  const handleRaidNow = () => {
    if (capacity.current === 0) return;
    (window as any).startAttack();
  };


  const handleDeleteBuilding = () => {
    if (selectedInMap && selectedBuildingInfo) {
      (window as any).deleteSelectedBuilding();
      const stats = getBuildingStats(selectedBuildingInfo.type, selectedBuildingInfo.level);
      const refund = Math.floor(stats.cost * 0.8);
      setResources(prev => ({ ...prev, gold: prev.gold + refund }));
      setSelectedInMap(null);
      setSelectedBuildingInfo(null);
    }
  };

  const handleUpgradeBuilding = () => {
    if (selectedInMap && selectedBuildingInfo) {
      const def = BUILDING_DEFINITIONS[selectedBuildingInfo.type];
      const maxLevel = def.maxLevel || 1;

      if (selectedBuildingInfo.level < maxLevel) {
        const nextLevelStats = getBuildingStats(selectedBuildingInfo.type, selectedBuildingInfo.level + 1);

        if (resources.gold >= nextLevelStats.cost) {
          // Subtract cost
          setResources(prev => ({ ...prev, gold: prev.gold - nextLevelStats.cost }));

          // Sync with backend
          Backend.upgradeBuilding('player_home', selectedInMap);

          // Sync with Phaser
          const newLevel = (window as any).upgradeSelectedBuilding?.();

          // Update local state to refresh InfoPanel
          if (newLevel) {
            setSelectedBuildingInfo(prev => prev ? { ...prev, level: newLevel } : null);
          }
        }
      }
    }
  };

  const buildingList = Object.values(BUILDING_DEFINITIONS);


  return (
    <div className="app-container">
      <div id="game-container" />

      {/* Game Tooltip - Rendered above canvas/pixelation */}
      {gameTooltip && (
        <div
          className="game-tooltip"
          style={{
            left: gameTooltip.x - 200 - (gameTooltip.buildingWidth * 25),
            top: gameTooltip.y - 20
          }}
        >
          <div className="game-tooltip-title">{gameTooltip.title}</div>
          <div className="game-tooltip-desc">{gameTooltip.desc}</div>
        </div>
      )}

      <div className={`hud ${showCloudOverlay ? 'hidden-ui' : ''}`}>

        <div className="hud-top">
          {view === 'HOME' ? (
            <>
              <h1 className="title">CLASH ISO</h1>
              <div className="resources">
                <button
                  style={{
                    position: 'absolute',
                    right: '100%',
                    marginRight: '20px',
                    background: 'rgba(255,0,0,0.5)',
                    border: '1px solid red',
                    color: 'white',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    if (window.confirm("RESET VILLAGE? This deletes all buildings and reloads.")) {
                      Backend.resetWorld('player_home');
                      window.location.reload();
                    }
                  }}
                >
                  RESET
                </button>
                <div className="res-item gold">
                  <div className="icon gold-icon"></div> {resources.gold}
                </div>
                <div className="res-item elixir">
                  <div className="icon elixir-icon"></div> {resources.elixir}
                </div>
                <button className="settings-btn" onClick={() => setIsSettingsOpen(true)}>
                  <span className="btn-icon">⚙️</span>
                </button>
              </div>
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
            onDelete={handleDeleteBuilding}
            onUpgrade={handleUpgradeBuilding}
            onMove={() => (window as any).moveSelectedBuilding()}
            key={selectedBuildingInfo.id}
          />
        )}

        <div className="build-menu">
          {view === 'HOME' ? (
            <div className="menu-inner">
              <div className="btn-group main-actions">
                <button className="action-btn build" onClick={() => setIsBuildingOpen(true)}>
                  <span className="btn-icon">🔨</span>
                  <span className="btn-label">BUILD</span>
                </button>
                <button className="action-btn train" onClick={() => setIsTrainingOpen(true)}>
                  <span className="btn-icon">⚒️</span>
                  <span className="btn-label">TRAIN</span>
                </button>
                <button
                  className={`action-btn enemy ${capacity.current === 0 ? 'disabled' : ''}`}
                  onClick={handleStartAttack}
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
                <button
                  className={`troop-sel-btn ${selectedTroopType === 'warrior' ? 'active' : ''}`}
                  onClick={() => setSelectedTroopType('warrior')}>
                  <div className="icon warrior-icon"></div> {army.warrior}
                </button>
                <button
                  className={`troop-sel-btn archer ${selectedTroopType === 'archer' ? 'active' : ''}`}
                  onClick={() => setSelectedTroopType('archer')}>
                  <div className="icon archer-icon"></div> {army.archer}
                </button>
                <button
                  className={`troop-sel-btn giant ${selectedTroopType === 'giant' ? 'active' : ''}`}
                  onClick={() => setSelectedTroopType('giant')}>
                  <div className="icon giant-icon"></div> {army.giant}
                </button>
                <button
                  className={`troop-sel-btn ward ${selectedTroopType === 'ward' ? 'active' : ''}`}
                  onClick={() => setSelectedTroopType('ward')}>
                  <div className="icon ward-icon"></div> {army.ward}
                </button>
                <button
                  className={`troop-sel-btn recursion ${selectedTroopType === 'recursion' ? 'active' : ''}`}
                  onClick={() => setSelectedTroopType('recursion')}>
                  <div className="icon recursion-icon"></div> {army.recursion}
                </button>
                <button
                  className={`troop-sel-btn chronoswarm ${selectedTroopType === 'chronoswarm' ? 'active' : ''}`}
                  onClick={() => setSelectedTroopType('chronoswarm')}>
                  <div className="icon chronoswarm-icon"></div> {army.chronoswarm}
                </button>
                <button
                  className={`troop-sel-btn ram ${selectedTroopType === 'ram' ? 'active' : ''}`}
                  onClick={() => setSelectedTroopType('ram')}>
                  <div className="icon ram-icon"></div> {army.ram}
                </button>
                <button
                  className={`troop-sel-btn stormmage ${selectedTroopType === 'stormmage' ? 'active' : ''}`}
                  onClick={() => setSelectedTroopType('stormmage')}>
                  <div className="icon stormmage-icon"></div> {army.stormmage}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* NEXT MAP button - separate right panel, only before battle starts */}
        {view === 'ATTACK' && !battleStarted && (
          <div className="scout-panel">
            <button className="action-btn next-map" onClick={() => (window as any).findNewMap?.()}>NEXT</button>
          </div>
        )}

        {/* HOME button - separate left panel during attack */}
        {view === 'ATTACK' && (
          <div className="home-panel">
            <button className="action-btn home" onClick={handleGoHome}>HOME</button>
          </div>
        )}
      </div>

      {isTrainingOpen && (
        <div className={`modal-overlay ${showCloudOverlay ? 'hidden-ui' : ''}`} onClick={() => setIsTrainingOpen(false)}>

          <div className="training-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Get ready for battle...</h2>
              <div className="header-actions">
                <button
                  className={`raid-btn practice ${capacity.current === 0 ? 'disabled' : ''}`}
                  onClick={() => { (window as any).startPracticeAttack?.(); setIsTrainingOpen(false); }}
                  disabled={capacity.current === 0}
                  style={{ marginRight: '10px' }}
                >
                  PRACTICE
                </button>
                <button
                  className={`raid-btn hurry ${capacity.current === 0 ? 'disabled' : ''}`}
                  onClick={() => { if (capacity.current > 0) { handleRaidNow(); setIsTrainingOpen(false); } }}
                  disabled={capacity.current === 0}
                >
                  FIND MATCH
                </button>
                <button className="close-btn" onClick={() => setIsTrainingOpen(false)}>×</button>
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
                    <button className="remove-btn" onClick={() => handleUntrainTroop(type as keyof typeof army)}>×</button>
                    <div className={`icon ${type}-icon`}></div>
                    <div className="count">{count}</div>
                  </div>
                ))}
                {capacity.current === 0 && <div className="hint" style={{ width: '100%', opacity: 0.5 }}>Army is empty. Train some troops below!</div>}
              </div>


              <div className="troop-grid">
                {Object.values(TROOP_DEFINITIONS).map(t => {
                  const canAfford = resources.elixir >= t.cost;
                  const hasSpace = capacity.current + t.space <= capacity.max;
                  const isAvailable = canAfford && hasSpace;

                  return (
                    <div
                      key={t.id}
                      className={`troop-grid-item ${!isAvailable ? 'disabled' : ''}`}
                      onClick={() => isAvailable && handleTrainTroop(t.id as any)}
                    >
                      <div className="count-badge">{army[t.id as keyof typeof army] || 0}</div>
                      <div className={`icon ${t.id}-icon large`}></div>
                      <span className="name" style={{ fontSize: '0.7rem', fontWeight: 900 }}>{t.name}</span>
                      <div className="cost-badge">
                        <div className="icon elixir-icon" style={{ width: '12px', height: '12px' }}></div>
                        {t.cost}
                      </div>
                      {!hasSpace && <div style={{ fontSize: '8px', color: '#ff4444', position: 'absolute', bottom: '2px' }}>NO SPACE</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {isBuildingOpen && (
        <div className={`modal-overlay ${showCloudOverlay ? 'hidden-ui' : ''}`} onClick={() => setIsBuildingOpen(false)}>

          <div className="training-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Building Shop</h2>
              <button className="close-btn" onClick={() => setIsBuildingOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="building-grid">
                {buildingList.map(b => {
                  const isDisabled = resources.gold < b.cost || (buildingCounts[b.id] || 0) >= b.maxCount;
                  return (
                    <div
                      key={b.id}
                      className={`building-grid-item ${isDisabled ? 'disabled' : ''}`}
                      onClick={() => {
                        if (!isDisabled) {
                          handleSelect(b.id);
                          setIsBuildingOpen(false);
                        }
                      }}
                    >
                      <div className={`icon ${b.id}-icon large`}></div>
                      <span className="name">{b.name}</span>
                      <span className="desc-text" style={{ fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '4px' }}>{b.desc}</span>
                      <span className="cost">{b.cost}g</span>
                      <span className="limit">{(buildingCounts[b.id] || 0)}/{b.maxCount}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}
      {showCloudOverlay && (
        <div className="cloud-overlay">
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
      )}

      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>SETTINGS</h2>
              <button className="close-btn" onClick={() => setIsSettingsOpen(false)}>×</button>
            </div>
            <div className="settings-body">
              <div className="setting-row">
                <label>PIXELATED AESTHETIC</label>
                <div className="toggle-switch">
                  <button
                    className={`toggle-btn ${pixelationEnabled ? 'active' : ''}`}
                    onClick={() => {
                      const newState = !pixelationEnabled;
                      setPixelationEnabled(newState);
                      if ((window as any).setPixelation) {
                        (window as any).setPixelation(newState ? 1.5 : 1.0);
                      }
                    }}
                  >
                    {pixelationEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              <div className="setting-row">
                <label>CAMERA SENSITIVITY</label>
                <div className="slider-container">
                  <input
                    type="range"
                    min="0.2"
                    max="3.0"
                    step="0.1"
                    value={sensitivity}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setSensitivity(val);
                      if ((window as any).setSensitivity) {
                        (window as any).setSensitivity(val);
                      }
                    }}
                  />
                  <span className="val-text">{sensitivity.toFixed(1)}x</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



export default App;
