import Phaser from 'phaser';
import { BUILDING_DEFINITIONS, TROOP_DEFINITIONS, MAP_SIZE } from '../config/GameDefinitions';
import type { Troop, PlacedBuilding } from '../types/GameTypes';

export class PathfindingSystem {

    // Default costs
    private static readonly COST_DEFAULT = 10;
    private static readonly COST_IMPASSABLE = 999999;
    private static readonly COST_TROOP_AVOIDANCE = 40;
    private static readonly COST_WALL_DEFAULT = 5000;

    static findPath(troop: Troop, target: { gridX: number, gridY: number, type?: string } | PlacedBuilding, buildings: PlacedBuilding[], allTroops: Troop[]): Phaser.Math.Vector2[] | null {

        const width = MAP_SIZE;
        const height = MAP_SIZE;

        // 1. Initialize Grid
        const grid = new Int32Array(width * height).fill(PathfindingSystem.COST_DEFAULT);

        // 2. Determine Traversal Capabilities
        const def = TROOP_DEFINITIONS[troop.type];
        const canFly = def.movementType === 'air' || def.movementType === 'ghost';
        const wallCost = canFly ? PathfindingSystem.COST_DEFAULT : (def.wallTraversalCost ?? PathfindingSystem.COST_WALL_DEFAULT);

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
                cost = wallCost;
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

        // 4. Mark Obstacles (Troops) - Soft Avoidance
        allTroops.forEach(t => {
            if (t.id !== troop.id && t.health > 0) {
                const tx = Math.floor(t.gridX);
                const ty = Math.floor(t.gridY);
                if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
                    const idx = ty * width + tx;
                    if (grid[idx] < PathfindingSystem.COST_IMPASSABLE) {
                        grid[idx] += PathfindingSystem.COST_TROOP_AVOIDANCE;
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

    private static calculateAStar(sx: number, sy: number, targetRect: { x: number, y: number, w: number, h: number }, grid: Int32Array, width: number, height: number): Phaser.Math.Vector2[] | null {
        const open: { x: number, y: number, f: number, g: number, p: any }[] = [];
        const closed = new Uint8Array(width * height);

        open.push({ x: sx, y: sy, f: 0, g: 0, p: null });

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
                { x: curr.x + 1, y: curr.y },
                { x: curr.x - 1, y: curr.y },
                { x: curr.x, y: curr.y + 1 },
                { x: curr.x, y: curr.y - 1 }
            ];

            for (const n of neighbors) {
                if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
                const nIdx = n.y * width + n.x;
                if (closed[nIdx]) continue;

                const cellCost = grid[nIdx];
                if (cellCost >= PathfindingSystem.COST_IMPASSABLE) continue;

                const gScore = curr.g + cellCost;

                const existing = open.find(o => o.x === n.x && o.y === n.y);
                if (existing && existing.g <= gScore) continue;

                const tx = targetRect.x + targetRect.w / 2;
                const ty = targetRect.y + targetRect.h / 2;
                const h = Math.abs(n.x - tx) + Math.abs(n.y - ty);

                const f = gScore + (h * 10);

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
