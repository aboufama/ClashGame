
import Phaser from 'phaser';
import { OBSTACLE_DEFINITIONS, type ObstacleType } from '../config/GameDefinitions';
import { IsoUtils } from '../utils/IsoUtils';

const OBSTACLES = OBSTACLE_DEFINITIONS as any;

export class ObstacleRenderer {
    static drawObstacle(graphics: Phaser.GameObjects.Graphics, obstacle: { type: ObstacleType, gridX: number, gridY: number, animOffset: number }, time: number = 0) {
        const info = OBSTACLES[obstacle.type];
        const center = IsoUtils.cartToIso(obstacle.gridX + info.width / 2, obstacle.gridY + info.height / 2);

        graphics.clear();

        switch (obstacle.type) {
            case 'rock_small':
                this.drawSmallRock(graphics, center);
                break;
            case 'rock_large':
                this.drawLargeRock(graphics, center);
                break;
            case 'tree_oak':
                this.drawOakTree(graphics, center, time + obstacle.animOffset);
                break;
            case 'tree_pine':
                this.drawPineTree(graphics, center, time + obstacle.animOffset);
                break;
            case 'grass_patch':
                this.drawGrassPatch(graphics, center, time + obstacle.animOffset);
                break;
        }
    }

    private static drawSmallRock(graphics: Phaser.GameObjects.Graphics, center: Phaser.Math.Vector2) {
        const x = center.x;
        const y = center.y;

        // Ground contact shadow (very subtle, touching the rock)
        graphics.fillStyle(0x3a3a3a, 0.25);
        graphics.fillEllipse(x, y + 2, 16, 5);

        // Flat stone base sitting ON the ground (isometric diamond shape)
        graphics.fillStyle(0x6a6a6a, 1);
        graphics.beginPath();
        graphics.moveTo(x, y - 4); // top
        graphics.lineTo(x + 10, y + 1); // right
        graphics.lineTo(x, y + 6); // bottom
        graphics.lineTo(x - 10, y + 1); // left
        graphics.closePath();
        graphics.fillPath();

        // Top surface (lighter, slightly raised)
        graphics.fillStyle(0x8a8a8a, 1);
        graphics.beginPath();
        graphics.moveTo(x, y - 6); // top
        graphics.lineTo(x + 8, y - 1); // right
        graphics.lineTo(x, y + 3); // bottom
        graphics.lineTo(x - 8, y - 1); // left
        graphics.closePath();
        graphics.fillPath();

        // Highlight on top-left edge
        graphics.fillStyle(0x9a9a9a, 0.7);
        graphics.beginPath();
        graphics.moveTo(x - 6, y - 2);
        graphics.lineTo(x, y - 5);
        graphics.lineTo(x + 2, y - 3);
        graphics.lineTo(x - 4, y);
        graphics.closePath();
        graphics.fillPath();

        // Small texture details (crevices)
        graphics.lineStyle(1, 0x5a5a5a, 0.6);
        graphics.lineBetween(x - 3, y, x + 3, y + 1);
    }

    private static drawLargeRock(graphics: Phaser.GameObjects.Graphics, center: Phaser.Math.Vector2) {
        const x = center.x;
        const y = center.y;

        // Ground contact shadow (subtle, directly under rocks)
        graphics.fillStyle(0x3a3a3a, 0.2);
        graphics.fillEllipse(x, y + 6, 40, 12);

        // Main stone slab (flat isometric, sitting on ground)
        graphics.fillStyle(0x5a5a5a, 1);
        graphics.beginPath();
        graphics.moveTo(x, y - 8); // top
        graphics.lineTo(x + 18, y); // right
        graphics.lineTo(x, y + 10); // bottom
        graphics.lineTo(x - 18, y); // left
        graphics.closePath();
        graphics.fillPath();

        // Top surface of main slab (lighter)
        graphics.fillStyle(0x7a7a7a, 1);
        graphics.beginPath();
        graphics.moveTo(x, y - 10); // top
        graphics.lineTo(x + 15, y - 2); // right
        graphics.lineTo(x, y + 6); // bottom
        graphics.lineTo(x - 15, y - 2); // left
        graphics.closePath();
        graphics.fillPath();

        // Second smaller stone (overlapping, slight offset)
        graphics.fillStyle(0x6a6a6a, 1);
        graphics.beginPath();
        graphics.moveTo(x + 8, y - 12); // top
        graphics.lineTo(x + 18, y - 6); // right
        graphics.lineTo(x + 10, y); // bottom
        graphics.lineTo(x, y - 6); // left
        graphics.closePath();
        graphics.fillPath();

        // Top of second stone
        graphics.fillStyle(0x8a8a8a, 1);
        graphics.beginPath();
        graphics.moveTo(x + 8, y - 14);
        graphics.lineTo(x + 16, y - 8);
        graphics.lineTo(x + 10, y - 3);
        graphics.lineTo(x + 2, y - 8);
        graphics.closePath();
        graphics.fillPath();

        // Third small stone (bottom left area)
        graphics.fillStyle(0x5a5a5a, 1);
        graphics.beginPath();
        graphics.moveTo(x - 10, y + 2);
        graphics.lineTo(x - 4, y + 6);
        graphics.lineTo(x - 8, y + 10);
        graphics.lineTo(x - 14, y + 6);
        graphics.closePath();
        graphics.fillPath();

        // Highlight on main stone
        graphics.fillStyle(0x9a9a9a, 0.6);
        graphics.beginPath();
        graphics.moveTo(x - 10, y - 4);
        graphics.lineTo(x, y - 8);
        graphics.lineTo(x + 4, y - 6);
        graphics.lineTo(x - 6, y - 2);
        graphics.closePath();
        graphics.fillPath();

        // Moss patch between stones
        graphics.fillStyle(0x4a6a4a, 0.5);
        graphics.fillCircle(x - 4, y + 3, 3);
        graphics.fillCircle(x + 6, y - 3, 2);

        // Crevice details
        graphics.lineStyle(1, 0x4a4a4a, 0.5);
        graphics.lineBetween(x - 8, y, x + 4, y + 2);
        graphics.lineBetween(x + 2, y - 4, x + 8, y - 2);
    }

