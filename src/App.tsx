
import { useCallback, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { GameConfig } from './game/GameConfig';
import type { GameMode } from './game/types/GameMode';
import { BUILDING_DEFINITIONS, TROOP_DEFINITIONS, type BuildingType, getBuildingStats } from './game/config/GameDefinitions';
import { Backend } from './game/backend/GameBackend';
import { Auth } from './game/backend/Auth';
import { gameManager } from './game/GameManager';
import { MobileUtils } from './game/utils/MobileUtils';
import { CloudOverlay } from './components/CloudOverlay';
import { TrainingModal } from './components/TrainingModal';
import { BuildingShopModal } from './components/BuildingShopModal';
import { BattleResultsModal } from './components/BattleResultsModal';
import { Hud } from './components/Hud';
import { DebugMenu } from './components/DebugMenu';
import { NotificationsPanel } from './components/NotificationsPanel';
import { LeaderboardPanel } from './components/LeaderboardPanel';
import { AccountModal } from './components/AccountModal';
import './App.css';

// Initialize mobile support
MobileUtils.setupMobileViewport();
MobileUtils.preventDefaultTouchBehaviors();



function App() {
  const gameRef = useRef<Phaser.Game | null>(null);

  type UserProfile = { id: string; email: string; username: string; lastLogin: number };
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const isLockedOut = !user || !isOnline;

  const [loading, setLoading] = useState(true);
  const [showCloudOverlay, setShowCloudOverlay] = useState(true);
  const [cloudOpening, setCloudOpening] = useState(false);
  const [cloudOverlayLoading, setCloudOverlayLoading] = useState(true);
  const [cloudLoadingProgress, setCloudLoadingProgress] = useState(4);
  const [cloudTransitionReward, setCloudTransitionReward] = useState<number | null>(null);
  const [lootAnimating, setLootAnimating] = useState<{ amount: number } | null>(null);
  const cloudOpenTimerRef = useRef<number | null>(null);
  const cloudHideTimerRef = useRef<number | null>(null);
  const [resources, setResources] = useState({ sol: 0 });
  const resourcesRef = useRef(resources);
  const [army, setArmy] = useState({ warrior: 0, archer: 0, giant: 0, ward: 0, recursion: 0, ram: 0, stormmage: 0, golem: 0, sharpshooter: 0, mobilemortar: 0, davincitank: 0, phalanx: 0 });
  const [isMobile] = useState(() => MobileUtils.isMobile());

  useEffect(() => {
    let cancelled = false;
    Auth.ensureUser()
      .then(({ user: authUser, online }) => {
        if (cancelled) return;
        if (authUser) {
          setUser({ id: authUser.id, email: authUser.email, username: authUser.username, lastLogin: Date.now() });
        } else {
          setUser(null);
        }
        setIsOnline(online);
      })
      .catch(error => {
        console.warn('Auth init failed:', error);
        if (!cancelled) {
          setUser(null);
          setIsOnline(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuthReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applySolDelta = useCallback(async (delta: number, reason: string, refId?: string) => {
    if (!user) return { applied: false, sol: resourcesRef.current.sol };

    const userId = user.id || 'default_player';
    const currentSol = resourcesRef.current.sol;
    if (delta < 0 && currentSol + delta < 0) {
      return { applied: false, sol: currentSol };
    }

    const optimisticSol = Math.max(0, currentSol + delta);
    resourcesRef.current = { sol: optimisticSol };
    setResources({ sol: optimisticSol });

    if (!isOnline) {
      return { applied: true, sol: optimisticSol };
    }

    const requestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    void Backend.applyResourceDelta(userId, delta, reason, refId, requestId)
      .then(server => {
        if (!server || typeof server.sol !== 'number') return;
        const reconciledSol = Math.max(0, server.sol);
        resourcesRef.current = { sol: reconciledSol };
        setResources({ sol: reconciledSol });
      })
      .catch(async error => {
        console.warn('Resource sync failed, reconciling from server:', error);
        try {
          await Backend.calculateOfflineProduction(userId);
          const cached = Backend.getCachedWorld(userId);
          if (cached) {
            const reconciledSol = Math.max(0, cached.resources.sol);
            resourcesRef.current = { sol: reconciledSol };
            setResources({ sol: reconciledSol });
            return;
          }
        } catch (reconcileError) {
          console.warn('Resource reconcile failed:', reconcileError);
        }

        resourcesRef.current = { sol: currentSol };
        setResources({ sol: currentSol });
      });

    return { applied: true, sol: optimisticSol };
  }, [user, isOnline]);


  useEffect(() => {
    return () => {
      gameManager.clearUI();
    };
  }, []);

  // Safety net: flush any pending save when the user navigates away or reloads.
  // Uses keepalive fetch so the request survives page unload.
  useEffect(() => {
    const handleBeforeUnload = () => {
      Backend.flushBeforeUnload();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const clearCloudTimers = useCallback(() => {
    if (cloudOpenTimerRef.current) {
      window.clearTimeout(cloudOpenTimerRef.current);
      cloudOpenTimerRef.current = null;
    }
    if (cloudHideTimerRef.current) {
      window.clearTimeout(cloudHideTimerRef.current);
      cloudHideTimerRef.current = null;
    }
  }, []);

  const beginVillageLoadCloud = useCallback((progress: number) => {
    clearCloudTimers();
    setCloudOpening(false);
    setCloudOverlayLoading(true);
    setCloudLoadingProgress(Math.max(0, Math.min(100, Math.floor(progress))));
    setCloudTransitionReward(null);
    setShowCloudOverlay(true);
  }, [clearCloudTimers]);

  const updateVillageLoadCloud = useCallback((progress: number) => {
    setCloudLoadingProgress(Math.max(0, Math.min(100, Math.floor(progress))));
  }, []);

  const revealVillageFromCloud = useCallback(() => {
    clearCloudTimers();
    setCloudLoadingProgress(100);

    cloudOpenTimerRef.current = window.setTimeout(() => {
      setCloudOverlayLoading(false);
      setCloudOpening(true);
      cloudHideTimerRef.current = window.setTimeout(() => {
        setShowCloudOverlay(false);
        setCloudOpening(false);
      }, 650);
    }, 220);
  }, [clearCloudTimers]);

  useEffect(() => {
    return () => {
      clearCloudTimers();
    };
  }, [clearCloudTimers]);

  // Load World & Resources once user is known
  useEffect(() => {
    if (!authReady) return;

    if (!user || !isOnline) {
      clearCloudTimers();
      setLoading(false);
      setCloudOverlayLoading(false);
      setShowCloudOverlay(false);
      setCloudOpening(false);
      return;
    }

    const init = async () => {
      let loaded = false;
      try {
        setLoading(true);
        beginVillageLoadCloud(8);
        const userId = user.id || 'default_player';

        // Always fetch fresh from server when online to avoid stale localStorage data.
        // This prevents showing outdated building positions/levels after switching browsers.
        updateVillageLoadCloud(24);
        let world = isOnline
          ? await Backend.forceLoadFromCloud(userId)
          : Backend.getCachedWorld(userId);

        const needsBootstrap = !world || !world.buildings || world.buildings.length === 0;
        if (needsBootstrap) {
          updateVillageLoadCloud(40);
          if (isOnline) {
            const bootstrapped = await Backend.bootstrapBase(userId);
            if (bootstrapped) {
              world = bootstrapped;
            } else {
              console.error('Online base unavailable. Skipping local creation to avoid overwrite.');
              return;
            }
          } else {
            world = await Backend.createWorld(userId, 'PLAYER');
          }
        }

        updateVillageLoadCloud(58);
        const offline = await Backend.calculateOfflineProduction(userId);

        // Re-read from cache which now has updated wallet balance from production
        const latestWorld = Backend.getCachedWorld(userId);
        if (latestWorld) {
          world = latestWorld;
        }
        if (!world) {
          console.error('Failed to initialize base.');
          return;
        }

        updateVillageLoadCloud(72);
        setResources({
          sol: Math.max(0, world.resources.sol)
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
        updateVillageLoadCloud(88);
        const scene = gameRef.current?.scene.getScene('MainScene') as any;
        if (scene && scene.updateUsername) {
          scene.updateUsername(user.username);
        }

        // IMPORTANT: Trigger Phaser to reload the base using the now-known userId
        await gameManager.loadBase();
        updateVillageLoadCloud(98);
        loaded = true;

        if (offline.sol > 0) {
          console.log(`Welcome back ${user.username}! Offline Production: ${offline.sol} SOL`);
        }
      } catch (error) {
        console.error('Error initializing game:', error);
      } finally {
        setLoading(false);
        if (!loaded) {
          setCloudLoadingProgress(100);
        }
        revealVillageFromCloud();
      }
    };

    init();
  }, [authReady, user, isOnline, beginVillageLoadCloud, updateVillageLoadCloud, revealVillageFromCloud, clearCloudTimers]);

  // Persist resources & army
  useEffect(() => {
    if (user && !loading) {
      try {
        const userId = user.id || 'default_player';
        Backend.updateResources(userId, resources.sol);
        Backend.updateArmy(userId, army);
      } catch (error) {
        console.error('Error saving game state:', error);
      }
    }
  }, [resources, army, user, loading]);
  const [capacity, setCapacity] = useState({ current: 0, max: 30 });
  const [selectedTroopType, setSelectedTroopType] = useState<'warrior' | 'archer' | 'giant' | 'ward' | 'recursion' | 'ram' | 'stormmage' | 'golem' | 'sharpshooter' | 'mobilemortar' | 'davincitank' | 'phalanx'>('warrior');
  const [visibleTroops, setVisibleTroops] = useState<string[]>([]);
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);
  const [isBuildingOpen, setIsBuildingOpen] = useState(false);
  const [view, setView] = useState<GameMode>('HOME');
  const [selectedInMap, setSelectedInMap] = useState<string | null>(null);
  const [selectedBuildingInfo, setSelectedBuildingInfo] = useState<{ id: string; type: BuildingType; level: number } | null>(null);
  const [battleStats, setBattleStats] = useState({ destruction: 0, solLooted: 0 });
  const [battleStarted, setBattleStarted] = useState(false); // Track if first troop deployed
  const [isExiting, setIsExiting] = useState(false);
  const [showBattleResults, setShowBattleResults] = useState(false);
  const [buildingCounts, setBuildingCounts] = useState<Record<BuildingType, number>>({} as Record<BuildingType, number>);
  const [shopWallLevel, setShopWallLevel] = useState(1);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [scoutTarget, setScoutTarget] = useState<{ userId: string; username: string } | null>(null);
  const selectedInMapRef = useRef<string | null>(null);
  const armyRef = useRef(army);
  const selectedTroopTypeRef = useRef(selectedTroopType);
  const battleStatsRef = useRef(battleStats);

  useEffect(() => {
    selectedInMapRef.current = selectedInMap;
    armyRef.current = army;
    selectedTroopTypeRef.current = selectedTroopType;
    battleStatsRef.current = battleStats;
    resourcesRef.current = resources;
  }, [selectedInMap, army, selectedTroopType, battleStats, resources]);

  const handleLoginAccount = async (identifier: string, password: string) => {
    setLoading(true);
    try {
      const existingId = user?.id;
      if (existingId) {
        await Backend.flushPendingSave();
        Backend.clearCacheForUser(existingId);
      }
      const authUser = await Auth.login(identifier, password);
      // Clear any stale cache for the NEW user from a previous session on this browser
      Backend.clearCacheForUser(authUser.id);
      setUser({ id: authUser.id, email: authUser.email, username: authUser.username, lastLogin: Date.now() });
      setIsOnline(true);
      setIsAccountOpen(false);
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const handleRegisterAccount = async (email: string, username: string, password: string) => {
    setLoading(true);
    try {
      const existingId = user?.id;
      if (existingId) {
        await Backend.flushPendingSave();
        Backend.clearCacheForUser(existingId);
      }
      const authUser = await Auth.register(email, username, password);
      // Clear any stale cache for the NEW user from a previous session on this browser
      Backend.clearCacheForUser(authUser.id);
      setUser({ id: authUser.id, email: authUser.email, username: authUser.username, lastLogin: Date.now() });
      setIsOnline(true);
      setIsAccountOpen(false);
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const handleLogoutAccount = async () => {
    setLoading(true);
    try {
      if (user?.id) {
        await Backend.flushPendingSave();
        Backend.clearCacheForUser(user.id);
      }
      await Auth.logout();
      setUser(null);
      setIsOnline(false);
      setIsAccountOpen(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Ensure game is destroyed to clean up state
    if (!user || !isOnline) {
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
        clearCloudTimers();
        setCloudOverlayLoading(false);
        setCloudLoadingProgress(0);
        setCloudOpening(false);
        setShowCloudOverlay(true);
      },
      hideCloudOverlay: () => {
        clearCloudTimers();
        setCloudOverlayLoading(false);
        setCloudOpening(true); // Start opening animation
        cloudHideTimerRef.current = window.setTimeout(() => {
          setShowCloudOverlay(false);
          setCloudOpening(false);
          // Trigger count-up animation if there was a reward
          setCloudTransitionReward(prev => {
            if (prev && prev > 0) {
              setLootAnimating({ amount: prev });
            }
            return null;
          });
        }, 600); // Match CSS animation duration
      },
      addSol: (amount: number) => {
        // Update display locally only — no server call.
        // Server tracks production independently via applyProduction on load.
        // Sending production ticks to the server caused race conditions with
        // spend calls, making the balance bounce back to pre-spend values.
        setResources(prev => ({ ...prev, sol: Math.max(0, prev.sol + amount) }));
      },
      setGameMode: (mode: GameMode) => {
        setView(mode);
        if (mode === 'HOME') {
          setScoutTarget(null);
        }
        if (mode === 'ATTACK') {
          setBattleStats({ destruction: 0, solLooted: 0 });
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
      updateBattleStats: (destruction: number, sol: number) => {
        setBattleStats({ destruction, solLooted: sol });
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
      onRaidEnded: async (solLooted: number) => {
        const scene = gameRef.current?.scene.getScene('MainScene') as any;
        const enemyWorld = scene?.currentEnemyWorld;
        const destruction = battleStatsRef.current.destruction;
        let lootWon = Math.max(0, solLooted);

        if (enemyWorld && isOnline && !enemyWorld.isBot && enemyWorld.id !== 'practice') {
          const result = await Backend.recordAttack(
            enemyWorld.id,
            user?.id || '',
            user?.username || 'Unknown',
            solLooted,
            destruction,
            enemyWorld.attackId
          );
          const lootApplied = typeof result?.lootApplied === 'number' ? result.lootApplied : null;
          if (result?.attackerBalance !== undefined) {
            setResources({ sol: Math.max(0, result.attackerBalance) });
          } else if (lootApplied !== null) {
            setResources(prev => ({ ...prev, sol: prev.sol + lootApplied }));
          }
          if (lootApplied !== null) {
            setBattleStats(prev => ({ ...prev, solLooted: lootApplied }));
            lootWon = Math.max(0, lootApplied);
          } else {
            lootWon = 0;
          }
        } else {
          const delta = await applySolDelta(solLooted, 'battle_loot');
          if (!delta.applied) {
            lootWon = 0;
          }
        }

        // Auto-trigger "Return Home" flow on raid end
        setShowBattleResults(false);
        transitionHome(lootWon);
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
        // Base cap = 30. L1 = 20, L2 = 25, L3+ = 30 per camp.
        // With 4 L3 camps this reaches the intended player cap of 150.
        const totalCapacity = 30 + campLevels.reduce((sum, level) => {
          if (level >= 3) return sum + 30;
          if (level >= 2) return sum + 25;
          return sum + 20;
        }, 0);
        setCapacity(prev => ({ ...prev, max: Math.min(150, totalCapacity) }));
      },
      closeMenus: () => {
        setIsTrainingOpen(false);
        setIsBuildingOpen(false);
        setSelectedInMap(null);
        setSelectedBuildingInfo(null);
      }
    });

    const pressedKeys = new Set<string>();
    let bonusComboTriggered = false;

    // 'M' keybind for moving, 'D' for debug overlay, and 'B+M' debug bonus.
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const key = e.key.toLowerCase();
      pressedKeys.add(key);
      const bonusComboActive = pressedKeys.has('b') && pressedKeys.has('m');

      if (bonusComboActive) {
        if (!bonusComboTriggered) {
          bonusComboTriggered = true;
          void applySolDelta(10_000, 'debug_bonus_combo');
        }
        return;
      }

      if (e.repeat) return;

      if (key === 'd') {
        setIsDebugOpen(prev => !prev);
        return;
      }
      if (key === 'm' && selectedInMapRef.current) {
        gameManager.moveSelectedBuilding();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      pressedKeys.delete(key);
      if (!(pressedKeys.has('b') && pressedKeys.has('m'))) {
        bonusComboTriggered = false;
      }
    };

    const clearPressedKeys = () => {
      pressedKeys.clear();
      bonusComboTriggered = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearPressedKeys);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearPressedKeys);
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [user, isOnline, applySolDelta, clearCloudTimers]);


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
        const maxPlacedLevel = walls.length > 0 ? Math.max(...walls.map((w: any) => w.level || 1)) : 1;
        const storedWallLevel = Number((world as any).wallLevel ?? 0);
        const level = Number.isFinite(storedWallLevel) && storedWallLevel > 0
          ? Math.max(maxPlacedLevel, Math.floor(storedWallLevel))
          : maxPlacedLevel;
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
                const maxPlacedLevel = walls.length > 0 ? Math.max(...walls.map((w: any) => w.level || 1)) : 1;
                const storedWallLevel = Number((world as any).wallLevel ?? 0);
                const wallLevel = Number.isFinite(storedWallLevel) && storedWallLevel > 0
                  ? Math.max(maxPlacedLevel, Math.floor(storedWallLevel))
                  : maxPlacedLevel;
                cost = def.cost * wallLevel;
              }
            } catch (error) {
              console.error('Error calculating wall cost:', error);
            }
          }
          void applySolDelta(-cost, 'build');
        }
        refreshBuildingCounts();
      }
    });
  }, [user, refreshBuildingCounts, applySolDelta]);

  const handleSelect = (type: string) => {
    gameManager.selectBuilding(type);
    // Close the modal after selection
    setIsBuildingOpen(false);
  };

  const handleTrainTroop = async (type: string) => {
    const def = TROOP_DEFINITIONS[type as keyof typeof TROOP_DEFINITIONS];
    if (!def) return;
    const cost = def.cost;
    const space = def.space;

    if (resources.sol < cost) {
      alert("Not enough SOL!");
      return;
    }
    if (capacity.current + space > capacity.max) {
      alert("Not enough housing space! Build more Army Camps!");
      return;
    }

    if (isOnline) {
      const result = await applySolDelta(-cost, 'train_troop');
      if (!result.applied) {
        alert("Not enough SOL!");
        return;
      }
    }

    setArmy(prev => {
      const key = type as keyof typeof prev;
      return { ...prev, [key]: (prev[key] ?? 0) + 1 };
    });
    if (!isOnline) {
      setResources(prev => ({
        ...prev,
        sol: Math.max(0, prev.sol - cost)
      }));
    }
    setCapacity(prev => ({ ...prev, current: prev.current + space }));
  };

  const handleUntrainTroop = async (type: string) => {
    if (army[type as keyof typeof army] <= 0) return;
    const def = TROOP_DEFINITIONS[type as keyof typeof TROOP_DEFINITIONS];
    if (!def) return;
    const cost = def.cost;
    const space = def.space;

    if (isOnline) {
      const result = await applySolDelta(cost, 'untrain_troop');
      if (!result.applied) {
        return;
      }
    }

    setArmy(prev => {
      const key = type as keyof typeof prev;
      return { ...prev, [key]: (prev[key] ?? 0) - 1 };
    });
    if (!isOnline) {
      setResources(prev => ({ ...prev, sol: prev.sol + cost }));
    }
    setCapacity(prev => ({ ...prev, current: prev.current - space }));
  };

  const transitionHome = useCallback((rewardAmount: number = 0) => {
    setCloudTransitionReward(rewardAmount > 0 ? Math.floor(rewardAmount) : null);
    const scene = gameRef.current?.scene.getScene('MainScene') as any;
    if (scene) {
      scene.showCloudTransition(async () => {
        setView('HOME');
        setSelectedInMap(null);
        setScoutTarget(null);
        await scene.goHome();
      });
    } else {
      setCloudTransitionReward(null);
      setView('HOME');
      setSelectedInMap(null);
      setScoutTarget(null);
    }
  }, []);

  const handleStartAttack = () => {
    if (capacity.current === 0) return;
    // Don't set view here - the game will call setGameMode when transition is complete
    gameManager.startAttack();
  };


  const handleGoHome = () => {
    transitionHome();
  };

  const handleNextMap = () => {
    if (scoutTarget) return;
    gameManager.findNewMap();
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
    if (isOnline) {
      gameManager.startOnlineAttack();
    } else {
      handleRaidNow();
    }
    setIsTrainingOpen(false);
  };

  const handleAttackUser = (userId: string, username: string) => {
    if (capacity.current === 0) {
      alert('Train some troops first!');
      return;
    }
    // Close any open modals
    setIsTrainingOpen(false);
    setScoutTarget(null);
    // Start attack on specific user
    gameManager.startAttackOnUser(userId, username);
  };

  const handleScoutUser = (userId: string, username: string) => {
    // Close any open modals
    setIsTrainingOpen(false);
    setScoutTarget({ userId, username });
    gameManager.startScoutOnUser(userId, username);
  };

  const handleAttackScouted = () => {
    if (!scoutTarget) return;
    if (capacity.current === 0) {
      setIsTrainingOpen(true);
      return;
    }
    const { userId, username } = scoutTarget;
    setScoutTarget(null);
    gameManager.startAttackOnUser(userId, username);
  };

  const handleBattleResultsGoHome = () => {
    setShowBattleResults(false);
    transitionHome(Math.max(0, battleStatsRef.current.solLooted));
  };


  const handleDeleteBuilding = () => {
    if (selectedInMap && selectedBuildingInfo) {
      gameManager.deleteSelectedBuilding();
      const stats = getBuildingStats(selectedBuildingInfo.type, selectedBuildingInfo.level);
      const refund = Math.floor(stats.cost * 0.8);
      if (isOnline) {
        void applySolDelta(refund, 'refund_building');
      } else {
        setResources(prev => ({ ...prev, sol: prev.sol + refund }));
      }
      setSelectedInMap(null);
      setSelectedBuildingInfo(null);
    }
  };

  const upgradeInProgressRef = useRef(false);

  const handleUpgradeBuilding = async () => {
    // Serialize upgrade requests, but don't wait for save round-trips.
    if (upgradeInProgressRef.current) return;
    if (selectedInMap && selectedBuildingInfo) {
      const def = BUILDING_DEFINITIONS[selectedBuildingInfo.type];
      const maxLevel = def.maxLevel || 1;

      if (selectedBuildingInfo.level < maxLevel) {
        upgradeInProgressRef.current = true;
        try {
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

          if (resources.sol >= upgradeCost) {
            if (isOnline) {
              const result = await applySolDelta(-upgradeCost, 'upgrade_building');
              if (!result.applied) return;
            } else {
              // Subtract cost locally
              setResources(prev => ({
                ...prev,
                sol: Math.max(0, prev.sol - upgradeCost)
              }));
            }

            // Start the save immediately (returns a promise).
            // upgradeBuilding updates the cache synchronously, then fires
            // saveWorldDirect which sends the fetch without queuing.
            const savePromise = Backend.upgradeBuilding(user?.id || 'default_player', selectedInMap);

            // Visual update happens instantly — don't wait for network
            const newLevel = gameManager.upgradeSelectedBuilding();
            if (newLevel) {
              setSelectedBuildingInfo(prev => prev ? { ...prev, level: newLevel } : null);
            }

            // Fire save in background so next upgrade can start immediately.
            void savePromise.catch(error => {
              console.error('Upgrade save failed:', error);
            });
          }
        } finally {
          upgradeInProgressRef.current = false;
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

  // Wait for the initial session check before rendering game/login UI.
  if (!authReady) {
    return (
      <div className="app-container">
        <CloudOverlay
          show={true}
          opening={false}
          loading={true}
          loadingProgress={20}
        />
      </div>
    );
  }

  return (
    <div className="app-container">
      <div id="game-container" style={{ display: isLockedOut ? 'none' : 'block' }} />

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
        isMobile={isMobile}
        isScouting={Boolean(scoutTarget)}
        pendingLoot={cloudTransitionReward}
        lootAnimating={lootAnimating}
        onLootAnimationDone={() => setLootAnimating(null)}
        onOpenSettings={() => setIsAccountOpen(true)}
        onOpenBuild={() => setIsBuildingOpen(true)}
        onOpenTrain={() => setIsTrainingOpen(true)}
        onStartAttack={handleStartAttack}
        onSelectTroop={(type) => setSelectedTroopType(type as typeof selectedTroopType)}
        onNextMap={handleNextMap}
        onGoHome={handleGoHome}
        onDeleteBuilding={handleDeleteBuilding}
        onUpgradeBuilding={handleUpgradeBuilding}
        onMoveBuilding={() => gameManager.moveSelectedBuilding()}
      />

      {view === 'ATTACK' && scoutTarget && (
        <div className="scout-action-panel">
          <div className="scout-label">SCOUTING {scoutTarget.username.toUpperCase()}</div>
          <button className="action-btn scout-attack" onClick={handleAttackScouted}>
            ATTACK
          </button>
        </div>
      )}

      {/* Notifications and Leaderboard - only show when in HOME mode and online */}
      {view === 'HOME' && isOnline && user && (
        <div className="top-right-btns">
          <LeaderboardPanel
            currentUserId={user.id}
            isOnline={isOnline}
            onAttackUser={handleAttackUser}
            onScoutUser={handleScoutUser}
          />
          <NotificationsPanel userId={user.id} isOnline={isOnline} />
        </div>
      )}

      <DebugMenu isOpen={isDebugOpen} />

      <AccountModal
        isOpen={isAccountOpen || isLockedOut}
        currentUser={user}
        isOnline={isOnline}
        onClose={() => setIsAccountOpen(false)}
        onLogin={handleLoginAccount}
        onRegister={handleRegisterAccount}
        onLogout={handleLogoutAccount}
      />

      {isLockedOut && (
        <div className="auth-lock-overlay">
          <div className="auth-lock-panel">
            <h2>LOGIN REQUIRED</h2>
            <p>Sign in to access your base and play online.</p>
            <button className="action-btn" onClick={() => setIsAccountOpen(true)}>
              OPEN LOGIN
            </button>
          </div>
        </div>
      )}

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

      <CloudOverlay
        show={showCloudOverlay}
        opening={cloudOpening}
        loading={cloudOverlayLoading}
        loadingProgress={cloudLoadingProgress}
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
