
import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { GameConfig } from './game/GameConfig';
import type { GameMode } from './game/scenes/MainScene';
import { BUILDING_DEFINITIONS, TROOP_DEFINITIONS, type BuildingType, getBuildingStats } from './game/config/GameDefinitions';
import { InfoPanel } from './components/InfoPanel';
import { Backend, GameBackend } from './game/backend/GameBackend';
import { Auth, type UserProfile } from './game/backend/AuthService';
import { Login } from './components/Login';
import './App.css';



function App() {
  const gameRef = useRef<Phaser.Game | null>(null);

  const [user, setUser] = useState<UserProfile | null>(() => Auth.getCurrentUser());
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState({ gold: 0, elixir: 0 });

  // Handle Login
  const handleLogin = (profile: UserProfile) => {
    setUser(profile);
  };

  // Load World & Resources once user is known
  useEffect(() => {
    // ONE-TIME PURGE: Reset all villages for the new starting state
    if (!localStorage.getItem('clashIso_v1_purged')) {
      GameBackend.purgeAllData();
      localStorage.setItem('clashIso_v1_purged', 'done');
      window.location.reload(); // Refresh to ensure clean state
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    const init = async () => {
      setLoading(true);
      let world = await Backend.getWorld(user?.id || 'player_home');
      if (!world) {
        world = await Backend.createWorld(user?.id || 'player_home', 'PLAYER');
      }

      const offline = await Backend.calculateOfflineProduction(user?.id || 'player_home');
      setResources({
        gold: Math.max(0, world.resources.gold + offline.gold),
        elixir: Math.max(0, world.resources.elixir + offline.elixir)
      });

      // Load Army from backend
      if (world.army) {
        // Merge with defaults to ensure all keys exist
        setArmy(prev => ({ ...prev, ...world.army }));
      }

      // Force scene to update username now that we have user and world
      const scene = gameRef.current?.scene.getScene('MainScene') as any;
      if (scene && scene.updateUsername) {
        scene.updateUsername(user.username);
      }

      if (offline.gold > 0 || offline.elixir > 0) {
        console.log(`Welcome back ${user.username}! Offline Production: ${offline.gold} Gold, ${offline.elixir} Elixir`);
      }
      setLoading(false);
    };

    init();
  }, [user]);

  const [army, setArmy] = useState({ warrior: 0, archer: 0, giant: 0, ward: 0, recursion: 0, ram: 0, stormmage: 0, golem: 0, sharpshooter: 0, mobilemortar: 0, davincitank: 0, phalanx: 0 });

  // Persist resources & army
  useEffect(() => {
    if (user && !loading) {
      Backend.updateResources(user?.id || 'player_home', resources.gold, resources.elixir);
      Backend.updateArmy(user?.id || 'player_home', army);
    }
  }, [resources, army, user, loading]);
  const [capacity, setCapacity] = useState({ current: 0, max: 20 });
  const [selectedTroopType, setSelectedTroopType] = useState<'warrior' | 'archer' | 'giant' | 'ward' | 'recursion' | 'ram' | 'stormmage' | 'golem' | 'sharpshooter' | 'mobilemortar' | 'davincitank' | 'phalanx'>('warrior');
  const [visibleTroops, setVisibleTroops] = useState<string[]>([]);
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
  const [showBattleResults, setShowBattleResults] = useState(false);
  const [pixelationEnabled, setPixelationEnabled] = useState(true);
  const [sensitivity, setSensitivity] = useState(1.0);
  const [buildingCounts, setBuildingCounts] = useState<Record<BuildingType, number>>({} as Record<BuildingType, number>);
  const [gameTooltip, setGameTooltip] = useState<{ title: string; desc: string; x: number; y: number; buildingWidth: number } | null>(null);
  const selectedInMapRef = useRef<string | null>(null);
  const armyRef = useRef(army);

  useEffect(() => {
    selectedInMapRef.current = selectedInMap;
    armyRef.current = army;
  }, [selectedInMap, army]);

  const [cloudOpening, setCloudOpening] = useState(false);

  useEffect(() => {
    // If no user, ensure game is destroyed to clean up state
    if (!user) {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
      return;
    }

    // If game already running, don't recreate
    if (gameRef.current) return;

    // Start new game instance
    gameRef.current = new Phaser.Game(GameConfig);

    // Cloud overlay controls
    (window as any).showCloudOverlay = () => {
      setCloudOpening(false);
      setShowCloudOverlay(true);
    };
    (window as any).hideCloudOverlay = () => {
      setCloudOpening(true); // Start opening animation
      setTimeout(() => {
        setShowCloudOverlay(false);
        setCloudOpening(false);
      }, 600); // Match CSS animation duration
    };

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
        const availableTroops: Array<'warrior' | 'archer' | 'giant' | 'ward' | 'recursion' | 'ram' | 'stormmage' | 'golem' | 'sharpshooter' | 'mobilemortar' | 'davincitank' | 'phalanx'> =
          ['warrior', 'archer', 'giant', 'ward', 'recursion', 'ram', 'stormmage', 'golem', 'sharpshooter', 'mobilemortar', 'davincitank', 'phalanx'];
        const currentArmy = armyRef.current;
        const firstAvailable = availableTroops.find(type => currentArmy[type] > 0);
        if (firstAvailable) {
          setSelectedTroopType(firstAvailable);
        }
        // Snapshot troops for Battle Bar stability
        const battleTroops = availableTroops.filter(t => currentArmy[t] > 0);
        setVisibleTroops(battleTroops);
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

      // Auto-trigger "Return Home" flow on raid end
      const scene = gameRef.current?.scene.getScene('MainScene') as any;
      if (scene) {
        // Hide results initially to allow transition
        setShowBattleResults(false);

        scene.showCloudTransition(() => {
          setView('HOME');
          setSelectedInMap(null);
          scene.goHome();
          // Show results summary after arriving home (optional, but requested behavior is "same path")
          // In Clash, you see results over the battle, then click return.
          // Since we auto-ended, let's show the results now that we are safe at home (or purely resource update).
          // For now, mirroring "return home" button which just goes home.
          // If user wants to see results, we can enable this:
          // setShowBattleResults(true);
        });
      }
    };


    // Game tooltip callback (renders above pixelation layer)
    (window as any).updateGameTooltip = (data: { title: string; desc: string; x: number; y: number; buildingWidth: number } | null) => {
      setGameTooltip(data);
    };

    return () => {
      // Cleanup window handlers
      delete (window as any).showCloudOverlay;
      delete (window as any).hideCloudOverlay;
      delete (window as any).addGold;
      delete (window as any).addElixir;
      delete (window as any).setGameMode;
      delete (window as any).updateBattleStats;
      delete (window as any).onBuildingSelected;
      delete (window as any).onTooltipShow;
      delete (window as any).onGameOut;
      delete (window as any).updateBuildingCounts;
      delete (window as any).refreshCampCapacity;

      window.removeEventListener('keydown', handleKeyDown);
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [user]);

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


  const refreshBuildingCounts = async () => {
    const counts = await Backend.getBuildingCounts(user?.id || 'player_home');
    setBuildingCounts(counts);
  };

  useEffect(() => {
    if (isBuildingOpen) refreshBuildingCounts();
  }, [isBuildingOpen]);

  useEffect(() => {
    (window as any).refreshBuildingCounts = refreshBuildingCounts;
    (window as any).onBuildingPlaced = async (type: string, isFree: boolean = false) => {
      if (isFree) {
        refreshBuildingCounts();
        return;
      }
      const def = (BUILDING_DEFINITIONS as any)[type];
      if (def) {
        let cost = def.cost;
        if (type === 'wall') {
          const world = await Backend.getWorld(user?.id || 'player_home');
          if (world) {
            const walls = world.buildings.filter((b: any) => b.type === 'wall');
            if (walls.length > 0) {
              const maxLevel = Math.max(...walls.map((w: any) => w.level || 1));
              cost = def.cost * maxLevel;
            }
          }
        }
        setResources(prev => ({
          ...prev,
          gold: Math.max(0, prev.gold - cost)
        }));
      }
      refreshBuildingCounts();
    };
  }, []);

  const handleSelect = (type: string) => {
    (window as any).selectBuilding(type);
    // Refresh counts after selection (in case placement happens immediately or on cancel? 
    // Actually placement happens later, but we should refresh when re-opening shop)
  };

  const handleTrainTroop = (type: 'warrior' | 'archer' | 'giant' | 'ward' | 'recursion' | 'ram' | 'stormmage' | 'golem' | 'sharpshooter' | 'mobilemortar' | 'davincitank' | 'phalanx') => {
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
    setResources(prev => ({
      ...prev,
      elixir: Math.max(0, prev.elixir - cost)
    }));
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

  const handleUpgradeBuilding = async () => {
    if (selectedInMap && selectedBuildingInfo) {
      const def = BUILDING_DEFINITIONS[selectedBuildingInfo.type];
      const maxLevel = def.maxLevel || 1;

      if (selectedBuildingInfo.level < maxLevel) {
        const nextLevelStats = getBuildingStats(selectedBuildingInfo.type, selectedBuildingInfo.level + 1);
        let upgradeCost = nextLevelStats.cost;

        // Wall Logic: Cost is multiplied by the number of walls being upgraded
        if (selectedBuildingInfo.type === 'wall') {
          const world = await Backend.getWorld(user?.id || 'player_home');
          if (world) {
            const count = world.buildings.filter((b: any) => b.type === 'wall' && (b.level || 1) === selectedBuildingInfo.level).length;
            upgradeCost = nextLevelStats.cost * count;
          }
        }

        if (resources.gold >= upgradeCost) {
          // Subtract cost
          setResources(prev => ({
            ...prev,
            gold: Math.max(0, prev.gold - upgradeCost)
          }));

          // Sync with backend
          await Backend.upgradeBuilding(user?.id || 'player_home', selectedInMap);

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


  // Pre-calculation for UI: Wall Bulk Upgrade Cost
  const [wallUpgradeCostOverride, setWallUpgradeCostOverride] = useState<number | undefined>();

  useEffect(() => {
    const calcWallCost = async () => {
      if (selectedBuildingInfo?.type === 'wall' && view === 'HOME') {
        const world = await Backend.getWorld(user?.id || 'player_home');
        if (world) {
          const count = world.buildings.filter(b => b.type === 'wall' && (b.level || 1) === selectedBuildingInfo.level).length;
          const nextStats = getBuildingStats('wall', selectedBuildingInfo.level + 1);
          setWallUpgradeCostOverride(nextStats.cost * count);
        }
      } else {
        setWallUpgradeCostOverride(undefined);
      }
    };
    calcWallCost();
  }, [selectedBuildingInfo, view]);

  return (
    <div className="app-container">
      {!user && <Login onLogin={handleLogin} />}
      {loading && user && (
        <div className="loading-spinner-overlay">
          <div className="spinner"></div>
          <p>STABILIZING BASE COORDS...</p>
        </div>
      )}
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
              <div className="resources">
                <div className="res-item gold">
                  <div className="icon gold-icon"></div> {resources.gold.toLocaleString()}
                </div>
                <div className="res-item elixir">
                  <div className="icon elixir-icon"></div> {resources.elixir.toLocaleString()}
                </div>
              </div>
              <button className="settings-btn" onClick={() => setIsSettingsOpen(true)}>
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
            onDelete={handleDeleteBuilding}
            onUpgrade={handleUpgradeBuilding}
            onMove={() => (window as any).moveSelectedBuilding()}
            upgradeCost={wallUpgradeCostOverride}
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
                {visibleTroops.map(t => {
                  const type = t as keyof typeof army;
                  const count = army[type];
                  return (
                    <button
                      key={type}
                      className={`troop-sel-btn ${type} ${selectedTroopType === type ? 'active' : ''} ${count <= 0 ? 'disabled' : ''}`}
                      disabled={count <= 0}
                      onClick={() => count > 0 && setSelectedTroopType(type)}>
                      <div className={`icon ${type}-icon`}></div> {count}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* NEXT MAP button - separate right panel, only before battle starts */}
        {view === 'ATTACK' && !battleStarted && (
          <div className="scout-panel">
            <button className="action-btn next-map" onClick={() => (window as any).findNewMap?.()}>
              <span className="btn-icon">🗺️</span>
              <span className="btn-label">NEXT</span>
            </button>
          </div>
        )}

        {/* HOME button - separate left panel during attack */}
        {view === 'ATTACK' && (
          <div className="home-panel">
            <button className="action-btn home" onClick={handleGoHome}>
              <span className="btn-icon">🏠</span>
              <span className="btn-label">HOME</span>
            </button>
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
                  <span className="btn-icon">🎯</span>
                  <span className="btn-label">PRACTICE</span>
                </button>
                <button
                  className={`raid-btn hurry ${capacity.current === 0 ? 'disabled' : ''}`}
                  onClick={() => { if (capacity.current > 0) { handleRaidNow(); setIsTrainingOpen(false); } }}
                  disabled={capacity.current === 0}
                >
                  <span className="btn-icon">🔍</span>
                  <span className="btn-label">FIND MATCH</span>
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
                {Object.values(TROOP_DEFINITIONS).filter(t => t.id !== 'romanwarrior').map(t => {
                  const canAfford = resources.elixir >= t.cost;
                  const hasSpace = capacity.current + t.space <= capacity.max;
                  const isAvailable = canAfford && hasSpace;

                  return (
                    <div
                      key={t.id}
                      className={`troop-grid-item ${!isAvailable ? 'disabled' : ''}`}
                      onClick={() => isAvailable && handleTrainTroop(t.id as any)}
                    >
                      <div className="count-badge">{t.space}</div>
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
                  let cost = b.cost;
                  let name = b.name;

                  // Dynamic Wall Cost/Level in Shop
                  const [shopWallLevel, setShopWallLevel] = useState(1);
                  useEffect(() => {
                    const checkWall = async () => {
                      if (b.id === 'wall') {
                        const world = await Backend.getWorld(user?.id || 'player_home');
                        if (world) {
                          const walls = world.buildings.filter((w: any) => w.type === 'wall');
                          if (walls.length > 0) {
                            setShopWallLevel(Math.max(...walls.map((w: any) => w.level || 1)));
                          }
                        }
                      }
                    };
                    checkWall();
                  }, []);

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
                          handleSelect(b.id);
                          setIsBuildingOpen(false);
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
      )}
      {showCloudOverlay && (
        <div className={`cloud-overlay ${cloudOpening ? 'opening' : ''}`}>
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

              <div className="setting-row" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #333' }}>
                <button
                  className="action-btn"
                  style={{ backgroundColor: '#ff4444', width: '100%' }}
                  onClick={async () => {
                    const confirmName = prompt('PERMANENTLY DELETE ACCOUNT? This will erase all buildings, resources, and your login. Type "DELETE" to confirm.');
                    if (confirmName === 'DELETE') {
                      await Backend.deleteWorld(user?.id || 'player_home');
                      await Auth.deleteAccount(user?.id || 'player_home');
                      window.location.reload();
                    }
                  }}
                >
                  DELETE ACCOUNT (PERMANENT)
                </button>
                <button
                  className="action-btn"
                  style={{ backgroundColor: '#444', width: '100%', marginTop: '10px' }}
                  onClick={() => {
                    Auth.logout();
                    window.location.reload();
                  }}
                >
                  LOGOUT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Battle Results Screen */}
      {showBattleResults && (
        <div className="modal-overlay">
          <div className="battle-results">
            <h1 className="battle-results-title">VICTORY!</h1>
            <div className="battle-results-stats">
              <div className="battle-stat">
                <span className="battle-stat-label">DESTRUCTION:</span>
                <span className="battle-stat-value destruction">{battleStats.destruction}%</span>
              </div>
              <div className="battle-stat">
                <span className="battle-stat-label">GOLD LOOTED:</span>
                <span className="battle-stat-value">
                  <div className="icon gold-icon" style={{ display: 'inline-block', marginRight: '8px' }}></div>
                  {battleStats.goldLooted}
                </span>
              </div>
              <div className="battle-stat">
                <span className="battle-stat-label">ELIXIR LOOTED:</span>
                <span className="battle-stat-value">
                  <div className="icon elixir-icon" style={{ display: 'inline-block', marginRight: '8px' }}></div>
                  {battleStats.elixirLooted}
                </span>
              </div>
            </div>
            <button
              className="battle-home-btn"
              onClick={() => {
                setShowBattleResults(false);
                const scene = gameRef.current?.scene.getScene('MainScene') as any;
                if (scene) {
                  scene.showCloudTransition(() => {
                    setView('HOME');
                    setSelectedInMap(null);
                    scene.goHome();
                  });
                }
              }}
            >
              <span className="btn-icon">🏡</span>
              <span className="btn-label">GO HOME</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



export default App;