    private static drawOakTree(graphics: Phaser.GameObjects.Graphics, center: Phaser.Math.Vector2, time: number) {
        const x = center.x;
        const y = center.y;
        const sway = Math.sin(time / 800) * 2;

        // Shadow
        graphics.fillStyle(0x333333, 0.3);
        graphics.fillEllipse(x + 5, y + 20, 40, 16);

        // Trunk
        graphics.fillStyle(0x5a3a2a, 1);
        graphics.beginPath();
        graphics.moveTo(x - 6, y + 15);
        graphics.lineTo(x - 4 + sway * 0.3, y - 15);
        graphics.lineTo(x + 4 + sway * 0.3, y - 15);
        graphics.lineTo(x + 6, y + 15);
        graphics.closePath();
        graphics.fillPath();

        // Trunk bark detail
        graphics.lineStyle(1, 0x4a2a1a, 0.6);
        graphics.lineBetween(x - 2, y + 10, x - 1 + sway * 0.2, y - 10);
        graphics.lineBetween(x + 2, y + 12, x + 1 + sway * 0.2, y - 8);

        // Foliage layers (bottom to top)
        const foliageColors = [0x2a6a2a, 0x3a8a3a, 0x4a9a4a];
        const foliageLayers = [
            { yOff: -20, size: 24, sway: sway * 0.5 },
            { yOff: -30, size: 20, sway: sway * 0.7 },
            { yOff: -40, size: 16, sway: sway * 1.0 }
        ];

        foliageLayers.forEach((layer, i) => {
            graphics.fillStyle(foliageColors[i], 1);
            graphics.fillEllipse(x + layer.sway, y + layer.yOff, layer.size, layer.size * 0.6);
        });

        // Highlight spots on top layer
        graphics.fillStyle(0x5aaa5a, 0.5);
        graphics.fillCircle(x - 4 + sway, y - 42, 4);
        graphics.fillCircle(x + 6 + sway, y - 38, 3);
    }

    private static drawPineTree(graphics: Phaser.GameObjects.Graphics, center: Phaser.Math.Vector2, time: number) {
        const x = center.x;
        const y = center.y;
        const sway = Math.sin(time / 700) * 1.5;

        // Shadow
        graphics.fillStyle(0x333333, 0.3);
        graphics.fillEllipse(x + 3, y + 12, 20, 8);

        // Trunk
        graphics.fillStyle(0x5a3a2a, 1);
        graphics.beginPath();
        graphics.moveTo(x - 3, y + 10);
        graphics.lineTo(x - 2 + sway * 0.2, y - 10);
        graphics.lineTo(x + 2 + sway * 0.2, y - 10);
        graphics.lineTo(x + 3, y + 10);
        graphics.closePath();
        graphics.fillPath();

        // Pine layers (triangular)
        const pineColors = [0x1a5a2a, 0x2a6a3a, 0x3a7a4a];
        const layers = [
            { yOff: -5, width: 18, height: 12, sway: sway * 0.3 },
            { yOff: -15, width: 14, height: 12, sway: sway * 0.6 },
            { yOff: -25, width: 10, height: 12, sway: sway * 0.9 },
            { yOff: -34, width: 6, height: 10, sway: sway * 1.2 }
        ];

        layers.forEach((layer, i) => {
            graphics.fillStyle(pineColors[Math.min(i, 2)], 1);
            graphics.beginPath();
            graphics.moveTo(x + layer.sway, y + layer.yOff - layer.height);
            graphics.lineTo(x + layer.width / 2 + layer.sway * 0.5, y + layer.yOff);
            graphics.lineTo(x - layer.width / 2 + layer.sway * 0.5, y + layer.yOff);
            graphics.closePath();
            graphics.fillPath();
        });
    }

    private static drawGrassPatch(graphics: Phaser.GameObjects.Graphics, center: Phaser.Math.Vector2, time: number) {
        const x = center.x;
        const y = center.y;

        // Draw multiple grass blades
        for (let i = 0; i < 8; i++) {
            const bx = x + (i - 4) * 4 + Math.sin(i * 2) * 3;
            const by = y + Math.cos(i * 3) * 4;
            const sway = Math.sin(time / 500 + i * 0.5) * 2;
            const height = 10 + Math.sin(i * 1.5) * 4;

            const grassColor = i % 2 === 0 ? 0x4a8a4a : 0x5a9a5a;
            graphics.lineStyle(2, grassColor, 0.9);
            graphics.beginPath();
            graphics.moveTo(bx, by);
            graphics.lineTo(bx + sway, by - height);
            graphics.strokePath();
        }

        // Ground accent
        graphics.fillStyle(0x3a6a3a, 0.3);
        graphics.fillEllipse(x, y + 2, 16, 6);
    }
}
