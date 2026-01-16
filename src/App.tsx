
import { useCallback, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { GameConfig } from './game/GameConfig';
import type { GameMode } from './game/types/GameMode';
import { BUILDING_DEFINITIONS, TROOP_DEFINITIONS, type BuildingType, getBuildingStats } from './game/config/GameDefinitions';
import { Backend } from './game/backend/GameBackend';
import { Auth, AuthService, type UserProfile } from './game/backend/AuthService';
import { gameManager } from './game/GameManager';
import { CloudOverlay } from './components/CloudOverlay';
import { TrainingModal } from './components/TrainingModal';
import { BuildingShopModal } from './components/BuildingShopModal';
import { SettingsModal } from './components/SettingsModal';
import { BattleResultsModal } from './components/BattleResultsModal';
import { Hud } from './components/Hud';
import { DebugMenu } from './components/DebugMenu';
import './App.css';



function App() {
  const gameRef = useRef<Phaser.Game | null>(null);

  // Initialize user - start with null and set it in useEffect to ensure DOM is ready
  const [user, setUser] = useState<UserProfile | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState({ gold: 0, elixir: 0 });
  const [army, setArmy] = useState({ warrior: 0, archer: 0, giant: 0, ward: 0, recursion: 0, ram: 0, stormmage: 0, golem: 0, sharpshooter: 0, mobilemortar: 0, davincitank: 0, phalanx: 0 });

  // Initialize user on mount - ensure DOM is ready
  useEffect(() => {
    if (!user) {
      try {
        console.log('Initializing user...');
        const current = Auth.getCurrentUser();
        if (current) {
          console.log('Found existing user:', current.username);
          setUser(current);
        } else {
          console.log('Creating default user...');
          const defaultUser = AuthService.getOrCreateDefaultUser();
          console.log('Default user created:', defaultUser.username);
          setUser(defaultUser);
        }
      } catch (error) {
        console.error('Error initializing user:', error);
        // Fallback: create minimal user
        const fallbackUser: UserProfile = {
          id: 'default_player',
          username: 'Player',
          lastLogin: Date.now()
        };
        setUser(fallbackUser);
      }
    }
  }, [user]);

  useEffect(() => {
    return () => {
      gameManager.clearUI();
    };
  }, []);

  // Load World & Resources once user is known
  useEffect(() => {
    if (!user) return;

    const init = async () => {
      try {
        setLoading(true);
        const userId = user.id || 'default_player';
        let world = await Backend.getWorld(userId);
        if (!world) {
          world = await Backend.createWorld(userId, 'PLAYER');
        }

        const offline = await Backend.calculateOfflineProduction(userId);
        const latestWorld = await Backend.getWorld(userId);
        if (latestWorld) {
          world = latestWorld;
        }
        setResources({
          gold: Math.max(0, world.resources.gold),
          elixir: Math.max(0, world.resources.elixir)
        });

        // Load Army from storage and sync capacity
        if (world.army) {
          setArmy(prev => ({ ...prev, ...world.army }));

          // Calculate capacity.current from loaded army
          const totalSpace = Object.entries(world.army).reduce((sum, [type, count]) => {
            const def = TROOP_DEFINITIONS[type as keyof typeof TROOP_DEFINITIONS];
            return sum + (def ? def.space * (count as number) : 0);
          }, 0);
          setCapacity(prev => ({ ...prev, current: totalSpace }));
        }

        // Force scene to update username now that we have user and world
        const scene = gameRef.current?.scene.getScene('MainScene') as any;
        if (scene && scene.updateUsername) {
          scene.updateUsername(user.username);
        }

        if (offline.gold > 0 || offline.elixir > 0) {
          console.log(`Welcome back ${user.username}! Offline Production: ${offline.gold} Gold, ${offline.elixir} Elixir`);
        }
      } catch (error) {
        console.error('Error initializing game:', error);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [user]);

  // Persist resources & army
  useEffect(() => {
    if (user && !loading) {
      try {
        const userId = user.id || 'default_player';
        Backend.updateResources(userId, resources.gold, resources.elixir);
        Backend.updateArmy(userId, army);
      } catch (error) {
        console.error('Error saving game state:', error);
      }
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
  const [shopWallLevel, setShopWallLevel] = useState(1);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const selectedInMapRef = useRef<string | null>(null);
  const armyRef = useRef(army);
  const selectedTroopTypeRef = useRef(selectedTroopType);

  useEffect(() => {
    selectedInMapRef.current = selectedInMap;
    armyRef.current = army;
    selectedTroopTypeRef.current = selectedTroopType;
  }, [selectedInMap, army, selectedTroopType]);

  const [cloudOpening, setCloudOpening] = useState(false);

  useEffect(() => {
    // If no user, ensure game is destroyed to clean up state
    if (!user) {
      gameManager.clearUI();
      if (gameRef.current) {
        try {
          gameRef.current.destroy(true);
        } catch (error) {
          console.error('Error destroying game:', error);
        }
        gameRef.current = null;
      }
      return;
    }

    // If game already running, don't recreate
    if (gameRef.current) return;

    // Start new game instance
    try {
      // Ensure game container exists
      const container = document.getElementById('game-container');
      if (!container) {
        console.error('Game container not found!');
        return;
      }
      gameRef.current = new Phaser.Game(GameConfig);
      console.log('Phaser game initialized successfully');
    } catch (error) {
      console.error('Error creating Phaser game:', error);
      return;
    }

    gameManager.registerUI({
      showCloudOverlay: () => {
        setCloudOpening(false);
        setShowCloudOverlay(true);
      },
      hideCloudOverlay: () => {
        setCloudOpening(true); // Start opening animation
        setTimeout(() => {
          setShowCloudOverlay(false);
          setCloudOpening(false);
        }, 600); // Match CSS animation duration
      },
      addGold: (amount: number) => {
        setResources(prev => ({ ...prev, gold: prev.gold + amount }));
      },
      addElixir: (amount: number) => {
        setResources(prev => ({ ...prev, elixir: prev.elixir + amount }));
      },
      setGameMode: (mode: GameMode) => {
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
      },
      updateBattleStats: (destruction: number, gold: number, elixir: number) => {
        setBattleStats({ destruction, goldLooted: gold, elixirLooted: elixir });
      },
      onBuildingSelected: (data: { id: string; type: BuildingType; level: number } | null) => {
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
      },
      onPlacementCancelled: () => {
        setSelectedInMap(null);
      },
      onRaidEnded: (goldLooted: number, elixirLooted: number) => {
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
      },
      getArmy: () => armyRef.current,
      getSelectedTroopType: () => selectedTroopTypeRef.current,
      deployTroop: (type: string) => {
        setBattleStarted(true); // Battle has started!
        setArmy(prev => {
          const def = TROOP_DEFINITIONS[type as keyof typeof TROOP_DEFINITIONS];
          if (def) {
            setCapacity(c => ({ ...c, current: Math.max(0, c.current - def.space) }));
          }
          return { ...prev, [type]: prev[type as keyof typeof prev] - 1 };
        });
      },
      refreshCampCapacity: (campLevels: number[]) => {
        // L1 = 20 space, L2 = 25 space, L3+ = 30 space per camp
        const totalCapacity = 10 + campLevels.reduce((sum, level) => {
          if (level >= 3) return sum + 30;
          if (level >= 2) return sum + 25;
          return sum + 20;
        }, 0);
        setCapacity(prev => ({ ...prev, max: totalCapacity }));
      }
    });

    // 'M' Keybind for moving, 'D' for debug overlay
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key.toLowerCase() === 'd') {
        setIsDebugOpen(prev => !prev);
        return;
      }
      if (e.key.toLowerCase() === 'm' && selectedInMapRef.current) {
        gameManager.moveSelectedBuilding();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [user]);


  const refreshBuildingCounts = useCallback(async () => {
    if (!user) return;
    try {
      const counts = await Backend.getBuildingCounts(user.id || 'default_player');
      setBuildingCounts(counts);
    } catch (error) {
      console.error('Error refreshing building counts:', error);
    }
  }, [user]);

  useEffect(() => {
    if (isBuildingOpen && user) {
      refreshBuildingCounts();
    }
  }, [isBuildingOpen, user]);

  useEffect(() => {
    let cancelled = false;

    const loadShopWallLevel = async () => {
      if (!isBuildingOpen || !user) return;
      try {
        const world = await Backend.getWorld(user.id || 'default_player');
        if (!world || cancelled) return;
        const walls = world.buildings.filter((w: any) => w.type === 'wall');
        const level = walls.length > 0 ? Math.max(...walls.map((w: any) => w.level || 1)) : 1;
        if (!cancelled) setShopWallLevel(level);
      } catch (error) {
        console.error('Error checking wall level:', error);
      }
    };

    loadShopWallLevel();
    return () => {
      cancelled = true;
    };
  }, [isBuildingOpen, user]);

  useEffect(() => {
    if (!user) return;
    
    gameManager.registerUI({
      onBuildingPlaced: async (type: string, isFree: boolean = false) => {
      if (isFree) {
        refreshBuildingCounts();
        return;
      }
      const def = (BUILDING_DEFINITIONS as any)[type];
      if (def) {
        let cost = def.cost;
        if (type === 'wall') {
          try {
            const world = await Backend.getWorld(user.id || 'default_player');
            if (world) {
              const walls = world.buildings.filter((b: any) => b.type === 'wall');
              if (walls.length > 0) {
                const maxLevel = Math.max(...walls.map((w: any) => w.level || 1));
                cost = def.cost * maxLevel;
              }
            }
          } catch (error) {
            console.error('Error calculating wall cost:', error);
          }
        }
        setResources(prev => ({
          ...prev,
          gold: Math.max(0, prev.gold - cost)
        }));
      }
      refreshBuildingCounts();
      }
    });
  }, [user, refreshBuildingCounts]);

  const handleSelect = (type: string) => {
    gameManager.selectBuilding(type);
    // Close the modal after selection
    setIsBuildingOpen(false);
  };

  const handleTrainTroop = (type: string) => {
    const def = TROOP_DEFINITIONS[type as keyof typeof TROOP_DEFINITIONS];
    if (!def) return;
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

    setArmy(prev => {
      const key = type as keyof typeof prev;
      return { ...prev, [key]: (prev[key] ?? 0) + 1 };
    });
    setResources(prev => ({
      ...prev,
      elixir: Math.max(0, prev.elixir - cost)
    }));
    setCapacity(prev => ({ ...prev, current: prev.current + space }));
  };

  const handleUntrainTroop = (type: string) => {
    if (army[type as keyof typeof army] <= 0) return;
    const def = TROOP_DEFINITIONS[type as keyof typeof TROOP_DEFINITIONS];
    if (!def) return;
    const cost = def.cost;
    const space = def.space;

    setArmy(prev => {
      const key = type as keyof typeof prev;
      return { ...prev, [key]: (prev[key] ?? 0) - 1 };
    });
    setResources(prev => ({ ...prev, elixir: prev.elixir + cost }));
    setCapacity(prev => ({ ...prev, current: prev.current - space }));
  };

  const handleStartAttack = () => {
    if (capacity.current === 0) return;
    // Don't set view here - the game will call setGameMode when transition is complete
    gameManager.startAttack();
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
    gameManager.startAttack();
  };

  const handleStartPractice = () => {
    if (capacity.current === 0) return;
    gameManager.startPracticeAttack();
    setIsTrainingOpen(false);
  };

  const handleFindMatch = () => {
    if (capacity.current === 0) return;
    handleRaidNow();
    setIsTrainingOpen(false);
  };

  const handleBattleResultsGoHome = () => {
    setShowBattleResults(false);
    const scene = gameRef.current?.scene.getScene('MainScene') as any;
    if (scene) {
      scene.showCloudTransition(() => {
        setView('HOME');
        setSelectedInMap(null);
        scene.goHome();
      });
    }
  };

  const handleTogglePixelation = () => {
    const newState = !pixelationEnabled;
    setPixelationEnabled(newState);
    gameManager.setPixelation(newState ? 1.5 : 1.0);
  };

  const handleSensitivityChange = (val: number) => {
    setSensitivity(val);
    gameManager.setSensitivity(val);
  };

  const handleResetGame = async () => {
    const confirmName = prompt('PERMANENTLY DELETE ALL DATA? This will erase all buildings, resources, and game data. Type "DELETE" to confirm.');
    if (confirmName === 'DELETE') {
      try {
        await Backend.deleteWorld(user?.id || 'default_player');
        localStorage.clear();
        window.location.reload();
      } catch (error) {
        console.error('Error deleting world:', error);
        alert('Error resetting game. Please refresh the page.');
      }
    }
  };


  const handleDeleteBuilding = () => {
    if (selectedInMap && selectedBuildingInfo) {
      gameManager.deleteSelectedBuilding();
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
          try {
            const world = await Backend.getWorld(user?.id || 'default_player');
            if (world) {
              const count = world.buildings.filter((b: any) => b.type === 'wall' && (b.level || 1) === selectedBuildingInfo.level).length;
              upgradeCost = nextLevelStats.cost * count;
            }
          } catch (error) {
            console.error('Error calculating wall upgrade cost:', error);
          }
        }

        if (resources.gold >= upgradeCost) {
          // Subtract cost
          setResources(prev => ({
            ...prev,
            gold: Math.max(0, prev.gold - upgradeCost)
          }));

          // Sync with backend
          await Backend.upgradeBuilding(user?.id || 'default_player', selectedInMap);

          // Sync with Phaser
          const newLevel = gameManager.upgradeSelectedBuilding();

          // Update local state to refresh InfoPanel
          if (newLevel) {
            setSelectedBuildingInfo(prev => prev ? { ...prev, level: newLevel } : null);
          }
        }
      }
    }
  };

  const buildingList = Object.values(BUILDING_DEFINITIONS);
  const troopList = Object.values(TROOP_DEFINITIONS).filter(t => t.id !== 'romanwarrior');


  // Pre-calculation for UI: Wall Bulk Upgrade Cost
  const [wallUpgradeCostOverride, setWallUpgradeCostOverride] = useState<number | undefined>();

  useEffect(() => {
    const calcWallCost = async () => {
      if (selectedBuildingInfo?.type === 'wall' && view === 'HOME') {
        try {
          const world = await Backend.getWorld(user?.id || 'default_player');
          if (world) {
            const count = world.buildings.filter(b => b.type === 'wall' && (b.level || 1) === selectedBuildingInfo.level).length;
            const nextStats = getBuildingStats('wall', selectedBuildingInfo.level + 1);
            setWallUpgradeCostOverride(nextStats.cost * count);
          }
        } catch (error) {
          console.error('Error calculating wall cost:', error);
        }
      } else {
        setWallUpgradeCostOverride(undefined);
      }
    };
    calcWallCost();
  }, [selectedBuildingInfo, view]);

  // Don't render until user is set
  if (!user) {
    return (
      <div className="app-container">
        <div className="loading-spinner-overlay">
          <div className="spinner"></div>
          <p>INITIALIZING...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {loading && (
        <div className="loading-spinner-overlay">
          <div className="spinner"></div>
          <p>STABILIZING BASE COORDS...</p>
        </div>
      )}
      <div id="game-container" />

      <Hud
        view={view}
        resources={resources}
        battleStats={battleStats}
        battleStarted={battleStarted}
        capacity={capacity}
        visibleTroops={visibleTroops}
        selectedTroopType={selectedTroopType}
        army={army}
        selectedBuildingInfo={selectedBuildingInfo}
        isExiting={isExiting}
        wallUpgradeCostOverride={wallUpgradeCostOverride}
        showCloudOverlay={showCloudOverlay}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenBuild={() => setIsBuildingOpen(true)}
        onOpenTrain={() => setIsTrainingOpen(true)}
        onStartAttack={handleStartAttack}
        onSelectTroop={(type) => setSelectedTroopType(type as typeof selectedTroopType)}
        onNextMap={() => gameManager.findNewMap()}
        onGoHome={handleGoHome}
        onDeleteBuilding={handleDeleteBuilding}
        onUpgradeBuilding={handleUpgradeBuilding}
        onMoveBuilding={() => gameManager.moveSelectedBuilding()}
      />

      <DebugMenu isOpen={isDebugOpen} />

      <TrainingModal
        isOpen={isTrainingOpen}
        showCloudOverlay={showCloudOverlay}
        capacity={capacity}
        resources={resources}
        army={army}
        troops={troopList}
        onClose={() => setIsTrainingOpen(false)}
        onStartPractice={handleStartPractice}
        onFindMatch={handleFindMatch}
        onTrainTroop={handleTrainTroop}
        onUntrainTroop={handleUntrainTroop}
      />

      <BuildingShopModal
        isOpen={isBuildingOpen}
        showCloudOverlay={showCloudOverlay}
        buildingList={buildingList}
        buildingCounts={buildingCounts}
        resources={resources}
        shopWallLevel={shopWallLevel}
        onClose={() => setIsBuildingOpen(false)}
        onSelect={handleSelect}
      />

      <CloudOverlay show={showCloudOverlay} opening={cloudOpening} />

      <SettingsModal
        isOpen={isSettingsOpen}
        pixelationEnabled={pixelationEnabled}
        sensitivity={sensitivity}
        onTogglePixelation={handleTogglePixelation}
        onSensitivityChange={handleSensitivityChange}
        onResetGame={handleResetGame}
        onClose={() => setIsSettingsOpen(false)}
      />

      <BattleResultsModal
        isOpen={showBattleResults}
        stats={battleStats}
        onGoHome={handleBattleResultsGoHome}
      />
    </div>
  );
}



export default App;
