
import Phaser from 'phaser';
import { IsoUtils } from '../utils/IsoUtils';
import { BUILDING_DEFINITIONS } from '../config/GameDefinitions';

export class BuildingRenderer {

    /**
     * Draws the Town Hall as a simple, bright building with flag.
     */
    static drawTownHall(graphics: Phaser.GameObjects.Graphics, gridX: number, gridY: number, time: number, alpha: number = 1, tint: number | null = null, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        const info = BUILDING_DEFINITIONS['town_hall'];
        const c1 = IsoUtils.cartToIso(gridX, gridY);
        const c2 = IsoUtils.cartToIso(gridX + info.width, gridY);
        const c3 = IsoUtils.cartToIso(gridX + info.width, gridY + info.height);
        const c4 = IsoUtils.cartToIso(gridX, gridY + info.height);
        const center = IsoUtils.cartToIso(gridX + info.width / 2, gridY + info.height / 2);

        const g = baseGraphics || graphics;

        // Building dimensions - simple box
        const height = 55;

        // Wall top corners
        const t1 = new Phaser.Math.Vector2(c1.x, c1.y - height);
        const t2 = new Phaser.Math.Vector2(c2.x, c2.y - height);
        const t3 = new Phaser.Math.Vector2(c3.x, c3.y - height);
        const t4 = new Phaser.Math.Vector2(c4.x, c4.y - height);

        if (!skipBase) {
            // === SIMPLE STONE FOUNDATION ===
            g.fillStyle(tint ?? 0x9a8a7a, alpha);
            g.fillPoints([c1, c2, c3, c4], true);

            // Light stone texture
            g.fillStyle(0xa89888, alpha * 0.4);
            for (let i = 0; i < 6; i++) {
                const px = center.x + Math.sin(i * 2.3) * 22;
                const py = center.y + Math.cos(i * 1.7) * 13;
                g.fillCircle(px, py, 3);
            }

            // Foundation border
            g.lineStyle(2, 0x7a6a5a, alpha);
            g.strokePoints([c1, c2, c3, c4], true, true);
        }

        if (!onlyBase) {
            const windowGlow = 0.75 + Math.sin(time / 600) * 0.05;  // Very subtle pulse

            // === SIMPLE WALLS (warm stone colors) ===
            // Right wall (slightly darker)
            graphics.fillStyle(tint ?? 0xc4a484, alpha);
            graphics.fillPoints([c2, c3, t3, t2], true);

            // Left wall (lighter)
            graphics.fillStyle(tint ?? 0xdcc4a4, alpha);
            graphics.fillPoints([c3, c4, t4, t3], true);

            // Wall edge outlines
            graphics.lineStyle(2, 0xa48464, alpha * 0.7);
            graphics.lineBetween(c2.x, c2.y, t2.x, t2.y);
            graphics.lineBetween(c3.x, c3.y, t3.x, t3.y);
            graphics.lineBetween(c4.x, c4.y, t4.x, t4.y);

            // === ISOMETRIC WINDOWS matching wall angles ===
            const rightWallDir = { x: (c3.x - c2.x), y: (c3.y - c2.y) };
            const leftWallDir = { x: (c4.x - c3.x), y: (c4.y - c3.y) };

            // Right wall window - parallelogram following the c2->c3 wall
            const rMidPt = 0.5;  // Position along wall (0 to 1)
            const rWinBaseX = c2.x + rightWallDir.x * rMidPt;
            const rWinBaseY = c2.y + rightWallDir.y * rMidPt;
            const rWinTopY = rWinBaseY - height * 0.7;  // Window top
            const rWinBotY = rWinBaseY - height * 0.3;  // Window bottom
            const rWinWidth = rightWallDir.x * 0.15;  // Width along wall direction
            const rWinSlant = rightWallDir.y * 0.15;  // Vertical slant matching wall
            // Window frame
            graphics.fillStyle(0x4a3020, alpha);
            graphics.beginPath();
            graphics.moveTo(rWinBaseX - rWinWidth, rWinTopY - rWinSlant);
            graphics.lineTo(rWinBaseX + rWinWidth, rWinTopY + rWinSlant);
            graphics.lineTo(rWinBaseX + rWinWidth, rWinBotY + rWinSlant);
            graphics.lineTo(rWinBaseX - rWinWidth, rWinBotY - rWinSlant);
            graphics.closePath();
            graphics.fillPath();
            // Window glass glow
            graphics.fillStyle(0xffeebb, alpha * windowGlow);
            graphics.beginPath();
            graphics.moveTo(rWinBaseX - rWinWidth + 2, rWinTopY - rWinSlant + 2);
            graphics.lineTo(rWinBaseX + rWinWidth - 2, rWinTopY + rWinSlant + 2);
            graphics.lineTo(rWinBaseX + rWinWidth - 2, rWinBotY + rWinSlant - 2);
            graphics.lineTo(rWinBaseX - rWinWidth + 2, rWinBotY - rWinSlant - 2);
            graphics.closePath();
            graphics.fillPath();

            // Left wall window - parallelogram following the c3->c4 wall
            const lMidPt = 0.5;
            const lWinBaseX = c3.x + leftWallDir.x * lMidPt;
            const lWinBaseY = c3.y + leftWallDir.y * lMidPt;
            const lWinTopY = lWinBaseY - height * 0.7;
            const lWinBotY = lWinBaseY - height * 0.3;
            const lWinWidth = leftWallDir.x * 0.15;
            const lWinSlant = leftWallDir.y * 0.15;
            // Window frame
            graphics.fillStyle(0x4a3020, alpha);
            graphics.beginPath();
            graphics.moveTo(lWinBaseX - lWinWidth, lWinTopY - lWinSlant);
            graphics.lineTo(lWinBaseX + lWinWidth, lWinTopY + lWinSlant);
            graphics.lineTo(lWinBaseX + lWinWidth, lWinBotY + lWinSlant);
            graphics.lineTo(lWinBaseX - lWinWidth, lWinBotY - lWinSlant);
            graphics.closePath();
            graphics.fillPath();
            // Window glass glow
            graphics.fillStyle(0xffeebb, alpha * windowGlow);
            graphics.beginPath();
            graphics.moveTo(lWinBaseX - lWinWidth + 2, lWinTopY - lWinSlant + 2);
            graphics.lineTo(lWinBaseX + lWinWidth - 2, lWinTopY + lWinSlant + 2);
            graphics.lineTo(lWinBaseX + lWinWidth - 2, lWinBotY + lWinSlant - 2);
            graphics.lineTo(lWinBaseX - lWinWidth + 2, lWinBotY - lWinSlant - 2);
            graphics.closePath();
            graphics.fillPath();

            // === SIMPLE PITCHED ROOF ===
            // Roof base (flat top)
            graphics.fillStyle(tint ?? 0xd4a484, alpha);
            graphics.fillPoints([t1, t2, t3, t4], true);

            // Roof peak
            const peakHeight = 25;
            const peak = new Phaser.Math.Vector2(center.x, center.y - height - peakHeight);

            // Front roof face (lighter)
            graphics.fillStyle(0xcc6644, alpha);
            graphics.fillTriangle(t4.x, t4.y, t1.x, t1.y, peak.x, peak.y);

            // Right roof face
            graphics.fillStyle(0xb85534, alpha);
            graphics.fillTriangle(t1.x, t1.y, t2.x, t2.y, peak.x, peak.y);

            // Back roof faces (darker)
            graphics.fillStyle(0xa84424, alpha);
            graphics.fillTriangle(t2.x, t2.y, t3.x, t3.y, peak.x, peak.y);
            graphics.fillTriangle(t3.x, t3.y, t4.x, t4.y, peak.x, peak.y);

            // Roof ridge lines
            graphics.lineStyle(2, 0xd4a04a, alpha * 0.8);
            graphics.lineBetween(t1.x, t1.y, peak.x, peak.y);
            graphics.lineBetween(t4.x, t4.y, peak.x, peak.y);

            // === PROMINENT FLAG POLE AND BANNER ===
            const flagPoleX = center.x;
            const flagPoleY = center.y - height - peakHeight + 5;
            const flagWave = Math.sin(time / 150) * 5;

            // Flag pole
            graphics.lineStyle(4, 0x6a5040, alpha);
            graphics.lineBetween(flagPoleX, flagPoleY, flagPoleX, flagPoleY - 35);

            // Pole top finial (golden ball)
            graphics.fillStyle(0xffd700, alpha);
            graphics.fillCircle(flagPoleX, flagPoleY - 38, 5);

            // Large waving banner
            graphics.fillStyle(0xdd3333, alpha);
            graphics.beginPath();
            graphics.moveTo(flagPoleX, flagPoleY - 35);
            graphics.lineTo(flagPoleX + 25, flagPoleY - 30 + flagWave * 0.3);
            graphics.lineTo(flagPoleX + 22, flagPoleY - 22 + flagWave * 0.5);
            graphics.lineTo(flagPoleX + 25, flagPoleY - 14 + flagWave * 0.3);
            graphics.lineTo(flagPoleX, flagPoleY - 17);
            graphics.closePath();
            graphics.fillPath();

            // Banner golden stripe
            graphics.fillStyle(0xffd700, alpha);
            graphics.beginPath();
            graphics.moveTo(flagPoleX, flagPoleY - 30);
            graphics.lineTo(flagPoleX + 20, flagPoleY - 26 + flagWave * 0.4);
            graphics.lineTo(flagPoleX + 20, flagPoleY - 23 + flagWave * 0.4);
            graphics.lineTo(flagPoleX, flagPoleY - 27);
            graphics.closePath();
            graphics.fillPath();

            // Banner shadow/outline
            graphics.lineStyle(1, 0x991111, alpha * 0.6);
            graphics.beginPath();
            graphics.moveTo(flagPoleX, flagPoleY - 35);
            graphics.lineTo(flagPoleX + 25, flagPoleY - 30 + flagWave * 0.3);
            graphics.lineTo(flagPoleX + 22, flagPoleY - 22 + flagWave * 0.5);
            graphics.lineTo(flagPoleX + 25, flagPoleY - 14 + flagWave * 0.3);
            graphics.lineTo(flagPoleX, flagPoleY - 17);
            graphics.strokePath();
        }
    }

    static drawBarracks(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        const level = building?.level ?? 1;
        // Visual tiers: L1-4 wooden, L5-8 stone, L9-13 iron-fortified
        const tier = level >= 9 ? 3 : level >= 5 ? 2 : 1;
        const isLevel2 = tier >= 2;
        const wallHeight = tier >= 3 ? 36 : tier >= 2 ? 34 : 28;
        const g = baseGraphics || graphics;

        // Wall top corners
        const t1 = new Phaser.Math.Vector2(c1.x, c1.y - wallHeight);
        const t2 = new Phaser.Math.Vector2(c2.x, c2.y - wallHeight);
        const t3 = new Phaser.Math.Vector2(c3.x, c3.y - wallHeight);
        const t4 = new Phaser.Math.Vector2(c4.x, c4.y - wallHeight);

        if (!skipBase) {
            if (isLevel2) {
                // Level 2: Reinforced stone slab with iron edge trim
                g.fillStyle(tint ?? 0x5a5058, alpha);
                g.fillPoints([c1, c2, c3, c4], true);
                g.lineStyle(2, 0x70706e, alpha * 0.7);
                g.lineBetween(c1.x, c1.y, c2.x, c2.y);
                g.lineBetween(c3.x, c3.y, c4.x, c4.y);
                g.fillStyle(0x4a444e, alpha * 0.5);
                g.fillCircle(center.x - 10, center.y + 2, 3);
                g.fillCircle(center.x + 7, center.y + 4, 2.5);
                g.fillCircle(center.x - 3, center.y + 6, 2);
                g.fillCircle(center.x + 12, center.y, 2);
            } else {
                g.fillStyle(tint ?? 0x7a6a5a, alpha);
                g.fillPoints([c1, c2, c3, c4], true);
                g.fillStyle(0x6a5a4a, alpha * 0.45);
                g.fillCircle(center.x - 8, center.y + 3, 3);
                g.fillCircle(center.x + 6, center.y + 5, 2);
            }
        }

        if (!onlyBase) {
            if (isLevel2) {
                // Level 2: Dark iron-reinforced stone walls
                graphics.fillStyle(tint ?? 0x5a4a4a, alpha);
                graphics.fillPoints([c2, c3, t3, t2], true);
                graphics.fillStyle(tint ?? 0x6e5858, alpha);
                graphics.fillPoints([c3, c4, t4, t3], true);
                // Stone block mortar lines
                graphics.lineStyle(1, 0x8b3030, alpha * 0.35);
                for (let i = 1; i <= 3; i++) {
                    const frac = i / 4;
                    const seY1 = c2.y + (t2.y - c2.y) * frac;
                    const seY2 = c3.y + (t3.y - c3.y) * frac;
                    graphics.lineBetween(c2.x, seY1, c3.x, seY2);
                    const swY1 = c3.y + (t3.y - c3.y) * frac;
                    const swY2 = c4.y + (t4.y - c4.y) * frac;
                    graphics.lineBetween(c3.x, swY1, c4.x, swY2);
                }
                // Iron corner rivets
                graphics.fillStyle(0x888888, alpha * 0.8);
                graphics.fillCircle(c2.x, c2.y - 5, 2);
                graphics.fillCircle(c3.x, c3.y - 5, 2);
                graphics.fillCircle(c4.x, c4.y - 5, 2);
                graphics.fillCircle(t2.x, t2.y + 4, 2);
                graphics.fillCircle(t3.x, t3.y + 4, 2);
                graphics.fillCircle(t4.x, t4.y + 4, 2);
                // Iron band across top of walls
                graphics.lineStyle(2, 0x666666, alpha * 0.7);
                graphics.lineBetween(t2.x, t2.y + 1, t3.x, t3.y + 1);
                graphics.lineBetween(t3.x, t3.y + 1, t4.x, t4.y + 1);
            } else {
                graphics.fillStyle(tint ?? 0x8b3030, alpha);
                graphics.fillPoints([c2, c3, t3, t2], true);
                graphics.fillStyle(tint ?? 0xa04040, alpha);
                graphics.fillPoints([c3, c4, t4, t3], true);
            }

            // Wall edge outlines
            graphics.lineStyle(1, 0x4a1a1a, 0.6 * alpha);
            graphics.lineBetween(c2.x, c2.y, t2.x, t2.y);
            graphics.lineBetween(c3.x, c3.y, t3.x, t3.y);
            graphics.lineBetween(c4.x, c4.y, t4.x, t4.y);

            // === DOORWAY ===
            const doorHeight = isLevel2 ? 18 : 16;
            const wallDirX = (c4.x - c3.x);
            const wallDirY = (c4.y - c3.y);
            const wallLen = Math.sqrt(wallDirX * wallDirX + wallDirY * wallDirY);
            const normX = wallDirX / wallLen;
            const normY = wallDirY / wallLen;
            const doorCenterX = (c3.x + c4.x) / 2;
            const doorCenterY = (c3.y + c4.y) / 2;
            const doorHalfWidth = 10;
            const dbl = { x: doorCenterX - normX * doorHalfWidth, y: doorCenterY - normY * doorHalfWidth };
            const dbr = { x: doorCenterX + normX * doorHalfWidth, y: doorCenterY + normY * doorHalfWidth };
            const dtl = { x: dbl.x, y: dbl.y - doorHeight };
            const dtr = { x: dbr.x, y: dbr.y - doorHeight };

            graphics.fillStyle(0x1a0a0a, alpha);
            graphics.fillPoints([
                new Phaser.Math.Vector2(dbl.x, dbl.y),
                new Phaser.Math.Vector2(dbr.x, dbr.y),
                new Phaser.Math.Vector2(dtr.x, dtr.y),
                new Phaser.Math.Vector2(dtl.x, dtl.y)
            ], true);

            graphics.lineStyle(2, isLevel2 ? 0x777777 : 0x5d4e37, alpha);
            graphics.lineBetween(dbl.x, dbl.y, dtl.x, dtl.y);
            graphics.lineBetween(dbr.x, dbr.y, dtr.x, dtr.y);
            graphics.lineBetween(dtl.x, dtl.y, dtr.x, dtr.y);

            if (isLevel2) {
                // Iron door studs
                graphics.fillStyle(0x999999, alpha * 0.8);
                const doorMidX = (dbl.x + dbr.x) / 2;
                const doorMidY = (dbl.y + dbr.y) / 2 - doorHeight / 2;
                graphics.fillCircle(doorMidX - 4, doorMidY - 3, 1.5);
                graphics.fillCircle(doorMidX + 4, doorMidY - 3, 1.5);
                graphics.fillCircle(doorMidX - 4, doorMidY + 3, 1.5);
                graphics.fillCircle(doorMidX + 4, doorMidY + 3, 1.5);
            }

            // === ISOMETRIC ROOF ===
            const roofHeight = isLevel2 ? 20 : 18;
            const roofOverhang = isLevel2 ? 5 : 4;
            const r1 = new Phaser.Math.Vector2(t1.x, t1.y - roofOverhang);
            const r2 = new Phaser.Math.Vector2(t2.x + roofOverhang, t2.y);
            const r3 = new Phaser.Math.Vector2(t3.x, t3.y + roofOverhang);
            const r4 = new Phaser.Math.Vector2(t4.x - roofOverhang, t4.y);
            const peakFront = new Phaser.Math.Vector2(center.x + 10, center.y - wallHeight - roofHeight + 5);
            const peakBack = new Phaser.Math.Vector2(center.x - 10, center.y - wallHeight - roofHeight - 5);

            if (isLevel2) {
                // Dark slate roof with iron ridge cap
                graphics.fillStyle(0x2a2832, alpha);
                graphics.fillTriangle(r1.x, r1.y, r4.x, r4.y, peakBack.x, peakBack.y);
                graphics.fillStyle(0x3a3640, alpha);
                graphics.fillTriangle(r1.x, r1.y, r2.x, r2.y, peakBack.x, peakBack.y);
                graphics.fillStyle(0x484450, alpha);
                graphics.fillTriangle(r2.x, r2.y, r3.x, r3.y, peakFront.x, peakFront.y);
                graphics.fillTriangle(r2.x, r2.y, peakBack.x, peakBack.y, peakFront.x, peakFront.y);
                graphics.fillStyle(0x56525e, alpha);
                graphics.fillTriangle(r3.x, r3.y, r4.x, r4.y, peakFront.x, peakFront.y);
                graphics.fillTriangle(r4.x, r4.y, peakBack.x, peakBack.y, peakFront.x, peakFront.y);
                // Iron ridge cap
                graphics.lineStyle(3, 0x707070, alpha * 0.9);
                graphics.lineBetween(peakBack.x, peakBack.y, peakFront.x, peakFront.y);
                graphics.fillStyle(0x888888, alpha);
                graphics.fillCircle(peakFront.x, peakFront.y - 1, 3);
                graphics.fillCircle(peakBack.x, peakBack.y - 1, 3);
            } else {
                graphics.fillStyle(0x3a2515, alpha);
                graphics.fillTriangle(r1.x, r1.y, r4.x, r4.y, peakBack.x, peakBack.y);
                graphics.fillStyle(0x4a3020, alpha);
                graphics.fillTriangle(r1.x, r1.y, r2.x, r2.y, peakBack.x, peakBack.y);
                graphics.fillStyle(0x5a3a25, alpha);
                graphics.fillTriangle(r2.x, r2.y, r3.x, r3.y, peakFront.x, peakFront.y);
                graphics.fillTriangle(r2.x, r2.y, peakBack.x, peakBack.y, peakFront.x, peakFront.y);
                graphics.fillStyle(0x6a4a30, alpha);
                graphics.fillTriangle(r3.x, r3.y, r4.x, r4.y, peakFront.x, peakFront.y);
                graphics.fillTriangle(r4.x, r4.y, peakBack.x, peakBack.y, peakFront.x, peakFront.y);
                graphics.lineStyle(2, 0x2a1510, alpha);
                graphics.lineBetween(peakBack.x, peakBack.y, peakFront.x, peakFront.y);
            }

            graphics.lineStyle(1, isLevel2 ? 0x6a6a7a : 0x7a5a40, alpha * 0.6);
            graphics.lineBetween(r4.x, r4.y, peakFront.x, peakFront.y);

            // Tier 3 (L9-13): Iron fortification details
            if (tier >= 3) {
                // Iron plate reinforcements on walls
                graphics.fillStyle(0x555555, alpha * 0.6);
                const plateMidX = (c2.x + c3.x) / 2;
                const plateMidY = (c2.y + c3.y) / 2 - wallHeight * 0.5;
                graphics.fillRect(plateMidX - 6, plateMidY - 4, 12, 8);
                // Rivets on iron plates
                graphics.fillStyle(0x999999, alpha * 0.9);
                graphics.fillCircle(plateMidX - 4, plateMidY - 2, 1.5);
                graphics.fillCircle(plateMidX + 4, plateMidY - 2, 1.5);
                graphics.fillCircle(plateMidX - 4, plateMidY + 2, 1.5);
                graphics.fillCircle(plateMidX + 4, plateMidY + 2, 1.5);
                // Banner on roof
                graphics.fillStyle(0xcc2222, alpha * 0.8);
                const bannerX = peakFront.x + 2;
                const bannerY = peakFront.y - 6;
                graphics.fillTriangle(bannerX, bannerY, bannerX + 6, bannerY + 4, bannerX, bannerY + 8);
                // Banner pole
                graphics.lineStyle(1, 0x666666, alpha);
                graphics.lineBetween(bannerX, bannerY - 2, bannerX, bannerY + 10);
            }
        }
    }

    static drawLab(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, time: number = 0, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        const level = building?.level ?? 1;
        const isLevel2 = level >= 2;
        const wallHeight = isLevel2 ? 36 : 30;
        const g = baseGraphics || graphics;

        const t1 = new Phaser.Math.Vector2(c1.x, c1.y - wallHeight);
        const t2 = new Phaser.Math.Vector2(c2.x, c2.y - wallHeight);
        const t3 = new Phaser.Math.Vector2(c3.x, c3.y - wallHeight);
        const t4 = new Phaser.Math.Vector2(c4.x, c4.y - wallHeight);

        if (!skipBase) {
            // Stone foundation
            g.fillStyle(tint ?? 0x6a6a78, alpha);
            g.fillPoints([c1, c2, c3, c4], true);
            g.lineStyle(2, 0x555566, alpha * 0.7);
            g.lineBetween(c1.x, c1.y, c2.x, c2.y);
            g.lineBetween(c3.x, c3.y, c4.x, c4.y);
            // Floor detail
            g.fillStyle(0x5a5a68, alpha * 0.5);
            g.fillCircle(center.x - 6, center.y + 3, 3);
            g.fillCircle(center.x + 8, center.y + 2, 2.5);
        }

        if (!onlyBase) {
            // Walls - dark stone workshop
            const rightWallColor = isLevel2 ? 0x4a4458 : 0x5a5a6a;
            const leftWallColor = isLevel2 ? 0x5a5468 : 0x6a6a7a;
            graphics.fillStyle(tint ?? rightWallColor, alpha);
            graphics.fillPoints([c2, c3, t3, t2], true);
            graphics.fillStyle(tint ?? leftWallColor, alpha);
            graphics.fillPoints([c3, c4, t4, t3], true);

            // Wall edges
            graphics.lineStyle(1, 0x3a3a4a, 0.6 * alpha);
            graphics.lineBetween(c2.x, c2.y, t2.x, t2.y);
            graphics.lineBetween(c3.x, c3.y, t3.x, t3.y);
            graphics.lineBetween(c4.x, c4.y, t4.x, t4.y);

            // Glowing interior window on right wall
            const rWallDirX = (c3.x - c2.x);
            const rWallDirY = (c3.y - c2.y);
            const rwMidX = c2.x + rWallDirX * 0.5;
            const rwMidY = c2.y + rWallDirY * 0.5;
            const windowGlow = 0.6 + Math.sin(time / 500) * 0.15;
            // Window frame
            graphics.fillStyle(0x1a1a2a, alpha);
            const ww = rWallDirX * 0.12;
            const ws = rWallDirY * 0.12;
            const wTop = rwMidY - wallHeight * 0.65;
            const wBot = rwMidY - wallHeight * 0.3;
            graphics.beginPath();
            graphics.moveTo(rwMidX - ww, wTop - ws);
            graphics.lineTo(rwMidX + ww, wTop + ws);
            graphics.lineTo(rwMidX + ww, wBot + ws);
            graphics.lineTo(rwMidX - ww, wBot - ws);
            graphics.closePath();
            graphics.fillPath();
            // Glow
            const glowColor = isLevel2 ? 0x8844ff : 0x44cc88;
            graphics.fillStyle(glowColor, alpha * windowGlow);
            graphics.beginPath();
            graphics.moveTo(rwMidX - ww + 2, wTop - ws + 2);
            graphics.lineTo(rwMidX + ww - 2, wTop + ws + 2);
            graphics.lineTo(rwMidX + ww - 2, wBot + ws - 2);
            graphics.lineTo(rwMidX - ww + 2, wBot - ws - 2);
            graphics.closePath();
            graphics.fillPath();

            // Flat isometric roof
            const roofOverhang = 4;
            const r1 = new Phaser.Math.Vector2(t1.x, t1.y - roofOverhang);
            const r2 = new Phaser.Math.Vector2(t2.x + roofOverhang, t2.y);
            const r3 = new Phaser.Math.Vector2(t3.x, t3.y + roofOverhang);
            const r4 = new Phaser.Math.Vector2(t4.x - roofOverhang, t4.y);

            graphics.fillStyle(isLevel2 ? 0x3a3448 : 0x4a4a5a, alpha);
            graphics.fillPoints([r1, r2, r3, r4], true);
            graphics.lineStyle(1, 0x2a2a3a, alpha * 0.8);
            graphics.strokePoints([r1, r2, r3, r4], true, true);

            // Chimney on right side
            const chimneyX = (r2.x + r3.x) / 2;
            const chimneyY = (r2.y + r3.y) / 2;
            const chimneyH = 14;
            graphics.fillStyle(0x5a5a5a, alpha);
            graphics.fillRect(chimneyX - 3, chimneyY - chimneyH, 6, chimneyH);
            graphics.lineStyle(1, 0x3a3a3a, alpha * 0.8);
            graphics.strokeRect(chimneyX - 3, chimneyY - chimneyH, 6, chimneyH);

            // Smoke from chimney (animated)
            const smokePhase = time / 800;
            const smokeColor = isLevel2 ? 0x7744aa : 0x888888;
            for (let i = 0; i < 3; i++) {
                const sy = chimneyY - chimneyH - 4 - i * 6 - Math.sin(smokePhase + i) * 2;
                const sx = chimneyX + Math.sin(smokePhase * 0.7 + i * 1.5) * 3;
                graphics.fillStyle(smokeColor, alpha * (0.4 - i * 0.1));
                graphics.fillCircle(sx, sy, 3 - i * 0.5);
            }

            // Level 2: Glowing runes on walls
            if (isLevel2) {
                const runeGlow = 0.5 + Math.sin(time / 400) * 0.2;
                graphics.fillStyle(0x9966ff, alpha * runeGlow);
                // Runes on left wall
                const lWallDirX = (c4.x - c3.x);
                const lWallDirY = (c4.y - c3.y);
                for (let i = 0; i < 3; i++) {
                    const frac = 0.25 + i * 0.25;
                    const rx = c3.x + lWallDirX * frac;
                    const ry = c3.y + lWallDirY * frac - wallHeight * 0.5;
                    graphics.fillCircle(rx, ry, 2);
                    graphics.lineStyle(1, 0x9966ff, alpha * runeGlow * 0.7);
                    graphics.lineBetween(rx - 2, ry - 3, rx + 2, ry + 3);
                }
                // Reinforced wall bands
                graphics.lineStyle(2, 0x444466, alpha * 0.6);
                const bandY = c3.y + (t3.y - c3.y) * 0.5;
                graphics.lineBetween(c3.x, bandY, c4.x, c4.y + (t4.y - c4.y) * 0.5);
            }
        }
    }

    static drawCannon(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        // Get the rotation angle from building (same system as ballista/xbow)
        const angle = building?.ballistaAngle ?? Math.PI / 4; // Default facing bottom-right (isometric forward)
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const g = baseGraphics || graphics;

        if (!skipBase) {
            // === STONE FOUNDATION PLATFORM ===
            // Main stone base (isometric diamond)
            g.fillStyle(tint ?? 0x7a7a7a, alpha);
            g.fillPoints([c1, c2, c3, c4], true);

            // Stone texture - lighter edges for 3D effect
            g.lineStyle(2, 0x9a9a9a, alpha * 0.8);
            g.lineBetween(c1.x, c1.y, c2.x, c2.y);
            g.lineBetween(c1.x, c1.y, c4.x, c4.y);
            g.lineStyle(2, 0x4a4a4a, alpha * 0.8);
            g.lineBetween(c2.x, c2.y, c3.x, c3.y);
            g.lineBetween(c3.x, c3.y, c4.x, c4.y);

            // Stone decorative details
            g.fillStyle(0x6a6a6a, alpha * 0.6);
            g.fillCircle(center.x - 10, center.y + 6, 3);
            g.fillCircle(center.x + 8, center.y + 4, 2);

            // === WOODEN ROTATING BASE (Isometric ellipse) ===
            const baseRadiusX = 22;
            const baseRadiusY = 13; // Squashed for isometric view
            const baseY = center.y - 3;

            // Wood shadow underneath
            g.fillStyle(0x1a1008, alpha * 0.5);
            g.fillEllipse(center.x + 2, baseY + 4, baseRadiusX, baseRadiusY);

            // Main wooden base
            g.fillStyle(0x5a4030, alpha);
            g.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

            // Wood grain rings
            g.lineStyle(2, 0x4a3020, alpha * 0.6);
            g.strokeEllipse(center.x, baseY, baseRadiusX - 4, baseRadiusY - 2);
            g.lineStyle(1, 0x3a2515, alpha * 0.4);
            g.strokeEllipse(center.x, baseY, baseRadiusX - 8, baseRadiusY - 5);

            // Metal reinforcement ring on wooden base
            g.lineStyle(3, 0x444444, alpha);
            g.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
            g.lineStyle(1, 0x666666, alpha * 0.6);
            g.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);



        }

