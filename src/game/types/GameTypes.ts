import Phaser from 'phaser';
import type { ObstacleType } from '../config/GameDefinitions';

export interface PlacedBuilding {
    id: string;
    type: string;
    level: number; // Added level property
    gridX: number;
    gridY: number;
    graphics: Phaser.GameObjects.Graphics;
    barrelGraphics?: Phaser.GameObjects.Graphics;
    healthBar: Phaser.GameObjects.Graphics;
    health: number;
    maxHealth: number;
    owner: 'PLAYER' | 'ENEMY';
    loot?: { sol: number };
    // Ballista-specific properties
    ballistaAngle?: number;        // Current angle in radians (0 = facing right/east)
    ballistaTargetAngle?: number;  // Target angle to smoothly rotate towards
    ballistaStringTension?: number; // 0 = relaxed, 1 = fully drawn back
    ballistaBoltLoaded?: boolean;   // Whether a bolt is ready to fire
    lastFireTime?: number;
    isFiring?: boolean;
    // Idle swivel for rotating defenses
    idleSwiveTime?: number;        // Time accumulator for idle swivel
    idleTargetAngle?: number;      // Random idle target angle
    // Cannon barrel recoil (0-1, 0 = normal, 1 = full recoil)
    cannonRecoilOffset?: number;
    // Prism Tower - Continuous laser properties
    prismTarget?: Troop;           // Current target being lasered
    prismLaserGraphics?: Phaser.GameObjects.Graphics; // The continuous laser beam
    prismLaserCore?: Phaser.GameObjects.Graphics;     // Inner core of laser
    prismChargingUp?: boolean;     // Whether it's charging up
    prismChargeTime?: number;      // When charging started
    // Tesla charge state
    teslaCharging?: boolean;
    teslaChargeStart?: number;
    teslaCharged?: boolean;
    teslaChargeTarget?: Troop;
    // Range indicator
    rangeIndicator?: Phaser.GameObjects.Graphics;
    prismTrailLastPos?: { x: number, y: number }; // Track last scorch position for connected trail
    prismLastDamageTime?: number;
    lastTrailTime?: number;     // For specialized smoke trails
    lastSmokeTime?: number;     // For defensive smoke effects
    baseGraphics?: Phaser.GameObjects.Graphics; // Separate graphics for ground-level base (prevents clipping)
    isDestroyed?: boolean;
}

export interface Troop {
    id: string;
    type: 'warrior' | 'archer' | 'giant' | 'ward' | 'recursion' | 'ram' | 'stormmage' | 'golem' | 'sharpshooter' | 'mobilemortar' | 'davincitank' | 'phalanx' | 'romanwarrior';
    level: number;
    gameObject: Phaser.GameObjects.Graphics;
    healthBar: Phaser.GameObjects.Graphics;
    gridX: number;
    gridY: number;
    health: number;
    maxHealth: number;
    owner: 'PLAYER' | 'ENEMY';
    lastAttackTime: number;
    attackDelay: number;
    speedMult: number;
    hasTakenDamage: boolean;
    facingAngle: number;
    path?: Phaser.Math.Vector2[]; // Path of grid coordinates to follow
    lastPathTime?: number;
    nextPathTime?: number;
    target: any; // PlacedBuilding | Troop | null
    // Special troop properties
    recursionGen?: number; // For recursion (0 = original, 1 = first split, 2 = final)
    slamOffset?: number; // For golem body slam animation
    isSetUp?: boolean; // For mobile mortar - whether it's set up to fire
    bowDrawProgress?: number; // For sharpshooter bow draw animation (0 = relaxed, 1 = fully drawn)
    mortarRecoil?: number; // For mobile mortar - recoil offset for the mortar only (not the soldier)
    phalanxSpearOffset?: number; // For phalanx - spear thrusting animation (0 = normal, 1 = full thrust)
}

export interface PlacedObstacle {
    id: string;
    type: ObstacleType;
    gridX: number;
    gridY: number;
    graphics: Phaser.GameObjects.Graphics;
    animOffset: number; // For subtle idle animations
}
