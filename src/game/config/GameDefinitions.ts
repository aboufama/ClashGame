
export const MAP_SIZE = 25;

export type BuildingType =
    | 'town_hall' | 'barracks' | 'cannon' | 'ballista' | 'xbow'
    | 'mine' | 'elixir_collector' | 'mortar' | 'tesla' | 'wall'
    | 'army_camp' | 'prism' | 'magmavent' | 'dragons_breath';

export type TroopType =
    | 'warrior' | 'archer' | 'giant' | 'ward' | 'recursion' | 'chronoswarm'
    | 'ram' | 'stormmage' | 'golem';

export type ObstacleType =
    | 'rock_small' | 'rock_large' | 'tree_oak' | 'tree_pine' | 'grass_patch';

export interface BuildingLevelStats {
    hp: number;
    damage?: number;
    fireRate?: number;
    productionRate?: number;
    capacity?: number;
    cost: number;
}

export interface BuildingDef {
    id: BuildingType;
    name: string;
    cost: number; // Base cost (Level 1)
    desc: string;
    width: number; // Grid size
    height: number;
    maxHealth: number; // Base health
    // Logic stats
    range?: number;
    minRange?: number;
    category?: 'defense' | 'resource' | 'army' | 'other' | 'military';
    maxCount: number;
    color?: number;
    fireRate?: number;
    damage?: number;
    productionRate?: number; // Resources per second
    capacity?: number; // Housing space provided
    maxLevel?: number;
    levels?: BuildingLevelStats[]; // index 0 = Level 1, index 1 = Level 2, etc.
}