        if (!onlyBase) {
            // === ROTATING CANNON BARREL ===
            const baseY = center.y - 3;
            const barrelHeight = -14; // Height above base
            const barrelLength = 28;  // Length of barrel
            const barrelWidth = 10;   // Thickness

            // Apply recoil offset (pulls barrel back in opposite direction of firing)
            const recoilAmount = (building?.cannonRecoilOffset ?? 0) * 8; // Max 8 pixels recoil
            const recoilOffsetX = -cos * recoilAmount;
            const recoilOffsetY = -sin * 0.5 * recoilAmount;

            // Calculate barrel end position based on angle (with recoil)
            const barrelTipX = center.x + cos * barrelLength + recoilOffsetX;
            const barrelTipY = center.y + barrelHeight + sin * 0.5 * barrelLength + recoilOffsetY;

            // Barrel shadow on ground
            g.fillStyle(0x1a1a1a, alpha * 0.3);
            g.fillEllipse(center.x + cos * (barrelLength * 0.5) + 3, center.y + 4, barrelLength * 0.6, 5);

            // === BARREL CARRIAGE (holds the barrel) ===
            // Two side supports from the rotating base
            const supportOffsetX = -sin * 8;
            const supportOffsetY = cos * 4;

            // Left support
            graphics.fillStyle(0x4a3525, alpha);
            graphics.beginPath();
            graphics.moveTo(center.x - supportOffsetX, baseY - supportOffsetY);
            graphics.lineTo(center.x - supportOffsetX * 0.5, center.y + barrelHeight + 4);
            graphics.lineTo(center.x + cos * 5 - supportOffsetX * 0.5, center.y + barrelHeight + sin * 2.5 + 4);
            graphics.lineTo(center.x + cos * 5, center.y + barrelHeight + sin * 2.5);
            graphics.closePath();
            graphics.fillPath();

            // Right support
            graphics.fillStyle(0x3a2515, alpha);
            graphics.beginPath();
            graphics.moveTo(center.x + supportOffsetX, baseY + supportOffsetY);
            graphics.lineTo(center.x + supportOffsetX * 0.5, center.y + barrelHeight + 4);
            graphics.lineTo(center.x + cos * 5 + supportOffsetX * 0.5, center.y + barrelHeight + sin * 2.5 + 4);
            graphics.lineTo(center.x + cos * 5, center.y + barrelHeight + sin * 2.5);
            graphics.closePath();
            graphics.fillPath();

            // === CONDITIONAL RENDER ORDER ===
            // If pointing down (sin >= 0), barrel is in front, so draw pivot FIRST (behind barrel)
            // If pointing up (sin < 0), barrel is behind, so draw pivot LAST (on top of barrel)

            const drawPivot = () => {
                // === CENTRAL PIVOT MECHANISM ===
                const pivotX = center.x + recoilOffsetX;
                const pivotY = center.y + barrelHeight + 3 + recoilOffsetY;

                graphics.fillStyle(0x333333, alpha);
                graphics.fillCircle(pivotX, pivotY, 8);
                graphics.fillStyle(0x444444, alpha);
                graphics.fillCircle(pivotX, pivotY, 6);
                graphics.fillStyle(0x555555, alpha);
                graphics.fillCircle(pivotX, pivotY, 4);
                graphics.fillStyle(0x666666, alpha * 0.7);
                graphics.fillCircle(pivotX - 1, pivotY - 1, 2);
            };

            if (sin >= 0) drawPivot();

            // === BARREL BASE ===
            // Large reinforced base where barrel meets carriage (with recoil)
            // Moved here to be BEHIND the barrel body
            const baseJointX = center.x + cos * 3 + recoilOffsetX;
            const baseJointY = center.y + barrelHeight + sin * 1.5 + recoilOffsetY;
            graphics.fillStyle(0x555555, alpha);
            graphics.fillEllipse(baseJointX, baseJointY, 14, 8);
            graphics.fillStyle(0x444444, alpha);
            graphics.fillEllipse(baseJointX, baseJointY, 10, 6);
            graphics.fillStyle(0x333333, alpha);
            graphics.fillEllipse(baseJointX, baseJointY, 6, 4);

            // === MAIN BARREL BODY ===
            // Draw the barrel as multiple layers for depth
            // Barrel base point (with recoil)
            const barrelBaseX = center.x + recoilOffsetX;
            const barrelBaseY = center.y + barrelHeight + recoilOffsetY;

            // Barrel outer shadow
            graphics.lineStyle(barrelWidth + 4, 0x1a1a1a, alpha);
            graphics.lineBetween(barrelBaseX, barrelBaseY + 2, barrelTipX, barrelTipY + 2);

            // Barrel main body - dark iron
            graphics.lineStyle(barrelWidth, 0x2a2a2a, alpha);
            graphics.lineBetween(barrelBaseX, barrelBaseY, barrelTipX, barrelTipY);

            // Barrel highlight strip (top)
            graphics.lineStyle(barrelWidth - 4, 0x3a3a3a, alpha);
            graphics.lineBetween(center.x, center.y + barrelHeight - 1, barrelTipX, barrelTipY - 1);

            // Bright highlight
            graphics.lineStyle(2, 0x5a5a5a, alpha * 0.8);
            graphics.lineBetween(barrelBaseX, barrelBaseY - 2, barrelTipX, barrelTipY - 2);

            // === DECORATIVE BARREL BANDS (iron) ===
            const bands = [0.15, 0.4, 0.7, 0.9];
            for (const t of bands) {
                const bandX = center.x + cos * barrelLength * t + recoilOffsetX;
                const bandY = center.y + barrelHeight + sin * 0.5 * barrelLength * t + recoilOffsetY;

                // Iron bands
                graphics.fillStyle(0x4a4a4a, alpha);
                graphics.fillEllipse(bandX, bandY, 7, 4);
                graphics.fillStyle(0x5a5a5a, alpha * 0.6);
                graphics.fillCircle(bandX - 1, bandY - 1, 1.5);
                graphics.lineStyle(1, 0x333333, alpha);
                graphics.strokeEllipse(bandX, bandY, 7, 4);
            }

            // Barrel Base moved before barrel body


            // Muzzle removed - barrel just ends with the line strokes

            // If pointing up (sin < 0), draw pivot LAST (on top of barrel)
            if (sin < 0) drawPivot();
        }
    }

    static drawCannonLevel2(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        // LEVEL 2 CANNON: Reinforced single barrel with iron plating and copper accents
        const angle = building?.ballistaAngle ?? Math.PI / 4;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const g = baseGraphics || graphics;

        if (!skipBase) {
            // === REINFORCED STONE FOUNDATION ===
            g.fillStyle(tint ?? 0x6a6a6a, alpha);
            g.fillPoints([c1, c2, c3, c4], true);

            // Iron corner brackets
            g.lineStyle(2, 0x555555, alpha * 0.9);
            g.lineBetween(c1.x, c1.y, c2.x, c2.y);
            g.lineBetween(c1.x, c1.y, c4.x, c4.y);
            g.lineStyle(2, 0x3a3a3a, alpha * 0.8);
            g.lineBetween(c2.x, c2.y, c3.x, c3.y);
            g.lineBetween(c3.x, c3.y, c4.x, c4.y);

            // Corner rivets (iron)
            g.fillStyle(0x666666, alpha * 0.9);
            g.fillCircle(c1.x, c1.y, 2.5);
            g.fillCircle(c2.x, c2.y, 2);
            g.fillCircle(c3.x, c3.y, 2);
            g.fillCircle(c4.x, c4.y, 2);

            // === WOODEN ROTATING BASE WITH IRON REINFORCEMENT ===
            const baseRadiusX = 23;
            const baseRadiusY = 13.5;
            const baseY = center.y - 3;

            // Shadow underneath
            g.fillStyle(0x1a1008, alpha * 0.5);
            g.fillEllipse(center.x + 2, baseY + 4, baseRadiusX, baseRadiusY);

            // Main wooden base (darker, treated wood)
            g.fillStyle(0x4a3525, alpha);
            g.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

            // Wood grain rings
            g.lineStyle(2, 0x3a2515, alpha * 0.6);
            g.strokeEllipse(center.x, baseY, baseRadiusX - 4, baseRadiusY - 2);
            g.lineStyle(1, 0x2a1a0a, alpha * 0.4);
            g.strokeEllipse(center.x, baseY, baseRadiusX - 8, baseRadiusY - 5);

            // Heavy iron reinforcement ring
            g.lineStyle(4, 0x3a3a3a, alpha);
            g.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
            g.lineStyle(2, 0x555555, alpha * 0.6);
            g.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);

        }
        if (!onlyBase) {
            const baseY = center.y - 2;

            // === BIGGER REINFORCED BARREL ===
            const barrelHeight = -14;
            const barrelLength = 30;  // Longer barrel
            const barrelWidth = 12;   // Thicker barrel

            // Recoil
            const recoilAmount = (building?.cannonRecoilOffset ?? 0) * 9;
            const recoilOffsetX = -cos * recoilAmount;
            const recoilOffsetY = -sin * 0.5 * recoilAmount;

            const barrelTipX = center.x + cos * barrelLength + recoilOffsetX;
            const barrelTipY = center.y + barrelHeight + sin * 0.5 * barrelLength + recoilOffsetY;

            // Barrel shadow
            g.fillStyle(0x1a1a1a, alpha * 0.35);
            g.fillEllipse(center.x + cos * (barrelLength * 0.5) + 3, center.y + 5, barrelLength * 0.65, 5);

            // === BARREL CARRIAGE (heavier supports) ===
            const supportOffsetX = -sin * 9;
            const supportOffsetY = cos * 4.5;

            // Left support
            graphics.fillStyle(0x3a2a1a, alpha);
            graphics.beginPath();
            graphics.moveTo(center.x - supportOffsetX, baseY - supportOffsetY);
            graphics.lineTo(center.x - supportOffsetX * 0.5, center.y + barrelHeight + 5);
            graphics.lineTo(center.x + cos * 6 - supportOffsetX * 0.5, center.y + barrelHeight + sin * 3 + 5);
            graphics.lineTo(center.x + cos * 6, center.y + barrelHeight + sin * 3);
            graphics.closePath();
            graphics.fillPath();

            // Right support
            graphics.fillStyle(0x2a1a0a, alpha);
            graphics.beginPath();
            graphics.moveTo(center.x + supportOffsetX, baseY + supportOffsetY);
            graphics.lineTo(center.x + supportOffsetX * 0.5, center.y + barrelHeight + 5);
            graphics.lineTo(center.x + cos * 6 + supportOffsetX * 0.5, center.y + barrelHeight + sin * 3 + 5);
            graphics.lineTo(center.x + cos * 6, center.y + barrelHeight + sin * 3);
            graphics.closePath();
            graphics.fillPath();

            // === CENTRAL PIVOT (reinforced) ===
            const drawPivot = () => {
                const pivotX = center.x + recoilOffsetX;
                const pivotY = center.y + barrelHeight + 3 + recoilOffsetY;

                graphics.fillStyle(0x2a2a2a, alpha);
                graphics.fillCircle(pivotX, pivotY, 9);
                graphics.fillStyle(0x3a3a3a, alpha);
                graphics.fillCircle(pivotX, pivotY, 7);
                graphics.fillStyle(0x4a4a4a, alpha);
                graphics.fillCircle(pivotX, pivotY, 5);
                // Copper accent
                graphics.fillStyle(0xb87333, alpha * 0.8);
                graphics.fillCircle(pivotX - 1, pivotY - 1, 2.5);
            };

            if (sin >= 0) drawPivot();

            // === BARREL BASE JOINT ===
            const baseJointX = center.x + cos * 3 + recoilOffsetX;
            const baseJointY = center.y + barrelHeight + sin * 1.5 + recoilOffsetY;
            graphics.fillStyle(0x4a4a4a, alpha);
            graphics.fillEllipse(baseJointX, baseJointY, 15, 9);
            graphics.fillStyle(0x3a3a3a, alpha);
            graphics.fillEllipse(baseJointX, baseJointY, 11, 7);
            graphics.fillStyle(0x2a2a2a, alpha);
            graphics.fillEllipse(baseJointX, baseJointY, 7, 4);

            // === MAIN BARREL BODY (reinforced) ===
            const barrelBaseX = center.x + recoilOffsetX;
            const barrelBaseY = center.y + barrelHeight + recoilOffsetY;

            // Barrel outer shadow
            graphics.lineStyle(barrelWidth + 4, 0x1a1a1a, alpha);
            graphics.lineBetween(barrelBaseX, barrelBaseY + 2, barrelTipX, barrelTipY + 2);

            // Barrel main body - dark iron
            graphics.lineStyle(barrelWidth, 0x2a2a2a, alpha);
            graphics.lineBetween(barrelBaseX, barrelBaseY, barrelTipX, barrelTipY);

            // Barrel highlight strip
            graphics.lineStyle(barrelWidth - 4, 0x3a3a3a, alpha);
            graphics.lineBetween(barrelBaseX, barrelBaseY - 1, barrelTipX, barrelTipY - 1);

            // Bright highlight
            graphics.lineStyle(2, 0x5a5a5a, alpha * 0.85);
            graphics.lineBetween(barrelBaseX, barrelBaseY - 2, barrelTipX, barrelTipY - 2);

            // === IRON BANDS (heavier than level 1) ===
            const bands = [0.12, 0.35, 0.58, 0.82];
            for (const t of bands) {
                const bandX = center.x + cos * barrelLength * t + recoilOffsetX;
                const bandY = center.y + barrelHeight + sin * 0.5 * barrelLength * t + recoilOffsetY;

                // Iron bands with copper rivets
                graphics.fillStyle(0x3a3a3a, alpha);
                graphics.fillEllipse(bandX, bandY, 8, 4.5);
                graphics.fillStyle(0xb87333, alpha * 0.7);
                graphics.fillCircle(bandX - 2, bandY - 1, 1.5);
                graphics.fillCircle(bandX + 2, bandY + 1, 1.5);
                graphics.lineStyle(1, 0x2a2a2a, alpha);
                graphics.strokeEllipse(bandX, bandY, 8, 4.5);
            }

            // If pointing up (sin < 0), draw pivot LAST
            if (sin < 0) drawPivot();
        }
    }

    static drawCannonLevel3(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        // LEVEL 3 CANNON: Fortified single-barrel with armor plating and steel reinforcements
        const angle = building?.ballistaAngle ?? Math.PI / 4;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const g = baseGraphics || graphics;

        if (!skipBase) {
            // === ARMORED STEEL FOUNDATION ===
            // Dark steel base with reinforced edges (isometric diamond)
            g.fillStyle(tint ?? 0x3a3a4a, alpha);
            g.fillPoints([c1, c2, c3, c4], true);

            // Steel trim edges with subtle blue tint
            g.lineStyle(3, 0x4a4a5a, alpha * 0.9);
            g.lineBetween(c1.x, c1.y, c2.x, c2.y);
            g.lineBetween(c1.x, c1.y, c4.x, c4.y);
            g.lineStyle(2, 0x2a2a3a, alpha * 0.8);
            g.lineBetween(c2.x, c2.y, c3.x, c3.y);
            g.lineBetween(c3.x, c3.y, c4.x, c4.y);

            // Steel corner bolts
            g.fillStyle(0x606070, alpha * 0.9);
            g.fillCircle(c1.x, c1.y, 3);
            g.fillCircle(c2.x, c2.y, 2.5);
            g.fillCircle(c3.x, c3.y, 2.5);
            g.fillCircle(c4.x, c4.y, 2.5);
            // Bolt highlights
            g.fillStyle(0x808090, alpha * 0.6);
            g.fillCircle(c1.x - 1, c1.y - 1, 1.5);

            // === HEAVY ROTATING BASE ===
            const baseRadiusX = 22;
            const baseRadiusY = 13;
            const baseY = center.y - 3;

            // Shadow underneath
            g.fillStyle(0x1a1a1a, alpha * 0.5);
            g.fillEllipse(center.x + 2, baseY + 5, baseRadiusX + 2, baseRadiusY + 1);

            // Main armored base - dark steel
            g.fillStyle(0x3a3a4a, alpha);
            g.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

            // Inner steel ring
            g.lineStyle(3, 0x2a2a3a, alpha * 0.8);
            g.strokeEllipse(center.x, baseY, baseRadiusX - 4, baseRadiusY - 2);

            // Armor plates visible on base (wedge sections)
            g.fillStyle(0x4a4a5a, alpha * 0.6);
            g.beginPath();
            g.arc(center.x - 8, baseY, 8, -0.5, 0.8, false);
            g.fillPath();
            g.beginPath();
            g.arc(center.x + 8, baseY, 8, 2.3, 3.6, false);
            g.fillPath();

            // Heavy outer ring
            g.lineStyle(4, 0x4a4a5a, alpha);
            g.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
            g.lineStyle(2, 0x5a5a6a, alpha * 0.5);
            g.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);

        }
        if (!onlyBase) {
            const baseY = center.y - 2;

            // === FORTIFIED BARREL SETUP ===
            const barrelHeight = -12;
            const barrelLength = 28;
            const barrelWidth = 12;  // Thicker fortified barrel

            // Recoil animation
            const recoilAmount = (building?.cannonRecoilOffset ?? 0) * 10;
            const recoilOffsetX = -cos * recoilAmount;
            const recoilOffsetY = -sin * 0.5 * recoilAmount;

            // Barrel tip position
            const barrelTipX = center.x + cos * barrelLength + recoilOffsetX;
            const barrelTipY = center.y + barrelHeight + sin * 0.5 * barrelLength + recoilOffsetY;

            // Barrel shadow on ground
            g.fillStyle(0x1a1a1a, alpha * 0.4);
            g.fillEllipse(center.x + cos * (barrelLength * 0.5) + 3, center.y + 5, barrelLength * 0.7, 6);

            // === ARMORED BARREL CARRIAGE ===
            const supportOffsetX = -sin * 10;
            const supportOffsetY = cos * 5;

            // Left support (heavy steel)
            graphics.fillStyle(0x3a3a4a, alpha);
            graphics.beginPath();
            graphics.moveTo(center.x - supportOffsetX, baseY - supportOffsetY);
            graphics.lineTo(center.x - supportOffsetX * 0.5, center.y + barrelHeight + 5);
            graphics.lineTo(center.x + cos * 5 - supportOffsetX * 0.5, center.y + barrelHeight + sin * 2.5 + 5);
            graphics.lineTo(center.x + cos * 5, center.y + barrelHeight + sin * 2.5);
            graphics.closePath();
            graphics.fillPath();

            // Right support (slightly darker)
            graphics.fillStyle(0x2a2a3a, alpha);
            graphics.beginPath();
            graphics.moveTo(center.x + supportOffsetX, baseY + supportOffsetY);
            graphics.lineTo(center.x + supportOffsetX * 0.5, center.y + barrelHeight + 5);
            graphics.lineTo(center.x + cos * 5 + supportOffsetX * 0.5, center.y + barrelHeight + sin * 2.5 + 5);
            graphics.lineTo(center.x + cos * 5, center.y + barrelHeight + sin * 2.5);
            graphics.closePath();
            graphics.fillPath();

            // Steel bolts on supports
            graphics.fillStyle(0x5a5a6a, alpha * 0.8);
            graphics.fillCircle(center.x - supportOffsetX * 0.7, baseY - supportOffsetY * 0.7 - 3, 2);
            graphics.fillCircle(center.x + supportOffsetX * 0.7, baseY + supportOffsetY * 0.7 - 3, 2);

            // === CENTRAL PIVOT MECHANISM ===
            const drawPivot = () => {
                const pivotX = center.x + recoilOffsetX;
                const pivotY = center.y + barrelHeight + 4 + recoilOffsetY;

                // Heavy steel pivot
                graphics.fillStyle(0x2a2a2a, alpha);
                graphics.fillCircle(pivotX, pivotY, 9);
                graphics.fillStyle(0x3a3a4a, alpha);
                graphics.fillCircle(pivotX, pivotY, 7);
                // Steel center
                graphics.fillStyle(0x5a5a6a, alpha);
                graphics.fillCircle(pivotX, pivotY, 4);
                graphics.fillStyle(0x6a6a7a, alpha * 0.8);
                graphics.fillCircle(pivotX - 1, pivotY - 1, 2);
            };

            if (sin >= 0) drawPivot();

            // === BARREL BASE JOINT ===
            const baseJointX = center.x + cos * 3 + recoilOffsetX;
            const baseJointY = center.y + barrelHeight + sin * 1.5 + recoilOffsetY;
            graphics.fillStyle(0x4a4a5a, alpha);
            graphics.fillEllipse(baseJointX, baseJointY, 14, 9);
            graphics.fillStyle(0x3a3a4a, alpha * 0.8);
            graphics.fillEllipse(baseJointX, baseJointY, 10, 6);

            // === FORTIFIED BARREL ===
            const barrelBaseX = center.x + recoilOffsetX;
            const barrelBaseY = center.y + barrelHeight + recoilOffsetY;

            // Barrel outer shadow
            graphics.lineStyle(barrelWidth + 3, 0x1a1a1a, alpha);
            graphics.lineBetween(barrelBaseX, barrelBaseY + 2, barrelTipX, barrelTipY + 2);

            // Barrel main body - dark steel
            graphics.lineStyle(barrelWidth, 0x3a3a4a, alpha);
            graphics.lineBetween(barrelBaseX, barrelBaseY, barrelTipX, barrelTipY);

            // Barrel secondary layer
            graphics.lineStyle(barrelWidth - 2, 0x4a4a5a, alpha);
            graphics.lineBetween(barrelBaseX, barrelBaseY - 1, barrelTipX, barrelTipY - 1);

            // Barrel highlight strip
            graphics.lineStyle(3, 0x5a5a6a, alpha * 0.9);
            graphics.lineBetween(barrelBaseX, barrelBaseY - 3, barrelTipX, barrelTipY - 3);

            // === ARMOR REINFORCEMENT BANDS ===
            const bands = [0.15, 0.35, 0.55, 0.75];
            for (let i = 0; i < bands.length; i++) {
                const t = bands[i];
                const bandX = barrelBaseX + cos * barrelLength * t;
                const bandY = barrelBaseY + sin * 0.5 * barrelLength * t;

                // Steel reinforcement bands
                graphics.fillStyle(0x4a4a5a, alpha);
                graphics.fillEllipse(bandX, bandY, 9, 5);
                // Highlight on bands
                graphics.fillStyle(0x6a6a7a, alpha * 0.6);
                graphics.fillCircle(bandX - 2, bandY - 1, 2);
                graphics.lineStyle(1, 0x2a2a3a, alpha);
                graphics.strokeEllipse(bandX, bandY, 9, 5);

                // Small rivets on bands
                if (i % 2 === 0) {
                    graphics.fillStyle(0x5a5a6a, alpha * 0.7);
                    graphics.fillCircle(bandX - 3, bandY, 1.5);
                    graphics.fillCircle(bandX + 3, bandY, 1.5);
                }
            }

            // === MUZZLE SHROUD ===
            const muzzleX = barrelTipX;
            const muzzleY = barrelTipY;

            // Heavy muzzle ring
            graphics.fillStyle(0x4a4a5a, alpha);
            graphics.fillEllipse(muzzleX, muzzleY, 8, 5);
            graphics.fillStyle(0x5a5a6a, alpha);
            graphics.fillEllipse(muzzleX, muzzleY, 6, 4);

            // Dark bore
            graphics.fillStyle(0x1a1a1a, alpha);
            graphics.fillEllipse(muzzleX + cos * 2, muzzleY + sin, 4, 2.5);

            if (sin < 0) drawPivot();
        }
    }

    static drawCannonLevel4(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        // LEVEL 4 CANNON: Dual-barrel reinforced cannon with gold/brass accents and glowing effects
        const angle = building?.ballistaAngle ?? Math.PI / 4;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const g = baseGraphics || graphics;

        const baseY = center.y - 3;
        if (!skipBase) {
            // === REINFORCED STEEL FOUNDATION ===
            // Dark steel base with gold trim (isometric diamond)
            g.fillStyle(tint ?? 0x4a4a5a, alpha);
            g.fillPoints([c1, c2, c3, c4], true);

            // Gold trim edges for premium look
            g.lineStyle(3, 0xb8860b, alpha * 0.9);
            g.lineBetween(c1.x, c1.y, c2.x, c2.y);
            g.lineBetween(c1.x, c1.y, c4.x, c4.y);
            g.lineStyle(2, 0x8b6914, alpha * 0.8);
            g.lineBetween(c2.x, c2.y, c3.x, c3.y);
            g.lineBetween(c3.x, c3.y, c4.x, c4.y);

            // Decorative corner rivets (gold)
            g.fillStyle(0xffd700, alpha * 0.9);
            g.fillCircle(c1.x, c1.y, 3);
            g.fillCircle(c2.x, c2.y, 2);
            g.fillCircle(c3.x, c3.y, 2);
            g.fillCircle(c4.x, c4.y, 2);

            // === REINFORCED ROTATING BASE ===
            const baseRadiusX = 24;
            const baseRadiusY = 14;

            // Shadow underneath
            g.fillStyle(0x1a1008, alpha * 0.5);
            g.fillEllipse(center.x + 2, baseY + 5, baseRadiusX + 2, baseRadiusY + 1);

            // Main reinforced steel base with dark blue tint
            g.fillStyle(0x3a3a4a, alpha);
            g.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

            // Inner steel ring
            g.lineStyle(3, 0x2a2a3a, alpha * 0.8);
            g.strokeEllipse(center.x, baseY, baseRadiusX - 5, baseRadiusY - 3);

            // Glowing energy ring (orange/red for heat effect)
            g.lineStyle(2, 0xff6600, alpha * 0.6);
            g.strokeEllipse(center.x, baseY, baseRadiusX - 8, baseRadiusY - 5);
            g.lineStyle(1, 0xff9900, alpha * 0.4);
            g.strokeEllipse(center.x, baseY, baseRadiusX - 9, baseRadiusY - 6);

            // Gold reinforcement outer ring
            g.lineStyle(4, 0xb8860b, alpha);
            g.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
            g.lineStyle(2, 0xffd700, alpha * 0.5);
            g.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);

        }

        if (!onlyBase) {
            // === DUAL BARREL SETUP ===
            const barrelHeight = -14;
            const barrelLength = 30;  // Slightly longer barrels
            const barrelWidth = 8;    // Slightly thinner for dual setup
            const barrelSpacing = 5;  // Distance between the two barrels

            // Recoil animation
            const recoilAmount = (building?.cannonRecoilOffset ?? 0) * 10;
            const recoilOffsetX = -cos * recoilAmount;
            const recoilOffsetY = -sin * 0.5 * recoilAmount;

            // Barrel perpendicular offset for dual barrels
            const perpX = -sin * barrelSpacing;
            const perpY = cos * 0.5 * barrelSpacing;

            // Both barrel tip positions
            const barrelTip1X = center.x + cos * barrelLength + recoilOffsetX + perpX;
            const barrelTip1Y = center.y + barrelHeight + sin * 0.5 * barrelLength + recoilOffsetY + perpY;
            const barrelTip2X = center.x + cos * barrelLength + recoilOffsetX - perpX;
            const barrelTip2Y = center.y + barrelHeight + sin * 0.5 * barrelLength + recoilOffsetY - perpY;

            // Barrel shadow on ground
            g.fillStyle(0x1a1a1a, alpha * 0.4);
            g.fillEllipse(center.x + cos * (barrelLength * 0.5) + 3, center.y + 5, barrelLength * 0.7, 6);

            // === REINFORCED BARREL CARRIAGE ===
            const supportOffsetX = -sin * 10;
            const supportOffsetY = cos * 5;

            // Left support (reinforced steel)
            graphics.fillStyle(0x3a3a4a, alpha);
            graphics.beginPath();
            graphics.moveTo(center.x - supportOffsetX, baseY - supportOffsetY);
            graphics.lineTo(center.x - supportOffsetX * 0.5, center.y + barrelHeight + 5);
            graphics.lineTo(center.x + cos * 6 - supportOffsetX * 0.5, center.y + barrelHeight + sin * 3 + 5);
            graphics.lineTo(center.x + cos * 6, center.y + barrelHeight + sin * 3);
            graphics.closePath();
            graphics.fillPath();

            // Right support
            graphics.fillStyle(0x2a2a3a, alpha);
            graphics.beginPath();
            graphics.moveTo(center.x + supportOffsetX, baseY + supportOffsetY);
            graphics.lineTo(center.x + supportOffsetX * 0.5, center.y + barrelHeight + 5);
            graphics.lineTo(center.x + cos * 6 + supportOffsetX * 0.5, center.y + barrelHeight + sin * 3 + 5);
            graphics.lineTo(center.x + cos * 6, center.y + barrelHeight + sin * 3);
            graphics.closePath();
            graphics.fillPath();

            // Gold trim on supports
            graphics.lineStyle(1, 0xb8860b, alpha * 0.7);
            graphics.lineBetween(center.x - supportOffsetX, baseY - supportOffsetY, center.x + cos * 6, center.y + barrelHeight + sin * 3);
            graphics.lineBetween(center.x + supportOffsetX, baseY + supportOffsetY, center.x + cos * 6, center.y + barrelHeight + sin * 3);

            // === CENTRAL PIVOT MECHANISM (ENHANCED) ===
            const drawPivot = () => {
                const pivotX = center.x + recoilOffsetX;
                const pivotY = center.y + barrelHeight + 4 + recoilOffsetY;

                // Larger reinforced pivot
                graphics.fillStyle(0x2a2a2a, alpha);
                graphics.fillCircle(pivotX, pivotY, 10);
                graphics.fillStyle(0x3a3a4a, alpha);
                graphics.fillCircle(pivotX, pivotY, 8);
                // Gold center accent
                graphics.fillStyle(0xb8860b, alpha);
                graphics.fillCircle(pivotX, pivotY, 5);
                graphics.fillStyle(0xffd700, alpha * 0.8);
                graphics.fillCircle(pivotX - 1, pivotY - 1, 3);
                // Glowing core
                graphics.fillStyle(0xff6600, alpha * 0.5);
                graphics.fillCircle(pivotX, pivotY, 2);
            };

            if (sin >= 0) drawPivot();

            // === BARREL BASE JOINT (REINFORCED) ===
            const baseJointX = center.x + cos * 4 + recoilOffsetX;
            const baseJointY = center.y + barrelHeight + sin * 2 + recoilOffsetY;
            graphics.fillStyle(0x4a4a5a, alpha);
            graphics.fillEllipse(baseJointX, baseJointY, 16, 10);
            graphics.fillStyle(0xb8860b, alpha * 0.8);
            graphics.fillEllipse(baseJointX, baseJointY, 12, 7);
            graphics.fillStyle(0x3a3a4a, alpha);
            graphics.fillEllipse(baseJointX, baseJointY, 8, 5);

            // === DUAL BARRELS ===
            const drawBarrel = (tipX: number, tipY: number, offsetX: number, offsetY: number) => {
                const barrelBaseX = center.x + recoilOffsetX + offsetX;
                const barrelBaseY = center.y + barrelHeight + recoilOffsetY + offsetY;

                // Barrel outer shadow
                graphics.lineStyle(barrelWidth + 3, 0x1a1a1a, alpha);
                graphics.lineBetween(barrelBaseX, barrelBaseY + 2, tipX, tipY + 2);

                // Barrel main body - dark steel with blue tint
                graphics.lineStyle(barrelWidth, 0x2a2a3a, alpha);
                graphics.lineBetween(barrelBaseX, barrelBaseY, tipX, tipY);

                // Barrel highlight strip
                graphics.lineStyle(barrelWidth - 3, 0x3a3a4a, alpha);
                graphics.lineBetween(barrelBaseX, barrelBaseY - 1, tipX, tipY - 1);

                // Bright highlight
                graphics.lineStyle(2, 0x5a5a6a, alpha * 0.9);
                graphics.lineBetween(barrelBaseX, barrelBaseY - 2, tipX, tipY - 2);

                // === GOLD DECORATIVE BANDS ===
                const bands = [0.2, 0.5, 0.8];
                for (const t of bands) {
                    const bandX = barrelBaseX + cos * barrelLength * t;
                    const bandY = barrelBaseY + sin * 0.5 * barrelLength * t;

                    // Gold bands with subtle depth
                    graphics.fillStyle(0xb8860b, alpha);
                    graphics.fillEllipse(bandX, bandY, 6, 3.5);
                    graphics.fillStyle(0xb8860b, alpha * 0.7);
                    graphics.fillCircle(bandX - 1, bandY - 1, 1.5);
                    graphics.lineStyle(1, 0x8b6914, alpha);
                    graphics.strokeEllipse(bandX, bandY, 6, 3.5);
                }
            };

            // Draw both barrels
            drawBarrel(barrelTip1X, barrelTip1Y, perpX, perpY);
            drawBarrel(barrelTip2X, barrelTip2Y, -perpX, -perpY);

            // === CONNECTING BRACE BETWEEN BARRELS ===
            const braceT = 0.35;
            const brace1X = center.x + cos * barrelLength * braceT + recoilOffsetX + perpX;
            const brace1Y = center.y + barrelHeight + sin * 0.5 * barrelLength * braceT + recoilOffsetY + perpY;
            const brace2X = center.x + cos * barrelLength * braceT + recoilOffsetX - perpX;
            const brace2Y = center.y + barrelHeight + sin * 0.5 * barrelLength * braceT + recoilOffsetY - perpY;

            graphics.lineStyle(3, 0x3a3a4a, alpha);
            graphics.lineBetween(brace1X, brace1Y, brace2X, brace2Y);
            graphics.lineStyle(1, 0xb8860b, alpha * 0.8);
            graphics.lineBetween(brace1X, brace1Y, brace2X, brace2Y);

            if (sin < 0) drawPivot();
        }
    }

    static drawGoldMine(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, time: number = 0, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        const level = building?.level ?? 1;
        const isLevel2 = level >= 2;
        const isLevel3 = level >= 3;
        const isLevel4 = level >= 4;
        const isLevel5 = level >= 5;
        const g = baseGraphics || graphics;

        if (!skipBase) {
            // === ROCKY GROUND BASE ===
            const baseColor = isLevel5 ? 0x5a5a5a : (isLevel4 ? 0x8a7a6a : (isLevel3 ? 0x7d6d5d : (isLevel2 ? 0x7a6a5a : 0x6b5a4a)));
            g.fillStyle(tint ?? baseColor, alpha);
            g.fillPoints([c1, c2, c3, c4], true);
            const borderColor = isLevel5 ? 0x777777 : (isLevel3 ? 0x9b8365 : (isLevel2 ? 0x8b7355 : 0x4a3a2a));
            g.lineStyle(isLevel5 ? 3 : (isLevel3 ? 2 : (isLevel2 ? 2 : 1)), borderColor, 0.6 * alpha);
            g.strokePoints([c1, c2, c3, c4], true, true);

            // Level 2+: Gold-trimmed corners (L5 uses metal)
            if (isLevel2) {
                const cornerColor = isLevel5 ? 0x888888 : (isLevel4 ? 0xeecc00 : (isLevel3 ? 0xe0b000 : 0xdaa520));
                g.fillStyle(cornerColor, alpha * 0.8);
                g.fillCircle(c1.x, c1.y, isLevel5 ? 5 : (isLevel4 ? 4 : 3));
                g.fillCircle(c2.x, c2.y, isLevel5 ? 4 : (isLevel3 ? 3 : 2));
                g.fillCircle(c3.x, c3.y, isLevel5 ? 4 : (isLevel3 ? 3 : 2));
                g.fillCircle(c4.x, c4.y, isLevel5 ? 5 : (isLevel4 ? 4 : 2));
                // L5: Metal bolt highlights
                if (isLevel5) {
                    g.fillStyle(0xaaaaaa, alpha * 0.6);
                    g.fillCircle(c1.x, c1.y - 1, 2);
                    g.fillCircle(c3.x, c3.y - 1, 2);
                }
            }

            // L4+: Rim highlights (L5 uses steel)
            if (isLevel4) {
                g.lineStyle(1, isLevel5 ? 0x999999 : 0xcccccc, alpha * 0.5);
                g.lineBetween(c1.x, c1.y, c2.x, c2.y);
                g.lineBetween(c1.x, c1.y, c4.x, c4.y);
            }

            // Scattered rocks/dirt texture (reduced for L5 industrial)
            if (!isLevel5) {
                g.fillStyle(0x5a4a3a, alpha * 0.6);
                g.fillCircle(center.x - 15, center.y + 6, 5);
                g.fillCircle(center.x + 12, center.y + 4, 4);
                g.fillCircle(center.x - 8, center.y + 10, 3);
                g.fillStyle(0x7a6a5a, alpha * 0.4);
                g.fillCircle(center.x + 5, center.y + 8, 3);
            } else {
                // L5: Metal floor plates
                g.fillStyle(0x666666, alpha * 0.5);
                g.fillRect(center.x - 18, center.y + 3, 10, 6);
                g.fillRect(center.x + 8, center.y + 5, 10, 5);
            }
        }

        if (!onlyBase) {
            // === MINE SHAFT ENTRANCE (dark tunnel) ===
            // Entrance frame - wooden supports
            graphics.fillStyle(0x3a2a1a, alpha);
            graphics.fillRect(center.x - 12, center.y - 8, 4, 16);
            graphics.fillRect(center.x + 8, center.y - 8, 4, 16);

            // Entrance top beam
            graphics.fillStyle(0x4a3a2a, alpha);
            graphics.fillRect(center.x - 14, center.y - 12, 28, 5);
            graphics.fillStyle(0x5a4a3a, alpha);
            graphics.fillRect(center.x - 13, center.y - 11, 26, 2);

            // Dark tunnel interior
            graphics.fillStyle(0x1a1a1a, alpha);
            graphics.fillRect(center.x - 8, center.y - 6, 16, 14);
            graphics.fillStyle(0x0a0a0a, alpha);
            graphics.fillRect(center.x - 6, center.y - 4, 12, 10);

            // === MINE CART TRACKS ===
            g.lineStyle(2, 0x555555, alpha);
            g.lineBetween(center.x - 6, center.y + 8, center.x + 20, center.y + 2);
            g.lineBetween(center.x - 2, center.y + 10, center.x + 24, center.y + 4);

            // Track ties
            g.fillStyle(0x3a2a1a, alpha);
            for (let i = 0; i < 4; i++) {
                const tx = center.x - 4 + i * 7;
                const ty = center.y + 9 - i * 1.5;
                g.fillRect(tx, ty, 6, 2);
            }

            // === ANIMATED MINE CART ===
            const cartCycle = (time / 2000) % 1;
            const cartInTunnel = cartCycle < 0.3 || cartCycle > 0.8;

            if (!cartInTunnel) {
                const cartProgress = (cartCycle - 0.3) / 0.5; // 0 to 1 while visible
                const cartX = center.x - 4 + cartProgress * 16;
                const cartY = center.y + 6 - cartProgress * 3;

                // Cart body
                graphics.fillStyle(0x5a5a5a, alpha);
                graphics.fillRect(cartX - 6, cartY - 8, 12, 8);
                graphics.fillStyle(0x4a4a4a, alpha);
                graphics.fillRect(cartX - 5, cartY - 7, 10, 6);

                // Gold ore in cart
                graphics.fillStyle(0xffd700, alpha);
                graphics.fillCircle(cartX - 2, cartY - 6, 3);
                graphics.fillCircle(cartX + 2, cartY - 5, 2);
                graphics.fillCircle(cartX, cartY - 8, 2);

                // Cart wheels
                graphics.fillStyle(0x333333, alpha);
                graphics.fillCircle(cartX - 4, cartY, 2);
                graphics.fillCircle(cartX + 4, cartY, 2);
            }

            // === HEADFRAME TOWER ===
            // L5: Metal industrial tower, otherwise wooden
            const beamColor = isLevel5 ? 0x555555 : 0x4a3a2a;
            const beamColorLight = isLevel5 ? 0x666666 : 0x5a4a3a;
            const beamColorDark = isLevel5 ? 0x444444 : 0x4a3a2a;

            // Main support beams (A-frame)
            graphics.fillStyle(beamColor, alpha);
            graphics.fillRect(center.x - 20, center.y - 35, isLevel5 ? 5 : 4, 40);
            graphics.fillRect(center.x - 6, center.y - 35, isLevel5 ? 5 : 4, 40);

            // L5: Metal beam highlights
            if (isLevel5) {
                graphics.fillStyle(0x777777, alpha * 0.6);
                graphics.fillRect(center.x - 19, center.y - 35, 1, 40);
                graphics.fillRect(center.x - 5, center.y - 35, 1, 40);
            }

            // Cross beams
            graphics.fillStyle(beamColorLight, alpha);
            graphics.fillRect(center.x - 21, center.y - 30, 20, isLevel5 ? 4 : 3);
            graphics.fillRect(center.x - 21, center.y - 18, 20, isLevel5 ? 4 : 3);

            // Diagonal bracing
            graphics.lineStyle(isLevel5 ? 3 : 2, beamColorDark, alpha);
            graphics.lineBetween(center.x - 19, center.y - 28, center.x - 5, center.y - 16);
            graphics.lineBetween(center.x - 19, center.y - 16, center.x - 5, center.y - 28);

            // Pulley wheel at top (larger for L5)
            const pulleySize = isLevel5 ? 7 : 5;
            graphics.fillStyle(isLevel5 ? 0x666666 : 0x555555, alpha);
            graphics.fillCircle(center.x - 13, center.y - 38, pulleySize);
            graphics.fillStyle(isLevel5 ? 0x888888 : 0x666666, alpha);
            graphics.fillCircle(center.x - 13, center.y - 38, pulleySize - 2);

            // Animated wheel rotation
            const wheelAngle = time / (isLevel5 ? 300 : 400);  // Faster for L5
            graphics.lineStyle(isLevel5 ? 2 : 1, isLevel5 ? 0x555555 : 0x444444, alpha);
            for (let i = 0; i < 4; i++) {
                const a = wheelAngle + (i / 4) * Math.PI * 2;
                graphics.lineBetween(
                    center.x - 13 + Math.cos(a) * (pulleySize - 1),
                    center.y - 38 + Math.sin(a) * (pulleySize - 1),
                    center.x - 13 - Math.cos(a) * (pulleySize - 1),
                    center.y - 38 - Math.sin(a) * (pulleySize - 1)
                );
            }

            // L5: Secondary gear
            if (isLevel5) {
                graphics.fillStyle(0x666666, alpha);
                graphics.fillCircle(center.x - 5, center.y - 42, 4);
                graphics.fillStyle(0x888888, alpha * 0.7);
                graphics.fillCircle(center.x - 5, center.y - 42, 2);
                // Gear teeth hint
                graphics.lineStyle(1, 0x555555, alpha);
                for (let i = 0; i < 4; i++) {
                    const a = -wheelAngle * 1.5 + (i / 4) * Math.PI * 2;
                    graphics.lineBetween(
                        center.x - 5 + Math.cos(a) * 3,
                        center.y - 42 + Math.sin(a) * 3,
                        center.x - 5 - Math.cos(a) * 3,
                        center.y - 42 - Math.sin(a) * 3
                    );
                }
            }

            // Rope/chain from pulley
            graphics.lineStyle(isLevel5 ? 2 : 1, isLevel5 ? 0x555555 : 0x8b7355, alpha);
            graphics.lineBetween(center.x - 13, center.y - 33, center.x - 13, center.y - 5);

            // === GOLD ORE PILES ===
            const pileScale = isLevel5 ? 1.5 : (isLevel4 ? 1.3 : (isLevel3 ? 1.15 : (isLevel2 ? 1.0 : 0.85)));
            // Large pile
            graphics.fillStyle(isLevel5 ? 0xab9375 : (isLevel4 ? 0x9b8365 : 0x8b7355), alpha);
            graphics.fillCircle(center.x + 18, center.y - 2, 8 * pileScale);
            graphics.fillCircle(center.x + 22, center.y + 2, 6 * pileScale);

            // Level 2+: Extra gold pile
            if (isLevel2) {
                graphics.fillStyle(isLevel5 ? 0xbb9a85 : (isLevel3 ? 0xab9375 : 0x9b8365), alpha);
                graphics.fillCircle(center.x + 26, center.y - 1, 5 * pileScale);
            }

            // L3+: Third pile
            if (isLevel3) {
                graphics.fillStyle(0x9b8365, alpha);
                graphics.fillCircle(center.x + 14, center.y + 3, 4 * pileScale);
            }

            // Gold chunks in pile
            graphics.fillStyle(isLevel5 ? 0xffee00 : (isLevel4 ? 0xffe000 : 0xffd700), alpha);
            graphics.fillCircle(center.x + 16, center.y - 4, 3 * pileScale);
            graphics.fillCircle(center.x + 20, center.y - 1, 4 * pileScale);
            graphics.fillCircle(center.x + 24, center.y + 1, 2.5 * pileScale);
            graphics.fillCircle(center.x + 18, center.y, 2.5 * pileScale);

            // Level 2+: Extra gold chunks
            if (isLevel2) {
                graphics.fillCircle(center.x + 26, center.y - 2, 3);
                graphics.fillCircle(center.x + 14, center.y - 2, 2);
                graphics.fillCircle(center.x + 22, center.y - 3, 2);
            }

            // L4+: Refined gold bars (stacked) - more for L5
            if (isLevel4) {
                graphics.fillStyle(0xffd700, alpha);
                graphics.fillRect(center.x + 10, center.y + 4, isLevel5 ? 10 : 8, 3);
                graphics.fillStyle(0xffe855, alpha);
                graphics.fillRect(center.x + 11, center.y + 4, isLevel5 ? 8 : 6, 1);
                graphics.fillStyle(0xeec000, alpha);
                graphics.fillRect(center.x + 11, center.y + 2, 7, 2);
            }

            // Sparkling gold highlights (animated)
            const sparkle1 = 0.5 + Math.sin(time / 150) * 0.5;
            const sparkle2 = 0.5 + Math.sin(time / 180 + 1) * 0.5;
            const sparkle3 = 0.5 + Math.sin(time / 200 + 2) * 0.5;

            graphics.fillStyle(isLevel4 ? 0xffffaa : 0xffff88, alpha * sparkle1);
            graphics.fillCircle(center.x + 17, center.y - 5, 1.5 * pileScale);
            graphics.fillStyle(isLevel4 ? 0xffffaa : 0xffff88, alpha * sparkle2);
            graphics.fillCircle(center.x + 21, center.y - 2, 1.5 * pileScale);
            graphics.fillStyle(0xffffaa, alpha * sparkle3);
            graphics.fillCircle(center.x + 19, center.y - 3, 1 * pileScale);

            // Level 2+: Extra sparkles
            if (isLevel2) {
                const sparkle4 = 0.5 + Math.sin(time / 120 + 3) * 0.5;
                const sparkle5 = 0.5 + Math.sin(time / 160 + 4) * 0.5;
                graphics.fillStyle(0xffff66, alpha * sparkle4);
                graphics.fillCircle(center.x + 25, center.y - 1, 1.5);
                graphics.fillStyle(0xffffcc, alpha * sparkle5);
                graphics.fillCircle(center.x + 15, center.y - 3, 1);
            }

            // L3+: More sparkles
            if (isLevel3) {
                const sparkle6 = 0.5 + Math.sin(time / 100 + 5) * 0.5;
                graphics.fillStyle(0xffffdd, alpha * sparkle6);
                graphics.fillCircle(center.x + 13, center.y + 2, 1.2);
            }

            // === LANTERNS ===
            // Left lantern on post
            graphics.fillStyle(0x4a3a2a, alpha);
            graphics.fillRect(center.x - 24, center.y - 5, 2, 12);

            // Lantern glow (animated flicker)
            const flicker = 0.7 + Math.sin(time / 80) * 0.3;
            graphics.fillStyle(0xff8800, alpha * flicker);
            graphics.fillCircle(center.x - 23, center.y - 8, isLevel3 ? 4 : 3);
            graphics.fillStyle(0xffcc44, alpha * flicker * 0.8);
            graphics.fillCircle(center.x - 23, center.y - 9, isLevel3 ? 2.5 : 2);

            // Small gold coin/nugget detail near entrance
            graphics.fillStyle(0xffd700, alpha);
            graphics.fillCircle(center.x + 6, center.y + 5, isLevel3 ? 2.5 : 2);
            graphics.fillCircle(center.x + 3, center.y + 7, isLevel3 ? 2 : 1.5);
        }
    }

    static drawSolanaCollector(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, time: number = 0, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        const g = baseGraphics || graphics;
        const level = building?.level ?? 1;

        const isL2 = level >= 2;

        // Sequence: Move up, move down (slam), shake, move back up, pause
        const cycleLength = 8000;
        const cycleTime = time % cycleLength;
        let drillBobCurrent = 0;

        if (cycleTime < 1500) {
            const t = cycleTime / 1500;
            drillBobCurrent = -10 - 15 * t;
        } else if (cycleTime < 2000) {
            const t = (cycleTime - 1500) / 500;
            const bounce = Math.sin(t * Math.PI);
            drillBobCurrent = -25 + 25 * t + bounce * 2;
        } else if (cycleTime < 3000) {
            drillBobCurrent = 0 + Math.sin(time / 25) * 2;
        } else if (cycleTime < 4500) {
            const t = (cycleTime - 3000) / 1500;
            drillBobCurrent = 0 - 10 * t;
        } else {
            drillBobCurrent = -10 + Math.sin(time / 1200) * 1.5;
        }

        const drillBob = drillBobCurrent;
        const drillSpin = cycleTime < 3000 && cycleTime > 1500 ? time / 150 : time / 800;
        const rubbleSeed = time / 300;

        // Wood palette
        const woodDark = 0x3a2a1a;
        const woodMid = 0x5a4030;
        const woodLight = 0x6a5040;
        const woodHighlight = 0x7a6050;

        // Metal palette (used more in L2)
        const metalDark = 0x4a4a4a;
        const metalMid = 0x707070;
        const metalLight = 0x9d9d9d;
        const metalHighlight = 0xc0c0c0;

        // Solana accent
        const solGreen = 0x14f195;

        if (!skipBase) {
            // === FLAT GROUND ===
            // Ground surface — earthy brown
            g.fillStyle(tint ?? 0x5a4a38, alpha);
            g.fillPoints([c1, c2, c3, c4], true);

            // Dirt patches
            g.fillStyle(0x4a3a28, alpha * 0.7);
            g.fillCircle(center.x - 18, center.y + 6, 7);
            g.fillCircle(center.x + 20, center.y + 3, 6);
            g.fillCircle(center.x + 5, center.y + 14, 5);
            g.fillCircle(center.x - 8, center.y - 4, 5);

            // Border
            g.lineStyle(2, 0x3a2a1a, alpha * 0.6);
            g.strokePoints([c1, c2, c3, c4], true, true);

            // === JAGGED ROCKS in the center ===
            // L2 rocks are darker and denser
            const rockDark = isL2 ? 0x2a2a2a : 0x4a4a4a;
            const rockMid = isL2 ? 0x3a3a3a : 0x5a5a5a;
            const rockLight = isL2 ? 0x4a4a4a : 0x6a6a6a;

            // Large base rocks
            g.fillStyle(rockDark, alpha);
            g.fillCircle(center.x - 8, center.y + 1, 9);
            g.fillCircle(center.x + 7, center.y - 1, 8);
            g.fillCircle(center.x, center.y + 6, 7);
            g.fillCircle(center.x - 4, center.y - 5, 6);
            g.fillCircle(center.x + 10, center.y + 5, 6);
            // Extra rocks for density
            g.fillCircle(center.x - 14, center.y - 2, 6);
            g.fillCircle(center.x + 14, center.y - 3, 5);
            g.fillCircle(center.x + 5, center.y - 7, 5);
            g.fillCircle(center.x - 6, center.y + 8, 5);

            // Medium rocks
            g.fillStyle(rockMid, alpha);
            g.fillCircle(center.x - 12, center.y + 4, 5);
            g.fillCircle(center.x + 13, center.y + 2, 5);
            g.fillCircle(center.x + 3, center.y - 4, 5);
            g.fillCircle(center.x - 16, center.y + 1, 4);
            g.fillCircle(center.x + 16, center.y + 1, 4);
            g.fillCircle(center.x - 2, center.y - 8, 4);

            // Rock highlights (lighter tops)
            g.fillStyle(rockLight, alpha * 0.7);
            g.fillCircle(center.x - 8, center.y - 1, 4);
            g.fillCircle(center.x + 7, center.y - 3, 4);
            g.fillCircle(center.x - 1, center.y + 3, 3);
            g.fillCircle(center.x - 14, center.y - 4, 3);
            g.fillCircle(center.x + 13, center.y - 1, 3);

            // Jagged sharp edges (small triangular shapes via tiny circles)
            g.fillStyle(isL2 ? 0x353535 : 0x555555, alpha * 0.9);
            g.fillCircle(center.x - 10, center.y - 4, 2);
            g.fillCircle(center.x + 11, center.y - 3, 2);
            g.fillCircle(center.x - 5, center.y + 9, 2);
            g.fillCircle(center.x + 7, center.y + 7, 2);
            g.fillCircle(center.x - 17, center.y + 3, 2);
            g.fillCircle(center.x + 17, center.y + 3, 2);

            // Dark crevices between rocks
            g.fillStyle(0x1a1a1a, alpha * 0.8);
            g.fillCircle(center.x, center.y + 1, 3);
            g.fillCircle(center.x - 4, center.y + 3, 2);
            g.fillCircle(center.x + 4, center.y - 1, 2);
            g.fillCircle(center.x - 10, center.y + 2, 2);
            g.fillCircle(center.x + 11, center.y + 3, 2);

            // L2: Tiny bright Solana-colored dots in the rocks
            if (isL2) {
                const gPulse = 0.5 + Math.sin(time / 800) * 0.3;
                g.fillStyle(solGreen, alpha * gPulse * 0.8);
                g.fillCircle(center.x - 6, center.y, 1.5);
                g.fillCircle(center.x + 9, center.y - 2, 1);
                g.fillCircle(center.x + 2, center.y + 5, 1);
            }
        }

        if (!onlyBase) {
            // === A-FRAME (wood for L1, wood+metal for L2) ===
            const legColor = isL2 ? metalDark : woodDark;
            const legHighlight = isL2 ? metalLight : woodHighlight;

            // Left leg
            graphics.fillStyle(legColor, alpha);
            graphics.fillRect(center.x - 26, center.y - 50, 5, 54);
            graphics.fillStyle(legHighlight, alpha * 0.4);
            graphics.fillRect(center.x - 25, center.y - 50, 2, 54);

            // Right leg
            graphics.fillStyle(legColor, alpha);
            graphics.fillRect(center.x + 21, center.y - 50, 5, 54);
            graphics.fillStyle(legHighlight, alpha * 0.4);
            graphics.fillRect(center.x + 22, center.y - 50, 2, 54);

            // L2: Metal reinforcement bands on legs
            if (isL2) {
                graphics.fillStyle(metalHighlight, alpha * 0.5);
                graphics.fillRect(center.x - 26, center.y - 42, 5, 2);
                graphics.fillRect(center.x - 26, center.y - 20, 5, 2);
                graphics.fillRect(center.x + 21, center.y - 42, 5, 2);
                graphics.fillRect(center.x + 21, center.y - 20, 5, 2);
            }

            // Top crossbeam
            const beamColor = isL2 ? metalMid : woodMid;
            const beamHighlight = isL2 ? metalLight : woodLight;
            graphics.fillStyle(beamColor, alpha);
            graphics.fillRect(center.x - 26, center.y - 54, 52, 6);
            graphics.fillStyle(beamHighlight, alpha * 0.6);
            graphics.fillRect(center.x - 24, center.y - 53, 48, 2);

            // Mid crossbeam
            graphics.fillStyle(beamColor, alpha);
            graphics.fillRect(center.x - 24, center.y - 30, 48, 4);

            // L2: Rivets on crossbeams
            if (isL2) {
                graphics.fillStyle(metalHighlight, alpha * 0.7);
                graphics.fillCircle(center.x - 22, center.y - 51, 1.5);
                graphics.fillCircle(center.x + 22, center.y - 51, 1.5);
                graphics.fillCircle(center.x - 20, center.y - 28, 1.5);
                graphics.fillCircle(center.x + 20, center.y - 28, 1.5);
            }

            // === ROPE (L1) or CHAIN (L2) from top beam ===
            if (isL2) {
                // Chain — alternating links
                const chainTop = center.y - 48;
                const chainBot = center.y - 22 + drillBob;
                const chainLen = chainBot - chainTop;
                const linkCount = Math.max(4, Math.floor(chainLen / 4));
                for (let i = 0; i < linkCount; i++) {
                    const ly = chainTop + (i / linkCount) * chainLen;
                    const lx = center.x + (i % 2 === 0 ? -1 : 1);
                    graphics.fillStyle(metalLight, alpha * 0.8);
                    graphics.fillRect(lx - 1, ly, 3, 3);
                }
            } else {
                graphics.lineStyle(2, 0x8b7355, alpha * 0.8);
                graphics.lineBetween(center.x, center.y - 48, center.x, center.y - 22 + drillBob);
            }

            // === DRILL ASSEMBLY — hangs from rope/chain ===
            const drillAnchorY = center.y - 20 + drillBob;

            // Housing block (wood L1, metal L2)
            graphics.fillStyle(isL2 ? metalMid : woodMid, alpha);
            graphics.fillRect(center.x - 10, drillAnchorY - 6, 20, 10);
            graphics.fillStyle(isL2 ? metalLight : woodLight, alpha * 0.5);
            graphics.fillRect(center.x - 8, drillAnchorY - 5, 16, 3);

            // Iron band around housing
            graphics.fillStyle(isL2 ? metalHighlight : 0x555555, alpha);
            graphics.fillRect(center.x - 11, drillAnchorY - 1, 22, 2);

            // === DRILL BIT — tapered post ===
            const bitTopY = drillAnchorY + 4;
            const bitW = 10;
            const bitLen = 22;

            // Main shaft (tapered)
            graphics.fillStyle(metalMid, alpha);
            graphics.beginPath();
            graphics.moveTo(center.x - bitW, bitTopY);
            graphics.lineTo(center.x + bitW, bitTopY);
            graphics.lineTo(center.x + 3, bitTopY + bitLen);
            graphics.lineTo(center.x - 3, bitTopY + bitLen);
            graphics.closePath();
            graphics.fillPath();

            // Light highlight
            graphics.fillStyle(metalLight, alpha * 0.6);
            graphics.beginPath();
            graphics.moveTo(center.x - bitW + 2, bitTopY);
            graphics.lineTo(center.x - bitW + 5, bitTopY);
            graphics.lineTo(center.x - 1, bitTopY + bitLen);
            graphics.lineTo(center.x - 2, bitTopY + bitLen);
            graphics.closePath();
            graphics.fillPath();

            // Spiral groove marks (slow spin)
            graphics.lineStyle(2, metalDark, alpha * 0.8);
            for (let i = 0; i < 4; i++) {
                const gt = (i / 4 + (drillSpin % 1) * 0.25) % 1;
                const gy = bitTopY + gt * bitLen;
                const wAtY = bitW * (1 - gt * 0.7);
                const ox = Math.sin(drillSpin * 2 + i * 1.8) * wAtY * 0.35;
                graphics.lineBetween(
                    center.x - wAtY + ox, gy,
                    center.x + wAtY + ox, gy
                );
            }

            // Hardened tip
            graphics.fillStyle(isL2 ? 0x222222 : 0x333333, alpha);
            graphics.beginPath();
            graphics.moveTo(center.x - 4, bitTopY + bitLen - 2);
            graphics.lineTo(center.x + 4, bitTopY + bitLen - 2);
            graphics.lineTo(center.x, bitTopY + bitLen + 6);
            graphics.closePath();
            graphics.fillPath();

            // Tip highlight
            graphics.fillStyle(metalHighlight, alpha * 0.8);
            graphics.beginPath();
            graphics.moveTo(center.x - 1, bitTopY + bitLen);
            graphics.lineTo(center.x + 1, bitTopY + bitLen);
            graphics.lineTo(center.x, bitTopY + bitLen + 4);
            graphics.closePath();
            graphics.fillPath();

            // === FRONT ROCKS — drawn over the drill to hide the bottom ===
            const fRockDark = isL2 ? 0x2a2a2a : 0x4a4a4a;
            const fRockMid = isL2 ? 0x3a3a3a : 0x5a5a5a;
            const fRockLight = isL2 ? 0x4a4a4a : 0x6a6a6a;

            graphics.fillStyle(fRockDark, alpha);
            graphics.fillCircle(center.x - 10, center.y + 5, 8);
            graphics.fillCircle(center.x + 9, center.y + 4, 7);
            graphics.fillCircle(center.x, center.y + 8, 6);
            graphics.fillCircle(center.x - 15, center.y + 3, 5);
            graphics.fillCircle(center.x + 14, center.y + 3, 5);

            // Rock highlights on front rocks
            graphics.fillStyle(fRockMid, alpha);
            graphics.fillCircle(center.x - 10, center.y + 3, 5);
            graphics.fillCircle(center.x + 9, center.y + 2, 4);
            graphics.fillCircle(center.x - 14, center.y + 1, 3);

            graphics.fillStyle(fRockLight, alpha * 0.6);
            graphics.fillCircle(center.x - 9, center.y + 1, 3);
            graphics.fillCircle(center.x + 8, center.y + 1, 3);

            // L2: Tiny bright Solana dots on front rocks
            if (isL2) {
                const gPulse = 0.5 + Math.sin(time / 800) * 0.3;
                graphics.fillStyle(solGreen, alpha * gPulse * 0.8);
                graphics.fillCircle(center.x - 8, center.y + 4, 1);
                graphics.fillCircle(center.x + 7, center.y + 3, 1);
            }

            // === RUBBLE flying up — only while actively drilling ===
            const isDrilling = cycleTime >= 1500 && cycleTime < 3000;
            if (isDrilling) {
                const rubbleColors = [0x6b5a4a, 0x5a4a3a, 0x7a6a5a, 0x4a4a4a, 0x5a5a5a, 0x6b5a4a];
                for (let i = 0; i < 6; i++) {
                    const seed = rubbleSeed + i * 41.3;
                    const life = (seed * 0.5 + i * 0.17) % 1;
                    const rx = center.x + Math.sin(seed * 2.7 + i * 1.9) * (10 + i * 3);
                    const ry = center.y + 2 - life * 35;
                    const ra = life < 0.15 ? life / 0.15 : (life > 0.6 ? (1 - life) / 0.4 : 1);
                    const rs = 1.5 + Math.sin(i * 2.1) * 1;

                    graphics.fillStyle(rubbleColors[i % rubbleColors.length], alpha * ra * 0.7);
                    graphics.fillCircle(rx, ry, rs);
                }
            }

            // === SOLANA GREEN ACCENT — small lantern on left leg ===
            const flicker = 0.6 + Math.sin(time / 400) * 0.4;
            graphics.fillStyle(solGreen, alpha * flicker * 0.6);
            graphics.fillCircle(center.x - 23, center.y - 40, 3);
            graphics.fillStyle(solGreen, alpha * flicker * 0.2);
            graphics.fillCircle(center.x - 23, center.y - 40, 6);
        }
    }

    static drawElixirCollector(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, time: number = 0, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        // Purple/pink theme for elixir
        const level = building?.level ?? 1;
        const isLevel2 = level >= 2;
        const isLevel3 = level >= 3;
        const isLevel4 = level >= 4;
        const isLevel5 = level >= 5;
        const g = baseGraphics || graphics;

        const purpleDark = tint ?? (isLevel5 ? 0x9c64b3 : (isLevel4 ? 0x8c54a3 : (isLevel3 ? 0x7c4493 : (isLevel2 ? 0x7c4493 : 0x6c3483))));
        const purpleMid = tint ?? (isLevel5 ? 0xbe74dd : (isLevel4 ? 0xae64cd : (isLevel3 ? 0x9e54bd : (isLevel2 ? 0x9e54bd : 0x8e44ad))));
        const purpleLight = tint ?? (isLevel5 ? 0xd599ed : (isLevel4 ? 0xc589dd : (isLevel3 ? 0xb579cd : (isLevel2 ? 0xb579cd : 0xa569bd))));

        // Stone base (enhanced for higher levels)
        if (!skipBase) {
            const baseColor = isLevel4 ? 0x7a7a7a : (isLevel3 ? 0x6f6f6f : (isLevel2 ? 0x6a6a6a : 0x5a5a5a));
            g.fillStyle(baseColor, alpha);
            g.fillPoints([c1, c2, c3, c4], true);
            g.lineStyle(isLevel3 ? 2 : (isLevel2 ? 2 : 1), isLevel3 ? 0xbb8fce : (isLevel2 ? 0x9b59b6 : 0x3a3a3a), 0.5 * alpha);
            g.strokePoints([c1, c2, c3, c4], true, true);

            // Level 2+: Purple-trimmed corners
            if (isLevel2) {
                const cornerColor = isLevel4 ? 0xd7bde2 : (isLevel3 ? 0xc9a8d8 : 0xbb8fce);
                g.fillStyle(cornerColor, alpha * 0.8);
                g.fillCircle(c1.x, c1.y, isLevel4 ? 4 : 3);
                g.fillCircle(c2.x, c2.y, isLevel3 ? 3 : 2);
                g.fillCircle(c3.x, c3.y, isLevel3 ? 3 : 2);
                g.fillCircle(c4.x, c4.y, isLevel4 ? 4 : 2);
            }

            // L4: Crystal purple rim highlights
            if (isLevel4) {
                g.lineStyle(1, 0xe8daef, alpha * 0.5);
                g.lineBetween(c1.x, c1.y, c2.x, c2.y);
                g.lineBetween(c1.x, c1.y, c4.x, c4.y);
            }

        }

        if (!onlyBase) {
            // Elixir tank (glass container) - larger for higher levels
            const tankScale = isLevel4 ? 1.2 : (isLevel3 ? 1.1 : 1.0);
            const tankHeight = (isLevel2 ? 34 : 30) * tankScale;
            const tankWidth = (isLevel2 ? 20 : 18) * tankScale;

            // Tank back (darker)
            graphics.fillStyle(purpleDark, alpha * 0.8);
            graphics.fillEllipse(center.x, center.y - 5, tankWidth, tankWidth * 0.5);

            // Tank body (glass effect)
            graphics.fillStyle(purpleMid, alpha * 0.7);
            graphics.fillRect(center.x - tankWidth / 2, center.y - 5 - tankHeight, tankWidth, tankHeight);

            // Tank shine (glass reflection)
            const shineAlpha = isLevel4 ? 0.3 : (isLevel3 ? 0.28 : (isLevel2 ? 0.25 : 0.2));
            graphics.fillStyle(0xffffff, shineAlpha * alpha);
            graphics.fillRect(center.x - tankWidth / 2 + 3, center.y - 5 - tankHeight + 3, isLevel3 ? 6 : (isLevel2 ? 5 : 4), tankHeight - 6);

            // Level 2+: Secondary shine
            if (isLevel2) {
                graphics.fillStyle(0xffffff, (isLevel3 ? 0.18 : 0.15) * alpha);
                graphics.fillRect(center.x + tankWidth / 2 - 6, center.y - 5 - tankHeight + 5, isLevel3 ? 3 : 2, tankHeight - 10);
            }

            // Tank top cap
            graphics.fillStyle(purpleLight, alpha);
            graphics.fillEllipse(center.x, center.y - 5 - tankHeight, tankWidth, tankWidth * 0.5);

            // Level 2+: Glowing rim
            if (isLevel2) {
                graphics.lineStyle(isLevel4 ? 3 : 2, isLevel4 ? 0xe8daef : 0xd7bde2, alpha * (isLevel3 ? 0.7 : 0.6));
                graphics.strokeEllipse(center.x, center.y - 5 - tankHeight, tankWidth - 2, (tankWidth - 2) * 0.5);
            }

            // Pump mechanism on top
            const pumpOffset = Math.sin(time / 300) * (isLevel3 ? 5 : (isLevel2 ? 4 : 3));

            // Pump base (reinforced for higher levels)
            graphics.fillStyle(isLevel3 ? 0x6a6a6a : (isLevel2 ? 0x5a5a5a : 0x4a4a4a), alpha);
            graphics.fillRect(center.x - 4, center.y - tankHeight - 20, 8, 10);

            // L2+: Metal bands on pump
            if (isLevel2 && !isLevel5) {
                graphics.fillStyle(isLevel4 ? 0xbb8fce : 0x9b59b6, alpha * 0.7);
                graphics.fillRect(center.x - 5, center.y - tankHeight - 20, 10, 2);
                graphics.fillRect(center.x - 5, center.y - tankHeight - 12, 10, 2);
            }

            // Pump piston (animated up/down) - L1-L4 only
            if (!isLevel5) {
                graphics.fillStyle(isLevel3 ? 0x888888 : (isLevel2 ? 0x777777 : 0x666666), alpha);
                graphics.fillRect(center.x - 2, center.y - tankHeight - 25 + pumpOffset, 4, 8);

                // Pump handle
                graphics.lineStyle(2, isLevel3 ? 0x777777 : (isLevel2 ? 0x666666 : 0x555555), alpha);
                graphics.lineBetween(center.x, center.y - tankHeight - 25 + pumpOffset, center.x + 10, center.y - tankHeight - 20 + pumpOffset * 0.5);
            } else {
                // === L5: INDUSTRIAL DEEP EXTRACTION ===
                // One big central pipe going into the ground with pump on top

                // Big extraction pipe (main feature)
                const pipeWidth = 14;

                // Pipe shadow/depth
                graphics.fillStyle(0x444444, alpha);
                graphics.fillRect(center.x - pipeWidth / 2 - 1, center.y - 5, pipeWidth + 2, 18);

                // Main pipe body
                graphics.fillStyle(0x666666, alpha);
                graphics.fillRect(center.x - pipeWidth / 2, center.y - 5, pipeWidth, 15);

                // Pipe highlight (left edge)
                graphics.fillStyle(0x888888, alpha * 0.7);
                graphics.fillRect(center.x - pipeWidth / 2 + 1, center.y - 4, 2, 13);

                // Pipe opening (dark hole going down)
                graphics.fillStyle(0x222222, alpha);
                graphics.fillEllipse(center.x, center.y + 8, pipeWidth - 2, 5);

                // Pipe rim (top edge)
                graphics.fillStyle(0x777777, alpha);
                graphics.fillEllipse(center.x, center.y - 5, pipeWidth, 5);
                graphics.fillStyle(0x555555, alpha);
                graphics.fillEllipse(center.x, center.y - 5, pipeWidth - 4, 3);

                // Connection pipe from tank to main pipe
                graphics.fillStyle(0x666666, alpha);
                graphics.fillRect(center.x - 3, center.y - tankHeight - 5, 6, tankHeight);
                graphics.fillStyle(0x888888, alpha * 0.5);
                graphics.fillRect(center.x - 2, center.y - tankHeight - 5, 1, tankHeight);

                // Elixir flow inside connection pipe (animated) - only render within pipe bounds
                const flowOffset = (time / 200) % 1;
                const pipeTop = center.y - tankHeight - 5;
                const pipeBottom = center.y - 5;
                for (let i = 0; i < 3; i++) {
                    const flowY = pipeTop + ((flowOffset + i * 0.33) % 1) * tankHeight;
                    // Only draw if within pipe bounds
                    if (flowY >= pipeTop && flowY <= pipeBottom - 8) {
                        graphics.fillStyle(purpleMid, alpha * 0.8);
                        graphics.fillRect(center.x - 1, flowY, 2, 8);
                    }
                }

                // Industrial pump mechanism on top of tank
                // Pump housing
                graphics.fillStyle(0x555555, alpha);
                graphics.fillRect(center.x - 8, center.y - tankHeight - 18, 16, 14);
                graphics.fillStyle(0x666666, alpha);
                graphics.fillRect(center.x - 7, center.y - tankHeight - 17, 14, 12);

                // Pump highlight
                graphics.fillStyle(0x777777, alpha * 0.6);
                graphics.fillRect(center.x - 6, center.y - tankHeight - 16, 2, 10);

                // Animated pump piston
                graphics.fillStyle(0x888888, alpha);
                graphics.fillRect(center.x - 2, center.y - tankHeight - 25 + pumpOffset, 4, 10);

                // Pump top cap
                graphics.fillStyle(0x666666, alpha);
                graphics.fillEllipse(center.x, center.y - tankHeight - 25 + pumpOffset, 6, 2);

                // Purple glow from pipe (elixir being extracted)
                const glowPulse = 0.4 + Math.sin(time * 3) * 0.2;
                graphics.fillStyle(purpleLight, alpha * glowPulse);
                graphics.fillEllipse(center.x, center.y + 6, pipeWidth + 4, 8);
            }

            // Elixir bubbles (animated)
            const bubbleTime = time / 200;
            const bubbleCount = isLevel4 ? 7 : (isLevel3 ? 6 : (isLevel2 ? 5 : 3));
            for (let i = 0; i < bubbleCount; i++) {
                const bubbleY = ((bubbleTime + i * (isLevel3 ? 0.25 : (isLevel2 ? 0.35 : 0.5))) % 1) * tankHeight;
                const bubbleX = Math.sin(bubbleTime * 2 + i) * (isLevel3 ? 6 : (isLevel2 ? 5 : 4));
                graphics.fillStyle(isLevel4 ? 0xe8daef : 0xd7bde2, (isLevel3 ? 0.8 : (isLevel2 ? 0.7 : 0.6)) * alpha);
                graphics.fillCircle(center.x + bubbleX, center.y - 5 - bubbleY, isLevel3 ? 3 : (isLevel2 ? 2.5 : 2));
            }

            // Level 2+: Glowing elixir particles
            if (isLevel2) {
                const glowTime = time / 150;
                const particleCount = isLevel4 ? 5 : (isLevel3 ? 4 : 3);
                for (let i = 0; i < particleCount; i++) {
                    const glow = 0.3 + Math.sin(glowTime + i * 2) * 0.3;
                    const px = center.x + Math.sin(glowTime * 0.5 + i * 2.5) * 6;
                    const py = center.y - 5 - tankHeight * 0.5 + Math.cos(glowTime * 0.3 + i) * 8;
                    graphics.fillStyle(isLevel4 ? 0xf0e8f5 : 0xe8daef, alpha * glow);
                    graphics.fillCircle(px, py, isLevel4 ? 2 : 1.5);
                }
            }

            // L4: Magical sparkle effect near top
            if (isLevel4) {
                const sparkleTime = time / 100;
                for (let i = 0; i < 3; i++) {
                    const sparkle = 0.4 + Math.sin(sparkleTime + i * 1.5) * 0.4;
                    const sx = center.x + Math.cos(sparkleTime * 0.8 + i * 2) * 8;
                    const sy = center.y - 5 - tankHeight + 5 + Math.sin(sparkleTime * 0.5 + i) * 5;
                    graphics.fillStyle(0xffffff, alpha * sparkle * 0.6);
                    graphics.fillCircle(sx, sy, 1);
                }
            }

            // Wooden supports (reinforced for higher levels)
            graphics.fillStyle(isLevel3 ? 0x7d6e57 : (isLevel2 ? 0x6d5e47 : 0x5d4e37), alpha);
            graphics.fillRect(center.x - tankWidth / 2 - 3, center.y - 5, isLevel3 ? 5 : (isLevel2 ? 4 : 3), 8);
            graphics.fillRect(center.x + tankWidth / 2 - (isLevel3 ? 2 : (isLevel2 ? 1 : 0)), center.y - 5, isLevel3 ? 5 : (isLevel2 ? 4 : 3), 8);

            // Level 2+: Metal reinforcement bands on supports
            if (isLevel2) {
                graphics.fillStyle(isLevel4 ? 0xbb8fce : 0x9b59b6, alpha * (isLevel3 ? 0.7 : 0.6));
                graphics.fillRect(center.x - tankWidth / 2 - 3, center.y - 3, isLevel3 ? 5 : 4, 2);
                graphics.fillRect(center.x + tankWidth / 2 - (isLevel3 ? 2 : 1), center.y - 3, isLevel3 ? 5 : 4, 2);
            }

            // L4: Extra elixir pipe on side
            if (isLevel4) {
                graphics.fillStyle(0x9b59b6, alpha * 0.8);
                graphics.fillRect(center.x + tankWidth / 2 + 2, center.y - tankHeight * 0.6, 3, 15);
                graphics.fillStyle(0xbb8fce, alpha * 0.5);
                graphics.fillRect(center.x + tankWidth / 2 + 3, center.y - tankHeight * 0.6 + 2, 1, 11);
            }
        }
    }

    static drawBallista(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        // Get ballista state from building if provided
        const angle = building?.ballistaAngle ?? 0; // Default facing right
        const stringTension = building?.ballistaStringTension ?? 0; // 0 = relaxed, 1 = fully drawn
        const boltLoaded = building?.ballistaBoltLoaded ?? true;
        const g = baseGraphics || graphics;

        if (!skipBase) {
            // === STONE FOUNDATION PLATFORM ===
            // Raised stone base with depth
            const baseHeight = 6;

            // Side faces of the platform (isometric 3D effect)
            graphics.fillStyle(0x4a4a4a, alpha);
            graphics.beginPath();
            graphics.moveTo(c2.x, c2.y);
            graphics.lineTo(c3.x, c3.y);
            graphics.lineTo(c3.x, c3.y + baseHeight);
            graphics.lineTo(c2.x, c2.y + baseHeight);
            graphics.closePath();
            graphics.fillPath();

            graphics.fillStyle(0x3a3a3a, alpha);
            graphics.beginPath();
            graphics.moveTo(c3.x, c3.y);
            graphics.lineTo(c4.x, c4.y);
            graphics.lineTo(c4.x, c4.y + baseHeight);
            graphics.lineTo(c3.x, c3.y + baseHeight);
            graphics.closePath();
            graphics.fillPath();

            // Top face
            g.fillStyle(tint ?? 0x5a5a5a, alpha);
            g.fillPoints([c1, c2, c3, c4], true);

            // Stone block lines
            g.lineStyle(1, 0x4a4a4a, alpha * 0.5);
            g.lineBetween(c1.x, c1.y, c3.x, c3.y);
            g.lineBetween(c2.x, c2.y, c4.x, c4.y);

            // Border
            g.lineStyle(2, 0x3a3a3a, 0.6 * alpha);
            g.strokePoints([c1, c2, c3, c4], true, true);

        }

        if (!onlyBase) {
            // === WOODEN ROTATING PLATFORM ===
            const baseRadiusX = 22;
            const baseRadiusY = 13;
            const baseY = center.y - 4;

            // Shadow under platform
            g.fillStyle(0x1a1a1a, alpha * 0.4);
            g.fillEllipse(center.x + 2, baseY + 4, baseRadiusX, baseRadiusY);

            // Main wooden platform
            graphics.fillStyle(0x5a4030, alpha);
            graphics.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

            // Wood plank lines (radial pattern)
            graphics.lineStyle(1, 0x3a2515, alpha * 0.5);
            for (let i = 0; i < 6; i++) {
                const ang = (i / 6) * Math.PI;
                const x1 = center.x + Math.cos(ang) * (baseRadiusX - 2);
                const y1 = baseY + Math.sin(ang) * (baseRadiusY - 1);
                const x2 = center.x - Math.cos(ang) * (baseRadiusX - 2);
                const y2 = baseY - Math.sin(ang) * (baseRadiusY - 1);
                graphics.lineBetween(x1, y1, x2, y2);
            }

            // Iron outer ring
            graphics.lineStyle(3, 0x4a4a4a, alpha);
            graphics.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
            graphics.lineStyle(1, 0x606060, alpha * 0.6);
            graphics.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);

            // Iron rivets around edge
            graphics.fillStyle(0x555555, alpha);
            for (let i = 0; i < 8; i++) {
                const ang = (i / 8) * Math.PI * 2;
                const rx = center.x + Math.cos(ang) * (baseRadiusX - 3);
                const ry = baseY + Math.sin(ang) * (baseRadiusY - 2);
                graphics.fillCircle(rx, ry, 2);
            }

            // Calculate rotation for the crossbow mechanism
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            // === CENTRAL PIVOT MECHANISM ===
            // Heavy dark grey pivot hub on the wooden platform
            graphics.fillStyle(0x2a2a2a, alpha);
            graphics.fillCircle(center.x, baseY, 8);
            graphics.fillStyle(0x3a3a3a, alpha);
            graphics.fillCircle(center.x, baseY - 1, 6);
            graphics.fillStyle(0x444444, alpha);
            graphics.fillCircle(center.x, baseY - 2, 4);
            // Highlight
            graphics.fillStyle(0x606060, alpha * 0.6);
            graphics.fillCircle(center.x - 1, baseY - 3, 2);

            // === MASSIVE CROSSBOW ARMS ===
            const armLength = 28; // Much bigger arms
            const armWidth = 5;   // Thicker arms
            const bowHeight = -16; // Higher mounting point

            // Arm tip positions (perpendicular to firing direction)
            const leftArmX = center.x + (-sin) * armLength;
            const leftArmY = center.y + bowHeight + (cos * 0.5) * armLength;
            const rightArmX = center.x + (sin) * armLength;
            const rightArmY = center.y + bowHeight + (-cos * 0.5) * armLength;

            // Draw curved bow arms with multiple layers for depth
            // Outer shadow
            graphics.lineStyle(armWidth + 3, 0x2a1a10, alpha);
            graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
            graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

            // Main wooden arm
            graphics.lineStyle(armWidth + 1, 0x5a3520, alpha);
            graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
            graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

            // Wood highlight
            graphics.lineStyle(armWidth - 1, 0x7a5540, alpha);
            graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
            graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

            // Center wood grain
            graphics.lineStyle(2, 0x6a4530, alpha);
            graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
            graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

            // Metal reinforcement bands on arms
            const bandDist1 = 0.3;
            const bandDist2 = 0.6;
            const bandDist3 = 0.85;

            for (const dist of [bandDist1, bandDist2, bandDist3]) {
                const leftBandX = center.x + (-sin) * armLength * dist;
                const leftBandY = center.y + bowHeight + (cos * 0.5) * armLength * dist;
                const rightBandX = center.x + (sin) * armLength * dist;
                const rightBandY = center.y + bowHeight + (-cos * 0.5) * armLength * dist;

                graphics.fillStyle(0x555555, alpha);
                graphics.fillCircle(leftBandX, leftBandY, 3);
                graphics.fillCircle(rightBandX, rightBandY, 3);
                graphics.fillStyle(0x777777, alpha * 0.5);
                graphics.fillCircle(leftBandX - 0.5, leftBandY - 0.5, 1.5);
                graphics.fillCircle(rightBandX - 0.5, rightBandY - 0.5, 1.5);
            }

            // Large metal arm tips with hooks for string
            graphics.fillStyle(0x3a3a3a, alpha);
            graphics.fillCircle(leftArmX, leftArmY, 5);
            graphics.fillCircle(rightArmX, rightArmY, 5);
            graphics.fillStyle(0x555555, alpha);
            graphics.fillCircle(leftArmX, leftArmY, 3);
            graphics.fillCircle(rightArmX, rightArmY, 3);
            graphics.fillStyle(0x888888, alpha * 0.5);
            graphics.fillCircle(leftArmX - 1, leftArmY - 1, 1.5);
            graphics.fillCircle(rightArmX - 1, rightArmY - 1, 1.5);

            // Calculate bowstring position (needed for bolt placement)
            const stringPullback = stringTension * 16;
            const stringCenterX = center.x + cos * (-stringPullback);
            const stringCenterY = center.y + bowHeight + sin * 0.5 * (-stringPullback);

            // === MAIN RAIL/STOCK ===
            const railLength = 28;
            const railEndX = center.x + cos * railLength;
            const railEndY = center.y + bowHeight + sin * 0.5 * railLength;
            const railBackX = center.x + cos * (-12);
            const railBackY = center.y + bowHeight + sin * 0.5 * (-12);

            // Draw thick wooden rail
            graphics.lineStyle(10, 0x2a1a10, alpha);
            graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);
            graphics.lineStyle(8, 0x3a2515, alpha);
            graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);
            graphics.lineStyle(5, 0x4a3520, alpha);
            graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);

            // Rail groove for bolt
            graphics.lineStyle(2, 0x2a1a10, alpha * 0.7);
            graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);

            // Metal reinforcement plates on rail
            const plateDist = 0.4;
            const plateX = center.x + cos * railLength * plateDist;
            const plateY = center.y + bowHeight + sin * 0.5 * railLength * plateDist;
            graphics.fillStyle(0x444444, alpha);
            graphics.fillRect(plateX - 4, plateY - 2, 8, 4);
            graphics.fillStyle(0x666666, alpha * 0.5);
            graphics.fillRect(plateX - 3, plateY - 1, 6, 2);

            // === BOLT ===
            if (boltLoaded) {
                const boltLength = 24;
                const boltStartX = stringCenterX;
                const boltStartY = stringCenterY;
                const boltEndX = boltStartX + cos * boltLength;
                const boltEndY = boltStartY + sin * 0.5 * boltLength;

                // Narrower bolt shaft
                graphics.lineStyle(3, 0x4a3a25, alpha);
                graphics.lineBetween(boltStartX, boltStartY, boltEndX, boltEndY);
                graphics.lineStyle(2, 0x5d4e37, alpha);
                graphics.lineBetween(boltStartX, boltStartY, boltEndX, boltEndY);
                graphics.lineStyle(1, 0x7d6e57, alpha);
                graphics.lineBetween(boltStartX, boltStartY, boltEndX, boltEndY);

                // Arrowhead (smaller)
                const headLength = 8;
                const headWidth = 4;
                const headTipX = boltEndX + cos * headLength;
                const headTipY = boltEndY + sin * 0.5 * headLength;

                graphics.fillStyle(0x2a2a2a, alpha);
                graphics.beginPath();
                graphics.moveTo(headTipX, headTipY);
                graphics.lineTo(boltEndX + (-sin) * headWidth, boltEndY + (cos * 0.5) * headWidth);
                graphics.lineTo(boltEndX + (sin) * headWidth, boltEndY + (-cos * 0.5) * headWidth);
                graphics.closePath();
                graphics.fillPath();

                // Metal shine on head
                graphics.fillStyle(0x555555, alpha * 0.6);
                graphics.beginPath();
                graphics.moveTo(headTipX, headTipY);
                graphics.lineTo(boltEndX + (-sin) * headWidth * 0.5, boltEndY + (cos * 0.5) * headWidth * 0.5);
                graphics.lineTo(boltEndX, boltEndY);
                graphics.closePath();
                graphics.fillPath();

                // Smaller fletching
                const fletchX = boltStartX + cos * 3;
                const fletchY = boltStartY + sin * 0.5 * 3;
                graphics.fillStyle(0xcc2222, alpha);
                graphics.beginPath();
                graphics.moveTo(fletchX, fletchY);
                graphics.lineTo(fletchX + (-sin) * 5, fletchY + (cos * 0.5) * 5 - 3);
                graphics.lineTo(boltStartX + cos * 8, boltStartY + sin * 0.5 * 8);
                graphics.closePath();
                graphics.fillPath();
                graphics.beginPath();
                graphics.moveTo(fletchX, fletchY);
                graphics.lineTo(fletchX + (sin) * 5, fletchY + (-cos * 0.5) * 5 - 3);
                graphics.lineTo(boltStartX + cos * 8, boltStartY + sin * 0.5 * 8);
                graphics.closePath();
                graphics.fillPath();
            }

            // === BOWSTRING (rendered on top of bolt) ===
            graphics.lineStyle(3, 0x888888, alpha);
            graphics.lineBetween(leftArmX, leftArmY, stringCenterX, stringCenterY);
            graphics.lineBetween(rightArmX, rightArmY, stringCenterX, stringCenterY);
            graphics.lineStyle(2, 0xaaaaaa, alpha);
            graphics.lineBetween(leftArmX, leftArmY, stringCenterX, stringCenterY);
            graphics.lineBetween(rightArmX, rightArmY, stringCenterX, stringCenterY);

            // String tension glow when drawn
            if (stringTension > 0.3) {
                graphics.lineStyle(4, 0xffffff, alpha * 0.15 * stringTension);
                graphics.lineBetween(leftArmX, leftArmY, stringCenterX, stringCenterY);
                graphics.lineBetween(rightArmX, rightArmY, stringCenterX, stringCenterY);
            }

        }
    }

    static drawBallistaLevel2(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        // LEVEL 2 BALLISTA: Reinforced with bronze accents and improved mechanism
        const angle = building?.ballistaAngle ?? 0;
        const stringTension = building?.ballistaStringTension ?? 0;
        const boltLoaded = building?.ballistaBoltLoaded ?? true;
        const g = baseGraphics || graphics;

        if (!skipBase) {
            // === REINFORCED STONE FOUNDATION ===
            const baseHeight = 8; // Taller base

            // Side faces with stone texture
            graphics.fillStyle(0x4a4a4a, alpha);
            graphics.beginPath();
            graphics.moveTo(c2.x, c2.y);
            graphics.lineTo(c3.x, c3.y);
            graphics.lineTo(c3.x, c3.y + baseHeight);
            graphics.lineTo(c2.x, c2.y + baseHeight);
            graphics.closePath();
            graphics.fillPath();

            graphics.fillStyle(0x3a3a3a, alpha);
            graphics.beginPath();
            graphics.moveTo(c3.x, c3.y);
            graphics.lineTo(c4.x, c4.y);
            graphics.lineTo(c4.x, c4.y + baseHeight);
            graphics.lineTo(c3.x, c3.y + baseHeight);
            graphics.closePath();
            graphics.fillPath();

            // Top face with improved stone
            g.fillStyle(tint ?? 0x606060, alpha);
            g.fillPoints([c1, c2, c3, c4], true);

            // Stone block pattern
            g.lineStyle(1, 0x4a4a4a, alpha * 0.6);
            g.lineBetween(c1.x, c1.y, c3.x, c3.y);
            g.lineBetween(c2.x, c2.y, c4.x, c4.y);
            // Additional cross pattern
            const mid12 = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
            const mid34 = { x: (c3.x + c4.x) / 2, y: (c3.y + c4.y) / 2 };
            g.lineBetween(mid12.x, mid12.y, mid34.x, mid34.y);

            // Dark grey corner accents
            g.fillStyle(0x444444, alpha * 0.8);
            g.fillCircle(c1.x, c1.y, 3);
            g.fillCircle(c2.x, c2.y, 2.5);
            g.fillCircle(c3.x, c3.y, 2.5);
            g.fillCircle(c4.x, c4.y, 2.5);

            // Border
            g.lineStyle(2, 0x3a3a3a, 0.7 * alpha);
            g.strokePoints([c1, c2, c3, c4], true, true);

        }

        if (!onlyBase) {
            // === REINFORCED WOODEN PLATFORM ===
            const baseRadiusX = 24;
            const baseRadiusY = 14;
            const baseY = center.y - 5;

            // Shadow
            g.fillStyle(0x1a1a1a, alpha * 0.4);
            g.fillEllipse(center.x + 2, baseY + 5, baseRadiusX, baseRadiusY);

            // Main platform - darker wood
            graphics.fillStyle(0x4a3525, alpha);
            graphics.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

            // Wood planks
            graphics.lineStyle(1, 0x2a1a10, alpha * 0.5);
            for (let i = 0; i < 6; i++) {
                const ang = (i / 6) * Math.PI;
                const x1 = center.x + Math.cos(ang) * (baseRadiusX - 2);
                const y1 = baseY + Math.sin(ang) * (baseRadiusY - 1);
                const x2 = center.x - Math.cos(ang) * (baseRadiusX - 2);
                const y2 = baseY - Math.sin(ang) * (baseRadiusY - 1);
                graphics.lineBetween(x1, y1, x2, y2);
            }

            // Dark grey outer ring
            graphics.lineStyle(4, 0x3a3a3a, alpha);
            graphics.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
            graphics.lineStyle(2, 0x555555, alpha * 0.5);
            graphics.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);

            // Dark grey rivets
            graphics.fillStyle(0x444444, alpha);
            for (let i = 0; i < 10; i++) {
                const ang = (i / 10) * Math.PI * 2;
                const rx = center.x + Math.cos(ang) * (baseRadiusX - 3);
                const ry = baseY + Math.sin(ang) * (baseRadiusY - 2);
                graphics.fillCircle(rx, ry, 2.5);
                graphics.fillStyle(0x666666, alpha * 0.5);
                graphics.fillCircle(rx - 0.5, ry - 0.5, 1);
                graphics.fillStyle(0x444444, alpha);
            }

            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            // === DARK GREY PIVOT MECHANISM ===
            graphics.fillStyle(0x2a2a2a, alpha);
            graphics.fillCircle(center.x, baseY, 10);
            graphics.fillStyle(0x3a3a3a, alpha);
            graphics.fillCircle(center.x, baseY - 1, 7);
            graphics.fillStyle(0x444444, alpha);
            graphics.fillCircle(center.x, baseY - 2, 4);
            graphics.fillStyle(0x666666, alpha * 0.5);
            graphics.fillCircle(center.x - 1, baseY - 3, 2);

            // === REINFORCED CROSSBOW ARMS ===
            const armLength = 30;
            const armWidth = 6;
            const bowHeight = -18;

            const leftArmX = center.x + (-sin) * armLength;
            const leftArmY = center.y + bowHeight + (cos * 0.5) * armLength;
            const rightArmX = center.x + (sin) * armLength;
            const rightArmY = center.y + bowHeight + (-cos * 0.5) * armLength;

            // Outer shadow
            graphics.lineStyle(armWidth + 4, 0x1a0a05, alpha);
            graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
            graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

            // Dark wood arm
            graphics.lineStyle(armWidth + 2, 0x3a2515, alpha);
            graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
            graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

            // Wood core
            graphics.lineStyle(armWidth, 0x5a3520, alpha);
            graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
            graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

            // Wood highlight
            graphics.lineStyle(3, 0x6a4530, alpha);
            graphics.lineBetween(center.x, center.y + bowHeight, leftArmX, leftArmY);
            graphics.lineBetween(center.x, center.y + bowHeight, rightArmX, rightArmY);

            // Dark grey reinforcement bands
            const bandDist1 = 0.25;
            const bandDist2 = 0.5;
            const bandDist3 = 0.75;

            for (const dist of [bandDist1, bandDist2, bandDist3]) {
                const leftBandX = center.x + (-sin) * armLength * dist;
                const leftBandY = center.y + bowHeight + (cos * 0.5) * armLength * dist;
                const rightBandX = center.x + (sin) * armLength * dist;
                const rightBandY = center.y + bowHeight + (-cos * 0.5) * armLength * dist;

                graphics.fillStyle(0x333333, alpha);
                graphics.fillCircle(leftBandX, leftBandY, 4);
                graphics.fillCircle(rightBandX, rightBandY, 4);
                graphics.fillStyle(0x555555, alpha * 0.6);
                graphics.fillCircle(leftBandX - 0.5, leftBandY - 0.5, 2);
                graphics.fillCircle(rightBandX - 0.5, rightBandY - 0.5, 2);
            }

            // Dark grey arm tips
            graphics.fillStyle(0x2a2a2a, alpha);
            graphics.fillCircle(leftArmX, leftArmY, 6);
            graphics.fillCircle(rightArmX, rightArmY, 6);
            graphics.fillStyle(0x444444, alpha);
            graphics.fillCircle(leftArmX, leftArmY, 4);
            graphics.fillCircle(rightArmX, rightArmY, 4);
            graphics.fillStyle(0x666666, alpha * 0.6);
            graphics.fillCircle(leftArmX - 1, leftArmY - 1, 2);
            graphics.fillCircle(rightArmX - 1, rightArmY - 1, 2);

            // String position
            const stringPullback = stringTension * 18;
            const stringCenterX = center.x + cos * (-stringPullback);
            const stringCenterY = center.y + bowHeight + sin * 0.5 * (-stringPullback);

            // === REINFORCED RAIL ===
            const railLength = 30;
            const railEndX = center.x + cos * railLength;
            const railEndY = center.y + bowHeight + sin * 0.5 * railLength;
            const railBackX = center.x + cos * (-14);
            const railBackY = center.y + bowHeight + sin * 0.5 * (-14);

            graphics.lineStyle(12, 0x1a0a05, alpha);
            graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);
            graphics.lineStyle(10, 0x2a1510, alpha);
            graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);
            graphics.lineStyle(6, 0x3a2515, alpha);
            graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);
            graphics.lineStyle(2, 0x1a0a05, alpha * 0.7);
            graphics.lineBetween(railBackX, railBackY, railEndX, railEndY);

            // Dark grey rail plates
            for (const t of [0.3, 0.6]) {
                const plateX = center.x + cos * railLength * t;
                const plateY = center.y + bowHeight + sin * 0.5 * railLength * t;
                graphics.fillStyle(0x444444, alpha);
                graphics.fillEllipse(plateX, plateY, 5, 3);
                graphics.fillStyle(0x666666, alpha * 0.5);
                graphics.fillCircle(plateX - 1, plateY - 1, 1.5);
            }

            // === BOLT ===
            if (boltLoaded) {
                const boltLength = 26;
                const boltStartX = stringCenterX;
                const boltStartY = stringCenterY;
                const boltEndX = boltStartX + cos * boltLength;
                const boltEndY = boltStartY + sin * 0.5 * boltLength;

                graphics.lineStyle(4, 0x3a2a15, alpha);
                graphics.lineBetween(boltStartX, boltStartY, boltEndX, boltEndY);
                graphics.lineStyle(2, 0x5d4e37, alpha);
                graphics.lineBetween(boltStartX, boltStartY, boltEndX, boltEndY);

                // Arrowhead
                const headLength = 10;
                const headWidth = 5;
                const headTipX = boltEndX + cos * headLength;
                const headTipY = boltEndY + sin * 0.5 * headLength;

                graphics.fillStyle(0x2a2a2a, alpha);
                graphics.beginPath();
                graphics.moveTo(headTipX, headTipY);
                graphics.lineTo(boltEndX + (-sin) * headWidth, boltEndY + (cos * 0.5) * headWidth);
                graphics.lineTo(boltEndX + (sin) * headWidth, boltEndY + (-cos * 0.5) * headWidth);
                graphics.closePath();
                graphics.fillPath();

                graphics.fillStyle(0x555555, alpha * 0.6);
                graphics.beginPath();
                graphics.moveTo(headTipX, headTipY);
                graphics.lineTo(boltEndX + (-sin) * headWidth * 0.4, boltEndY + (cos * 0.5) * headWidth * 0.4);
                graphics.lineTo(boltEndX, boltEndY);
                graphics.closePath();
                graphics.fillPath();

                // Dark grey fletching
                const fletchX = boltStartX + cos * 3;
                const fletchY = boltStartY + sin * 0.5 * 3;
                graphics.fillStyle(0x444444, alpha);
                graphics.beginPath();
                graphics.moveTo(fletchX, fletchY);
                graphics.lineTo(fletchX + (-sin) * 6, fletchY + (cos * 0.5) * 6 - 3);
                graphics.lineTo(boltStartX + cos * 9, boltStartY + sin * 0.5 * 9);
                graphics.closePath();
                graphics.fillPath();
                graphics.beginPath();
                graphics.moveTo(fletchX, fletchY);
                graphics.lineTo(fletchX + (sin) * 6, fletchY + (-cos * 0.5) * 6 - 3);
                graphics.lineTo(boltStartX + cos * 9, boltStartY + sin * 0.5 * 9);
                graphics.closePath();
                graphics.fillPath();
            }

            // === BOWSTRING ===
            graphics.lineStyle(3, 0x888888, alpha);
            graphics.lineBetween(leftArmX, leftArmY, stringCenterX, stringCenterY);
            graphics.lineBetween(rightArmX, rightArmY, stringCenterX, stringCenterY);
            graphics.lineStyle(2, 0xbbbbbb, alpha);
            graphics.lineBetween(leftArmX, leftArmY, stringCenterX, stringCenterY);
            graphics.lineBetween(rightArmX, rightArmY, stringCenterX, stringCenterY);

            if (stringTension > 0.3) {
                graphics.lineStyle(5, 0xffffff, alpha * 0.2 * stringTension);
                graphics.lineBetween(leftArmX, leftArmY, stringCenterX, stringCenterY);
                graphics.lineBetween(rightArmX, rightArmY, stringCenterX, stringCenterY);
            }

        }
    }

    static drawXBow(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, time: number = 0, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        // X-Bow state
        const angle = building?.ballistaAngle ?? 0;
        const stringTension = building?.ballistaStringTension ?? 0;

        // Calculate rotation
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const heightOffset = -18; // Height above ground
        const g = baseGraphics || graphics;

        if (!skipBase) {
            // === HEAVY FORTIFIED STONE BASE ===
            const baseHeight = 8;

            // Side faces (isometric depth)
            graphics.fillStyle(0x5a5a5a, alpha);
            graphics.beginPath();
            graphics.moveTo(c2.x, c2.y);
            graphics.lineTo(c3.x, c3.y);
            graphics.lineTo(c3.x, c3.y + baseHeight);
            graphics.lineTo(c2.x, c2.y + baseHeight);
            graphics.closePath();
            graphics.fillPath();

            graphics.fillStyle(0x4a4a4a, alpha);
            graphics.beginPath();
            graphics.moveTo(c3.x, c3.y);
            graphics.lineTo(c4.x, c4.y);
            graphics.lineTo(c4.x, c4.y + baseHeight);
            graphics.lineTo(c3.x, c3.y + baseHeight);
            graphics.closePath();
            graphics.fillPath();

            // Top face
            g.fillStyle(tint ?? 0x6a6a6a, alpha);
            g.fillPoints([c1, c2, c3, c4], true);

            // Stone block pattern
            g.lineStyle(1, 0x5a5a5a, alpha * 0.5);
            g.lineBetween(c1.x, c1.y, c3.x, c3.y);
            g.lineBetween(c2.x, c2.y, c4.x, c4.y);

            // Border
            g.lineStyle(2, 0x4a4a4a, 0.7 * alpha);
            g.strokePoints([c1, c2, c3, c4], true, true);

        }

        if (!onlyBase) {
            // === METAL ROTATING PLATFORM ===
            const baseRadiusX = 24;
            const baseRadiusY = 14;
            const baseY = center.y - 4;

            // Shadow
            g.fillStyle(0x1a1a1a, alpha * 0.4);
            g.fillEllipse(center.x + 2, baseY + 4, baseRadiusX, baseRadiusY);

            // Dark metal platform
            graphics.fillStyle(0x3a3a4a, alpha);
            graphics.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

            // Metal segment lines
            graphics.lineStyle(1, 0x2a2a3a, alpha * 0.6);
            for (let i = 0; i < 8; i++) {
                const ang = (i / 8) * Math.PI * 2;
                const x1 = center.x + Math.cos(ang) * (baseRadiusX - 2);
                const y1 = baseY + Math.sin(ang) * (baseRadiusY - 1);
                graphics.lineBetween(center.x, baseY, x1, y1);
            }

            // Outer ring
            graphics.lineStyle(3, 0x4a4a5a, alpha);
            graphics.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
            graphics.lineStyle(1, 0x5a5a6a, alpha * 0.6);
            graphics.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);

            // Bolts
            graphics.fillStyle(0x555560, alpha);
            for (let i = 0; i < 8; i++) {
                const ang = (i / 8) * Math.PI * 2;
                const rx = center.x + Math.cos(ang) * (baseRadiusX - 3);
                const ry = baseY + Math.sin(ang) * (baseRadiusY - 2);
                graphics.fillCircle(rx, ry, 2);
            }

            // === CENTRAL PIVOT MECHANISM ===
            graphics.fillStyle(0x2a2a3a, alpha);
            graphics.fillCircle(center.x, baseY, 8);
            graphics.fillStyle(0x3a3a4a, alpha);
            graphics.fillCircle(center.x, baseY - 1, 6);
            graphics.fillStyle(0x4a4a5a, alpha);
            graphics.fillCircle(center.x, baseY - 2, 4);
            graphics.fillStyle(0x5a5a6a, alpha * 0.6);
            graphics.fillCircle(center.x - 1, baseY - 3, 2);

            // === CROSSBOW BODY ===
            // Define Front (Tip) and Back (Stock) relative to center using angle
            // Front is +d along angle
            const frontX = center.x + cos * 20;
            const frontY = center.y + heightOffset + sin * 0.5 * 20;
            const backX = center.x + cos * -20;
            const backY = center.y + heightOffset + sin * 0.5 * -20;

            // Draw Stock/Rail
            graphics.lineStyle(10, 0x3a2515, alpha);
            graphics.lineBetween(backX, backY, frontX, frontY);
            // Highlight
            graphics.lineStyle(6, 0x5a3520, alpha);
            graphics.lineBetween(backX, backY, frontX, frontY);

            // === ARMS (Mounted at Front) ===
            // Arms extend perpendicular to aim
            const armSpan = 30;
            const armX = -sin * armSpan;
            const armY = cos * 0.5 * armSpan;

            // Mount point slightly behind tip
            const mountX = center.x + cos * 15;
            const mountY = center.y + heightOffset + sin * 0.5 * 15;

            const lArmX = mountX + armX;
            const lArmY = mountY + armY;
            const rArmX = mountX - armX;
            const rArmY = mountY - armY;

            graphics.lineStyle(5, 0x4a2a10, alpha);
            graphics.lineBetween(mountX, mountY, lArmX, lArmY);
            graphics.lineBetween(mountX, mountY, rArmX, rArmY);

            // Tips
            graphics.fillStyle(0x888888, alpha);
            graphics.fillCircle(lArmX, lArmY, 3);
            graphics.fillCircle(rArmX, rArmY, 3);

            // === STRING (Single) ===
            // Connects tips to Nock. Nock moves with tension.
            const pull = stringTension * 12; // 0 to 12px back
            // Resting nock position (mid-rail) -> Pulled back (near stock)
            // Resting: -5. Pulled: -17.
            const nockOffset = -5 - pull;
            const nockX = center.x + cos * nockOffset;
            const nockY = center.y + heightOffset + sin * 0.5 * nockOffset;

            graphics.lineStyle(1.5, 0xdddddd, alpha); // Thin string
            graphics.lineBetween(lArmX, lArmY, nockX, nockY);
            graphics.lineBetween(rArmX, rArmY, nockX, nockY);

            // === BOLT (If loaded) ===
            if (stringTension > 0.1) {
                const boltTipX = frontX;
                const boltTipY = frontY;
                graphics.lineStyle(2, 0xffff00, alpha);
                graphics.lineBetween(nockX, nockY, boltTipX, boltTipY);
            }

            // Firing Glow
            const firingGlow = 0.3 + Math.sin(time / 50) * 0.2;
            graphics.fillStyle(0xff8844, alpha * firingGlow);
            graphics.fillCircle(frontX, frontY, 4);
        }
    }

    static drawXBowLevel2(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, time: number = 0, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        // LEVEL 2 X-BOW: Enhanced with purple/magenta accents and energy effects
        const angle = building?.ballistaAngle ?? 0;
        const stringTension = building?.ballistaStringTension ?? 0;

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const heightOffset = -20; // Slightly higher
        const g = baseGraphics || graphics;

        if (!skipBase) {
            // === ENHANCED FORTIFIED BASE ===
            const baseHeight = 10;

            // Side faces with purple tint
            graphics.fillStyle(0x5a5a6a, alpha);
            graphics.beginPath();
            graphics.moveTo(c2.x, c2.y);
            graphics.lineTo(c3.x, c3.y);
            graphics.lineTo(c3.x, c3.y + baseHeight);
            graphics.lineTo(c2.x, c2.y + baseHeight);
            graphics.closePath();
            graphics.fillPath();

            graphics.fillStyle(0x4a4a5a, alpha);
            graphics.beginPath();
            graphics.moveTo(c3.x, c3.y);
            graphics.lineTo(c4.x, c4.y);
            graphics.lineTo(c4.x, c4.y + baseHeight);
            graphics.lineTo(c3.x, c3.y + baseHeight);
            graphics.closePath();
            graphics.fillPath();

            // Top face
            g.fillStyle(tint ?? 0x6a6a7a, alpha);
            g.fillPoints([c1, c2, c3, c4], true);

            // Stone pattern
            g.lineStyle(1, 0x5a5a6a, alpha * 0.5);
            g.lineBetween(c1.x, c1.y, c3.x, c3.y);
            g.lineBetween(c2.x, c2.y, c4.x, c4.y);
            const mid12 = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
            const mid34 = { x: (c3.x + c4.x) / 2, y: (c3.y + c4.y) / 2 };
            g.lineBetween(mid12.x, mid12.y, mid34.x, mid34.y);

            // Dark grey corner accents
            g.fillStyle(0x444444, alpha * 0.9);
            g.fillCircle(c1.x, c1.y, 4);
            g.fillCircle(c2.x, c2.y, 3);
            g.fillCircle(c3.x, c3.y, 3);
            g.fillCircle(c4.x, c4.y, 3);
            // Subtle grey glow
            g.fillStyle(0x666666, alpha * 0.4);
            g.fillCircle(c1.x, c1.y, 6);

            g.lineStyle(2, 0x4a4a5a, 0.7 * alpha);
            g.strokePoints([c1, c2, c3, c4], true, true);

        }

        if (!onlyBase) {
            // === ENHANCED METAL PLATFORM ===
            const baseRadiusX = 26;
            const baseRadiusY = 15;
            const baseY = center.y - 5;

            // Shadow
            g.fillStyle(0x1a1a2a, alpha * 0.4);
            g.fillEllipse(center.x + 2, baseY + 5, baseRadiusX, baseRadiusY);

            // Dark grey metal platform
            graphics.fillStyle(0x333333, alpha);
            graphics.fillEllipse(center.x, baseY, baseRadiusX, baseRadiusY);

            // Geometric pattern
            graphics.lineStyle(1, 0x444444, alpha * 0.4);
            for (let i = 0; i < 8; i++) {
                const ang = (i / 8) * Math.PI * 2 + time / 2000;
                const x1 = center.x + Math.cos(ang) * (baseRadiusX - 2);
                const y1 = baseY + Math.sin(ang) * (baseRadiusY - 1);
                graphics.lineBetween(center.x, baseY, x1, y1);
            }

            // Dark grey outer ring
            graphics.lineStyle(4, 0x3a3a3a, alpha);
            graphics.strokeEllipse(center.x, baseY, baseRadiusX, baseRadiusY);
            graphics.lineStyle(2, 0x555555, alpha * 0.5);
            graphics.strokeEllipse(center.x, baseY - 1, baseRadiusX - 1, baseRadiusY - 1);

            // Dark grey rivets
            graphics.fillStyle(0x444444, alpha);
            for (let i = 0; i < 10; i++) {
                const ang = (i / 10) * Math.PI * 2;
                const rx = center.x + Math.cos(ang) * (baseRadiusX - 3);
                const ry = baseY + Math.sin(ang) * (baseRadiusY - 2);
                graphics.fillCircle(rx, ry, 2.5);
                graphics.fillStyle(0x666666, alpha * 0.5);
                graphics.fillCircle(rx - 0.5, ry - 0.5, 1);
                graphics.fillStyle(0x444444, alpha);
            }

            // === ENHANCED DARK GREY PIVOT ===
            graphics.fillStyle(0x2a2a2a, alpha);
            graphics.fillCircle(center.x, baseY, 10);
            graphics.fillStyle(0x3a3a3a, alpha);
            graphics.fillCircle(center.x, baseY - 1, 7);
            graphics.fillStyle(0x444444, alpha);
            graphics.fillCircle(center.x, baseY - 2, 4);
            // Core highlight
            graphics.fillStyle(0x666666, alpha * 0.6);
            graphics.fillCircle(center.x, baseY - 2, 2);

            // === ENHANCED CROSSBOW BODY ===
            const frontX = center.x + cos * 22;
            const frontY = center.y + heightOffset + sin * 0.5 * 22;
            const backX = center.x + cos * -22;
            const backY = center.y + heightOffset + sin * 0.5 * -22;

            // Enhanced rail
            graphics.lineStyle(12, 0x2a2a3a, alpha);
            graphics.lineBetween(backX, backY, frontX, frontY);
            graphics.lineStyle(8, 0x333333, alpha);
            graphics.lineBetween(backX, backY, frontX, frontY);
            graphics.lineStyle(4, 0x444444, alpha);
            graphics.lineBetween(backX, backY, frontX, frontY);

            // Dark grey line along rail
            graphics.lineStyle(2, 0x444444, alpha * 0.7);
            graphics.lineBetween(backX, backY, frontX, frontY);

            // === ENHANCED ARMS ===
            const armSpan = 34;
            const armX = -sin * armSpan;
            const armY = cos * 0.5 * armSpan;

            const mountX = center.x + cos * 17;
            const mountY = center.y + heightOffset + sin * 0.5 * 17;

            const lArmX = mountX + armX;
            const lArmY = mountY + armY;
            const rArmX = mountX - armX;
            const rArmY = mountY - armY;

            // Shadow
            graphics.lineStyle(7, 0x1a1a2a, alpha);
            graphics.lineBetween(mountX, mountY, lArmX, lArmY);
            graphics.lineBetween(mountX, mountY, rArmX, rArmY);

            // Dark arms
            graphics.lineStyle(5, 0x333333, alpha);
            graphics.lineBetween(mountX, mountY, lArmX, lArmY);
            graphics.lineBetween(mountX, mountY, rArmX, rArmY);

            // Arm highlights
            graphics.lineStyle(3, 0x444444, alpha);
            graphics.lineBetween(mountX, mountY, lArmX, lArmY);
            graphics.lineBetween(mountX, mountY, rArmX, rArmY);

            // Dark grey tips
            graphics.fillStyle(0x2a2a2a, alpha);
            graphics.fillCircle(lArmX, lArmY, 5);
            graphics.fillCircle(rArmX, rArmY, 5);
            graphics.fillStyle(0x444444, alpha);
            graphics.fillCircle(lArmX, lArmY, 3);
            graphics.fillCircle(rArmX, rArmY, 3);
            graphics.fillStyle(0x666666, alpha * 0.6);
            graphics.fillCircle(lArmX - 0.5, lArmY - 0.5, 1.5);
            graphics.fillCircle(rArmX - 0.5, rArmY - 0.5, 1.5);

            // === ENERGY STRING ===
            const pull = stringTension * 14;
            const nockOffset = -6 - pull;
            const nockX = center.x + cos * nockOffset;
            const nockY = center.y + heightOffset + sin * 0.5 * nockOffset;

            // Reinforced string effect
            graphics.lineStyle(2, 0x555555, alpha);
            graphics.lineBetween(lArmX, lArmY, nockX, nockY);
            graphics.lineBetween(rArmX, rArmY, nockX, nockY);
            graphics.lineStyle(1, 0x777777, alpha * 0.7);
            graphics.lineBetween(lArmX, lArmY, nockX, nockY);
            graphics.lineBetween(rArmX, rArmY, nockX, nockY);

            // Reinforced bolt
            if (stringTension > 0.1) {
                const boltTipX = frontX;
                const boltTipY = frontY;
                graphics.lineStyle(4, 0x333333, alpha * 0.5);
                graphics.lineBetween(nockX, nockY, boltTipX, boltTipY);
                graphics.lineStyle(2, 0x555555, alpha);
                graphics.lineBetween(nockX, nockY, boltTipX, boltTipY);
                graphics.lineStyle(1, 0x777777, alpha * 0.8);
                graphics.lineBetween(nockX, nockY, boltTipX, boltTipY);
            }

            graphics.fillCircle(frontX, frontY, 5);
        }
    }

    static drawMortar(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building: any, time: number, baseGraphics?: Phaser.GameObjects.Graphics) {
        const level = building?.level ?? 1;
        const isLevel2 = level >= 2;
        const isLevel3 = level >= 3;
        const size = isLevel3 ? 1.2 : (isLevel2 ? 1.12 : 1.0);
        const g = baseGraphics || graphics;

        // Recoil animation - reduced movement + scale shrink for perspective effect
        const timeSinceFire = building?.lastFireTime ? (time - building.lastFireTime) : 10000;
        const recoilDuration = 400;
        let recoil = 0;
        let recoilScale = 1.0;
        if (timeSinceFire < recoilDuration) {
            const t = timeSinceFire / recoilDuration;
            const recoilAmount = Math.sin(t * Math.PI);
            recoil = recoilAmount * 5;
            recoilScale = 1.0 - recoilAmount * 0.08;
        }

        // Subtle rotation - based on horizontal direction to target in screen space
        const aimAngle = building?.ballistaAngle ?? 0;
        const horizontalAim = Math.cos(aimAngle);

        // Snap to 7 discrete positions
        let rotationDeg = 0;
        if (horizontalAim > 0.9) rotationDeg = 30;
        else if (horizontalAim > 0.6) rotationDeg = 20;
        else if (horizontalAim > 0.25) rotationDeg = 10;
        else if (horizontalAim < -0.9) rotationDeg = -30;
        else if (horizontalAim < -0.6) rotationDeg = -20;
        else if (horizontalAim < -0.25) rotationDeg = -10;

        // Colors - varies by level
        const stoneBase = tint ?? (isLevel3 ? 0x5a5a5a : (isLevel2 ? 0x4a4540 : 0x5a5550));
        const stoneDark = isLevel3 ? 0x4a4a4a : (isLevel2 ? 0x3a3530 : 0x4a4540);
        const stoneLight = isLevel3 ? 0x7a7a7a : 0x6a6560;
        const ironColor = isLevel3 ? 0x4a4a4a : (isLevel2 ? 0x3a3a3a : 0x4a4a4a);
        const ironDark = isLevel3 ? 0x3a3a3a : (isLevel2 ? 0x2a2a2a : 0x3a3a3a);
        const ironLight = isLevel3 ? 0x6a6a6a : (isLevel2 ? 0x4a4a4a : 0x5a5a5a);
        const ironHighlight = isLevel3 ? 0xcccccc : null; // White/silver highlight for L3
        const dirtColor = isLevel3 ? 0x4a4038 : 0x3a3020;

        // Emplacement dimensions
        const pitRadius = 22 * size;
        const pitY = center.y + 2;
        const baseElevation = isLevel3 ? 4 : 0; // L3 has elevated base

        // ============================================
        // STONE BASE PLATFORM
        // ============================================
        // L3: Draw elevated platform sides first
        if (isLevel3) {
            graphics.fillStyle(stoneDark, alpha);
            // Front side of elevation
            graphics.beginPath();
            graphics.moveTo(c2.x, c2.y);
            graphics.lineTo(c3.x, c3.y);
            graphics.lineTo(c3.x, c3.y + baseElevation);
            graphics.lineTo(c2.x, c2.y + baseElevation);
            graphics.closePath();
            graphics.fillPath();
            // Right side
            graphics.beginPath();
            graphics.moveTo(c3.x, c3.y);
            graphics.lineTo(c4.x, c4.y);
            graphics.lineTo(c4.x, c4.y + baseElevation);
            graphics.lineTo(c3.x, c3.y + baseElevation);
            graphics.closePath();
            graphics.fillPath();
        }

        // Main platform top
        g.fillStyle(stoneBase, alpha);
        g.fillPoints([c1, c2, c3, c4], true);

        // Edge highlights
        g.lineStyle(2, stoneLight, alpha * 0.6);
        g.lineBetween(c1.x, c1.y, c2.x, c2.y);
        g.lineBetween(c1.x, c1.y, c4.x, c4.y);
        g.lineStyle(2, stoneDark, alpha * 0.6);
        g.lineBetween(c2.x, c2.y, c3.x, c3.y);
        g.lineBetween(c3.x, c3.y, c4.x, c4.y);

        // L3: Stone rim around edge + decorative garnishes
        if (isLevel3) {
            g.lineStyle(3, 0x6a6a6a, alpha * 0.8);
            g.strokePoints([c1, c2, c3, c4], true, true);

            // Corner rivets/stones
            g.fillStyle(0x7a7a7a, alpha);
            g.fillCircle(c1.x, c1.y, 3);
            g.fillCircle(c2.x, c2.y, 3);
            g.fillCircle(c3.x, c3.y, 3);
            g.fillCircle(c4.x, c4.y, 3);
            // Inner highlight on rivets
            g.fillStyle(0x9a9a9a, alpha * 0.8);
            g.fillCircle(c1.x - 1, c1.y - 1, 1.5);
            g.fillCircle(c2.x - 1, c2.y - 1, 1.5);
            g.fillCircle(c3.x - 1, c3.y - 1, 1.5);
            g.fillCircle(c4.x - 1, c4.y - 1, 1.5);

            // Small decorative stones near emplacement
            g.fillStyle(0x5a5a5a, alpha * 0.7);
            g.fillCircle(center.x - 22, center.y - 8, 2.5);
            g.fillCircle(center.x + 20, center.y - 6, 2);
            g.fillCircle(center.x - 18, center.y + 10, 2);
            g.fillCircle(center.x + 22, center.y + 8, 2.5);
        }

        // ============================================
        // DIRT EMPLACEMENT (the pit the mortar sits in)
        // ============================================
        // Outer dirt ring
        graphics.fillStyle(dirtColor, alpha);
        graphics.fillEllipse(center.x, pitY, pitRadius * 2.2, pitRadius * 1.0);

        // Inner dark pit
        graphics.fillStyle(0x1a1510, alpha);
        graphics.fillEllipse(center.x, pitY + 2, pitRadius * 1.8, pitRadius * 0.8);

        // Deep shadow
        graphics.fillStyle(0x0a0a08, alpha);
        graphics.fillEllipse(center.x, pitY + 4, pitRadius * 1.4, pitRadius * 0.6);

        // ============================================
        // MORTAR BARREL (recoils into pit with scale shrink + ROTATION)
        // Rotation is achieved by offsetting top more than bottom
        // ============================================
        const barrelY = center.y - 8 * size + recoil;
        const barrelWidth = 20 * size * recoilScale;

        // Tilt multiplier - how much each vertical level gets offset
        // Bottom = 0 (stays centered), Top = full rotation offset
        const tiltAmount = rotationDeg * 0.12; // Max ~3.6px at ±30 degrees

        // Barrel base (bottom, goes into pit) - minimal tilt
        graphics.fillStyle(ironDark, alpha);
        graphics.fillEllipse(center.x + tiltAmount * 0.1, barrelY + 14 * size * recoilScale, barrelWidth * 0.8, barrelWidth * 0.35);
        graphics.fillEllipse(center.x + tiltAmount * 0.2, barrelY + 10 * size * recoilScale, barrelWidth * 0.9, barrelWidth * 0.4);

        // Main barrel body - progressive tilt
        graphics.fillStyle(ironColor, alpha);
        graphics.fillEllipse(center.x + tiltAmount * 0.35, barrelY + 6 * size * recoilScale, barrelWidth, barrelWidth * 0.45);
        graphics.fillEllipse(center.x + tiltAmount * 0.5, barrelY + 2 * size * recoilScale, barrelWidth * 1.1, barrelWidth * 0.5);
        graphics.fillEllipse(center.x + tiltAmount * 0.65, barrelY - 2 * size * recoilScale, barrelWidth * 1.2, barrelWidth * 0.55);

        // Iron bands - also tilt
        graphics.lineStyle(2, ironDark, alpha);
        graphics.strokeEllipse(center.x + tiltAmount * 0.25, barrelY + 8 * size * recoilScale, barrelWidth * 0.85, barrelWidth * 0.38);
        graphics.strokeEllipse(center.x + tiltAmount * 0.5, barrelY, barrelWidth * 1.1, barrelWidth * 0.5);

        // Level 2+: Extra reinforcement band
        if (isLevel2) {
            graphics.lineStyle(2, 0x2a2a2a, alpha);
            graphics.strokeEllipse(center.x + tiltAmount * 0.4, barrelY + 4 * size * recoilScale, barrelWidth * 0.95, barrelWidth * 0.43);
        }

        // Barrel rim (top) - maximum tilt
        graphics.fillStyle(ironLight, alpha);
        graphics.fillEllipse(center.x + tiltAmount * 0.85, barrelY - 6 * size * recoilScale, barrelWidth * 1.3, barrelWidth * 0.6);

        // Level 3: Single beefy shiny rim highlight
        if (ironHighlight) {
            graphics.lineStyle(3, ironHighlight, alpha * 0.85);
            graphics.strokeEllipse(center.x + tiltAmount * 0.85, barrelY - 7 * size * recoilScale, barrelWidth * 1.38, barrelWidth * 0.64);
        }

        // Inner rim
        graphics.fillStyle(ironColor, alpha);
        graphics.fillEllipse(center.x + tiltAmount * 0.85, barrelY - 6 * size * recoilScale, barrelWidth * 1.1, barrelWidth * 0.5);

        // Bore hole
        graphics.fillStyle(0x0a0a0a, alpha);
        graphics.fillEllipse(center.x + tiltAmount * 0.9, barrelY - 6 * size * recoilScale, barrelWidth * 0.85, barrelWidth * 0.38);

        // Bore depth
        graphics.fillStyle(0x000000, alpha * 0.8);
        graphics.fillEllipse(center.x + tiltAmount * 1.0, barrelY - 4 * size * recoilScale, barrelWidth * 0.7, barrelWidth * 0.32);

        // ============================================
        // FRONT DIRT EDGE (covers barrel bottom - the masking layer)
        // ============================================
        graphics.fillStyle(dirtColor, alpha);
        graphics.beginPath();
        // Draw front arc of the dirt emplacement
        for (let i = 0; i <= 16; i++) {
            const angle = (i / 32) * Math.PI * 2;
            const px = center.x + Math.cos(angle) * pitRadius * 1.1;
            const py = pitY + Math.sin(angle) * pitRadius * 0.5;
            if (i === 0) graphics.moveTo(px, py);
            else graphics.lineTo(px, py);
        }
        // Inner edge
        for (let i = 16; i >= 0; i--) {
            const angle = (i / 32) * Math.PI * 2;
            const px = center.x + Math.cos(angle) * pitRadius * 0.7;
            const py = pitY + Math.sin(angle) * pitRadius * 0.32;
            graphics.lineTo(px, py);
        }
        graphics.closePath();
        graphics.fillPath();

        // Dirt texture on front edge
        graphics.fillStyle(0x2a2518, alpha * 0.5);
        graphics.fillCircle(center.x + 8, pitY + pitRadius * 0.35, 3);
        graphics.fillCircle(center.x - 6, pitY + pitRadius * 0.4, 2);
        graphics.fillCircle(center.x + 2, pitY + pitRadius * 0.38, 2.5);

        // ============================================
        // SMOKE EFFECT ON FIRING
        // ============================================
        if (timeSinceFire < 300) {
            const t = timeSinceFire / 300;
            const smokeAlpha = (1 - t) * 0.5;
            graphics.fillStyle(0x888888, alpha * smokeAlpha);
            graphics.fillCircle(center.x + Math.sin(time / 40) * 4, barrelY - 12 - t * 20, 4 + t * 6);
            graphics.fillCircle(center.x - 4 + Math.cos(time / 50) * 3, barrelY - 18 - t * 25, 3 + t * 5);
            graphics.fillCircle(center.x + 3 + Math.sin(time / 60) * 2, barrelY - 24 - t * 28, 2.5 + t * 4);
        }
    }

    static drawTeslaCoil(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building: any, time: number, baseGraphics?: Phaser.GameObjects.Graphics) {
        const level = building?.level ?? 1;
        const isLevel2 = level >= 2;
        const g = baseGraphics || graphics;

        // Determine tesla state from building properties
        const isCharging = building?.teslaCharging === true;
        const chargeStart = building?.teslaChargeStart ?? 0;
        const isCharged = building?.teslaCharged === true;
        const lastFireTime = building?.lastFireTime ?? 0;
        const chargeDuration = 800;
        const chargeProgress = isCharging ? Math.min((time - chargeStart) / chargeDuration, 1) : 0;

        // Cooldown: after firing, sink back over 600ms
        const timeSinceFire = time - lastFireTime;
        const isCoolingDown = !isCharging && !isCharged && lastFireTime > 0 && timeSinceFire < 600;
        const cooldownProgress = isCoolingDown ? timeSinceFire / 600 : 0;

        const hasEverFired = lastFireTime > 0;
        const isActive = isCharging || isCharged || isCoolingDown;

        // Calculate yOffset for subtle dip when idle
        const dipAmount = 5; // Subtle dip, not fully underground
        let yOffset: number;
        if (isCharging) {
            // Rise from dip to 0 over charge duration
            yOffset = dipAmount * (1 - chargeProgress);
        } else if (isCharged) {
            // Fully extended
            yOffset = 0;
        } else if (isCoolingDown) {
            // Settle back down
            yOffset = dipAmount * cooldownProgress;
        } else {
            // Idle: subtle dip
            yOffset = dipAmount;
        }

        // Stone base platform (stays in place — this is the ground)
        g.fillStyle(isLevel2 ? 0x6a6a6a : 0x5a5a5a, alpha);
        g.fillPoints([c1, c2, c3, c4], true);
        g.lineStyle(isLevel2 ? 2 : 1, isLevel2 ? 0x4a4a4a : 0x3a3a3a, 0.5 * alpha);
        g.strokePoints([c1, c2, c3, c4], true, true);

        // L2: Raised platform edge
        if (isLevel2) {
            g.fillStyle(0x555555, alpha * 0.8);
            g.fillRect(center.x - 16, center.y + 2, 32, 4);
        }

        // Wooden support post (shifted by yOffset)
        const postWidth = isLevel2 ? 10 : 8;
        graphics.fillStyle(isLevel2 ? 0x5a4a3a : 0x4a3a2a, alpha);
        graphics.fillRect(center.x - postWidth / 2, center.y - 35 + yOffset, postWidth, 35);
        graphics.lineStyle(1, 0x2a1a0a, 0.5 * alpha);
        graphics.strokeRect(center.x - postWidth / 2, center.y - 35 + yOffset, postWidth, 35);

        // Metal coil rings (shifted by yOffset)
        const ringCount = isLevel2 ? 4 : 3;
        for (let i = 0; i < ringCount; i++) {
            const ringY = center.y - 10 - i * (isLevel2 ? 7 : 8) + yOffset;
            const ringSize = isLevel2 ? 14 : 12;

            if (isActive) {
                // Charging: rings light up bottom-to-top sequentially
                const ringThreshold = i / ringCount;
                const isLit = chargeProgress > ringThreshold || isCharged || isCoolingDown;

                if (isLit) {
                    // Lit ring: metallic with cyan glow
                    graphics.fillStyle(0x7a7a7a, alpha);
                    graphics.fillEllipse(center.x, ringY, ringSize, 4);
                    graphics.lineStyle(1, 0x3a3a3a, alpha);
                    graphics.strokeEllipse(center.x, ringY, ringSize, 4);
                    const glowAlpha = isCharged ? 0.6 : (0.3 + (chargeProgress - ringThreshold) * 0.4);
                    graphics.lineStyle(isLevel2 ? 2 : 1, 0x00ccff, alpha * glowAlpha);
                    graphics.strokeEllipse(center.x, ringY, ringSize + 1, 5);
                } else {
                    // Unlit ring during charge-up
                    graphics.fillStyle(0x4a4a4a, alpha);
                    graphics.fillEllipse(center.x, ringY, ringSize, 4);
                    graphics.lineStyle(1, 0x3a3a3a, alpha);
                    graphics.strokeEllipse(center.x, ringY, ringSize, 4);
                }
            } else if (!hasEverFired) {
                // Truly idle (never attacked): rings lit with cyan glow
                graphics.fillStyle(0x7a7a7a, alpha);
                graphics.fillEllipse(center.x, ringY, ringSize, 4);
                graphics.lineStyle(1, 0x3a3a3a, alpha);
                graphics.strokeEllipse(center.x, ringY, ringSize, 4);
                graphics.lineStyle(isLevel2 ? 2 : 1, 0x00ccff, alpha * 0.45);
                graphics.strokeEllipse(center.x, ringY, ringSize + 1, 5);
            } else {
                // Between attacks: dull rings, no glow
                graphics.fillStyle(0x5a5a5a, alpha);
                graphics.fillEllipse(center.x, ringY, ringSize, 4);
                graphics.lineStyle(1, 0x3a3a3a, alpha);
                graphics.strokeEllipse(center.x, ringY, ringSize, 4);
            }
        }

        // L2: Electrical ring around base — only visible when active
        if (isLevel2 && isActive) {
            const ringPulse = 0.5 + Math.sin(time / 100) * 0.3;
            graphics.lineStyle(3, 0x00ccff, alpha * ringPulse * 0.6);
            graphics.strokeEllipse(center.x, center.y - 2, 24, 8);
            graphics.lineStyle(1, 0x88ffff, alpha * ringPulse * 0.8);
            graphics.strokeEllipse(center.x, center.y - 2, 22, 7);

            // Occasional sparks from ring
            const sparkSeed = Math.floor(time / 80);
            if (sparkSeed % 3 === 0) {
                const sparkAngle = (time / 50) % (Math.PI * 2);
                const sx = center.x + Math.cos(sparkAngle) * 12;
                const sy = center.y - 2 + Math.sin(sparkAngle) * 4;
                graphics.fillStyle(0xffffff, alpha * 0.8);
                graphics.fillCircle(sx, sy, 2);
            }
        }

        // Glowing electric orb (shifted by yOffset)
        const orbY = center.y - 40 + yOffset;

        if (isCharged || (isCharging && chargeProgress >= 1)) {
            // Fully charged / firing: bright pulsing cyan orb
            const pulseIntensity = 0.8 + Math.sin(time / 120) * 0.2;

            // Outer glow (pulsing)
            graphics.fillStyle(0x00ccff, 0.3 * alpha * pulseIntensity);
            graphics.fillCircle(center.x, orbY, 14 + Math.sin(time / 80) * 2);

            // Mid glow
            graphics.fillStyle(0x44ddff, 0.5 * alpha * pulseIntensity);
            graphics.fillCircle(center.x, orbY, 10);

            // Core
            graphics.fillStyle(tint ?? 0xaaeeff, alpha);
            graphics.fillCircle(center.x, orbY, 7);

            // Electric highlight
            graphics.fillStyle(0xffffff, 0.8 * alpha);
            graphics.fillCircle(center.x - 2, orbY - 2, 2);
        } else if (isCharging) {
            // Charging: orb starts dull, brightens as charge completes
            const brightness = chargeProgress * 0.5;

            // Dim glow grows with charge
            if (chargeProgress > 0.7) {
                graphics.fillStyle(0x00ccff, 0.15 * alpha * chargeProgress);
                graphics.fillCircle(center.x, orbY, 10 + chargeProgress * 4);
            }

            // Orb transitions from dull to bright
            const orbColor = chargeProgress > 0.8 ? 0x66aacc : 0x556677;
            graphics.fillStyle(orbColor, alpha);
            graphics.fillCircle(center.x, orbY, 7);

            // Dim highlight
            graphics.fillStyle(0xaaaaaa, 0.3 * alpha * brightness);
            graphics.fillCircle(center.x - 2, orbY - 2, 2);
        } else {
            // Idle: dull gray-blue orb, no glow
            graphics.fillStyle(0x556677, alpha);
            graphics.fillCircle(center.x, orbY, 7);

            // Subtle dull highlight
            graphics.fillStyle(0x778899, 0.3 * alpha);
            graphics.fillCircle(center.x - 2, orbY - 2, 1.5);

            // Occasional idle crackle — small dim arcs to feel alive
            const idleSeed = Math.floor(time / 300);
            if (idleSeed % 4 === 0) {
                const arcAngle = ((idleSeed * 2.618) % 6.28);
                const arcLen = 8 + (idleSeed % 5);
                const sx = center.x + Math.cos(arcAngle) * 5;
                const sy = orbY + Math.sin(arcAngle) * 5;
                const ex = center.x + Math.cos(arcAngle) * arcLen + Math.sin(time / 30) * 2;
                const ey = orbY + Math.sin(arcAngle) * arcLen + Math.cos(time / 35) * 1.5;

                graphics.lineStyle(1, 0x6699aa, alpha * 0.4);
                graphics.beginPath();
                graphics.moveTo(sx, sy);
                graphics.lineTo(ex, ey);
                graphics.strokePath();

                graphics.fillStyle(0x88aacc, alpha * 0.3);
                graphics.fillCircle(ex, ey, 1);
            }
        }
    }
    static drawPrismTower(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, _building?: any, baseGraphics?: Phaser.GameObjects.Graphics, skipBase: boolean = false, onlyBase: boolean = false) {
        const time = Date.now();
        const level = _building?.level ?? 1;
        const isLevel3 = level >= 3;
        const g = baseGraphics || graphics;

        // === BASE LAYER ===
        if (!skipBase) {
            if (isLevel3) {
                // Obsidian runic platform with glowing rune channels
                g.fillStyle(tint ?? 0x1a1a2a, alpha);
                g.fillPoints([c1, c2, c3, c4], true);
                const runeGlow = 0.3 + Math.sin(time / 200) * 0.15;
                g.lineStyle(1.5, 0xcc66ff, alpha * runeGlow);
                g.lineBetween(c1.x, c1.y, c3.x, c3.y);
                g.lineBetween(c2.x, c2.y, c4.x, c4.y);
                g.lineStyle(1, 0xcc66ff, alpha * runeGlow * 0.8);
                const rd = 6;
                g.lineBetween(center.x, center.y - rd, center.x + rd, center.y);
                g.lineBetween(center.x + rd, center.y, center.x, center.y + rd);
                g.lineBetween(center.x, center.y + rd, center.x - rd, center.y);
                g.lineBetween(center.x - rd, center.y, center.x, center.y - rd);
                g.lineStyle(1, 0x4a4a6a, alpha * 0.8);
                g.lineBetween(c1.x, c1.y, c2.x, c2.y);
                g.lineBetween(c1.x, c1.y, c4.x, c4.y);
            } else {
                g.fillStyle(tint ?? 0x4a4a5a, alpha);
                g.fillPoints([c1, c2, c3, c4], true);
                g.lineStyle(1, 0x6a6a7a, alpha * 0.8);
                g.lineBetween(c1.x, c1.y, c2.x, c2.y);
                g.lineBetween(c1.x, c1.y, c4.x, c4.y);
                g.lineStyle(1, 0x2a2a3a, alpha * 0.8);
                g.lineBetween(c2.x, c2.y, c3.x, c3.y);
                g.lineBetween(c3.x, c3.y, c4.x, c4.y);
            }
        }

        if (onlyBase) return;

        const baseHeight = isLevel3 ? 18 : 15;
        const pillarColor1 = isLevel3 ? 0x2a1a3a : 0x3a3a4a;
        const pillarColor2 = isLevel3 ? 0x3a2a4a : 0x5a5a6a;

        graphics.fillStyle(pillarColor1, alpha);
        graphics.fillPoints([
            new Phaser.Math.Vector2(center.x + 8, center.y + 4),
            new Phaser.Math.Vector2(center.x + 8, center.y + 4 - baseHeight),
            new Phaser.Math.Vector2(center.x, center.y - 4 - baseHeight),
            new Phaser.Math.Vector2(center.x, center.y - 4)
        ], true);
        graphics.fillStyle(pillarColor2, alpha);
        graphics.fillPoints([
            new Phaser.Math.Vector2(center.x, center.y - 4),
            new Phaser.Math.Vector2(center.x, center.y - 4 - baseHeight),
            new Phaser.Math.Vector2(center.x - 8, center.y + 4 - baseHeight),
            new Phaser.Math.Vector2(center.x - 8, center.y + 4)
        ], true);

        if (isLevel3) {
            const runeGlow2 = 0.35 + Math.sin(time / 180) * 0.2;
            graphics.lineStyle(1, 0xaa44ee, alpha * runeGlow2);
            graphics.lineBetween(center.x + 4, center.y + 2 - baseHeight * 0.3, center.x + 6, center.y + 2 - baseHeight * 0.7);
            graphics.lineBetween(center.x - 4, center.y + 2 - baseHeight * 0.3, center.x - 6, center.y + 2 - baseHeight * 0.7);
        }

        const crystalBase = center.y - baseHeight;
        const crystalHeight = isLevel3 ? 42 : 35;
        const hueSpeed = isLevel3 ? 15 : 20;
        const hue1 = (time / hueSpeed) % 360;
        const hue2 = (hue1 + 120) % 360;
        const hue3 = (hue1 + 240) % 360;

        const hslToColor = (h: number, sat: number = 0.7) => {
            const c = sat;
            const x = c * (1 - Math.abs((h / 60) % 2 - 1));
            let r = 0, gg = 0, b = 0;
            if (h < 60) { r = c; gg = x; }
            else if (h < 120) { r = x; gg = c; }
            else if (h < 180) { gg = c; b = x; }
            else if (h < 240) { gg = x; b = c; }
            else if (h < 300) { r = x; b = c; }
            else { r = c; b = x; }
            return ((Math.floor((r + 0.3) * 255) << 16) | (Math.floor((gg + 0.3) * 255) << 8) | Math.floor((b + 0.3) * 255));
        };

        const crystalW = isLevel3 ? 7 : 6;
        graphics.fillStyle(hslToColor(hue1), alpha * 0.8);
        graphics.beginPath();
        graphics.moveTo(center.x + crystalW, crystalBase + 4);
        graphics.lineTo(center.x, crystalBase - crystalHeight);
        graphics.lineTo(center.x, crystalBase - 2);
        graphics.closePath();
        graphics.fillPath();

        graphics.fillStyle(hslToColor(hue2), alpha * 0.8);
        graphics.beginPath();
        graphics.moveTo(center.x - crystalW, crystalBase + 4);
        graphics.lineTo(center.x, crystalBase - crystalHeight);
        graphics.lineTo(center.x, crystalBase - 2);
        graphics.closePath();
        graphics.fillPath();

        graphics.fillStyle(hslToColor(hue3), alpha * 0.9);
        graphics.beginPath();
        graphics.moveTo(center.x - crystalW, crystalBase + 4);
        graphics.lineTo(center.x, crystalBase - crystalHeight);
        graphics.lineTo(center.x + crystalW, crystalBase + 4);
        graphics.closePath();
        graphics.fillPath();

        if (isLevel3) {
            // Orbiting satellite crystals
            for (let i = 0; i < 3; i++) {
                const orbitAngle = (time / 600 + i * (Math.PI * 2 / 3)) % (Math.PI * 2);
                const orbitRadius = 10;
                const orbitY = crystalBase - crystalHeight * 0.5;
                const ox = center.x + Math.cos(orbitAngle) * orbitRadius;
                const oy = orbitY + Math.sin(orbitAngle) * orbitRadius * 0.4;
                const miniHue = (hue1 + i * 120) % 360;
                graphics.fillStyle(hslToColor(miniHue, 0.9), alpha * 0.75);
                graphics.beginPath();
                graphics.moveTo(ox, oy - 5);
                graphics.lineTo(ox + 2.5, oy);
                graphics.lineTo(ox, oy + 3);
                graphics.lineTo(ox - 2.5, oy);
                graphics.closePath();
                graphics.fillPath();
            }
        }

        const glowPulse = isLevel3 ? (0.5 + Math.sin(time / 80) * 0.25) : (0.4 + Math.sin(time / 100) * 0.2);
        const glowSize = isLevel3 ? 6 : 4;
        graphics.fillStyle(0xffffff, alpha * glowPulse);
        graphics.fillCircle(center.x, crystalBase - crystalHeight + 5, glowSize);

        if (isLevel3) {
            graphics.fillStyle(0xcc66ff, alpha * glowPulse * 0.4);
            graphics.fillCircle(center.x, crystalBase - crystalHeight + 5, glowSize + 4);
        }

        const beamCount = isLevel3 ? 5 : 3;
        const beamAlpha = isLevel3 ? 0.4 : 0.3;
        graphics.lineStyle(isLevel3 ? 1.5 : 1, 0xffffff, alpha * beamAlpha);
        for (let i = 0; i < beamCount; i++) {
            const beamAngle = (time / 500 + i * (Math.PI * 2 / beamCount)) % (Math.PI * 2);
            const beamLen = (isLevel3 ? 20 : 15) + Math.sin(time / 150 + i) * 5;
            graphics.lineBetween(
                center.x, crystalBase - crystalHeight,
                center.x + Math.cos(beamAngle) * beamLen,
                crystalBase - crystalHeight + Math.sin(beamAngle) * beamLen * 0.5
            );
        }
    }

    // === MAGMA VENT - VOLCANIC LAVA SPEWER WITH STEAMPUNK CONTROLS ===
    static drawMagmaVent(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, baseGraphics?: Phaser.GameObjects.Graphics, time: number = 0, skipBase: boolean = false, onlyBase: boolean = false) {
        const level = building?.level ?? 1;
        const g = baseGraphics || graphics;

        // Level 2 scale multiplier (bigger rocks and lava)
        const scale = level >= 2 ? 1.2 : 1.0;

        // Attack state
        const timeSinceFire = building?.lastFireTime ? (time - building.lastFireTime) : 100000;
        const attackDuration = 1200;
        const isAttacking = timeSinceFire < attackDuration;
        const attackProgress = isAttacking ? timeSinceFire / attackDuration : 0;
        const attackPower = isAttacking ? Math.sin(attackProgress * Math.PI) : 0;

        // === COLOR PALETTE ===
        const basaltDark = 0x1a1a1f;
        const basaltMid = 0x2a2a32;
        const basaltLight = 0x3a3a45;
        const basaltHighlight = 0x4a4a55;
        const lavaOrange = 0xff5500;
        const lavaYellow = 0xffaa00;
        const lavaWhite = 0xffdd66;
        const brassColor = tint ?? 0xc08040;
        const brassLight = 0xdaa060;
        const brassDark = 0x8b6030;

        // Pool position constants (used in both base and dynamic rendering)
        const poolY = center.y + 2;
        const poolW = 36 * scale;
        const poolH = 18 * scale;

        // === BASE LAYER (baked to ground texture) ===
        if (!skipBase) {
            // === SCORCHED GROUND BASE ===
            g.fillStyle(0x1a1410, alpha);
            g.fillPoints([c1, c2, c3, c4], true);

            // === LAVA CHANNEL GRID (drawn on base layer, under everything) ===
            // Static dim channels for base - attacking glow is dynamic
            const channelAlpha = 0.2;
            const channelColor = lavaOrange;
            const channelWidth = 2.5;

            g.lineStyle(channelWidth, channelColor, alpha * channelAlpha);

            // Main radial channels from center to corners
            g.lineBetween(center.x, center.y, c1.x, c1.y);
            g.lineBetween(center.x, center.y, c2.x, c2.y);
            g.lineBetween(center.x, center.y, c3.x, c3.y);
            g.lineBetween(center.x, center.y, c4.x, c4.y);

            // Secondary channels to edge midpoints
            const midNE = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
            const midSE = { x: (c2.x + c3.x) / 2, y: (c2.y + c3.y) / 2 };
            const midSW = { x: (c3.x + c4.x) / 2, y: (c3.y + c4.y) / 2 };
            const midNW = { x: (c4.x + c1.x) / 2, y: (c4.y + c1.y) / 2 };

            g.lineBetween(center.x, center.y, midNE.x, midNE.y);
            g.lineBetween(center.x, center.y, midSE.x, midSE.y);
            g.lineBetween(center.x, center.y, midSW.x, midSW.y);
            g.lineBetween(center.x, center.y, midNW.x, midNW.y);

            // === CENTRAL LAVA POOL (static base) ===
            // Dark crater rim
            g.fillStyle(basaltDark, alpha);
            g.fillEllipse(center.x, poolY + 2, poolW + 8, poolH + 4);

            // Static lava glow edge
            g.fillStyle(lavaOrange, alpha * 0.35 * 0.6);
            g.fillEllipse(center.x, poolY + 1, poolW + 5, poolH + 2);

            // Main lava surface (idle state)
            g.fillStyle(lavaOrange, alpha * 0.65);
            g.fillEllipse(center.x, poolY, poolW, poolH);

            // Hot center
            g.fillStyle(lavaYellow, alpha * 0.65 * 0.95);
            g.fillEllipse(center.x, poolY - 1, poolW * 0.55, poolH * 0.55);

            // White-hot core
            g.fillStyle(lavaWhite, alpha * 0.65 * 0.85);
            g.fillEllipse(center.x, poolY - 2, poolW * 0.25, poolH * 0.25);
        }

        // Return early if only drawing base
        if (onlyBase) return;

        // === DYNAMIC LAYER (rendered each frame at building depth) ===

        // Dynamic lava glow overlay when attacking
        if (isAttacking) {
            const channelAlpha = 0.7 + attackPower * 0.3;
            const channelColor = lavaYellow;
            const channelWidth = 5 + attackPower * 3;

            graphics.lineStyle(channelWidth, channelColor, alpha * channelAlpha);
            graphics.lineBetween(center.x, center.y, c1.x, c1.y);
            graphics.lineBetween(center.x, center.y, c2.x, c2.y);
            graphics.lineBetween(center.x, center.y, c3.x, c3.y);
            graphics.lineBetween(center.x, center.y, c4.x, c4.y);

            const midNE = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
            const midSE = { x: (c2.x + c3.x) / 2, y: (c2.y + c3.y) / 2 };
            const midSW = { x: (c3.x + c4.x) / 2, y: (c3.y + c4.y) / 2 };
            const midNW = { x: (c4.x + c1.x) / 2, y: (c4.y + c1.y) / 2 };

            graphics.lineBetween(center.x, center.y, midNE.x, midNE.y);
            graphics.lineBetween(center.x, center.y, midSE.x, midSE.y);
            graphics.lineBetween(center.x, center.y, midSW.x, midSW.y);
            graphics.lineBetween(center.x, center.y, midNW.x, midNW.y);

            // White-hot inner glow
            const hotLength = 0.3 + attackProgress * 0.4;
            graphics.lineStyle(channelWidth * 0.4, lavaWhite, alpha * attackPower * 0.8);
            graphics.lineBetween(center.x, center.y, center.x + (c1.x - center.x) * hotLength, center.y + (c1.y - center.y) * hotLength);
            graphics.lineBetween(center.x, center.y, center.x + (c2.x - center.x) * hotLength, center.y + (c2.y - center.y) * hotLength);
            graphics.lineBetween(center.x, center.y, center.x + (c3.x - center.x) * hotLength, center.y + (c3.y - center.y) * hotLength);
            graphics.lineBetween(center.x, center.y, center.x + (c4.x - center.x) * hotLength, center.y + (c4.y - center.y) * hotLength);

            // Central glow
            graphics.fillStyle(lavaWhite, alpha * attackPower * 0.4);
            graphics.fillCircle(center.x, center.y, 10 + attackPower * 12);

            // Dynamic lava surface overlay
            const lavaAlpha = 0.95;
            const glowAmount = 0.7 + attackPower * 0.3;
            graphics.fillStyle(lavaOrange, alpha * glowAmount * 0.6);
            graphics.fillEllipse(center.x, poolY + 1, poolW + 5, poolH + 2);
            graphics.fillStyle(lavaOrange, alpha * lavaAlpha);
            graphics.fillEllipse(center.x, poolY, poolW, poolH);
            graphics.fillStyle(lavaYellow, alpha * lavaAlpha * 0.95);
            graphics.fillEllipse(center.x, poolY - 1, poolW * 0.55, poolH * 0.55);
            const coreSize = 0.4 + attackPower * 0.3;
            graphics.fillStyle(lavaWhite, alpha * lavaAlpha * 0.85);
            graphics.fillEllipse(center.x, poolY - 2, poolW * coreSize, poolH * coreSize);
        }

        // === HUGE VOLCANIC ROCKS ===
        const rockScale = scale;

        // BACK-LEFT ROCK (huge, imposing)
        graphics.fillStyle(basaltMid, alpha);
        graphics.beginPath();
        graphics.moveTo(center.x - 48 * rockScale, center.y + 15);
        graphics.lineTo(center.x - 44 * rockScale, center.y - 25 * rockScale);
        graphics.lineTo(center.x - 30 * rockScale, center.y - 35 * rockScale);
        graphics.lineTo(center.x - 18 * rockScale, center.y - 28 * rockScale);
        graphics.lineTo(center.x - 12 * rockScale, center.y - 8);
        graphics.lineTo(center.x - 20 * rockScale, center.y + 12);
        graphics.closePath();
        graphics.fillPath();

        // Back-left rock highlight face
        graphics.fillStyle(basaltLight, alpha * 0.8);
        graphics.beginPath();
        graphics.moveTo(center.x - 48 * rockScale, center.y + 15);
        graphics.lineTo(center.x - 44 * rockScale, center.y - 25 * rockScale);
        graphics.lineTo(center.x - 36 * rockScale, center.y - 18 * rockScale);
        graphics.lineTo(center.x - 38 * rockScale, center.y + 8);
        graphics.closePath();
        graphics.fillPath();

        // Back-left rock shadow face
        graphics.fillStyle(basaltDark, alpha);
        graphics.beginPath();
        graphics.moveTo(center.x - 18 * rockScale, center.y - 28 * rockScale);
        graphics.lineTo(center.x - 12 * rockScale, center.y - 8);
        graphics.lineTo(center.x - 20 * rockScale, center.y + 12);
        graphics.lineTo(center.x - 22 * rockScale, center.y - 5);
        graphics.closePath();
        graphics.fillPath();

        // BACK-RIGHT ROCK (huge)
        graphics.fillStyle(basaltDark, alpha);
        graphics.beginPath();
        graphics.moveTo(center.x + 46 * rockScale, center.y + 18);
        graphics.lineTo(center.x + 40 * rockScale, center.y - 20 * rockScale);
        graphics.lineTo(center.x + 28 * rockScale, center.y - 30 * rockScale);
        graphics.lineTo(center.x + 16 * rockScale, center.y - 22 * rockScale);
        graphics.lineTo(center.x + 14 * rockScale, center.y + 5);
        graphics.lineTo(center.x + 25 * rockScale, center.y + 16);
        graphics.closePath();
        graphics.fillPath();

        // Back-right rock highlight
        graphics.fillStyle(basaltMid, alpha * 0.7);
        graphics.beginPath();
        graphics.moveTo(center.x + 28 * rockScale, center.y - 30 * rockScale);
        graphics.lineTo(center.x + 40 * rockScale, center.y - 20 * rockScale);
        graphics.lineTo(center.x + 38 * rockScale, center.y - 5);
        graphics.lineTo(center.x + 30 * rockScale, center.y - 15 * rockScale);
        graphics.closePath();
        graphics.fillPath();

        // FRONT ROCK (smaller, foreground)
        graphics.fillStyle(basaltMid, alpha);
        graphics.beginPath();
        graphics.moveTo(center.x + 8 * rockScale, center.y + 25);
        graphics.lineTo(center.x + 4 * rockScale, center.y + 12);
        graphics.lineTo(center.x + 15 * rockScale, center.y + 8);
        graphics.lineTo(center.x + 22 * rockScale, center.y + 18);
        graphics.closePath();
        graphics.fillPath();

        graphics.fillStyle(basaltHighlight, alpha * 0.6);
        graphics.beginPath();
        graphics.moveTo(center.x + 8 * rockScale, center.y + 25);
        graphics.lineTo(center.x + 4 * rockScale, center.y + 12);
        graphics.lineTo(center.x + 10 * rockScale, center.y + 14);
        graphics.lineTo(center.x + 12 * rockScale, center.y + 22);
        graphics.closePath();
        graphics.fillPath();



        // Rock lava glow (reflected light when attacking)
        if (isAttacking) {
            graphics.fillStyle(lavaOrange, alpha * attackPower * 0.4);
            graphics.fillCircle(center.x - 28 * rockScale, center.y - 5, 14 * rockScale);
            graphics.fillCircle(center.x + 28 * rockScale, center.y - 2, 12 * rockScale);
            graphics.fillCircle(center.x + 12 * rockScale, center.y + 15, 8 * rockScale);
        }

        // === BIG ROTATING DIAL WHEEL ===
        const wheelX = center.x;
        const wheelY = center.y - 32;
        const wheelRadius = 15 * scale;

        // Wheel mount / housing base
        graphics.fillStyle(brassDark, alpha);
        graphics.fillRect(wheelX - 12, wheelY + 10, 24, 14);
        graphics.fillStyle(brassColor, alpha);
        graphics.fillRect(wheelX - 10, wheelY + 12, 20, 10);

        // Wheel outer rim
        graphics.lineStyle(6, brassDark, alpha);
        graphics.strokeCircle(wheelX, wheelY, wheelRadius);
        graphics.lineStyle(4, brassColor, alpha);
        graphics.strokeCircle(wheelX, wheelY, wheelRadius - 2);
        graphics.lineStyle(2, brassLight, alpha * 0.8);
        graphics.strokeCircle(wheelX, wheelY, wheelRadius - 4);

        // DIAL ROTATION - Spins when attacking!
        const dialRotation = isAttacking
            ? attackProgress * Math.PI * 3  // Spins 1.5 full rotations during attack
            : Math.sin(time / 2000) * 0.1;  // Slight idle wobble

        // Wheel spokes (8 for ship-wheel look)
        graphics.lineStyle(3, brassColor, alpha);
        for (let i = 0; i < 8; i++) {
            const spokeAngle = (i / 8) * Math.PI * 2 + dialRotation;
            const sx = wheelX + Math.cos(spokeAngle) * (wheelRadius - 5);
            const sy = wheelY + Math.sin(spokeAngle) * (wheelRadius - 5) * 0.65;
            graphics.lineBetween(wheelX, wheelY, sx, sy);
        }

        // Handle knobs on 4 spokes
        graphics.fillStyle(brassDark, alpha);
        for (let i = 0; i < 4; i++) {
            const knobAngle = (i / 4) * Math.PI * 2 + dialRotation;
            const kx = wheelX + Math.cos(knobAngle) * (wheelRadius - 3);
            const ky = wheelY + Math.sin(knobAngle) * (wheelRadius - 3) * 0.65;
            graphics.fillCircle(kx, ky, 3);
        }
        graphics.fillStyle(brassLight, alpha * 0.7);
        for (let i = 0; i < 4; i++) {
            const knobAngle = (i / 4) * Math.PI * 2 + dialRotation;
            const kx = wheelX + Math.cos(knobAngle) * (wheelRadius - 3) - 0.5;
            const ky = wheelY + Math.sin(knobAngle) * (wheelRadius - 3) * 0.65 - 0.5;
            graphics.fillCircle(kx, ky, 1.5);
        }

        // Center hub
        graphics.fillStyle(brassDark, alpha);
        graphics.fillCircle(wheelX, wheelY, 7);
        graphics.fillStyle(brassColor, alpha);
        graphics.fillCircle(wheelX, wheelY, 5);
        graphics.fillStyle(brassLight, alpha);
        graphics.fillCircle(wheelX - 1.5, wheelY - 1.5, 2.5);

        // === PRESSURE GAUGE (with animated needle) ===
        const gaugeX = center.x - 35;
        const gaugeY = center.y - 22;
        const gaugeRadius = 11 * scale;

        // Gauge mount bracket
        graphics.fillStyle(brassDark, alpha);
        graphics.fillRect(gaugeX - 5, gaugeY + gaugeRadius - 3, 10, 12);

        // Gauge body
        graphics.fillStyle(brassColor, alpha);
        graphics.fillCircle(gaugeX, gaugeY, gaugeRadius + 2);
        graphics.fillStyle(brassDark, alpha);
        graphics.fillCircle(gaugeX, gaugeY, gaugeRadius);

        // Gauge face
        graphics.fillStyle(0xf5f5e8, alpha);
        graphics.fillCircle(gaugeX, gaugeY, gaugeRadius - 2);

        // Gauge zone arcs
        const arcR = gaugeRadius - 4;
        graphics.lineStyle(3, 0x44aa44, alpha * 0.65);
        graphics.beginPath();
        graphics.arc(gaugeX, gaugeY, arcR, -Math.PI * 0.8, -Math.PI * 0.35);
        graphics.strokePath();
        graphics.lineStyle(3, 0xddaa00, alpha * 0.65);
        graphics.beginPath();
        graphics.arc(gaugeX, gaugeY, arcR, -Math.PI * 0.35, Math.PI * 0.05);
        graphics.strokePath();
        graphics.lineStyle(3, 0xdd3333, alpha * 0.65);
        graphics.beginPath();
        graphics.arc(gaugeX, gaugeY, arcR, Math.PI * 0.05, Math.PI * 0.45);
        graphics.strokePath();

        // Tick marks
        graphics.lineStyle(1, 0x333333, alpha);
        for (let i = 0; i < 8; i++) {
            const tickAngle = -Math.PI * 0.8 + (i / 7) * Math.PI * 1.25;
            graphics.lineBetween(
                gaugeX + Math.cos(tickAngle) * (gaugeRadius - 5),
                gaugeY + Math.sin(tickAngle) * (gaugeRadius - 5),
                gaugeX + Math.cos(tickAngle) * (gaugeRadius - 2),
                gaugeY + Math.sin(tickAngle) * (gaugeRadius - 2)
            );
        }

        // Needle - Smooth physics: shoots up, bounces at limit, falls back down
        const idleNeedleWobble = Math.sin(time / 800) * 0.15;
        const idleAngle = -Math.PI * 0.6 + idleNeedleWobble;  // Green zone
        const maxAngle = Math.PI * 0.35;  // Deep red zone (limit)

        let needleAngle: number;
        if (isAttacking) {
            // Smooth animation: fast shoot up, bounce at top, gradual fall
            // Phase 1 (0-0.2): Rapid rise to max
            // Phase 2 (0.2-0.5): Bounce/oscillate at top
            // Phase 3 (0.5-1.0): Gradual fall back toward idle

            if (attackProgress < 0.15) {
                // SHOOT UP - fast ease-out curve
                const riseProgress = attackProgress / 0.15;
                const easeOut = 1 - Math.pow(1 - riseProgress, 3);  // cubic ease-out
                needleAngle = idleAngle + (maxAngle - idleAngle) * easeOut;
            } else if (attackProgress < 0.4) {
                // BOUNCE at the top - damped oscillation
                const bounceProgress = (attackProgress - 0.15) / 0.25;
                const bounce = Math.sin(bounceProgress * Math.PI * 3) * Math.exp(-bounceProgress * 3) * 0.15;
                needleAngle = maxAngle + bounce;
            } else {
                // FALL BACK DOWN - slow ease-in
                const fallProgress = (attackProgress - 0.4) / 0.6;
                const easeIn = Math.pow(fallProgress, 2);  // quadratic ease-in
                needleAngle = maxAngle - (maxAngle - idleAngle) * easeIn;
            }
        } else {
            needleAngle = idleAngle;
        }

        graphics.lineStyle(2.5, 0xcc0000, alpha);
        graphics.lineBetween(
            gaugeX, gaugeY,
            gaugeX + Math.cos(needleAngle) * (gaugeRadius - 3),
            gaugeY + Math.sin(needleAngle) * (gaugeRadius - 3)
        );

        // Needle hub
        graphics.fillStyle(0x222222, alpha);
        graphics.fillCircle(gaugeX, gaugeY, 3);
        graphics.fillStyle(brassLight, alpha);
        graphics.fillCircle(gaugeX - 0.5, gaugeY - 0.5, 1.5);

        // Gauge glass rim
        graphics.lineStyle(2, brassLight, alpha * 0.7);
        graphics.strokeCircle(gaugeX, gaugeY, gaugeRadius + 1);

        // === ERUPTION EFFECTS (on attack) ===
        if (isAttacking) {
            // Lava bubbles erupting from pool
            for (let i = 0; i < 6; i++) {
                const bubblePhase = (attackProgress + i * 0.15) % 1;
                const bubbleX = center.x + Math.sin(i * 2.3 + time / 70) * 10 * scale;
                const bubbleY = poolY - 6 - bubblePhase * 45 * scale;
                const bubbleAlpha = (1 - bubblePhase) * attackPower;
                const bubbleSize = (2.5 + (1 - bubblePhase) * 6) * scale;

                graphics.fillStyle(lavaYellow, alpha * bubbleAlpha);
                graphics.fillCircle(bubbleX, bubbleY, bubbleSize);
                graphics.fillStyle(lavaWhite, alpha * bubbleAlpha * 0.65);
                graphics.fillCircle(bubbleX, bubbleY, bubbleSize * 0.4);
            }

            // Large heat glow dome
            graphics.fillStyle(lavaYellow, alpha * attackPower * 0.2);
            graphics.fillEllipse(center.x, center.y, 70 * scale, 40 * scale);
        }

        // === SUBTLE IDLE SMOKE ===
        if (!isAttacking) {
            for (let i = 0; i < 2; i++) {
                const smokePhase = ((time / 3500) + i * 0.5) % 1;
                const smokeY = poolY - 10 - smokePhase * 35;
                const smokeX = center.x + Math.sin(time / 500 + i * 3) * 8 * smokePhase;
                const smokeAlpha = (1 - smokePhase) * 0.2;
                graphics.fillStyle(0x444444, alpha * smokeAlpha);
                graphics.fillCircle(smokeX, smokeY, 4 + smokePhase * 6);
            }
        }
    }

    static drawArmyCamp(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, baseGraphics?: Phaser.GameObjects.Graphics, building?: any, skipBase: boolean = false, onlyBase: boolean = false) {
        const time = Date.now();
        const g = baseGraphics || graphics; // Ground-plane elements render here.
        const level = building?.level ?? 1;
        const showWeaponRack = level >= 2;
        const showDummy = level >= 3;

        // === TRAINING GROUND BASE ===
        if (!skipBase) {
            // Packed dirt/sand arena floor
            g.fillStyle(tint ?? 0xb8a080, alpha);
            g.fillPoints([c1, c2, c3, c4], true);

            // Inner training circle (worn area)
            g.lineStyle(2, 0xa89070, 0.5 * alpha);
            // Note: Using a fixed radius scale for the classic look
            g.strokeEllipse(center.x, center.y, 45, 22.5);
            g.fillStyle(0xa89070, 0.3 * alpha);
            g.fillEllipse(center.x, center.y, 45, 22.5);

            // Ground texture - packed earth patterns
            g.fillStyle(0x9a8060, alpha * 0.5);
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2;
                const dist = 20 + (i % 3) * 12;
                const ox = Math.cos(angle) * dist * 0.8;
                const oy = Math.sin(angle) * dist * 0.4;
                g.fillCircle(center.x + ox, center.y + 5 + oy, 2 + (i % 2));
            }

            // Decorative border - rope boundary (ground plane)
            g.lineStyle(2, 0x8b7355, alpha * 0.7);
            g.strokePoints([c1, c2, c3, c4], true, true);



        }

        if (!onlyBase) {
            // === CENTRAL CAMPFIRE ===
            const fireX = center.x;
            const fireY = center.y + 8;

            // Fire pit stones (ring)
            graphics.fillStyle(0x555555, alpha);
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const stoneX = fireX + Math.cos(angle) * 12;
                const stoneY = fireY + Math.sin(angle) * 6;
                graphics.fillEllipse(stoneX, stoneY, 5, 3);
            }

            // Fire pit inner (ash/coals)
            graphics.fillStyle(0x2a2020, alpha);
            graphics.fillEllipse(fireX, fireY, 10, 5);

            // Glowing coals
            const coalGlow = 0.5 + Math.sin(time / 200) * 0.2;
            graphics.fillStyle(0x881100, alpha * coalGlow);
            graphics.fillEllipse(fireX, fireY, 8, 4);
            graphics.fillStyle(0xcc3300, alpha * coalGlow * 0.7);
            graphics.fillEllipse(fireX - 2, fireY, 4, 2);
            graphics.fillEllipse(fireX + 3, fireY + 1, 3, 1.5);

            // Main flame animation
            const flame1 = Math.sin(time / 60) * 0.3 + 0.7;
            const flame2 = Math.sin(time / 45 + 1) * 0.25 + 0.75;
            const flame3 = Math.sin(time / 80 + 2) * 0.35 + 0.65;

            // Flame glow on ground
            g.fillStyle(0xff4400, alpha * 0.15 * flame1);
            g.fillEllipse(fireX, fireY, 25, 12);

            // Flames (multi-layer)
            graphics.fillStyle(0xdd4400, alpha * flame3);
            graphics.beginPath();
            graphics.moveTo(fireX - 6, fireY);
            graphics.lineTo(fireX - 8, fireY - 12 - flame3 * 5);
            graphics.lineTo(fireX - 3, fireY - 8);
            graphics.lineTo(fireX - 5, fireY - 18 - flame2 * 6);
            graphics.lineTo(fireX, fireY - 10);
            graphics.lineTo(fireX + 2, fireY - 16 - flame1 * 5);
            graphics.lineTo(fireX + 5, fireY - 6);
            graphics.lineTo(fireX + 7, fireY - 14 - flame3 * 4);
            graphics.lineTo(fireX + 6, fireY);
            graphics.closePath();
            graphics.fillPath();

            graphics.fillStyle(0xff6600, alpha * flame1);
            graphics.beginPath();
            graphics.moveTo(fireX - 5, fireY);
            graphics.lineTo(fireX - 6, fireY - 10 - flame2 * 4);
            graphics.lineTo(fireX - 2, fireY - 7);
            graphics.lineTo(fireX - 3, fireY - 15 - flame1 * 5);
            graphics.lineTo(fireX + 1, fireY - 9);
            graphics.lineTo(fireX + 3, fireY - 13 - flame3 * 4);
            graphics.lineTo(fireX + 5, fireY - 5);
            graphics.lineTo(fireX + 5, fireY);
            graphics.closePath();
            graphics.fillPath();

            graphics.fillStyle(0xffaa00, alpha * flame2);
            graphics.beginPath();
            graphics.moveTo(fireX - 3, fireY);
            graphics.lineTo(fireX - 4, fireY - 7 - flame1 * 3);
            graphics.lineTo(fireX - 1, fireY - 5);
            graphics.lineTo(fireX, fireY - 11 - flame2 * 4);
            graphics.lineTo(fireX + 2, fireY - 6);
            graphics.lineTo(fireX + 3, fireY - 8 - flame3 * 3);
            graphics.lineTo(fireX + 3, fireY);
            graphics.closePath();
            graphics.fillPath();

            graphics.fillStyle(0xffdd44, alpha * flame3);
            graphics.beginPath();
            graphics.moveTo(fireX - 2, fireY);
            graphics.lineTo(fireX - 2, fireY - 5 - flame2 * 2);
            graphics.lineTo(fireX, fireY - 8 - flame1 * 3);
            graphics.lineTo(fireX + 2, fireY - 4 - flame3 * 2);
            graphics.lineTo(fireX + 2, fireY);
            graphics.closePath();
            graphics.fillPath();

            // Fire sparks rising
            for (let i = 0; i < 5; i++) {
                const sparkPhase = (time / 80 + i * 40) % 40;
                if (sparkPhase < 35) {
                    const sparkRise = sparkPhase * 0.7;
                    const sparkDrift = Math.sin(sparkPhase * 0.3 + i) * 4;
                    const sparkAlpha = 1 - sparkPhase / 35;
                    graphics.fillStyle(0xffaa44, alpha * sparkAlpha * 0.8);
                    graphics.fillCircle(fireX + sparkDrift + (i - 2) * 2, fireY - 15 - sparkRise, 1.2);
                }
            }

            if (showDummy) {
                // === TRAINING DUMMY ===
                const dummyX = center.x - 35;
                const dummyY = center.y - 5;

                // Dummy post
                graphics.fillStyle(0x5d4e37, alpha);
                graphics.fillRect(dummyX - 2, dummyY - 25, 4, 30);
                graphics.fillStyle(0x3d2e17, alpha);
                graphics.fillRect(dummyX + 1, dummyY - 25, 1, 30);

                // Dummy body (straw-stuffed sack)
                graphics.fillStyle(0xc4a060, alpha);
                graphics.fillEllipse(dummyX, dummyY - 18, 8, 12);
                graphics.fillStyle(0xa48040, alpha * 0.6);
                graphics.fillEllipse(dummyX + 2, dummyY - 18, 5, 10);

                // Dummy head
                graphics.fillStyle(0xc4a060, alpha);
                graphics.fillCircle(dummyX, dummyY - 32, 6);
                graphics.fillStyle(0xa48040, alpha * 0.5);
                graphics.fillCircle(dummyX + 1, dummyY - 32, 4);

                // Dummy arms (wooden crossbar)
                graphics.fillStyle(0x5d4e37, alpha);
                graphics.fillRect(dummyX - 10, dummyY - 22, 20, 3);

                // Straw detail
                graphics.lineStyle(1, 0x8a7030, alpha * 0.6);
                graphics.lineBetween(dummyX - 4, dummyY - 10, dummyX - 6, dummyY - 5);
                graphics.lineBetween(dummyX + 3, dummyY - 10, dummyX + 5, dummyY - 6);
                graphics.lineBetween(dummyX, dummyY - 10, dummyX, dummyY - 4);
            }

            if (showWeaponRack) {
                // === WEAPON RACK (right side) ===
                const rackX = center.x + 35;
                const rackY = center.y;

                // Rack frame (A-frame)
                graphics.fillStyle(0x5d4e37, alpha);
                // Left leg
                graphics.beginPath();
                graphics.moveTo(rackX - 10, rackY + 5);
                graphics.lineTo(rackX - 8, rackY - 20);
                graphics.lineTo(rackX - 5, rackY - 20);
                graphics.lineTo(rackX - 7, rackY + 5);
                graphics.closePath();
                graphics.fillPath();

                // Right leg
                graphics.beginPath();
                graphics.moveTo(rackX + 10, rackY + 5);
                graphics.lineTo(rackX + 8, rackY - 20);
                graphics.lineTo(rackX + 5, rackY - 20);
                graphics.lineTo(rackX + 7, rackY + 5);
                graphics.closePath();
                graphics.fillPath();

                // Cross bar
                graphics.fillRect(rackX - 9, rackY - 18, 18, 3);
                graphics.fillStyle(0x3d2e17, alpha);
                graphics.fillRect(rackX - 9, rackY - 16, 18, 1);

                // Weapons on rack
                // Sword 1
                graphics.fillStyle(0x888888, alpha);
                graphics.fillRect(rackX - 7, rackY - 30, 2, 14);
                graphics.fillStyle(0x5d4e37, alpha);
                graphics.fillRect(rackX - 8, rackY - 17, 4, 3);
                graphics.fillStyle(0xccaa00, alpha);
                graphics.fillRect(rackX - 7, rackY - 17, 2, 1);

                // Sword 2
                graphics.fillStyle(0x777777, alpha);
                graphics.fillRect(rackX + 1, rackY - 28, 2, 12);
                graphics.fillStyle(0x5d4e37, alpha);
                graphics.fillRect(rackX, rackY - 17, 4, 3);
                graphics.fillStyle(0xccaa00, alpha);
                graphics.fillRect(rackX + 1, rackY - 17, 2, 1);

                // Axe
                graphics.fillStyle(0x5d4e37, alpha);
                graphics.fillRect(rackX + 6, rackY - 32, 2, 16);
                graphics.fillStyle(0x666666, alpha);
                graphics.beginPath();
                graphics.moveTo(rackX + 5, rackY - 32);
                graphics.lineTo(rackX + 11, rackY - 30);
                graphics.lineTo(rackX + 11, rackY - 26);
                graphics.lineTo(rackX + 5, rackY - 24);
                graphics.closePath();
                graphics.fillPath();
            }
        }
    }

    static drawWall(graphics: Phaser.GameObjects.Graphics, _center: Phaser.Math.Vector2, gridX: number, gridY: number, alpha: number, tint: number | null, building: any, neighbors: { nN: boolean, nS: boolean, nE: boolean, nW: boolean, owner: string }) {
        const level = building?.level ?? 1;
        const owner = neighbors.owner;

        // Route to appropriate level renderer
        if (level >= 3) {
            this.drawWallLevel3(graphics, gridX, gridY, alpha, tint, owner, neighbors);
        } else if (level === 2) {
            this.drawWallLevel2(graphics, gridX, gridY, alpha, tint, owner, neighbors);
        } else {
            this.drawWallLevel1(graphics, gridX, gridY, alpha, tint, owner, neighbors);
        }
    }

    // === LEVEL 1: WOODEN PALISADE ===
    private static drawWallLevel1(graphics: Phaser.GameObjects.Graphics, gridX: number, gridY: number, alpha: number, tint: number | null, _owner: string, neighbors: { nN: boolean, nS: boolean, nE: boolean, nW: boolean }) {
        const wallHeight = 19;
        const wallThickness = 0.35;

        // Wooden colors - warm browns
        const woodTop = tint ?? 0x8b6b4a;
        const woodFront = tint ?? 0x6b4a30;
        const woodSide = tint ?? 0x5a3a20;

        const { nN, nS, nE, nW } = neighbors;

        const hw = wallThickness / 2;
        const cx = gridX + 0.5;
        const cy = gridY + 0.5;

        const sideFaces: { points: Phaser.Math.Vector2[], color: number }[] = [];
        const topFaces: Phaser.Math.Vector2[][] = [];

        const addSegment = (x1: number, y1: number, x2: number, y2: number) => {
            const isVertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);
            if (isVertical) {
                const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
                const bl = IsoUtils.cartToIso(x1 - hw, minY), br = IsoUtils.cartToIso(x1 + hw, minY);
                const fl = IsoUtils.cartToIso(x1 - hw, maxY), fr = IsoUtils.cartToIso(x1 + hw, maxY);
                const tbl = new Phaser.Math.Vector2(bl.x, bl.y - wallHeight);
                const tbr = new Phaser.Math.Vector2(br.x, br.y - wallHeight);
                const tfl = new Phaser.Math.Vector2(fl.x, fl.y - wallHeight);
                const tfr = new Phaser.Math.Vector2(fr.x, fr.y - wallHeight);
                sideFaces.push({ points: [br, fr, tfr, tbr], color: woodSide });
                sideFaces.push({ points: [fr, fl, tfl, tfr], color: woodFront });
                topFaces.push([tbl, tbr, tfr, tfl]);
            } else {
                const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
                const lt = IsoUtils.cartToIso(minX, y1 - hw), lb = IsoUtils.cartToIso(minX, y1 + hw);
                const rt = IsoUtils.cartToIso(maxX, y1 - hw), rb = IsoUtils.cartToIso(maxX, y1 + hw);
                const tlt = new Phaser.Math.Vector2(lt.x, lt.y - wallHeight);
                const tlb = new Phaser.Math.Vector2(lb.x, lb.y - wallHeight);
                const trt = new Phaser.Math.Vector2(rt.x, rt.y - wallHeight);
                const trb = new Phaser.Math.Vector2(rb.x, rb.y - wallHeight);
                sideFaces.push({ points: [rt, rb, trb, trt], color: woodSide });
                sideFaces.push({ points: [rb, lb, tlb, trb], color: woodFront });
                topFaces.push([tlt, trt, trb, tlb]);
            }
        };

        // Straight-through detection: skip post for continuous stretches
        const isStraightNS = nN && nS && !nE && !nW;
        const isStraightEW = nE && nW && !nN && !nS;
        const isStraight = isStraightNS || isStraightEW;

        if (isStraight) {
            // Draw a single full segment through the tile (no post)
            if (isStraightNS) addSegment(cx, gridY, cx, gridY + 1);
            if (isStraightEW) addSegment(gridX, cy, gridX + 1, cy);
        } else {
            // Half-segments: center to own tile edge to avoid depth overlap at corners
            if (nN) addSegment(cx, cy, cx, gridY);
            if (nS) addSegment(cx, cy, cx, gridY + 1);
            if (nE) addSegment(cx, cy, gridX + 1, cy);
            if (nW) addSegment(cx, cy, gridX, cy);

            // Central post with direction-aware faces for isometric corners
            const ps = wallThickness * 0.7;
            const hps = ps / 2;
            const pTL = IsoUtils.cartToIso(cx - hps, cy - hps);
            const pTR = IsoUtils.cartToIso(cx + hps, cy - hps);
            const pBR = IsoUtils.cartToIso(cx + hps, cy + hps);
            const pBL = IsoUtils.cartToIso(cx - hps, cy + hps);
            const ptTL = new Phaser.Math.Vector2(pTL.x, pTL.y - wallHeight);
            const ptTR = new Phaser.Math.Vector2(pTR.x, pTR.y - wallHeight);
            const ptBR = new Phaser.Math.Vector2(pBR.x, pBR.y - wallHeight);
            const ptBL = new Phaser.Math.Vector2(pBL.x, pBL.y - wallHeight);
            // East face: visible when no east segment hides it
            if (!nE) sideFaces.push({ points: [pTR, pBR, ptBR, ptTR], color: woodSide });
            // South face: visible when no south segment hides it
            if (!nS) sideFaces.push({ points: [pBR, pBL, ptBL, ptBR], color: woodFront });
            // West face: inner face exposed when east segment exists
            if (nE && !nW) sideFaces.push({ points: [pBL, pTL, ptTL, ptBL], color: woodSide });
            // North face: inner face exposed when south segment exists
            if (nS && !nN) sideFaces.push({ points: [pTL, pTR, ptTR, ptTL], color: woodFront });
            topFaces.push([ptTL, ptTR, ptBR, ptBL]);
        }

        // Render side faces
        for (const face of sideFaces) {
            graphics.fillStyle(face.color, alpha);
            graphics.fillPoints(face.points, true);
        }

        // Render top faces
        graphics.fillStyle(woodTop, alpha);
        for (const top of topFaces) {
            graphics.fillPoints(top, true);
        }

        // Post decorations only when not a straight segment
        if (!isStraight) {
            const ps = wallThickness * 0.7;
            const hps = ps / 2;
            const pTL = IsoUtils.cartToIso(cx - hps, cy - hps);
            const pTR = IsoUtils.cartToIso(cx + hps, cy - hps);
            const pBR = IsoUtils.cartToIso(cx + hps, cy + hps);
            const pBL = IsoUtils.cartToIso(cx - hps, cy + hps);
            const ptTL = new Phaser.Math.Vector2(pTL.x, pTL.y - wallHeight);
            const ptTR = new Phaser.Math.Vector2(pTR.x, pTR.y - wallHeight);
            const ptBR = new Phaser.Math.Vector2(pBR.x, pBR.y - wallHeight);
            const ptBL = new Phaser.Math.Vector2(pBL.x, pBL.y - wallHeight);

            // Wood grain lines on visible front faces
            const pcx = (ptTL.x + ptBR.x) / 2;
            const pcy = (ptTL.y + ptBR.y) / 2;
            graphics.lineStyle(1, 0x4a2a15, alpha * 0.4);
            graphics.lineBetween(pcx - 2, pcy + wallHeight * 0.3, pcx - 2, pcy + wallHeight * 0.8);
            graphics.lineBetween(pcx + 1, pcy + wallHeight * 0.2, pcx + 1, pcy + wallHeight * 0.7);

            // Sharpened top (pointed stake) — draw faces matching visible pillar sides
            const peakY = pcy - 6;
            // North face of peak (light)
            if (!nN || (nS && !nN)) {
                graphics.fillStyle(0x9b7b5a, alpha);
                graphics.beginPath(); graphics.moveTo(pcx, peakY);
                graphics.lineTo(ptTL.x, ptTL.y); graphics.lineTo(ptTR.x, ptTR.y);
                graphics.closePath(); graphics.fillPath();
            }
            // East face of peak (medium)
            if (!nE) {
                graphics.fillStyle(0x9b7b5a, alpha);
                graphics.beginPath(); graphics.moveTo(pcx, peakY);
                graphics.lineTo(ptTR.x, ptTR.y); graphics.lineTo(ptBR.x, ptBR.y);
                graphics.closePath(); graphics.fillPath();
            }
            // South face of peak (dark)
            if (!nS) {
                graphics.fillStyle(0x7b5b3a, alpha);
                graphics.beginPath(); graphics.moveTo(pcx, peakY);
                graphics.lineTo(ptBR.x, ptBR.y); graphics.lineTo(ptBL.x, ptBL.y);
                graphics.closePath(); graphics.fillPath();
            }
            // West face of peak (medium)
            if (nE && !nW) {
                graphics.fillStyle(0x8b6b4a, alpha);
                graphics.beginPath(); graphics.moveTo(pcx, peakY);
                graphics.lineTo(ptBL.x, ptBL.y); graphics.lineTo(ptTL.x, ptTL.y);
                graphics.closePath(); graphics.fillPath();
            }

            // Rope binding
            const ropeY = pcy + 8;
            graphics.lineStyle(2, 0x8a7a5a, alpha);
            graphics.lineBetween(pcx - 4, ropeY, pcx + 4, ropeY);
            graphics.lineStyle(1, 0x6a5a3a, alpha * 0.6);
            graphics.lineBetween(pcx - 3, ropeY + 2, pcx + 3, ropeY + 2);
        }
    }

    // === LEVEL 2: STONE WALL ===
    private static drawWallLevel2(graphics: Phaser.GameObjects.Graphics, gridX: number, gridY: number, alpha: number, tint: number | null, _owner: string, neighbors: { nN: boolean, nS: boolean, nE: boolean, nW: boolean }) {
        const wallHeight = 17;
        const wallThickness = 0.37;

        // Stone colors - classic grey
        const stoneTop = tint ?? 0xd4c4a8;
        const stoneFront = tint ?? 0xa89878;
        const stoneSide = tint ?? 0x8a7a68;

        const { nN, nS, nE, nW } = neighbors;

        const hw = wallThickness / 2;
        const cx = gridX + 0.5;
        const cy = gridY + 0.5;

        const sideFaces: { points: Phaser.Math.Vector2[], color: number }[] = [];
        const topFaces: Phaser.Math.Vector2[][] = [];

        const addSegment = (x1: number, y1: number, x2: number, y2: number) => {
            const isVertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);
            if (isVertical) {
                const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
                const bl = IsoUtils.cartToIso(x1 - hw, minY), br = IsoUtils.cartToIso(x1 + hw, minY);
                const fl = IsoUtils.cartToIso(x1 - hw, maxY), fr = IsoUtils.cartToIso(x1 + hw, maxY);
                const tbl = new Phaser.Math.Vector2(bl.x, bl.y - wallHeight);
                const tbr = new Phaser.Math.Vector2(br.x, br.y - wallHeight);
                const tfl = new Phaser.Math.Vector2(fl.x, fl.y - wallHeight);
                const tfr = new Phaser.Math.Vector2(fr.x, fr.y - wallHeight);
                sideFaces.push({ points: [br, fr, tfr, tbr], color: stoneSide });
                sideFaces.push({ points: [fr, fl, tfl, tfr], color: stoneFront });
                topFaces.push([tbl, tbr, tfr, tfl]);
            } else {
                const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
                const lt = IsoUtils.cartToIso(minX, y1 - hw), lb = IsoUtils.cartToIso(minX, y1 + hw);
                const rt = IsoUtils.cartToIso(maxX, y1 - hw), rb = IsoUtils.cartToIso(maxX, y1 + hw);
                const tlt = new Phaser.Math.Vector2(lt.x, lt.y - wallHeight);
                const tlb = new Phaser.Math.Vector2(lb.x, lb.y - wallHeight);
                const trt = new Phaser.Math.Vector2(rt.x, rt.y - wallHeight);
                const trb = new Phaser.Math.Vector2(rb.x, rb.y - wallHeight);
                sideFaces.push({ points: [rt, rb, trb, trt], color: stoneSide });
                sideFaces.push({ points: [rb, lb, tlb, trb], color: stoneFront });
                topFaces.push([tlt, trt, trb, tlb]);
            }
        };

        // Straight-through detection: skip pillar for continuous stretches
        const isStraightNS = nN && nS && !nE && !nW;
        const isStraightEW = nE && nW && !nN && !nS;
        const isStraight = isStraightNS || isStraightEW;

        if (isStraight) {
            if (isStraightNS) addSegment(cx, gridY, cx, gridY + 1);
            if (isStraightEW) addSegment(gridX, cy, gridX + 1, cy);
        } else {
            // Half-segments: center to own tile edge to avoid depth overlap at corners
            if (nN) addSegment(cx, cy, cx, gridY);
            if (nS) addSegment(cx, cy, cx, gridY + 1);
            if (nE) addSegment(cx, cy, gridX + 1, cy);
            if (nW) addSegment(cx, cy, gridX, cy);

            // Central pillar with direction-aware faces
            const ps = wallThickness * 0.6;
            const hps = ps / 2;
            const pTL = IsoUtils.cartToIso(cx - hps, cy - hps);
            const pTR = IsoUtils.cartToIso(cx + hps, cy - hps);
            const pBR = IsoUtils.cartToIso(cx + hps, cy + hps);
            const pBL = IsoUtils.cartToIso(cx - hps, cy + hps);
            const ptTL = new Phaser.Math.Vector2(pTL.x, pTL.y - wallHeight);
            const ptTR = new Phaser.Math.Vector2(pTR.x, pTR.y - wallHeight);
            const ptBR = new Phaser.Math.Vector2(pBR.x, pBR.y - wallHeight);
            const ptBL = new Phaser.Math.Vector2(pBL.x, pBL.y - wallHeight);
            if (!nE) sideFaces.push({ points: [pTR, pBR, ptBR, ptTR], color: stoneSide });
            if (!nS) sideFaces.push({ points: [pBR, pBL, ptBL, ptBR], color: stoneFront });
            if (nE && !nW) sideFaces.push({ points: [pBL, pTL, ptTL, ptBL], color: stoneSide });
            if (nS && !nN) sideFaces.push({ points: [pTL, pTR, ptTR, ptTL], color: stoneFront });
            topFaces.push([ptTL, ptTR, ptBR, ptBL]);
        }

        // Render side faces
        for (const face of sideFaces) {
            graphics.fillStyle(face.color, alpha);
            graphics.fillPoints(face.points, true);
        }

        // Render top faces
        graphics.fillStyle(stoneTop, alpha);
        for (const top of topFaces) {
            graphics.fillPoints(top, true);
        }

        // Post decorations only when not a straight segment
        if (!isStraight) {
            const ps = wallThickness * 0.6;
            const hps = ps / 2;
            const ptTL = new Phaser.Math.Vector2(IsoUtils.cartToIso(cx - hps, cy - hps).x, IsoUtils.cartToIso(cx - hps, cy - hps).y - wallHeight);
            const ptTR = new Phaser.Math.Vector2(IsoUtils.cartToIso(cx + hps, cy - hps).x, IsoUtils.cartToIso(cx + hps, cy - hps).y - wallHeight);
            const ptBL = new Phaser.Math.Vector2(IsoUtils.cartToIso(cx - hps, cy + hps).x, IsoUtils.cartToIso(cx - hps, cy + hps).y - wallHeight);
            const ptBR = new Phaser.Math.Vector2(IsoUtils.cartToIso(cx + hps, cy + hps).x, IsoUtils.cartToIso(cx + hps, cy + hps).y - wallHeight);

            // Top highlights
            graphics.lineStyle(1, 0xe8dcc8, alpha * 0.6);
            graphics.lineBetween(ptTL.x, ptTL.y, ptTR.x, ptTR.y);
            graphics.lineBetween(ptTL.x, ptTL.y, ptBL.x, ptBL.y);

            // Junction decoration
            const neighborCount = (nN ? 1 : 0) + (nS ? 1 : 0) + (nE ? 1 : 0) + (nW ? 1 : 0);
            if (neighborCount >= 3) {
                const pcx = (ptTL.x + ptBR.x) / 2;
                const pcy = (ptTL.y + ptBR.y) / 2;
                graphics.fillStyle(0xe8dcc8, alpha);
                graphics.fillCircle(pcx, pcy, 2.5);
            }
        }
    }

    // === LEVEL 3: FORTIFIED DARK STONE ===
    private static drawWallLevel3(graphics: Phaser.GameObjects.Graphics, gridX: number, gridY: number, alpha: number, tint: number | null, _owner: string, neighbors: { nN: boolean, nS: boolean, nE: boolean, nW: boolean }) {
        const wallHeight = 22;
        const wallThickness = 0.45;

        // Dark obsidian fortress colors
        const stoneTop = tint ?? 0x4a4a5a;
        const stoneFront = tint ?? 0x3a3a4a;
        const stoneSide = tint ?? 0x2a2a3a;

        const { nN, nS, nE, nW } = neighbors;

        const hw = wallThickness / 2;
        const cx = gridX + 0.5;
        const cy = gridY + 0.5;

        const sideFaces: { points: Phaser.Math.Vector2[], color: number }[] = [];
        const topFaces: Phaser.Math.Vector2[][] = [];

        const addSegment = (x1: number, y1: number, x2: number, y2: number) => {
            const isVertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);
            if (isVertical) {
                const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
                const bl = IsoUtils.cartToIso(x1 - hw, minY), br = IsoUtils.cartToIso(x1 + hw, minY);
                const fl = IsoUtils.cartToIso(x1 - hw, maxY), fr = IsoUtils.cartToIso(x1 + hw, maxY);
                const tbl = new Phaser.Math.Vector2(bl.x, bl.y - wallHeight);
                const tbr = new Phaser.Math.Vector2(br.x, br.y - wallHeight);
                const tfl = new Phaser.Math.Vector2(fl.x, fl.y - wallHeight);
                const tfr = new Phaser.Math.Vector2(fr.x, fr.y - wallHeight);
                sideFaces.push({ points: [br, fr, tfr, tbr], color: stoneSide });
                sideFaces.push({ points: [fr, fl, tfl, tfr], color: stoneFront });
                topFaces.push([tbl, tbr, tfr, tfl]);
            } else {
                const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
                const lt = IsoUtils.cartToIso(minX, y1 - hw), lb = IsoUtils.cartToIso(minX, y1 + hw);
                const rt = IsoUtils.cartToIso(maxX, y1 - hw), rb = IsoUtils.cartToIso(maxX, y1 + hw);
                const tlt = new Phaser.Math.Vector2(lt.x, lt.y - wallHeight);
                const tlb = new Phaser.Math.Vector2(lb.x, lb.y - wallHeight);
                const trt = new Phaser.Math.Vector2(rt.x, rt.y - wallHeight);
                const trb = new Phaser.Math.Vector2(rb.x, rb.y - wallHeight);
                sideFaces.push({ points: [rt, rb, trb, trt], color: stoneSide });
                sideFaces.push({ points: [rb, lb, tlb, trb], color: stoneFront });
                topFaces.push([tlt, trt, trb, tlb]);
            }
        };

        // Straight-through detection: skip pillar for continuous stretches
        const isStraightNS = nN && nS && !nE && !nW;
        const isStraightEW = nE && nW && !nN && !nS;
        const isStraight = isStraightNS || isStraightEW;

        if (isStraight) {
            if (isStraightNS) addSegment(cx, gridY, cx, gridY + 1);
            if (isStraightEW) addSegment(gridX, cy, gridX + 1, cy);
        } else {
            // Half-segments: center to own tile edge to avoid depth overlap at corners
            if (nN) addSegment(cx, cy, cx, gridY);
            if (nS) addSegment(cx, cy, cx, gridY + 1);
            if (nE) addSegment(cx, cy, gridX + 1, cy);
            if (nW) addSegment(cx, cy, gridX, cy);

            // Central pillar with direction-aware faces
            const ps = wallThickness * 0.7;
            const hps = ps / 2;
            const pTL = IsoUtils.cartToIso(cx - hps, cy - hps);
            const pTR = IsoUtils.cartToIso(cx + hps, cy - hps);
            const pBR = IsoUtils.cartToIso(cx + hps, cy + hps);
            const pBL = IsoUtils.cartToIso(cx - hps, cy + hps);
            const ptTL = new Phaser.Math.Vector2(pTL.x, pTL.y - wallHeight);
            const ptTR = new Phaser.Math.Vector2(pTR.x, pTR.y - wallHeight);
            const ptBR = new Phaser.Math.Vector2(pBR.x, pBR.y - wallHeight);
            const ptBL = new Phaser.Math.Vector2(pBL.x, pBL.y - wallHeight);
            if (!nE) sideFaces.push({ points: [pTR, pBR, ptBR, ptTR], color: stoneSide });
            if (!nS) sideFaces.push({ points: [pBR, pBL, ptBL, ptBR], color: stoneFront });
            if (nE && !nW) sideFaces.push({ points: [pBL, pTL, ptTL, ptBL], color: stoneSide });
            if (nS && !nN) sideFaces.push({ points: [pTL, pTR, ptTR, ptTL], color: stoneFront });
            topFaces.push([ptTL, ptTR, ptBR, ptBL]);
        }

        // Render side faces
        for (const face of sideFaces) {
            graphics.fillStyle(face.color, alpha);
            graphics.fillPoints(face.points, true);
        }

        // Render top faces
        graphics.fillStyle(stoneTop, alpha);
        for (const top of topFaces) {
            graphics.fillPoints(top, true);
        }

        // Post decorations only when not a straight segment
        if (!isStraight) {
            const ps = wallThickness * 0.7;
            const hps = ps / 2;
            const ptTL = new Phaser.Math.Vector2(IsoUtils.cartToIso(cx - hps, cy - hps).x, IsoUtils.cartToIso(cx - hps, cy - hps).y - wallHeight);
            const ptTR = new Phaser.Math.Vector2(IsoUtils.cartToIso(cx + hps, cy - hps).x, IsoUtils.cartToIso(cx + hps, cy - hps).y - wallHeight);
            const ptBL = new Phaser.Math.Vector2(IsoUtils.cartToIso(cx - hps, cy + hps).x, IsoUtils.cartToIso(cx - hps, cy + hps).y - wallHeight);
            const ptBR = new Phaser.Math.Vector2(IsoUtils.cartToIso(cx + hps, cy + hps).x, IsoUtils.cartToIso(cx + hps, cy + hps).y - wallHeight);

            // Top highlights & Gold/Steel trim
            graphics.lineStyle(1, 0xc9a227, alpha * 0.8);
            graphics.lineBetween(ptTL.x, ptTL.y, ptTR.x, ptTR.y);
            graphics.lineBetween(ptTL.x, ptTL.y, ptBL.x, ptBL.y);

            // Stone texture highlights
            graphics.fillStyle(0xffffff, alpha * 0.08);
            const pcx = (ptTL.x + ptBR.x) / 2;
            const pcy = (ptTL.y + ptBR.y) / 2;
            graphics.fillRect(pcx - 4, pcy + 7, 2, 2);
            graphics.fillRect(pcx + 2, pcy + 13, 2, 2);
        }
    }


    // === DRAGON'S BREATH - Subtle Asian-Themed Firecracker Battery ===
    static drawDragonsBreath(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, center: Phaser.Math.Vector2, alpha: number, tint: number | null, building?: any, baseGraphics?: Phaser.GameObjects.Graphics, gridX: number = 0, gridY: number = 0, time: number = 0, _skipBase: boolean = false, onlyBase: boolean = false) {
        const g = baseGraphics || graphics;

        // Firing state - extended salvo time for 16 pods
        const timeSinceFire = building?.lastFireTime ? (time - building.lastFireTime) : 100000;
        const fireRate = 3000; // Full reload cycle
        const salvoActive = timeSinceFire < 800; // Firing phase
        const reloadPhase = timeSinceFire >= 800 ? Math.min(1, (timeSinceFire - 800) / (fireRate - 800)) : 0;

        // === ELEGANT STONE PLATFORM (Subtle Asian Temple Style) ===
        // Main platform - dark slate with subtle red undertone
        const baseColor = tint ?? 0x3a2a2a;
        g.fillStyle(baseColor, alpha);
        g.fillPoints([c1, c2, c3, c4], true);

        // Subtle inner pattern - darker stone tiles
        g.fillStyle(0x2a1a1a, alpha * 0.5);
        const inset = 8;
        const inner1 = new Phaser.Math.Vector2(c1.x, c1.y + inset);
        const inner2 = new Phaser.Math.Vector2(c2.x + inset * 0.5, c2.y);
        const inner3 = new Phaser.Math.Vector2(c3.x, c3.y - inset);
        const inner4 = new Phaser.Math.Vector2(c4.x - inset * 0.5, c4.y);
        g.fillPoints([inner1, inner2, inner3, inner4], true);

        // Elegant gold trim border (single refined line)
        g.lineStyle(2, 0xb8860b, alpha * 0.8);
        g.strokePoints([c1, c2, c3, c4], true, true);

        // Corner ornaments - jade-gold studs
        const corners = [c1, c2, c3, c4];
        for (const corner of corners) {
            g.fillStyle(0x4a6a4a, alpha * 0.9); // Jade green
            g.fillCircle(corner.x, corner.y, 4);
            g.fillStyle(0xb8860b, alpha); // Gold center
            g.fillCircle(corner.x, corner.y, 2);
        }

        // Bamboo accent borders (subtle wooden frame)
        g.lineStyle(1, 0x5a4a3a, alpha * 0.6);
        g.lineBetween(c1.x, c1.y, c2.x, c2.y);
        g.lineBetween(c4.x, c4.y, c3.x, c3.y);

        // If only drawing base (for baking to ground texture), stop here
        if (onlyBase) return;

        // === 16 SILO HOLES (4x4 Grid - evenly spread) ===

        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                // Calculate center of each tile in the 4x4 grid
                const tileGridX = gridX + col + 0.5;
                const tileGridY = gridY + row + 0.5;
                const tileCenter = IsoUtils.cartToIso(tileGridX, tileGridY);

                const podIndex = row * 4 + col;

                // Silo hole (dark pit)
                g.fillStyle(0x1a0a0a, alpha);
                g.fillEllipse(tileCenter.x, tileCenter.y + 2, 14, 7);

                // Silo rim (brass ring)
                g.lineStyle(2, 0x6a4a2a, alpha);
                g.strokeEllipse(tileCenter.x, tileCenter.y + 2, 14, 7);

                // === FIRECRACKER POD STATE ===
                // Staggered firing: each pod fires 40ms apart
                const podFireDelay = podIndex * 40;
                const podTimeSinceFire = timeSinceFire - podFireDelay;

                // States: 
                // -100 to 0: Fuse glowing
                // 0 to 200: Firing (rocket launches)
                // 200 to 800: Empty (pod fired, gone)
                // 800+: Reloading (pod rises from silo)

                const isFuseGlowing = salvoActive && podTimeSinceFire > -100 && podTimeSinceFire <= 0;
                const isFiring = podTimeSinceFire > 0 && podTimeSinceFire < 200;
                const isEmpty = podTimeSinceFire >= 200 && timeSinceFire < 800;
                const isReloading = timeSinceFire >= 800;

                // Calculate pod position (rises from silo during reload)
                let podHeight = 28; // Full height above platform
                let podVisible = true;

                if (isEmpty) {
                    // Pod is gone (fired away)
                    podVisible = false;
                } else if (isReloading) {
                    // Pod rises from silo over reload period
                    // Pods reload in reverse order (last fired = first to reload visually, or same order)
                    const podReloadDelay = podIndex * 50; // Staggered reload
                    const podReloadTime = (timeSinceFire - 800) - podReloadDelay;
                    const reloadDuration = 1500;

                    if (podReloadTime < 0) {
                        podVisible = false;
                    } else if (podReloadTime < reloadDuration) {
                        // Rising animation
                        const riseProgress = podReloadTime / reloadDuration;
                        podHeight = riseProgress * 28;
                        podVisible = true;
                    } else {
                        podHeight = 28;
                        podVisible = true;
                    }
                } else if (isFiring) {
                    // Slight upward recoil during firing
                    const fireProgress = podTimeSinceFire / 200;
                    podHeight = 28 + Math.sin(fireProgress * Math.PI) * 4;
                }

                if (podVisible) {
                    const baseY = tileCenter.y + 2;
                    const topY = baseY - podHeight;

                    // === LARGE FIRECRACKER ROCKET ===
                    const rocketWidth = 10;
                    const rocketHeight = podHeight - 4;

                    // Rocket body (red with gold bands)
                    graphics.fillStyle(0xcc2222, alpha);
                    graphics.fillRect(tileCenter.x - rocketWidth / 2, topY, rocketWidth, rocketHeight);

                    // Paper texture lines
                    graphics.lineStyle(1, 0xaa1111, alpha * 0.5);
                    for (let i = 1; i < 4; i++) {
                        const lineY = topY + (rocketHeight * i / 4);
                        graphics.lineBetween(tileCenter.x - rocketWidth / 2, lineY, tileCenter.x + rocketWidth / 2, lineY);
                    }

                    // Gold decorative bands
                    graphics.fillStyle(0xffd700, alpha);
                    graphics.fillRect(tileCenter.x - rocketWidth / 2 - 1, topY, rocketWidth + 2, 4);
                    graphics.fillRect(tileCenter.x - rocketWidth / 2 - 1, topY + rocketHeight - 4, rocketWidth + 2, 4);

                    // Middle gold band with dragon motif
                    const midY = topY + rocketHeight / 2;
                    graphics.fillStyle(0xb8860b, alpha);
                    graphics.fillRect(tileCenter.x - rocketWidth / 2, midY - 2, rocketWidth, 4);

                    // Tiny dragon/swirl symbol
                    graphics.fillStyle(0x880000, alpha);
                    graphics.fillCircle(tileCenter.x, midY, 2);

                    // Rocket tip (conical - gold/brass)
                    graphics.fillStyle(0xb8860b, alpha);
                    graphics.beginPath();
                    graphics.moveTo(tileCenter.x, topY - 6);
                    graphics.lineTo(tileCenter.x - rocketWidth / 2, topY);
                    graphics.lineTo(tileCenter.x + rocketWidth / 2, topY);
                    graphics.closePath();
                    graphics.fillPath();

                    // Tip highlight
                    graphics.fillStyle(0xffd700, alpha * 0.6);
                    graphics.beginPath();
                    graphics.moveTo(tileCenter.x, topY - 6);
                    graphics.lineTo(tileCenter.x - 2, topY);
                    graphics.lineTo(tileCenter.x, topY - 2);
                    graphics.closePath();
                    graphics.fillPath();

                    // Fuse at top
                    const fuseColor = isFuseGlowing ? 0xff6600 : 0x3a3a3a;
                    graphics.fillStyle(fuseColor, alpha);
                    graphics.fillRect(tileCenter.x - 1, topY - 10, 2, 5);

                    // Fuse spark/glow
                    if (isFuseGlowing) {
                        const sparkIntensity = 0.5 + Math.sin(time / 30 + podIndex) * 0.5;
                        graphics.fillStyle(0xffff00, alpha * sparkIntensity);
                        graphics.fillCircle(tileCenter.x, topY - 10, 3);
                        graphics.fillStyle(0xffffff, alpha * sparkIntensity * 0.5);
                        graphics.fillCircle(tileCenter.x, topY - 10, 1.5);
                    }

                    // === LAUNCH SMOKE FROM SILO ===
                    if (isFiring) {
                        const fireProgress = podTimeSinceFire / 200;
                        const smokeIntensity = Math.sin(fireProgress * Math.PI);

                        // Smoke billowing from silo hole
                        for (let s = 0; s < 5; s++) {
                            const smokeAge = (fireProgress * 5 + s * 0.2) % 1;
                            const smokeX = tileCenter.x + Math.sin(time / 50 + s * 2 + podIndex) * (6 + smokeAge * 10);
                            const smokeY = baseY - smokeAge * 20;
                            const smokeSize = 4 + smokeAge * 8;
                            const smokeAlpha = (1 - smokeAge) * smokeIntensity * 0.6;

                            graphics.fillStyle(0x888888, alpha * smokeAlpha);
                            graphics.fillCircle(smokeX, smokeY, smokeSize);
                        }

                        // Muzzle flash at silo
                        graphics.fillStyle(0xff6600, alpha * smokeIntensity * 0.5);
                        graphics.fillEllipse(tileCenter.x, baseY, 12 + smokeIntensity * 6, 6 + smokeIntensity * 3);
                        graphics.fillStyle(0xffff00, alpha * smokeIntensity * 0.3);
                        graphics.fillEllipse(tileCenter.x, baseY, 8, 4);
                    }
                }

                // === LOADING SMOKE (during reload phase) ===
                if (isReloading) {
                    const podReloadDelay = podIndex * 50;
                    const podReloadTime = (timeSinceFire - 800) - podReloadDelay;

                    if (podReloadTime > 0 && podReloadTime < 500) {
                        const steamProgress = podReloadTime / 500;
                        const steamAlpha = (1 - steamProgress) * 0.3;
                        const steamOffset = Math.sin(time / 100 + podIndex) * 3;

                        graphics.fillStyle(0xaaaaaa, alpha * steamAlpha);
                        graphics.fillCircle(tileCenter.x + steamOffset, tileCenter.y - 5 - steamProgress * 15, 3 + steamProgress * 4);
                    }
                }
            }
        }

        // === SUBTLE AMBIENT EFFECTS ===
        // Small wisps of incense/steam (idle state only)
        if (!salvoActive && reloadPhase >= 1) {
            for (let i = 0; i < 2; i++) {
                const wispsTime = (time / 4000 + i * 0.5) % 1;
                const wispX = center.x + Math.sin(time / 800 + i * 3) * 15;
                const wispY = center.y - 20 - wispsTime * 25;
                const wispAlpha = (1 - wispsTime) * 0.15;

                graphics.fillStyle(0xcccccc, alpha * wispAlpha);
                graphics.fillCircle(wispX, wispY, 2 + wispsTime * 3);
            }
        }
    }

    static drawGenericBuilding(graphics: Phaser.GameObjects.Graphics, c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2, c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2, _center: Phaser.Math.Vector2, info: any, alpha: number, tint: number | null, baseGraphics?: Phaser.GameObjects.Graphics) {
        const color = tint ?? info.color;
        const height = 30 * Math.max(info.width, info.height);
        const t1 = new Phaser.Math.Vector2(c1.x, c1.y - height);
        const t2 = new Phaser.Math.Vector2(c2.x, c2.y - height);
        const t3 = new Phaser.Math.Vector2(c3.x, c3.y - height);
        const t4 = new Phaser.Math.Vector2(c4.x, c4.y - height);

        const g = baseGraphics || graphics;
        g.fillStyle(color, alpha);
        g.fillPoints([c1, c2, c3, c4], true);

        const darkColor = Phaser.Display.Color.IntegerToColor(color).darken(20).color;
        const lightColor = Phaser.Display.Color.IntegerToColor(color).brighten(10).color;

        graphics.fillStyle(darkColor, alpha);
        graphics.fillPoints([c2, c3, t3, t2], true);
        graphics.fillStyle(lightColor, alpha);
        graphics.fillPoints([c3, c4, t4, t3], true);

        graphics.lineStyle(1, 0x000000, 0.3 * alpha);
        graphics.strokePoints([c2, c3, t3, t2], true, true);
        graphics.strokePoints([c3, c4, t4, t3], true, true);

        const topColor = Phaser.Display.Color.IntegerToColor(color).brighten(25).color;
        graphics.fillStyle(topColor, alpha);
        graphics.fillPoints([t1, t2, t3, t4], true);
        graphics.lineStyle(2, 0xffffff, 0.15 * alpha);
        graphics.lineBetween(t1.x, t1.y, t2.x, t2.y);
        graphics.lineBetween(t1.x, t1.y, t4.x, t4.y);
    }

    // ===== SPIKE LAUNCHER (TREBUCHET) =====
    static drawSpikeLauncher(
        graphics: Phaser.GameObjects.Graphics,
        c1: Phaser.Math.Vector2, c2: Phaser.Math.Vector2,
        c3: Phaser.Math.Vector2, c4: Phaser.Math.Vector2,
        center: Phaser.Math.Vector2, alpha: number, tint: number | null,
        building?: any, time: number = 0,
        baseGraphics?: Phaser.GameObjects.Graphics,
        skipBase: boolean = false, onlyBase: boolean = false
    ) {
        const g = baseGraphics || graphics;

        // BOUNCY reload with LOADER PERSON
        // Loader stays visible - sits at lever when ready, pulls lever to fire, loads ball after
        const timeSinceFire = building?.lastFireTime ? (time - building.lastFireTime) : 10000;
        const fireAnimDuration = 3000;

        // Get facing direction early for loader positioning
        const aimAngle = building?.ballistaAngle ?? 0;
        const facingLeft = Math.cos(aimAngle) < 0;
        const dirX = facingLeft ? -1 : 1; // Direction multiplier

        let armAngle = -1.4;
        let showProjectile = true;
        let loaderX = 0; // Default: sitting in CENTER
        let loaderY = 10;
        let showLoader = true;
        let loaderCarrying = false;
        let loaderPulling = false;
        let loaderSitting = true;
        let showFlyingBall = false; // Ball flying from loader to sling
        let flyingBallX = 0;
        let flyingBallY = 0;

        if (timeSinceFire < fireAnimDuration) {
            const t = timeSinceFire / fireAnimDuration;

            if (t < 0.05) {
                // PULL LEVER: Loader pulls lever to fire
                armAngle = -1.4;
                showProjectile = true;
                loaderPulling = true;
                loaderSitting = false;
                loaderX = 0; // Stay in center
                loaderY = 6;
            } else if (t < 0.15) {
                // RELEASE: Fast swing, loader watches
                const releaseT = (t - 0.05) / 0.10;
                armAngle = -1.4 + (1 - Math.pow(1 - releaseT, 2)) * 2.9;
                showProjectile = false;
                loaderSitting = false;
                loaderX = 0;
                loaderY = 8;
            } else if (t < 0.25) {
                // BOUNCE: Damped oscillation
                const bounceT = (t - 0.15) / 0.10;
                const decay = Math.exp(-bounceT * 5);
                armAngle = 1.5 + Math.sin(bounceT * Math.PI * 4) * decay * 0.35;
                showProjectile = false;
                loaderSitting = false;
                loaderX = 0;
                loaderY = 8;
            } else if (t < 0.48) {
                // LOADER WALKS TO ARM TIP (arm tip is in dirX direction when arm is down)
                const walkT = (t - 0.25) / 0.23;
                armAngle = 1.5;
                showProjectile = false;
                loaderCarrying = true;
                loaderSitting = false;
                // Walk from center toward arm tip
                loaderX = walkT * (18 * dirX);
                loaderY = 8 - walkT * 3;
            } else if (t < 0.58) {
                // THROW: Loader throws ball UP into sling
                const throwT = (t - 0.48) / 0.10;
                armAngle = 1.5;
                showProjectile = false;
                loaderSitting = false;
                loaderCarrying = false;
                loaderX = 18 * dirX;
                loaderY = 5;

                // Calculate actual arm tip position when arm is down (armAngle = 1.5)
                // armTipX = pivotX + cos(armAngle - PI/2) * armLength * mirrorX
                // At armAngle=1.5: cos(1.5 - 1.57) = cos(-0.07) ≈ 1, sin(-0.07) ≈ -0.07
                // So arm tip is nearly directly to the side (in dirX direction)
                const frameHeight = 35;
                const armLength = 40;
                const slingDrop = 8;
                const ballOffset = 5;

                // Arm tip is at: center + armLength * dirX horizontally, frameHeight - 2 down from center
                const armTipRelX = Math.cos(1.5 - Math.PI / 2) * armLength * dirX;
                const armTipRelY = -frameHeight + 2 + Math.sin(1.5 - Math.PI / 2) * armLength + slingDrop + ballOffset;

                // Ball starts above loader's head, ends at sling position
                const startBallX = 18 * dirX;
                const startBallY = 5 - 12; // Above loader's head
                const endBallX = armTipRelX;
                const endBallY = armTipRelY;

                showFlyingBall = true;
                // Arc: goes up then curves to sling
                flyingBallX = startBallX + (endBallX - startBallX) * throwT;
                flyingBallY = startBallY + (endBallY - startBallY) * throwT - Math.sin(throwT * Math.PI) * 20;
            } else if (t < 0.62) {
                // CATCH: Ball lands in sling
                armAngle = 1.5;
                showProjectile = true; // Ball now in sling!
                loaderSitting = false;
                loaderCarrying = false;
                loaderX = 18 * dirX;
                loaderY = 5;
            } else if (t < 0.92) {
                // WINCH: Loader walks back to center and operates winch
                const winchT = (t - 0.58) / 0.34;
                armAngle = 1.5 - (1 - Math.pow(1 - winchT, 3)) * 2.9;
                showProjectile = true;
                loaderSitting = false;
                if (winchT < 0.3) {
                    // Walking back to center
                    loaderX = (20 * dirX) * (1 - winchT / 0.3);
                    loaderY = 5 + (winchT / 0.3) * 3;
                } else {
                    // Operating winch at center
                    loaderX = Math.sin((winchT - 0.3) * Math.PI * 8) * 2;
                    loaderY = 8;
                }
            } else {
                // SETTLE & SIT: Loader sits at center
                const settleT = (t - 0.92) / 0.08;
                armAngle = -1.4 + Math.sin(settleT * Math.PI * 2) * 0.12 * (1 - settleT);
                showProjectile = true;
                loaderSitting = true;
                loaderX = 0;
                loaderY = 10;
            }
        } else {
            // IDLE: Loader sitting at center
            loaderSitting = true;
            loaderX = 0;
            loaderY = 10;
        }

        // Facing variables for arm rendering
        const mirrorX = dirX;
        const facingOffset = Math.cos(aimAngle) * 0.15;

        // ===== LEVEL =====
        const level = building?.level ?? 1;
        const isLevel3 = level >= 3;

        // ===== COLORS =====
        const woodDark = tint ?? (isLevel3 ? 0x3a2a20 : 0x5d4037);
        const woodMid = isLevel3 ? 0x4a3830 : 0x795548;
        const woodLight = isLevel3 ? 0x5a4840 : 0x8d6e63;
        const metalDark = isLevel3 ? 0x2a2a2a : 0x424242;
        const metalMid = isLevel3 ? 0x505050 : 0x616161;
        const ropeTan = 0xb8a07a;
        const stoneGray = isLevel3 ? 0x606060 : 0x757575;
        const stoneDark = isLevel3 ? 0x3a3a3a : 0x5a5a5a;
        const ironPlate = 0x555555;

        // ===== BASE PLATFORM (ground layer) =====
        if (!skipBase) {
            if (isLevel3) {
                // Iron-plated stone foundation
                g.fillStyle(0x3a3a3a, alpha);
                g.fillPoints([c1, c2, c3, c4], true);
                g.fillStyle(ironPlate, alpha * 0.5);
                g.fillPoints([c1, c2, c3, c4], true);
                g.lineStyle(2, 0x666666, alpha * 0.9);
                g.lineBetween(c1.x, c1.y, c2.x, c2.y);
                g.lineBetween(c1.x, c1.y, c4.x, c4.y);
                g.lineStyle(2, 0x333333, alpha * 0.9);
                g.lineBetween(c2.x, c2.y, c3.x, c3.y);
                g.lineBetween(c3.x, c3.y, c4.x, c4.y);
                g.fillStyle(0x777777, alpha * 0.8);
                g.fillCircle(c1.x, c1.y, 3.5);
                g.fillCircle(c2.x, c2.y, 3.5);
                g.fillCircle(c3.x, c3.y, 3.5);
                g.fillCircle(c4.x, c4.y, 3.5);
                g.lineStyle(1, 0x4a4a4a, alpha * 0.4);
                g.lineBetween(c1.x, c1.y, c3.x, c3.y);
                g.lineBetween(c2.x, c2.y, c4.x, c4.y);
            } else {
                g.fillStyle(stoneDark, alpha);
                g.fillPoints([c1, c2, c3, c4], true);
                g.lineStyle(2, stoneGray, alpha * 0.8);
                g.lineBetween(c1.x, c1.y, c2.x, c2.y);
                g.lineBetween(c1.x, c1.y, c4.x, c4.y);
                g.lineStyle(2, 0x4a4a4a, alpha * 0.8);
                g.lineBetween(c2.x, c2.y, c3.x, c3.y);
                g.lineBetween(c3.x, c3.y, c4.x, c4.y);

                g.fillStyle(woodDark, alpha * 0.7);
                const inset = 6;
                const m1 = new Phaser.Math.Vector2(c1.x, c1.y + inset);
                const m2 = new Phaser.Math.Vector2(c2.x + inset * 1.5, c2.y);
                const m3 = new Phaser.Math.Vector2(c3.x, c3.y - inset);
                const m4 = new Phaser.Math.Vector2(c4.x - inset * 1.5, c4.y);
                g.fillPoints([m1, m2, m3, m4], true);

                g.lineStyle(1, 0x4a3020, alpha * 0.5);
                for (let i = 1; i < 4; i++) {
                    const t = i / 4;
                    const startX = m1.x + (m2.x - m1.x) * t;
                    const startY = m1.y + (m2.y - m1.y) * t;
                    const endX = m4.x + (m3.x - m4.x) * t;
                    const endY = m4.y + (m3.y - m4.y) * t;
                    g.lineBetween(startX, startY, endX, endY);
                }

                g.fillStyle(metalDark, alpha);
                g.fillCircle(c1.x, c1.y, 3);
                g.fillCircle(c2.x, c2.y, 3);
                g.fillCircle(c3.x, c3.y, 3);
                g.fillCircle(c4.x, c4.y, 3);
            }
        }

        if (onlyBase) return;

        // ===== FRAME (A-Frame supports) =====
        const frameHeight = 35;
        const frameWidth = 18;

        // Left support leg
        graphics.fillStyle(woodDark, alpha);
        graphics.beginPath();
        graphics.moveTo(center.x - frameWidth, center.y + 8);
        graphics.lineTo(center.x - 6, center.y - frameHeight);
        graphics.lineTo(center.x - 3, center.y - frameHeight);
        graphics.lineTo(center.x - frameWidth + 4, center.y + 8);
        graphics.closePath();
        graphics.fillPath();

        // Right support leg
        graphics.beginPath();
        graphics.moveTo(center.x + frameWidth, center.y + 8);
        graphics.lineTo(center.x + 6, center.y - frameHeight);
        graphics.lineTo(center.x + 3, center.y - frameHeight);
        graphics.lineTo(center.x + frameWidth - 4, center.y + 8);
        graphics.closePath();
        graphics.fillPath();

        if (isLevel3) {
            // Iron reinforcement plates on legs
            graphics.fillStyle(ironPlate, alpha * 0.7);
            graphics.fillRect(center.x - frameWidth + 1, center.y, 5, 6);
            graphics.fillRect(center.x + frameWidth - 6, center.y, 5, 6);
            graphics.lineStyle(2, ironPlate, alpha * 0.6);
            graphics.lineBetween(center.x - 12, center.y - 5, center.x + 12, center.y - 5);
        }

        // Cross beam
        graphics.fillStyle(isLevel3 ? metalMid : woodMid, alpha);
        graphics.fillRect(center.x - 8, center.y - frameHeight - 2, 16, 5);

        // Pivot point (metal hub)
        graphics.fillStyle(metalMid, alpha);
        graphics.fillCircle(center.x, center.y - frameHeight + 2, isLevel3 ? 6 : 5);
        graphics.fillStyle(metalDark, alpha);
        graphics.fillCircle(center.x, center.y - frameHeight + 2, isLevel3 ? 4 : 3);

        if (isLevel3) {
            // Gear teeth around pivot
            graphics.lineStyle(1, 0x777777, alpha * 0.6);
            for (let i = 0; i < 8; i++) {
                const ga = (i / 8) * Math.PI * 2;
                graphics.lineBetween(
                    center.x + Math.cos(ga) * 5, center.y - frameHeight + 2 + Math.sin(ga) * 5,
                    center.x + Math.cos(ga) * 7, center.y - frameHeight + 2 + Math.sin(ga) * 7
                );
            }
        }

        // ===== THROWING ARM =====
        const armLength = 40;
        // Apply facing offset so trebuchet leans toward target
        const armPivotX = center.x + facingOffset * 30;
        const armPivotY = center.y - frameHeight + 2;

        // Calculate arm endpoints based on angle (mirrorX flips arm direction)
        const armTipX = armPivotX + Math.cos(armAngle - Math.PI / 2) * armLength * mirrorX;
        const armTipY = armPivotY + Math.sin(armAngle - Math.PI / 2) * armLength;
        const counterweightX = armPivotX - Math.cos(armAngle - Math.PI / 2) * (armLength * 0.4) * mirrorX;
        const counterweightY = armPivotY - Math.sin(armAngle - Math.PI / 2) * (armLength * 0.4);

        // Arm beam
        graphics.lineStyle(5, woodMid, alpha);
        graphics.lineBetween(counterweightX, counterweightY, armTipX, armTipY);

        // Arm wood grain highlight
        graphics.lineStyle(2, woodLight, alpha * 0.5);
        graphics.lineBetween(counterweightX, counterweightY - 1, armTipX, armTipY - 1);

        // Counterweight
        graphics.fillStyle(stoneGray, alpha);
        graphics.fillRect(counterweightX - 8, counterweightY - 5, 16, 12);
        graphics.fillStyle(stoneDark, alpha);
        graphics.fillRect(counterweightX - 6, counterweightY - 3, 12, 8);

        // Sling/rope at arm tip
        graphics.lineStyle(2, ropeTan, alpha);
        const slingDrop = 8;
        graphics.lineBetween(armTipX - 3, armTipY, armTipX, armTipY + slingDrop);
        graphics.lineBetween(armTipX + 3, armTipY, armTipX, armTipY + slingDrop);

        // SPIKY PROJECTILE in sling (only visible when loaded)
        if (showProjectile) {
            const spX = armTipX;
            const spY = armTipY + slingDrop + 5;
            const spikeScale = isLevel3 ? 1.2 : 1.0;
            const coreColor = isLevel3 ? 0x333333 : 0x555555;
            const spikeColor = isLevel3 ? 0x888888 : 0xaaaaaa;
            const highlightColor = isLevel3 ? 0xbbbbbb : 0xcccccc;
            const sp = (v: number) => Math.round(v * spikeScale);

            graphics.fillStyle(coreColor, alpha);
            graphics.fillCircle(spX, spY, 4 * spikeScale);

            graphics.fillStyle(spikeColor, alpha);
            graphics.fillTriangle(spX, spY - sp(4), spX - sp(2), spY - sp(10), spX + sp(2), spY - sp(10));
            graphics.fillTriangle(spX, spY + sp(4), spX - sp(2), spY + sp(10), spX + sp(2), spY + sp(10));
            graphics.fillTriangle(spX - sp(4), spY, spX - sp(10), spY - sp(2), spX - sp(10), spY + sp(2));
            graphics.fillTriangle(spX + sp(4), spY, spX + sp(10), spY - sp(2), spX + sp(10), spY + sp(2));
            graphics.fillTriangle(spX - sp(3), spY - sp(3), spX - sp(7), spY - sp(7), spX - sp(5), spY - sp(5));
            graphics.fillTriangle(spX + sp(3), spY - sp(3), spX + sp(7), spY - sp(7), spX + sp(5), spY - sp(5));
            graphics.fillTriangle(spX - sp(3), spY + sp(3), spX - sp(7), spY + sp(7), spX - sp(5), spY + sp(5));
            graphics.fillTriangle(spX + sp(3), spY + sp(3), spX + sp(7), spY + sp(7), spX + sp(5), spY + sp(5));

            graphics.fillStyle(highlightColor, alpha * 0.8);
            graphics.fillTriangle(spX - 1, spY - sp(5), spX, spY - sp(9), spX + 1, spY - sp(9));
            graphics.fillTriangle(spX - sp(5), spY - 1, spX - sp(9), spY, spX - sp(9), spY + 1);

            if (isLevel3) {
                graphics.fillStyle(0xcc3300, alpha * 0.6);
                graphics.fillCircle(spX, spY - sp(10), 1.5);
                graphics.fillCircle(spX, spY + sp(10), 1.5);
                graphics.fillCircle(spX - sp(10), spY, 1.5);
                graphics.fillCircle(spX + sp(10), spY, 1.5);
            }
        }

        // ===== ROPE WINCH (decoration) =====
        graphics.fillStyle(woodDark, alpha);
        graphics.fillRect(center.x + 12, center.y - 5, 8, 10);
        graphics.lineStyle(1, ropeTan, alpha * 0.8);
        for (let i = 0; i < 4; i++) {
            graphics.strokeCircle(center.x + 16, center.y - 2 + i * 2, 3);
        }

        // ===== SPIKE RACK (on right side) =====
        if (isLevel3) {
            graphics.fillStyle(ironPlate, alpha);
            graphics.fillRect(center.x + 17, center.y - 3, 6, 15);
            graphics.lineStyle(1, 0x777777, alpha * 0.6);
            graphics.strokeRect(center.x + 17, center.y - 3, 6, 15);
            graphics.fillStyle(0x888888, alpha);
            graphics.fillTriangle(center.x + 20, center.y - 8, center.x + 17, center.y + 1, center.x + 23, center.y + 1);
            graphics.fillTriangle(center.x + 20, center.y - 5, center.x + 16, center.y + 4, center.x + 24, center.y + 4);
            graphics.fillTriangle(center.x + 20, center.y - 2, center.x + 15, center.y + 7, center.x + 25, center.y + 7);
            graphics.fillStyle(0xcc3300, alpha * 0.5);
            graphics.fillCircle(center.x + 20, center.y - 8, 1.5);
            graphics.fillCircle(center.x + 20, center.y - 5, 1.5);
        } else {
            graphics.fillStyle(woodDark, alpha);
            graphics.fillRect(center.x + 18, center.y - 2, 4, 14);
            graphics.fillStyle(0xaaaaaa, alpha);
            graphics.fillTriangle(center.x + 20, center.y - 6, center.x + 18, center.y + 2, center.x + 22, center.y + 2);
            graphics.fillTriangle(center.x + 20, center.y - 3, center.x + 17, center.y + 5, center.x + 23, center.y + 5);
            graphics.fillTriangle(center.x + 20, center.y, center.x + 16, center.y + 8, center.x + 24, center.y + 8);
            graphics.fillStyle(0xcccccc, alpha * 0.7);
            graphics.fillTriangle(center.x + 19, center.y - 5, center.x + 19, center.y - 1, center.x + 21, center.y - 1);
        }

        // ===== SPIKE AMMO PILE (left side - bigger and spikier) =====
        // Metal core balls with spikes
        graphics.fillStyle(0x666666, alpha);
        graphics.fillCircle(center.x - 14, center.y + 6, 5);
        graphics.fillCircle(center.x - 20, center.y + 8, 4);
        graphics.fillCircle(center.x - 10, center.y + 9, 4);
        graphics.fillCircle(center.x - 16, center.y + 10, 3);

        // LOTS of spikes sticking out of pile
        graphics.fillStyle(0xaaaaaa, alpha);
        // From first ball
        graphics.fillTriangle(center.x - 14, center.y + 1, center.x - 16, center.y + 5, center.x - 12, center.y + 5);
        graphics.fillTriangle(center.x - 10, center.y + 4, center.x - 13, center.y + 7, center.x - 11, center.y + 8);
        graphics.fillTriangle(center.x - 18, center.y + 4, center.x - 15, center.y + 7, center.x - 17, center.y + 8);
        // From second ball
        graphics.fillTriangle(center.x - 20, center.y + 3, center.x - 22, center.y + 7, center.x - 18, center.y + 7);
        graphics.fillTriangle(center.x - 24, center.y + 6, center.x - 21, center.y + 9, center.x - 23, center.y + 10);
        // From third ball
        graphics.fillTriangle(center.x - 6, center.y + 7, center.x - 9, center.y + 10, center.x - 7, center.y + 11);
        graphics.fillTriangle(center.x - 10, center.y + 5, center.x - 12, center.y + 9, center.x - 8, center.y + 9);
        // Highlights
        graphics.fillStyle(0xcccccc, alpha * 0.6);
        graphics.fillTriangle(center.x - 13, center.y + 2, center.x - 15, center.y + 4, center.x - 12, center.y + 4);

        // ===== SCATTERED SPIKES ON GROUND =====
        graphics.fillStyle(0x888888, alpha * 0.8);
        // Small spikes scattered around base
        graphics.fillTriangle(center.x + 8, center.y + 10, center.x + 6, center.y + 14, center.x + 10, center.y + 14);
        graphics.fillTriangle(center.x - 4, center.y + 12, center.x - 6, center.y + 16, center.x - 2, center.y + 16);
        graphics.fillTriangle(center.x + 3, center.y + 14, center.x + 1, center.y + 18, center.x + 5, center.y + 18);

        // ===== LOADER PERSON (always visible) =====
        if (showLoader) {
            const lx = center.x + loaderX;
            const ly = center.y + loaderY;

            if (loaderSitting) {
                // SITTING pose (shorter, legs bent)
                graphics.fillStyle(0x8b6914, alpha);
                graphics.fillRect(lx - 3, ly - 2, 6, 5);
                graphics.fillStyle(0xdeb887, alpha);
                graphics.fillCircle(lx, ly - 5, 3);
                graphics.fillStyle(0x654321, alpha);
                graphics.fillRect(lx - 4, ly + 3, 3, 3);
                graphics.fillRect(lx + 1, ly + 3, 3, 3);
                graphics.fillStyle(0xdeb887, alpha);
                graphics.fillRect(lx - 5, ly - 1, 2, 3);
                graphics.fillRect(lx + 3, ly - 1, 2, 3);
            } else if (loaderPulling) {
                // PULLING LEVER pose
                graphics.fillStyle(0x8b6914, alpha);
                graphics.fillRect(lx - 3, ly - 4, 6, 8);
                graphics.fillStyle(0xdeb887, alpha);
                graphics.fillCircle(lx, ly - 7, 3);
                graphics.fillStyle(0x654321, alpha);
                graphics.fillRect(lx - 3, ly + 4, 2, 5);
                graphics.fillRect(lx + 1, ly + 4, 2, 5);
                graphics.fillStyle(0xdeb887, alpha);
                graphics.fillRect(lx - 6, ly - 5, 3, 2);
                graphics.fillRect(lx + 3, ly - 5, 3, 2);
                graphics.fillStyle(0x5d4037, alpha);
                graphics.fillRect(lx - 8, ly - 6, 2, 8);
            } else if (loaderCarrying) {
                // CARRYING spike ball
                graphics.fillStyle(0x8b6914, alpha);
                graphics.fillRect(lx - 3, ly - 4, 6, 8);
                graphics.fillStyle(0xdeb887, alpha);
                graphics.fillCircle(lx, ly - 7, 3);
                graphics.fillStyle(0x654321, alpha);
                graphics.fillRect(lx - 3, ly + 4, 2, 5);
                graphics.fillRect(lx + 1, ly + 4, 2, 5);
                graphics.fillStyle(0xdeb887, alpha);
                graphics.fillRect(lx - 5, ly - 6, 2, 4);
                graphics.fillRect(lx + 3, ly - 6, 2, 4);
                graphics.fillStyle(0x555555, alpha);
                graphics.fillCircle(lx, ly - 12, 3);
                graphics.fillStyle(0xaaaaaa, alpha);
                graphics.fillTriangle(lx, ly - 15, lx - 1, ly - 18, lx + 1, ly - 18);
                graphics.fillTriangle(lx - 3, ly - 12, lx - 6, ly - 13, lx - 6, ly - 11);
                graphics.fillTriangle(lx + 3, ly - 12, lx + 6, ly - 13, lx + 6, ly - 11);
                graphics.fillTriangle(lx, ly - 9, lx - 1, ly - 6, lx + 1, ly - 6);
            } else {
                // STANDING/OPERATING WINCH
                graphics.fillStyle(0x8b6914, alpha);
                graphics.fillRect(lx - 3, ly - 4, 6, 8);
                graphics.fillStyle(0xdeb887, alpha);
                graphics.fillCircle(lx, ly - 7, 3);
                graphics.fillStyle(0x654321, alpha);
                graphics.fillRect(lx - 3, ly + 4, 2, 5);
                graphics.fillRect(lx + 1, ly + 4, 2, 5);
                graphics.fillStyle(0xdeb887, alpha);
                graphics.fillRect(lx - 5, ly - 2, 2, 4);
                graphics.fillRect(lx + 3, ly - 2, 2, 4);
            }
        }

        // ===== FLYING BALL (during throw animation) =====
        if (showFlyingBall) {
            const bx = center.x + flyingBallX;
            const by = center.y + flyingBallY;

            // Metal core
            graphics.fillStyle(0x555555, alpha);
            graphics.fillCircle(bx, by, 3);

            // Spikes
            graphics.fillStyle(0xaaaaaa, alpha);
            graphics.fillTriangle(bx, by - 3, bx - 1, by - 7, bx + 1, by - 7);
            graphics.fillTriangle(bx, by + 3, bx - 1, by + 7, bx + 1, by + 7);
            graphics.fillTriangle(bx - 3, by, bx - 7, by - 1, bx - 7, by + 1);
            graphics.fillTriangle(bx + 3, by, bx + 7, by - 1, bx + 7, by + 1);
        }
    }
}
