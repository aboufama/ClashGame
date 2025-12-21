
import type { BuildingType, ObstacleType } from "../config/GameDefinitions";

export interface SerializedBuilding {
    id: string; // Unique instance ID (UUID)
    type: BuildingType;
    gridX: number;
    gridY: number;
    level: number;
    // Future: constructionFinishTime?: number;
}

export interface SerializedObstacle {
    id: string;
    type: ObstacleType;
    gridX: number;
    gridY: number;
}

export interface PlayerResources {
    gold: number;
    elixir: number;
}

export interface SerializedWorld {
    id: string; // Unique World ID
    ownerId: string; // 'player' or some enemy ID
    username?: string; // Owner's display name
    buildings: SerializedBuilding[];
    obstacles?: SerializedObstacle[]; // Optional for backward compat
    resources: PlayerResources;
    army?: Record<string, number>; // Persisted army state
    lastSaveTime: number;
}

// Army state is usually per-player, not per-world (you take your army to attack worlds)
export interface PlayerState {
    id: string; // 'player'
    resources: PlayerResources;
    army: Record<string, number>; // troopType -> count
    unlockedTroops: string[];
    // Future: tech tree, spells, etc.
}
