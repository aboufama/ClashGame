import { BUILDING_DEFINITIONS, TROOP_DEFINITIONS, type BuildingType, type TroopType } from '../config/GameDefinitions';

const DEPTH_BASE = 1000;
const DEPTH_STEP = 100;
const DEPTH_TIE = 1;
const MAX_BIAS = Math.floor(DEPTH_STEP * 0.4);
const GROUND_PLANE_DEPTH = 0;

const BUILDING_BIAS_SCALE = 2;
const TROOP_BIAS_SCALE = 1;
const OBSTACLE_BIAS_SCALE = 1;

const LAYER_OFFSETS = {
    obstacle: 2,
    rubble: 3,
    building: 6,
    troop: 8
};

const baseDepth = (anchorX: number, anchorY: number) =>
    DEPTH_BASE + (anchorX + anchorY) * DEPTH_STEP + (anchorX - anchorY) * DEPTH_TIE;

const clampBias = (bias: number) => Math.max(-MAX_BIAS, Math.min(MAX_BIAS, bias));

export const depthForFootprint = (
    gridX: number,
    gridY: number,
    width: number,
    height: number,
    layerOffset: number,
    bias: number = 0
) => {
    const anchorX = gridX + width - 1;
    const anchorY = gridY + height - 1;
    return baseDepth(anchorX, anchorY) + layerOffset + clampBias(bias);
};

export const depthForGroundPlane = () => GROUND_PLANE_DEPTH;

const buildingBias = (type: BuildingType) => {
    const def = BUILDING_DEFINITIONS[type];
    return clampBias(Math.max(def.width, def.height) * BUILDING_BIAS_SCALE);
};

const troopBias = (type: TroopType) => {
    const def = TROOP_DEFINITIONS[type];
    return clampBias(Math.max(1, def.space) * TROOP_BIAS_SCALE);
};

const obstacleBias = (width: number, height: number) =>
    clampBias(Math.max(width, height) * OBSTACLE_BIAS_SCALE);

export const depthForBuilding = (gridX: number, gridY: number, type: BuildingType) => {
    const def = BUILDING_DEFINITIONS[type];
    return depthForFootprint(gridX, gridY, def.width, def.height, LAYER_OFFSETS.building, buildingBias(type));
};

export const depthForObstacle = (gridX: number, gridY: number, width: number, height: number) =>
    depthForFootprint(gridX, gridY, width, height, LAYER_OFFSETS.obstacle, obstacleBias(width, height));

export const depthForRubble = (gridX: number, gridY: number, width: number, height: number) =>
    depthForFootprint(gridX, gridY, width, height, LAYER_OFFSETS.rubble);

export const depthForTroop = (gridX: number, gridY: number, type: TroopType) =>
    baseDepth(gridX, gridY) + LAYER_OFFSETS.troop + troopBias(type);