// ... (TroopDef, ObstacleDef omitted for brevity in prompt but implicitly kept if I target correctly)
// Wait, I should target the interface definition block specifically or replacing the whole file part.
// I'll target the interface first.

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDef> = {
    town_hall: { id: 'town_hall', name: 'Town Hall', cost: 500, desc: 'The heart of your village.', width: 3, height: 3, maxHealth: 2000, category: 'other', maxCount: 1, color: 0x3366ff, maxLevel: 1, capacity: 10 },
    barracks: { id: 'barracks', name: 'Barracks', cost: 200, desc: 'Trains brave troops.', width: 2, height: 2, maxHealth: 800, category: 'military', maxCount: 4, color: 0xff3333, maxLevel: 1 },
    cannon: {
        id: 'cannon',
        name: 'Cannon',
        cost: 250,
        desc: 'Point defense against ground.',
        width: 1,
        height: 1,
        maxHealth: 800,
        range: 7,
        category: 'defense',
        maxCount: 5,
        color: 0x333333,
        fireRate: 2500,
        damage: 70,
        maxLevel: 4,
        levels: [
            { hp: 800, damage: 70, fireRate: 2500, cost: 250 },       // Level 1 - Basic
            { hp: 900, damage: 80, fireRate: 2300, cost: 400 },       // Level 2 - Reinforced
            { hp: 950, damage: 88, fireRate: 2100, cost: 500 },       // Level 3 - Fortified (new intermediate)
            { hp: 1000, damage: 95, fireRate: 2000, cost: 650 }       // Level 4 - Dual-barrel
        ]
    },
    ballista: {
        id: 'ballista',
        name: 'Ballista',
        cost: 350,
        desc: 'Heavy single-target damage.',
        width: 2,
        height: 2,
        maxHealth: 900,
        range: 9,
        category: 'defense',
        maxCount: 2,
        color: 0x8b4513,
        fireRate: 1750,
        damage: 240,
        maxLevel: 2,
        levels: [
            { hp: 900, damage: 240, fireRate: 1750, cost: 350 },    // Level 1 - Standard
            { hp: 1050, damage: 280, fireRate: 1600, cost: 550 }    // Level 2 - Reinforced
        ]
    },
    xbow: {
        id: 'xbow',
        name: 'X-Bow',
        cost: 800,
        desc: 'Rapid fire long-range turret.',
        width: 2,
        height: 2,
        maxHealth: 1500,
        range: 11,
        category: 'defense',
        maxCount: 2,
        color: 0x8b008b,
        fireRate: 200,
        damage: 15,
        maxLevel: 2,
        levels: [
            { hp: 1500, damage: 15, fireRate: 200, cost: 800 },     // Level 1 - Standard
            { hp: 1750, damage: 18, fireRate: 180, cost: 1200 }     // Level 2 - Enhanced
        ]
    },
    mine: {
        id: 'mine',
        name: 'Gold Mine',
        cost: 150,
        desc: 'Produces glorious Gold.',
        width: 1,
        height: 1,
        maxHealth: 600,
        category: 'resource',
        maxCount: 8,
        color: 0xffaa00,
        productionRate: 2.5,
        maxLevel: 5,
        levels: [
            { hp: 600, productionRate: 2.5, cost: 150 },   // Level 1 - Basic
            { hp: 720, productionRate: 3.2, cost: 300 },   // Level 2 - Reinforced
            { hp: 850, productionRate: 4.0, cost: 500 },   // Level 3 - Advanced
            { hp: 1000, productionRate: 5.0, cost: 750 },  // Level 4 - Masterwork
            { hp: 1200, productionRate: 7.0, cost: 1200 }  // Level 5 - Industrial (tech leap)
        ]
    },
    elixir_collector: {
        id: 'elixir_collector',
        name: 'Elixir Collector',
        cost: 150,
        desc: 'Pumps magical Elixir.',
        width: 1,
        height: 1,
        maxHealth: 600,
        category: 'resource',
        maxCount: 8,
        color: 0x9b59b6,
        productionRate: 2.5,
        maxLevel: 5,
        levels: [
            { hp: 600, productionRate: 2.5, cost: 150 },   // Level 1 - Basic
            { hp: 720, productionRate: 3.2, cost: 300 },   // Level 2 - Reinforced
            { hp: 850, productionRate: 4.0, cost: 500 },   // Level 3 - Advanced
            { hp: 1000, productionRate: 5.0, cost: 750 },  // Level 4 - Masterwork
            { hp: 1200, productionRate: 7.0, cost: 1200 }  // Level 5 - Deep Extraction (tech leap)
        ]
    },
    mortar: {
        id: 'mortar',
        name: 'Mortar',
        cost: 400,
        desc: 'Splash damage area shell.',
        width: 2,
        height: 2,
        maxHealth: 700,
        range: 10,
        minRange: 3,
        category: 'defense',
        maxCount: 3,
        color: 0x555555,
        fireRate: 4000,
        damage: 45,
        maxLevel: 3,
        levels: [
            { hp: 700, damage: 45, fireRate: 4000, cost: 400 },    // Level 1 - Standard
            { hp: 850, damage: 55, fireRate: 3600, cost: 650 },    // Level 2 - Reinforced
            { hp: 1050, damage: 70, fireRate: 3200, cost: 950 }    // Level 3 - Heavy Artillery
        ]
    },
    tesla: {
        id: 'tesla',
        name: 'Tesla Coil',
        cost: 600,
        desc: 'Hidden zapping trap.',
        width: 1,
        height: 1,
        maxHealth: 600,
        range: 6,
        category: 'defense',
        maxCount: 3,
        color: 0x00ccff,
        fireRate: 1500,
        damage: 60,
        maxLevel: 2,
        levels: [
            { hp: 600, damage: 60, fireRate: 1500, cost: 600 },   // Level 1 - Standard
            { hp: 750, damage: 75, fireRate: 1300, cost: 900 }    // Level 2 - Enhanced (ring + thicker base)
        ]
    },
    wall: {
        id: 'wall',
        name: 'Wall',
        cost: 50,
        desc: 'Stops enemies cold.',
        width: 1,
        height: 1,
        maxHealth: 500,
        category: 'defense',
        maxCount: 100,
        color: 0xcccccc,
        maxLevel: 3,
        levels: [
            { hp: 500, cost: 50 },      // Level 1 - Wooden palisade
            { hp: 800, cost: 150 },     // Level 2 - Stone wall
            { hp: 1200, cost: 350 }     // Level 3 - Fortified dark stone
        ]
    },
    army_camp: {
        id: 'army_camp',
        name: 'Army Camp',
        cost: 300,
        desc: 'Houses your army.',
        width: 3,
        height: 3,
        maxHealth: 1000,
        category: 'military',
        maxCount: 4,
        color: 0x884422,
        maxLevel: 2,
        capacity: 20,
        levels: [
            { hp: 1000, capacity: 20, cost: 300 },    // Level 1 - Basic (20 space, fire only)
            { hp: 1200, capacity: 25, cost: 500 }     // Level 2 - Upgraded (25 space, with dummy & weapons)
        ]
    },
    prism: { id: 'prism', name: 'Prism Tower', cost: 550, desc: 'Beam bounces between foes.', width: 1, height: 1, maxHealth: 1100, range: 8, category: 'defense', maxCount: 1, color: 0xff00ff, fireRate: 50, maxLevel: 1 },
    magmavent: { id: 'magmavent', name: 'Magma Vent', cost: 650, desc: 'Erupts with area damage.', width: 3, height: 3, maxHealth: 1200, range: 6, category: 'defense', maxCount: 1, color: 0xff4400, fireRate: 1500, maxLevel: 1 },
    dragons_breath: {
        id: 'dragons_breath',
        name: "Dragon's Breath",
        cost: 1500,
        desc: '16 firecracker pods rain destruction on foes.',
        width: 4,
        height: 4,
        maxHealth: 2500,
        range: 13,
        category: 'defense',
        maxCount: 1,
        color: 0xcc0000,
        fireRate: 3000,  // 3 second salvo cycle
        damage: 25,      // Per pod (16 pods = 400 max damage per salvo)
        maxLevel: 1,
        levels: [
            { hp: 2500, damage: 25, fireRate: 3000, cost: 1500 }
        ]
    },
};

