
export const MAP_SIZE = 25;

export type BuildingType =
    | 'town_hall' | 'barracks' | 'lab' | 'cannon' | 'ballista' | 'xbow'
    | 'solana_collector' | 'mortar' | 'tesla' | 'wall'
    | 'army_camp' | 'prism' | 'magmavent' | 'dragons_breath' | 'spike_launcher'
    | 'frostfall';

export type TroopType =
    | 'warrior' | 'archer' | 'giant' | 'ward' | 'recursion'
    | 'ram' | 'stormmage' | 'golem' | 'sharpshooter' | 'mobilemortar'
    | 'davincitank' | 'phalanx' | 'romanwarrior' | 'wallbreaker';

export type ObstacleType =
    | 'rock_small' | 'rock_large' | 'tree_oak' | 'tree_pine' | 'grass_patch';

export interface BuildingLevelStats {
    hp: number;
    damage?: number;
    fireRate?: number;
    productionRate?: number;
    capacity?: number;
    range?: number;
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

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDef> = {
    town_hall: { id: 'town_hall', name: 'Town Hall', cost: 500, desc: 'The heart of your village.', width: 3, height: 3, maxHealth: 2000, category: 'other', maxCount: 1, color: 0x3366ff, maxLevel: 1, capacity: 30 },
    barracks: {
        id: 'barracks',
        name: 'Barracks',
        cost: 200,
        desc: 'Unlocks new troop types as it levels up.',
        width: 2,
        height: 2,
        maxHealth: 850,
        category: 'military',
        maxCount: 1,
        color: 0xff3333,
        maxLevel: 13,
        levels: [
            { hp: 850, cost: 200 },
            { hp: 900, cost: 320 },
            { hp: 950, cost: 460 },
            { hp: 1000, cost: 620 },
            { hp: 1060, cost: 800 },
            { hp: 1120, cost: 1000 },
            { hp: 1200, cost: 1250 },
            { hp: 1280, cost: 1550 },
            { hp: 1380, cost: 1900 },
            { hp: 1480, cost: 2300 },
            { hp: 1600, cost: 2800 },
            { hp: 1750, cost: 3400 },
            { hp: 1900, cost: 4000 }
        ]
    },
    lab: {
        id: 'lab',
        name: 'Lab',
        cost: 500,
        desc: 'Researches troop upgrades. Higher levels boost all troop stats.',
        width: 2,
        height: 2,
        maxHealth: 900,
        category: 'military',
        maxCount: 1,
        color: 0x6644aa,
        maxLevel: 3,
        levels: [
            { hp: 900, cost: 500 },
            { hp: 1200, cost: 1200 },
            { hp: 1500, cost: 2400 }
        ]
    },
    cannon: {
        id: 'cannon',
        name: 'Cannon',
        cost: 220,
        desc: 'Point defense against ground.',
        width: 1,
        height: 1,
        maxHealth: 820,
        range: 7,
        category: 'defense',
        maxCount: 5,
        color: 0x333333,
        fireRate: 2400,
        damage: 58,
        maxLevel: 4,
        levels: [
            { hp: 820, damage: 58, fireRate: 2400, cost: 220 },
            { hp: 940, damage: 70, fireRate: 2200, cost: 360 },
            { hp: 1040, damage: 82, fireRate: 2050, cost: 520 },
            { hp: 1150, damage: 95, fireRate: 1900, cost: 700 }
        ]
    },
    ballista: {
        id: 'ballista',
        name: 'Ballista',
        cost: 360,
        desc: 'Heavy single-target damage.',
        width: 2,
        height: 2,
        maxHealth: 950,
        range: 9,
        category: 'defense',
        maxCount: 2,
        color: 0x8b4513,
        fireRate: 1900,
        damage: 185,
        maxLevel: 3,
        levels: [
            { hp: 950, damage: 185, fireRate: 1900, cost: 360 },
            { hp: 1150, damage: 230, fireRate: 1700, cost: 620 },
            { hp: 1400, damage: 280, fireRate: 1550, cost: 950 }
        ]
    },
    xbow: {
        id: 'xbow',
        name: 'X-Bow',
        cost: 900,
        desc: 'Rapid fire long-range turret.',
        width: 2,
        height: 2,
        maxHealth: 1550,
        range: 11,
        category: 'defense',
        maxCount: 3,
        color: 0x8b008b,
        fireRate: 220,
        damage: 20,
        maxLevel: 3,
        levels: [
            { hp: 1550, damage: 20, fireRate: 220, cost: 900 },
            { hp: 1850, damage: 26, fireRate: 190, cost: 1350 },
            { hp: 2200, damage: 32, fireRate: 165, cost: 1900 }
        ]
    },
    solana_collector: {
        id: 'solana_collector',
        name: 'Solana Collector',
        cost: 300,
        desc: 'Harvests SOL from the grid.',
        width: 2,
        height: 2,
        maxHealth: 700,
        category: 'resource',
        maxCount: 16,
        color: 0x14f195,
        productionRate: 5.0,
        maxLevel: 4,
        levels: [
            { hp: 700, productionRate: 5.0, cost: 300 },     // Level 1 - Wooden drill rig
            { hp: 900, productionRate: 8.0, cost: 600 },     // Level 2 - Metal-reinforced, Solana veins
            { hp: 1150, productionRate: 11.0, cost: 1000 },  // Level 3 - Previous top tier
            { hp: 1400, productionRate: 14.0, cost: 1500 }   // Level 4 - Marble rocks, gold accents
        ]
    },
    mortar: {
        id: 'mortar',
        name: 'Mortar',
        cost: 500,
        desc: 'Splash damage area shell.',
        width: 2,
        height: 2,
        maxHealth: 760,
        range: 10,
        minRange: 3,
        category: 'defense',
        maxCount: 3,
        color: 0x555555,
        fireRate: 3900,
        damage: 62,
        maxLevel: 4,
        levels: [
            { hp: 760, damage: 62, fireRate: 3900, cost: 500 },
            { hp: 930, damage: 78, fireRate: 3500, cost: 780 },
            { hp: 1150, damage: 95, fireRate: 3150, cost: 1100 },
            { hp: 1400, damage: 115, fireRate: 2850, cost: 1550 }
        ]
    },
    tesla: {
        id: 'tesla',
        name: 'Tesla Coil',
        cost: 650,
        desc: 'Hidden zapping trap.',
        width: 1,
        height: 1,
        maxHealth: 700,
        range: 6,
        category: 'defense',
        maxCount: 3,
        color: 0x00ccff,
        fireRate: 2400,
        damage: 52,
        maxLevel: 3,
        levels: [
            { hp: 700, damage: 52, fireRate: 2400, cost: 650 },
            { hp: 900, damage: 68, fireRate: 2100, cost: 980 },
            { hp: 1150, damage: 85, fireRate: 1850, cost: 1400 }
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
        maxLevel: 4,
        levels: [
            { hp: 500, cost: 50 },      // Level 1 - Wooden palisade
            { hp: 800, cost: 150 },     // Level 2 - Stone wall
            { hp: 1200, cost: 350 },    // Level 3 - Fortified dark stone
            { hp: 1700, cost: 600 }     // Level 4 - Marble & Gold
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
        maxLevel: 4,
        capacity: 20,
        levels: [
            { hp: 1000, capacity: 20, cost: 300 },    // Level 1 - Basic (20 space, no decor)
            { hp: 1200, capacity: 25, cost: 500 },    // Level 2 - Weapons rack
            { hp: 1400, capacity: 30, cost: 700 },    // Level 3 - Full decor
            { hp: 1600, capacity: 35, cost: 1000 }    // Level 4 - Marble bricks
        ]
    },
    prism: {
        id: 'prism',
        name: 'Prism Tower',
        cost: 1050,
        desc: 'Continuous beam that melts clustered enemies.',
        width: 1,
        height: 1,
        maxHealth: 1200,
        range: 8.5,
        category: 'defense',
        maxCount: 1,
        color: 0xff00ff,
        fireRate: 100,
        damage: 156,
        maxLevel: 4,
        levels: [
            { hp: 1200, damage: 156, fireRate: 100, cost: 1050, range: 8.5 },
            { hp: 1450, damage: 204, fireRate: 90, cost: 1450, range: 9.0 },
            { hp: 1750, damage: 264, fireRate: 75, cost: 2100, range: 9.5 },
            { hp: 2100, damage: 330, fireRate: 65, cost: 3000, range: 10.0 }
        ]
    },
    magmavent: {
        id: 'magmavent',
        name: 'Magma Vent',
        cost: 1250,
        desc: 'Industrial grate erupts with area damage.',
        width: 3,
        height: 3,
        maxHealth: 1500,
        range: 4.4,
        category: 'defense',
        maxCount: 1,
        color: 0xff4400,
        fireRate: 1500,
        damage: 96,
        maxLevel: 3,
        levels: [
            { hp: 1500, damage: 96, fireRate: 1500, cost: 1250, range: 4.4 },
            { hp: 1850, damage: 125, fireRate: 1250, cost: 1750, range: 4.6 },
            { hp: 2250, damage: 155, fireRate: 1050, cost: 2500, range: 4.8 }
        ]
    },
    dragons_breath: {
        id: 'dragons_breath',
        name: "Dragon's Breath",
        cost: 2200,
        desc: '16 firecracker pods rain destruction on foes.',
        width: 4,
        height: 4,
        maxHealth: 2800,
        range: 13.5,
        category: 'defense',
        maxCount: 1,
        color: 0xcc0000,
        fireRate: 2800,
        damage: 34,
        maxLevel: 2,
        levels: [
            { hp: 2800, damage: 34, fireRate: 2800, cost: 2200, range: 13.5 },
            { hp: 3500, damage: 45, fireRate: 2400, cost: 3200, range: 14.0 }
        ]
    },
    spike_launcher: {
        id: 'spike_launcher',
        name: 'Spike Launcher',
        cost: 1450,
        desc: 'Trebuchet hurls spike bags that damage areas.',
        width: 2,
        height: 2,
        maxHealth: 1200,
        range: 9.5,
        minRange: 3,
        category: 'defense',
        maxCount: 2,
        color: 0x8b6914,
        fireRate: 4200,
        damage: 38,
        maxLevel: 4,
        levels: [
            { hp: 1200, damage: 38, fireRate: 4200, cost: 1450, range: 9.5 },
            { hp: 1450, damage: 52, fireRate: 3800, cost: 1950, range: 10.0 },
            { hp: 1800, damage: 70, fireRate: 3400, cost: 2800, range: 10.5 },
            { hp: 2200, damage: 90, fireRate: 3000, cost: 3800, range: 11.0 }
        ]
    },
    frostfall: {
        id: 'frostfall',
        name: 'Frostfall Monolith',
        cost: 1200,
        desc: 'An ancient ice well tended by a Frost Keeper who cranks up devastating ice crystals from the frozen depths.',
        width: 2,
        height: 2,
        maxHealth: 1050,
        range: 6.0,
        category: 'defense',
        maxCount: 2,
        color: 0x88ccff,
        fireRate: 5000,
        damage: 15,
        maxLevel: 3,
        levels: [
            { hp: 1050, damage: 15, fireRate: 5000, cost: 1200, range: 6.0 },
            { hp: 1300, damage: 25, fireRate: 4800, cost: 1800, range: 6.5 },
            { hp: 1650, damage: 38, fireRate: 4600, cost: 2600, range: 7.0 }
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
        range: levelStats.range ?? base.range,
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
    targetPriority?: 'town_hall' | 'defense' | 'wall';  // Special targeting
    wallDamageMultiplier?: number;  // Extra damage to walls
    chainCount?: number;  // For chain attacks
    chainRange?: number;  // Range for chain to jump
    healRadius?: number; // For healers
    healAmount?: number; // Heal per tick
    attackDelay?: number; // Base attack interval (ms)
    firstAttackDelay?: number; // Delay before first attack after spawn (ms)
    splashRadius?: number;
    movementType?: 'ground' | 'air' | 'ghost'; // Traversal capability
    wallTraversalCost?: number; // Cost to move through a wall (default 5000, 0 for air/ghost)
}

export interface ObstacleDef {
    id: ObstacleType;
    name: string;
    clearCost: number; // SOL to remove
    clearTime: number; // Seconds to clear
    width: number;
    height: number;
    solReward: number; // SOL gained when cleared
}



export const TROOP_DEFINITIONS: Record<TroopType, TroopDef> = {
    warrior: { id: 'warrior', name: 'Warrior', cost: 25, space: 1, desc: 'Fast melee fighter.', health: 100, range: 0.5, damage: 10, speed: 0.003, color: 0xffff00, attackDelay: 800 },
    archer: { id: 'archer', name: 'Archer', cost: 40, space: 1, desc: 'Ranged attacker.', health: 50, range: 2.7, damage: 14.0, speed: 0.0025, color: 0x00ffff, attackDelay: 900 },
    giant: { id: 'giant', name: 'Giant', cost: 150, space: 5, desc: 'Tank targeting defenses.', health: 1200, range: 0.5, damage: 64, speed: 0.001, color: 0xff6600, attackDelay: 3600, targetPriority: 'defense', wallDamageMultiplier: 2 },
    ward: { id: 'ward', name: 'Ward', cost: 80, space: 6, desc: 'Heals friendly troops.', health: 100, range: 4.0, damage: 9, speed: 0.00125, color: 0x00ff00, healRadius: 7.0, healAmount: 5, attackDelay: 1000 },
    recursion: { id: 'recursion', name: 'Recursion', cost: 80, space: 3, desc: 'Splits into two copies on death.', health: 150, range: 0.5, damage: 12, speed: 0.003, color: 0xff00ff, attackDelay: 850 },

    ram: { id: 'ram', name: 'Battering Ram', cost: 200, space: 8, desc: 'Charges Town Hall. 4x wall damage.', health: 800, range: 0.6, damage: 50, speed: 0.0018, color: 0x8b4513, targetPriority: 'town_hall', wallDamageMultiplier: 4, wallTraversalCost: 50, attackDelay: 1100 },
    stormmage: { id: 'stormmage', name: 'Storm Mage', cost: 180, space: 6, desc: 'Chain lightning hits 4 targets.', health: 200, range: 4.9, damage: 40, speed: 0.002, color: 0x4444ff, chainCount: 4, chainRange: 5, attackDelay: 1700 },
    golem: { id: 'golem', name: 'Stone Golem', cost: 500, space: 25, desc: 'Colossal stone titan. Nearly indestructible.', health: 9000, range: 0.8, damage: 106, speed: 0.0004, color: 0x6b7b8b, targetPriority: 'defense', attackDelay: 3000, firstAttackDelay: 1500 },

    sharpshooter: { id: 'sharpshooter', name: 'Sharpshooter', cost: 100, space: 4, desc: 'Elite archer with extended range.', health: 80, range: 5.6, damage: 70, speed: 0.002, color: 0x2e7d32, attackDelay: 1400 },
    mobilemortar: { id: 'mobilemortar', name: 'Mobile Mortar', cost: 180, space: 8, desc: 'Portable mortar with splash damage.', health: 150, range: 6.75, damage: 200, speed: 0.0012, color: 0x555555, splashRadius: 2.2, attackDelay: 2200, firstAttackDelay: 1000 },
    davincitank: { id: 'davincitank', name: 'Da Vinci Tank', cost: 600, space: 30, desc: 'Leonardo\'s armored war machine. Spins and fires in all directions.', health: 8000, range: 4.0, damage: 80, speed: 0.0006, color: 0xb8956e, targetPriority: 'defense', attackDelay: 1800 },
    phalanx: { id: 'phalanx', name: 'Phalanx', cost: 350, space: 18, desc: 'Roman testudo formation. 3x3 shield wall with spears. Splits into 9 soldiers on death.', health: 3000, range: 0.6, damage: 45, speed: 0.0008, color: 0xc9a07a, attackDelay: 1400 },
    romanwarrior: { id: 'romanwarrior', name: 'Roman Soldier', cost: 0, space: 1, desc: 'An individual soldier from a Phalanx formation.', health: 300, range: 0.5, damage: 15, speed: 0.0015, color: 0xcc3333, attackDelay: 900 },
    wallbreaker: { id: 'wallbreaker', name: 'Wall Breaker', cost: 100, space: 4, desc: 'Suicidal bomber. Runs at walls and explodes for massive damage.', health: 200, range: 0.5, damage: 800, speed: 0.004, color: 0xff6633, targetPriority: 'wall', wallDamageMultiplier: 3, splashRadius: 2.5, attackDelay: 500 }
};

/** Maps barracks level (1-indexed) to the troop type unlocked at that level. */
export const BARRACKS_TROOP_UNLOCK_ORDER: TroopType[] = [
    'warrior',        // L1
    'archer',         // L2
    'wallbreaker',    // L3
    'recursion',      // L4
    'ward',           // L5
    'sharpshooter',   // L6
    'giant',          // L7
    'stormmage',      // L8
    'mobilemortar',   // L9
    'ram',            // L10
    'phalanx',        // L11
    'golem',          // L12
    'davincitank'     // L13
];

/** Returns the list of troop types unlocked at the given barracks level. */
export function getUnlockedTroops(barracksLevel: number): TroopType[] {
    const level = Math.max(0, Math.min(BARRACKS_TROOP_UNLOCK_ORDER.length, Math.floor(barracksLevel)));
    return BARRACKS_TROOP_UNLOCK_ORDER.slice(0, level);
}

/** Returns the barracks level required to unlock the given troop type. Returns Infinity if not found. */
export function getTroopUnlockLevel(troopType: TroopType): number {
    const index = BARRACKS_TROOP_UNLOCK_ORDER.indexOf(troopType);
    return index >= 0 ? index + 1 : Infinity;
}

const TROOP_LEVEL_MULTIPLIERS: Record<number, number> = {
    1: 1,
    2: 1.3,
    3: 1.65
};

const toScaledFloat = (value: number, multiplier: number, digits: number = 2) =>
    Number((value * multiplier).toFixed(digits));

export function normalizeTroopLevel(level: number = 1): number {
    if (!Number.isFinite(level)) return 1;
    const normalized = Math.max(1, Math.floor(level));
    const maxDefined = Math.max(...Object.keys(TROOP_LEVEL_MULTIPLIERS).map(Number));
    return Math.min(normalized, maxDefined);
}

export function getTroopLevelMultiplier(level: number = 1): number {
    return TROOP_LEVEL_MULTIPLIERS[normalizeTroopLevel(level)] ?? 1;
}

export function getTroopStats(type: TroopType, level: number = 1): TroopDef {
    const base = TROOP_DEFINITIONS[type];
    const multiplier = getTroopLevelMultiplier(level);
    if (multiplier <= 1) return { ...base };

    const utilityMultiplier = 1 + (multiplier - 1) * 0.45;
    const speedMultiplier = 1 + (multiplier - 1) * 0.25;
    const attackSpeedMultiplier = 1 + (multiplier - 1) * 0.2;

    return {
        ...base,
        health: Math.round(base.health * multiplier),
        damage: toScaledFloat(base.damage, multiplier),
        speed: toScaledFloat(base.speed, speedMultiplier, 6),
        range: toScaledFloat(base.range, utilityMultiplier),
        healRadius: typeof base.healRadius === 'number' ? toScaledFloat(base.healRadius, utilityMultiplier) : base.healRadius,
        healAmount: typeof base.healAmount === 'number' ? toScaledFloat(base.healAmount, multiplier) : base.healAmount,
        chainRange: typeof base.chainRange === 'number' ? toScaledFloat(base.chainRange, utilityMultiplier) : base.chainRange,
        splashRadius: typeof base.splashRadius === 'number' ? toScaledFloat(base.splashRadius, utilityMultiplier) : base.splashRadius,
        attackDelay: typeof base.attackDelay === 'number' ? Math.max(150, Math.round(base.attackDelay / attackSpeedMultiplier)) : base.attackDelay
    };
}

export const OBSTACLE_DEFINITIONS: Record<ObstacleType, ObstacleDef> = {
    rock_small: { id: 'rock_small', name: 'Small Rock', clearCost: 50, clearTime: 5, width: 1, height: 1, solReward: 10 },
    rock_large: { id: 'rock_large', name: 'Large Rock', clearCost: 150, clearTime: 15, width: 2, height: 2, solReward: 50 },
    tree_oak: { id: 'tree_oak', name: 'Oak Tree', clearCost: 100, clearTime: 10, width: 2, height: 2, solReward: 30 },
    tree_pine: { id: 'tree_pine', name: 'Pine Tree', clearCost: 75, clearTime: 8, width: 1, height: 1, solReward: 20 },
    grass_patch: { id: 'grass_patch', name: 'Tall Grass', clearCost: 25, clearTime: 3, width: 1, height: 1, solReward: 5 },
};
