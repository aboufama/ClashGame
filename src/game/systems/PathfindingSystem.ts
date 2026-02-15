import Phaser from 'phaser';
import { BUILDING_DEFINITIONS, MAP_SIZE, getBuildingStats, getTroopStats, type BuildingType } from '../config/GameDefinitions';
import type { Troop, PlacedBuilding } from '../types/GameTypes';

export class PathfindingSystem {

    // Default costs
    private static readonly COST_DEFAULT = 10;
    private static readonly COST_IMPASSABLE = 999999;
    private static readonly COST_TROOP_AVOIDANCE = 28;
    private static readonly COST_TROOP_NEARBY = 16;
    private static readonly COST_WALL_DEFAULT = 220;
    private static readonly COST_WALL_BREAK_TIME = 35;
    private static readonly COST_DANGER_MULT = 0.85;
    private static readonly COST_DANGER_MAX = 130;

    static findPath(troop: Troop, target: { gridX: number, gridY: number, type?: string } | PlacedBuilding, buildings: PlacedBuilding[], allTroops: Troop[]): Phaser.Math.Vector2[] | null {

        const width = MAP_SIZE;
        const height = MAP_SIZE;

        // 1. Initialize Grid
        const grid = new Int32Array(width * height).fill(PathfindingSystem.COST_DEFAULT);

        // 2. Determine Traversal Capabilities
        const def = getTroopStats(troop.type, troop.level || 1);
        const canFly = def.movementType === 'air' || def.movementType === 'ghost';
        const wallBaseCost = canFly ? PathfindingSystem.COST_DEFAULT : (def.wallTraversalCost ?? PathfindingSystem.COST_WALL_DEFAULT);
        const wallDamage = Math.max(1, def.damage * (def.wallDamageMultiplier ?? 1));
        const attackDelayMs = Math.max(150, def.attackDelay ?? 1000);
        const wallDps = wallDamage / (attackDelayMs / 1000);

        // 3. Mark Buildings on Grid
        buildings.forEach(b => {
            if (b.health <= 0) return;

            // If target is this building, it shouldn't be an obstacle
            const isTarget = ('id' in target) && (b.id === (target as any).id);
            if (isTarget) return;

            if (canFly) {
                return;
            }

            let cost = PathfindingSystem.COST_IMPASSABLE;
            if (b.type === 'wall') {
                const breakSeconds = b.health / Math.max(0.1, wallDps);
                const breakCost = breakSeconds * PathfindingSystem.COST_WALL_BREAK_TIME;
                cost = Math.round(PathfindingSystem.COST_DEFAULT + wallBaseCost + breakCost);
                cost = Phaser.Math.Clamp(cost, PathfindingSystem.COST_DEFAULT + wallBaseCost, PathfindingSystem.COST_IMPASSABLE - 1);
            }

            const info = BUILDING_DEFINITIONS[b.type as keyof typeof BUILDING_DEFINITIONS];
            if (!info) return;

            // Fill grid cells
            for (let x = b.gridX; x < b.gridX + info.width; x++) {
                for (let y = b.gridY; y < b.gridY + info.height; y++) {
                    if (x >= 0 && x < width && y >= 0 && y < height) {
                        grid[y * width + x] = cost;
                    }
                }
            }
        });

        // 4. Add danger cost from enemy defenses so units prefer safer lanes.
        if (!canFly) {
            const danger = this.computeDefenseDangerMap(troop, buildings, width, height);
            for (let i = 0; i < grid.length; i++) {
                if (grid[i] < PathfindingSystem.COST_IMPASSABLE) {
                    grid[i] += danger[i];
                }
            }
        }

        // 5. Mark Obstacles (Troops) - Soft Avoidance + nearby crowding
        allTroops.forEach(t => {
            if (t.id !== troop.id && t.health > 0) {
                const tx = Math.floor(t.gridX);
                const ty = Math.floor(t.gridY);
                if (tx < 0 || tx >= width || ty < 0 || ty >= height) return;

                for (let ox = -2; ox <= 2; ox++) {
                    for (let oy = -2; oy <= 2; oy++) {
                        const px = tx + ox;
                        const py = ty + oy;
                        if (px < 0 || px >= width || py < 0 || py >= height) continue;

                        const dSq = ox * ox + oy * oy;
                        if (dSq > 4) continue;

                        const idx = py * width + px;
                        if (grid[idx] >= PathfindingSystem.COST_IMPASSABLE) continue;

                        if (dSq === 0) {
                            grid[idx] += PathfindingSystem.COST_TROOP_AVOIDANCE;
                        } else {
                            const nearbyCost = Math.max(2, Math.round(PathfindingSystem.COST_TROOP_NEARBY / dSq));
                            grid[idx] += nearbyCost;
                        }
                    }
                }
            }
        });

        let targetRect = { x: Math.floor(target.gridX), y: Math.floor(target.gridY), w: 1, h: 1 };
        if ('type' in target && (target as any).type && BUILDING_DEFINITIONS[(target as any).type as keyof typeof BUILDING_DEFINITIONS]) {
            const info = BUILDING_DEFINITIONS[(target as any).type as keyof typeof BUILDING_DEFINITIONS];
            targetRect.w = info.width;
            targetRect.h = info.height;
        }

        return this.calculateAStar(Math.floor(troop.gridX), Math.floor(troop.gridY), targetRect, grid, width, height);
    }