// Start of getBuildingStats is further down.
export function getBuildingStats(type: BuildingType, level: number = 1): BuildingDef {
    const base = BUILDING_DEFINITIONS[type];
    const levelStats = base.levels ? base.levels[level - 1] : null;

    if (!levelStats) return { ...base }; // Fallback to base stats if no levels defined

    return {
        ...base,
        maxHealth: levelStats.hp,
        damage: levelStats.damage ?? base.damage,
        fireRate: levelStats.fireRate ?? base.fireRate,
        productionRate: levelStats.productionRate ?? base.productionRate,
        capacity: levelStats.capacity ?? base.capacity,
        cost: levelStats.cost
    };
}

export interface TroopDef {
    id: TroopType;
    name: string;
    cost: number;
    space: number;
    desc: string;
    health: number;
    range: number;
    damage: number;
    speed: number;
    color: number;
    boostRadius?: number;
    boostAmount?: number;
    targetPriority?: 'town_hall' | 'defense';  // Special targeting
    wallDamageMultiplier?: number;  // Extra damage to walls
    chainCount?: number;  // For chain attacks
    chainRange?: number;  // Range for chain to jump
}

export interface ObstacleDef {
    id: ObstacleType;
    name: string;
    clearCost: number; // Gold to remove
    clearTime: number; // Seconds to clear
    width: number;
    height: number;
    goldReward: number; // Gold gained when cleared
}



export const TROOP_DEFINITIONS: Record<TroopType, TroopDef> = {
    warrior: { id: 'warrior', name: 'Warrior', cost: 25, space: 1, desc: 'Fast melee fighter.', health: 100, range: 0.8, damage: 10, speed: 0.003, color: 0xffff00 },
    archer: { id: 'archer', name: 'Archer', cost: 40, space: 1, desc: 'Ranged attacker.', health: 50, range: 4.5, damage: 14.0, speed: 0.0025, color: 0x00ffff },
    giant: { id: 'giant', name: 'Giant', cost: 150, space: 5, desc: 'Tank targeting Defenses.', health: 600, range: 1.0, damage: 16, speed: 0.002, color: 0xff6600 },
    ward: { id: 'ward', name: 'Ward', cost: 80, space: 6, desc: 'Heals friendly troops.', health: 100, range: 4.0, damage: 9, speed: 0.0025, color: 0x00ff00 },
    recursion: { id: 'recursion', name: 'Recursion', cost: 80, space: 3, desc: 'Splits into two copies on death.', health: 150, range: 1.0, damage: 12, speed: 0.003, color: 0xff00ff },
    chronoswarm: { id: 'chronoswarm', name: 'Speedster', cost: 60, space: 2, desc: 'Speeds up nearby allies.', health: 50, range: 1.5, damage: 5, speed: 0.004, color: 0xffcc00, boostRadius: 4.0, boostAmount: 1.5 },
    ram: { id: 'ram', name: 'Battering Ram', cost: 200, space: 8, desc: 'Charges Town Hall. 4x wall damage.', health: 800, range: 1.2, damage: 50, speed: 0.0018, color: 0x8b4513, targetPriority: 'town_hall', wallDamageMultiplier: 4 },
    stormmage: { id: 'stormmage', name: 'Storm Mage', cost: 180, space: 6, desc: 'Chain lightning hits 4 targets.', health: 200, range: 4.9, damage: 40, speed: 0.002, color: 0x4444ff, chainCount: 4, chainRange: 5 },
    golem: { id: 'golem', name: 'Stone Golem', cost: 500, space: 25, desc: 'Colossal stone titan. Nearly indestructible.', health: 6000, range: 1.5, damage: 80, speed: 0.0012, color: 0x6b7b8b, targetPriority: 'defense' }
};

export const OBSTACLE_DEFINITIONS: Record<ObstacleType, ObstacleDef> = {
    rock_small: { id: 'rock_small', name: 'Small Rock', clearCost: 50, clearTime: 5, width: 1, height: 1, goldReward: 10 },
    rock_large: { id: 'rock_large', name: 'Large Rock', clearCost: 150, clearTime: 15, width: 2, height: 2, goldReward: 50 },
    tree_oak: { id: 'tree_oak', name: 'Oak Tree', clearCost: 100, clearTime: 10, width: 2, height: 2, goldReward: 30 },
    tree_pine: { id: 'tree_pine', name: 'Pine Tree', clearCost: 75, clearTime: 8, width: 1, height: 1, goldReward: 20 },
    grass_patch: { id: 'grass_patch', name: 'Tall Grass', clearCost: 25, clearTime: 3, width: 1, height: 1, goldReward: 5 },
};


