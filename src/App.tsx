
import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { GameConfig } from './game/GameConfig';
import type { GameMode } from './game/scenes/MainScene';

import './App.css';

function App() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [resources, setResources] = useState({ gold: 1000, elixir: 1000 });
  const [army, setArmy] = useState({ warrior: 0, archer: 0, giant: 0, ward: 0, mimic: 0, recursion: 0, voidanchor: 0, chronoswarm: 0, sporemother: 0 });
  const [capacity, setCapacity] = useState({ current: 0, max: 20 });
  const [selectedTroopType, setSelectedTroopType] = useState<'warrior' | 'archer' | 'giant' | 'ward' | 'mimic' | 'recursion' | 'voidanchor' | 'chronoswarm' | 'sporemother'>('warrior');
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);
  const [isBuildingOpen, setIsBuildingOpen] = useState(false);
  const [view, setView] = useState<GameMode>('HOME');
  const [selectedInMap, setSelectedInMap] = useState<string | null>(null);
  const [battleStats, setBattleStats] = useState({ destruction: 0, goldLooted: 0, elixirLooted: 0 });
  const [showCloudOverlay, setShowCloudOverlay] = useState(false);

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
      }
    };

    (window as any).updateBattleStats = (destruction: number, gold: number, elixir: number) => {
      setBattleStats({ destruction, goldLooted: gold, elixirLooted: elixir });
    };

    (window as any).onBuildingSelected = (id: string | null) => {
      setSelectedInMap(id);
    };

    (window as any).onPlacementCancelled = () => {
      setSelected(null);
      setSelectedInMap(null);
    };

    // Note: loot is collected via updateBattleStats -> setBattleStats, then collected separately
    (window as any).onRaidEnded = (goldLooted: number, elixirLooted: number) => {
      setResources(prev => ({
        ...prev,
        gold: prev.gold + goldLooted,
        elixir: prev.elixir + elixirLooted
      }));
      setView('HOME');
      setSelectedInMap(null);
      const scene = gameRef.current?.scene.getScene('MainScene') as any;
      if (scene) {
        scene.showCloudTransition(() => {
          scene.goHome();
        });
      }
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
      setArmy(prev => {
        const housing = { warrior: 1, archer: 1, giant: 5, ward: 3, mimic: 2, recursion: 2, voidanchor: 4, chronoswarm: 2, sporemother: 3 };
        setCapacity(c => ({ ...c, current: Math.max(0, c.current - housing[type]) }));
        return { ...prev, [type]: prev[type] - 1 };
      });
    };

    (window as any).refreshCampCapacity = (count: number) => {
      setCapacity(prev => ({ ...prev, max: Math.max(20, count * 20) }));
    };
  }, [army, selectedTroopType]);

  const handleSelect = (type: string) => {
    const newSelected = selected === type ? null : type;
    setSelected(newSelected);
    (window as any).selectBuilding(newSelected);
  };

  const handleTrainTroop = (type: 'warrior' | 'archer' | 'giant' | 'ward' | 'mimic' | 'recursion' | 'voidanchor' | 'chronoswarm' | 'sporemother') => {
    const costs = { warrior: 25, archer: 40, giant: 150, ward: 80, mimic: 60, recursion: 70, voidanchor: 120, chronoswarm: 55, sporemother: 90 };
    const housing = { warrior: 1, archer: 1, giant: 5, ward: 3, mimic: 2, recursion: 2, voidanchor: 4, chronoswarm: 2, sporemother: 3 };

    const cost = costs[type];
    const space = housing[type];

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

  const handleStartAttack = () => {
    const total = army.warrior + army.archer + army.giant + army.ward + army.mimic + army.recursion + army.voidanchor + army.chronoswarm + army.sporemother;
    if (total === 0) {
      alert("Train some troops first!");
      return;
    }
    // Don't set view here - the game will call setGameMode when transition is complete
    (window as any).startAttack();
  };


  const handleGoHome = () => {
    setView('HOME');
    setSelectedInMap(null);
    (window as any).goHome();
  };

  const handleRaidNow = () => {
    const total = army.warrior + army.archer + army.giant + army.ward + army.mimic + army.recursion + army.voidanchor + army.chronoswarm + army.sporemother;
    if (total === 0) {
      alert("Train some troops first!");
      return;
    }
    (window as any).startAttack();
  };


  const handleDeleteBuilding = () => {
    if (selectedInMap) {
      (window as any).deleteSelectedBuilding();
      setResources(prev => ({ ...prev, gold: prev.gold + 50 }));
      setSelectedInMap(null);
    }
  };

  const buildingList = [
    { id: 'town_hall', name: 'Town Hall', cost: 500, desc: 'The heart of your village.' },
    { id: 'barracks', name: 'Barracks', cost: 200, desc: 'Trains brave troops.' },
    { id: 'cannon', name: 'Cannon', cost: 250, desc: 'Point defense against ground.' },
    { id: 'ballista', name: 'Ballista', cost: 350, desc: 'Heavy single-target damage.' },
    { id: 'xbow', name: 'X-Bow', cost: 800, desc: 'Rapid fire long-range turret.' },
    { id: 'mine', name: 'Gold Mine', cost: 150, desc: 'Produces glorious Gold.' },
    { id: 'elixir_collector', name: 'Elixir Collector', cost: 150, desc: 'Pumps magical Elixir.' },
    { id: 'mortar', name: 'Mortar', cost: 400, desc: 'Splash damage area shell.' },
    { id: 'tesla', name: 'Tesla Coil', cost: 600, desc: 'Hidden zapping trap.' },
    { id: 'wall', name: 'Wall', cost: 50, desc: 'Stops enemies cold.' },
    { id: 'army_camp', name: 'Army Camp', cost: 300, desc: 'Houses your army.' },
    { id: 'prism', name: 'Prism Tower', cost: 550, desc: 'Beam bounces between foes.' },
    { id: 'magmavent', name: 'Magma Vent', cost: 650, desc: 'Erupts with area damage.' },
    { id: 'mindspire', name: 'Mind Spire', cost: 500, desc: 'Confuses and slows enemies.' },
  ];


  return (
    <div className="app-container">
      <div id="game-container" />

      <div className={`hud ${showCloudOverlay ? 'hidden-ui' : ''}`}>

        <div className="hud-top">
          {view === 'HOME' ? (
            <>
              <h1 className="title">CLASH ISO</h1>
              <div className="resources">
                <div className="res-item gold">
                  <div className="icon gold-icon"></div> {resources.gold}
                </div>
                <div className="res-item elixir">
                  <div className="icon elixir-icon"></div> {resources.elixir}
                </div>
              </div>
            </>
          ) : (
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
        </div>

        {selectedInMap && view === 'HOME' && (
          <div className="edit-panel">
            <span className="section-label">SELECTED</span>
            <div className="btn-group">
              <button className="edit-btn" onClick={() => (window as any).moveSelectedBuilding()}>
                <div className="icon move-icon"></div> MOVE
              </button>
              <button className="edit-btn delete" onClick={handleDeleteBuilding}>
                <div className="icon delete-icon"></div> SELL
              </button>
              <button className="edit-btn" onClick={() => { (window as any).deselectBuilding(); setSelectedInMap(null); }}>
                <div className="icon cancel-icon"></div> CANCEL
              </button>
            </div>
          </div>
        )}

        <div className="build-menu">
          {view === 'HOME' ? (
            <div className="menu-inner">
              <div className="menu-section">
                <span className="section-label">Home Actions</span>
                <div className="btn-group main-actions">
                  <button className="action-btn build" onClick={() => setIsBuildingOpen(true)}>🔨 BUILD</button>
                  <button className="action-btn train" onClick={() => setIsTrainingOpen(true)}>⚒️ TRAIN</button>
                  <button className="action-btn enemy" onClick={handleStartAttack}>⚔️ RAID</button>
                </div>

              </div>
              <div className="menu-divider" />
              <div className="menu-section">
                <span className="section-label">Army Space</span>
                <div className="capacity-text">{capacity.current}/{capacity.max}</div>
              </div>
            </div>
          ) : (
            <div className="menu-inner raid">
              <div className="menu-section">
                <span className="section-label">Deploy Troops</span>
                <div className="btn-group">
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
                      className={`troop-sel-btn mimic ${selectedTroopType === 'mimic' ? 'active' : ''}`}
                      onClick={() => setSelectedTroopType('mimic')}>
                      <div className="icon mimic-icon"></div> {army.mimic}
                    </button>
                    <button
                      className={`troop-sel-btn recursion ${selectedTroopType === 'recursion' ? 'active' : ''}`}
                      onClick={() => setSelectedTroopType('recursion')}>
                      <div className="icon recursion-icon"></div> {army.recursion}
                    </button>
                    <button
                      className={`troop-sel-btn voidanchor ${selectedTroopType === 'voidanchor' ? 'active' : ''}`}
                      onClick={() => setSelectedTroopType('voidanchor')}>
                      <div className="icon voidanchor-icon"></div> {army.voidanchor}
                    </button>
                    <button
                      className={`troop-sel-btn chronoswarm ${selectedTroopType === 'chronoswarm' ? 'active' : ''}`}
                      onClick={() => setSelectedTroopType('chronoswarm')}>
                      <div className="icon chronoswarm-icon"></div> {army.chronoswarm}
                    </button>
                    <button
                      className={`troop-sel-btn sporemother ${selectedTroopType === 'sporemother' ? 'active' : ''}`}
                      onClick={() => setSelectedTroopType('sporemother')}>
                      <div className="icon sporemother-icon"></div> {army.sporemother}
                    </button>
                  </div>
                  <button className="action-btn home" onClick={handleGoHome}>HOME</button>
                </div>
              </div>
              <p className="hint">Tap map to deploy</p>
            </div>
          )}
        </div>
      </div>

      {isTrainingOpen && (
        <div className={`modal-overlay ${showCloudOverlay ? 'hidden-ui' : ''}`} onClick={() => setIsTrainingOpen(false)}>

          <div className="training-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Troop Training</h2>
              <div className="header-actions">
                <button className="raid-btn hurry" onClick={() => { handleRaidNow(); setIsTrainingOpen(false); }}>FIND MATCH</button>
                <button className="close-btn" onClick={() => setIsTrainingOpen(false)}>×</button>
              </div>
            </div>

            <div className="modal-body">
              <div className="housing-status">
                Housing Space: <span className={capacity.current >= capacity.max ? 'full' : ''}>{capacity.current}/{capacity.max}</span>
              </div>
              <div className="troop-list">
                {[
                  { id: 'warrior', name: 'Warrior', cost: 25, space: 1, desc: 'Fast melee fighter.' },
                  { id: 'archer', name: 'Archer', cost: 40, space: 1, desc: 'Ranged attacker.' },
                  { id: 'giant', name: 'Giant', cost: 150, space: 5, desc: 'Tank targeting Defenses.' },
                  { id: 'ward', name: 'Ward', cost: 80, space: 3, desc: 'Heals friendly troops.' },
                  { id: 'mimic', name: 'Mimic', cost: 60, space: 2, desc: 'Shapeshifter with burst damage.' },
                  { id: 'recursion', name: 'Recursion', cost: 70, space: 2, desc: 'Splits into copies on death.' },
                  { id: 'voidanchor', name: 'Void Anchor', cost: 120, space: 4, desc: 'Pulls enemies toward it.' },
                  { id: 'chronoswarm', name: 'Chrono Swarm', cost: 55, space: 2, desc: 'Speeds up nearby allies.' },
                  { id: 'sporemother', name: 'Spore Mother', cost: 90, space: 3, desc: 'Heals allies on death.' },
                ].map(t => (

                  <div key={t.id} className="troop-card">
                    <div className={`icon ${t.id}-icon large`}></div>
                    <div className="troop-info">
                      <span className="name">{t.name}</span>
                      <div className="desc-text" style={{ fontSize: '10px', color: '#aaa', marginBottom: '2px' }}>{t.desc}</div>
                      <div className="stats">{t.cost} Elixir • {t.space} Space</div>
                    </div>
                    <button
                      className="train-btn"
                      onClick={() => handleTrainTroop(t.id as any)}
                      disabled={resources.elixir < t.cost || capacity.current + t.space > capacity.max}
                    >
                      TRAIN ({army[t.id as keyof typeof army]})
                    </button>
                  </div>
                ))}
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
                {buildingList.map(b => (
                  <div key={b.id} className="building-grid-item">
                    <div className={`icon ${b.id}-icon large`}></div>
                    <span className="name">{b.name}</span>
                    <span className="desc-text" style={{ fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '4px' }}>{b.desc}</span>
                    <span className="cost">{b.cost}g</span>
                    <button
                      className="grid-btn"
                      onClick={() => { handleSelect(b.id); setIsBuildingOpen(false); }}
                      disabled={resources.gold < b.cost}
                    >
                      BUILD
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}
      {showCloudOverlay && (
        <div className="cloud-overlay">
          {[...Array(40)].map((_, i) => (
            <div
              key={i}
              className="cloud-part"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                width: `${250 + Math.random() * 200}px`,
                height: `${200 + Math.random() * 150}px`,
                animationDelay: `${Math.random() * 0.5}s`
              }}
            />
          ))}
        </div>
      )}

    </div>
  );
}


export default App;