    private static computeDefenseDangerMap(troop: Troop, buildings: PlacedBuilding[], width: number, height: number): Int32Array {
        const danger = new Int32Array(width * height);

        const defenses = buildings.filter(b => {
            if (b.owner === troop.owner || b.health <= 0 || b.type === 'wall') return false;
            const info = BUILDING_DEFINITIONS[b.type as keyof typeof BUILDING_DEFINITIONS];
            return !!info && info.category === 'defense';
        });

        defenses.forEach(defense => {
            const stats = getBuildingStats(defense.type as BuildingType, defense.level || 1);
            const range = stats.range ?? 0;
            if (range <= 0) return;

            const damage = stats.damage ?? 20;
            const fireRate = Math.max(100, stats.fireRate ?? 2200);
            const dps = damage / (fireRate / 1000);
            const dangerPerTile = Math.min(PathfindingSystem.COST_DANGER_MAX, Math.max(4, dps * 10 * PathfindingSystem.COST_DANGER_MULT));

            const centerX = defense.gridX + (BUILDING_DEFINITIONS[defense.type as keyof typeof BUILDING_DEFINITIONS]?.width ?? 1) / 2;
            const centerY = defense.gridY + (BUILDING_DEFINITIONS[defense.type as keyof typeof BUILDING_DEFINITIONS]?.height ?? 1) / 2;

            const minX = Math.max(0, Math.floor(centerX - range - 1));
            const maxX = Math.min(width - 1, Math.ceil(centerX + range + 1));
            const minY = Math.max(0, Math.floor(centerY - range - 1));
            const maxY = Math.min(height - 1, Math.ceil(centerY + range + 1));

            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    const tileCenterX = x + 0.5;
                    const tileCenterY = y + 0.5;
                    const dist = Phaser.Math.Distance.Between(centerX, centerY, tileCenterX, tileCenterY);
                    if (dist > range) continue;

                    const closeness = 1 + ((range - dist) / Math.max(0.5, range));
                    danger[y * width + x] += Math.round(dangerPerTile * closeness);
                }
            }
        });

        return danger;
    }

    private static calculateAStar(sx: number, sy: number, targetRect: { x: number, y: number, w: number, h: number }, grid: Int32Array, width: number, height: number): Phaser.Math.Vector2[] | null {
        const open: { x: number, y: number, f: number, g: number, p: any }[] = [];
        const closed = new Uint8Array(width * height);
        const targetX = targetRect.x + targetRect.w / 2;
        const targetY = targetRect.y + targetRect.h / 2;
        const startDx = Math.abs(sx - targetX);
        const startDy = Math.abs(sy - targetY);
        const startDiag = Math.min(startDx, startDy);
        const startH = (startDiag * 14) + ((Math.max(startDx, startDy) - startDiag) * 10);
        open.push({ x: sx, y: sy, f: startH, g: 0, p: null });

        while (open.length > 0) {
            open.sort((a, b) => a.f - b.f);
            const curr = open.shift()!;

            if (curr.x >= targetRect.x && curr.x < targetRect.x + targetRect.w &&
                curr.y >= targetRect.y && curr.y < targetRect.y + targetRect.h) {

                const path: Phaser.Math.Vector2[] = [];
                let p = curr;
                while (p.p) {
                    path.push(new Phaser.Math.Vector2(p.x, p.y));
                    p = p.p;
                }
                return path.reverse();
            }

            const idx = curr.y * width + curr.x;
            if (closed[idx]) continue;
            closed[idx] = 1;

            const neighbors = [
                { x: curr.x + 1, y: curr.y, step: 10, diagonal: false },
                { x: curr.x - 1, y: curr.y, step: 10, diagonal: false },
                { x: curr.x, y: curr.y + 1, step: 10, diagonal: false },
                { x: curr.x, y: curr.y - 1, step: 10, diagonal: false },
                { x: curr.x + 1, y: curr.y + 1, step: 14, diagonal: true },
                { x: curr.x + 1, y: curr.y - 1, step: 14, diagonal: true },
                { x: curr.x - 1, y: curr.y + 1, step: 14, diagonal: true },
                { x: curr.x - 1, y: curr.y - 1, step: 14, diagonal: true }
            ];

            for (const n of neighbors) {
                if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;

                if (n.diagonal) {
                    // No corner cutting: if either cardinal side is blocked, skip this diagonal step.
                    const sideA = curr.y * width + n.x;
                    const sideB = n.y * width + curr.x;
                    if (grid[sideA] >= PathfindingSystem.COST_IMPASSABLE || grid[sideB] >= PathfindingSystem.COST_IMPASSABLE) {
                        continue;
                    }
                }

                const nIdx = n.y * width + n.x;
                if (closed[nIdx]) continue;

                const cellCost = grid[nIdx];
                if (cellCost >= PathfindingSystem.COST_IMPASSABLE) continue;

                const gScore = curr.g + ((cellCost * n.step) / 10);

                const existing = open.find(o => o.x === n.x && o.y === n.y);
                if (existing && existing.g <= gScore) continue;

                const dx = Math.abs(n.x - targetX);
                const dy = Math.abs(n.y - targetY);
                const diag = Math.min(dx, dy);
                const h = (diag * 14) + ((Math.max(dx, dy) - diag) * 10);

                const f = gScore + h;

                if (existing) {
                    existing.g = gScore;
                    existing.f = f;
                    existing.p = curr;
                } else {
                    open.push({ x: n.x, y: n.y, f, g: gScore, p: curr });
                }
            }
        }

        return null;
    }
}
