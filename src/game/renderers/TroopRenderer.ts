import Phaser from 'phaser';

export class TroopRenderer {
    static drawTroopVisual(graphics: Phaser.GameObjects.Graphics, type: 'warrior' | 'archer' | 'giant' | 'ward' | 'recursion' | 'ram' | 'stormmage' | 'golem' | 'sharpshooter' | 'mobilemortar' | 'davincitank' | 'phalanx' | 'romanwarrior', owner: 'PLAYER' | 'ENEMY', facingAngle: number = 0, isMoving: boolean = true, slamOffset: number = 0, bowDrawProgress: number = 0, mortarRecoil: number = 0, isDeactivated: boolean = false, phalanxSpearOffset: number = 0, troopLevel: number = 1) {
        const isPlayer = owner === 'PLAYER';

        switch (type) {
            case 'warrior':
                TroopRenderer.drawWarrior(graphics, isPlayer, isMoving);
                break;
            case 'archer':
                TroopRenderer.drawArcher(graphics, isPlayer, isMoving, facingAngle);
                break;
            case 'giant':
                TroopRenderer.drawGiant(graphics, isPlayer, isMoving);
                break;
            case 'golem':
                TroopRenderer.drawGolem(graphics, isPlayer, isMoving, slamOffset);
                break;
            case 'sharpshooter':
                TroopRenderer.drawSharpshooter(graphics, isPlayer, isMoving, facingAngle, bowDrawProgress);
                break;
            case 'mobilemortar':
                TroopRenderer.drawMobileMortar(graphics, isPlayer, isMoving, facingAngle, mortarRecoil);
                break;
            case 'ward':
                TroopRenderer.drawWard(graphics, isPlayer);
                break;
            case 'recursion':
                TroopRenderer.drawRecursion(graphics, isPlayer);
                break;
            case 'ram':
                TroopRenderer.drawRam(graphics, isPlayer, isMoving, facingAngle, troopLevel);
                break;
            case 'stormmage':
                TroopRenderer.drawStormMage(graphics, isPlayer);
                break;
            case 'davincitank':
                TroopRenderer.drawDaVinciTank(graphics, isPlayer, isMoving, isDeactivated, facingAngle);
                break;
            case 'phalanx':
                TroopRenderer.drawPhalanx(graphics, isPlayer, isMoving, facingAngle, phalanxSpearOffset);
                break;
            case 'romanwarrior':
                TroopRenderer.drawRomanSoldier(graphics, isPlayer, isMoving, facingAngle, false, 0);
                break;
        }

        // Outline (skip for troops with detailed custom shapes)
        if (type !== 'warrior' && type !== 'archer' && type !== 'giant' && type !== 'ram' && type !== 'golem' && type !== 'sharpshooter' && type !== 'mobilemortar' && type !== 'davincitank' && type !== 'phalanx' && type !== 'romanwarrior') {
            graphics.lineStyle(1, 0x000000, 0.5);
            const radius = type === 'ward' ? 8 : 8;
            graphics.strokeCircle(0, type === 'ward' ? 0 : -1, radius);
        }

    }

    private static drawWarrior(graphics: Phaser.GameObjects.Graphics, isPlayer: boolean, isMoving: boolean) {
        // WARRIOR - Same style as Ram warriors but standalone with sword and shield
        const now = Date.now();
        const runPhase = isMoving ? (now % 300) / 300 : 0;
        const runBob = isMoving ? Math.sin(runPhase * Math.PI * 2) * 3 : 0;
        const legKick = isMoving ? Math.sin(runPhase * Math.PI * 2) * 3 : 0;

        const skinColor = isPlayer ? 0xdeb887 : 0xc9a66b;
        const armorColor = isPlayer ? 0x8b4513 : 0x654321;
        const armorDark = isPlayer ? 0x5c3317 : 0x4a2f1a;

        // Shadow
        graphics.fillStyle(0x000000, 0.25);
        graphics.fillEllipse(0, 12, 10, 5);

        // Running legs
        graphics.fillStyle(armorDark, 1);
        // Back leg
        graphics.beginPath();
        graphics.moveTo(-2, 4 + runBob);
        graphics.lineTo(-3 - legKick, 10);
        graphics.lineTo(-1 - legKick, 10);
        graphics.lineTo(0, 4 + runBob);
        graphics.closePath();
        graphics.fillPath();
        // Front leg
        graphics.beginPath();
        graphics.moveTo(2, 4 + runBob);
        graphics.lineTo(3 + legKick, 10);
        graphics.lineTo(5 + legKick, 10);
        graphics.lineTo(4, 4 + runBob);
        graphics.closePath();
        graphics.fillPath();

        // Feet
        graphics.fillStyle(0x3a2a1a, 1);
        graphics.fillEllipse(-2 - legKick, 11, 3, 2);
        graphics.fillEllipse(4 + legKick, 11, 3, 2);

        // Body (leather armor)
        graphics.fillStyle(armorColor, 1);
        graphics.fillCircle(0, runBob, 6);
        graphics.fillStyle(armorDark, 1);
        graphics.fillCircle(1, runBob + 1, 5);

        // Arms
        graphics.fillStyle(skinColor, 1);
        // Left arm (holding shield)
        graphics.beginPath();
        graphics.moveTo(-4, runBob - 2);
        graphics.lineTo(-8, runBob + 2);
        graphics.lineTo(-6, runBob + 3);
        graphics.lineTo(-2, runBob - 1);
        graphics.closePath();
        graphics.fillPath();
        // Right arm (sword arm)
        graphics.beginPath();
        graphics.moveTo(4, runBob - 2);
        graphics.lineTo(7, runBob - 8);
        graphics.lineTo(5, runBob - 9);
        graphics.lineTo(2, runBob - 1);
        graphics.closePath();
        graphics.fillPath();

        // Shield
        graphics.fillStyle(armorDark, 1);
        graphics.fillCircle(-9, runBob + 2, 5);
        graphics.fillStyle(armorColor, 1);
        graphics.fillCircle(-9, runBob + 1, 4);
        graphics.fillStyle(0x555555, 1);
        graphics.fillCircle(-9, runBob + 1, 1.5);

        // Sword
        graphics.fillStyle(0xaaaaaa, 1);
        graphics.fillRect(5, runBob - 16, 2, 10);
        graphics.fillStyle(0x666666, 1);
        graphics.fillRect(4, runBob - 7, 4, 2);
        graphics.fillStyle(0x5c3317, 1);
        graphics.fillRect(5, runBob - 5, 2, 3);

        // Head
        graphics.fillStyle(skinColor, 1);
        graphics.fillCircle(0, runBob - 6, 4);
        // Helmet
        graphics.fillStyle(0x555555, 1);
        graphics.beginPath();
        graphics.arc(0, runBob - 7, 4, Math.PI, 0, false);
        graphics.closePath();
        graphics.fillPath();
        // Helmet spike
        graphics.fillStyle(0x666666, 1);
        graphics.beginPath();
        graphics.moveTo(-1, runBob - 11);
        graphics.lineTo(0, runBob - 14);
        graphics.lineTo(1, runBob - 11);
        graphics.closePath();
        graphics.fillPath();
    }

    private static drawArcher(graphics: Phaser.GameObjects.Graphics, isPlayer: boolean, isMoving: boolean, facingAngle: number) {
        // HOODED ARCHER - Agile ranger with bow
        const now = Date.now();
        const runPhase = isMoving ? (now % 350) / 350 : 0;
        const runBob = isMoving ? Math.sin(runPhase * Math.PI * 2) * 1.5 : 0;
        const legKick = isMoving ? Math.sin(runPhase * Math.PI * 2) * 3 : 0;

        const cloakColor = isPlayer ? 0x2e7d32 : 0xc62828;
        const cloakDark = isPlayer ? 0x1b5e20 : 0x8e0000;
        const skinColor = 0xdeb887;
        const bowColor = 0x8b4513;

        // Shadow
        graphics.fillStyle(0x000000, 0.3);
        graphics.fillEllipse(0, 7, 10, 5);

        // Legs (skinnier)
        graphics.fillStyle(cloakDark, 1);
        // Back leg
        graphics.beginPath();
        graphics.moveTo(-1, 1 + runBob);
        graphics.lineTo(-2 - legKick, 7);
        graphics.lineTo(-1 - legKick, 7);
        graphics.lineTo(0, 1 + runBob);
        graphics.closePath();
        graphics.fillPath();
        // Front leg
        graphics.beginPath();
        graphics.moveTo(1, 1 + runBob);
        graphics.lineTo(2 + legKick, 7);
        graphics.lineTo(3 + legKick, 7);
        graphics.lineTo(2, 1 + runBob);
        graphics.closePath();
        graphics.fillPath();

        // Feet
        graphics.fillStyle(0x3a2a1a, 1);
        graphics.fillEllipse(-1 - legKick, 8, 2, 1.5);
        graphics.fillEllipse(2 + legKick, 8, 2, 1.5);

        // Cloak body (skinnier)
        graphics.fillStyle(cloakDark, 1);
        graphics.fillCircle(0, -2 + runBob, 6);
        graphics.fillStyle(cloakColor, 1);
        graphics.fillCircle(0, -3 + runBob, 5);

        // Bow - rotates based on facing angle
        const bowAngle = facingAngle || 0;
        const bowDist = 7;
        const bowX = Math.cos(bowAngle) * bowDist;
        const bowY = Math.sin(bowAngle) * bowDist * 0.5 - 5 + runBob;

        // Bow arm
        graphics.fillStyle(skinColor, 1);
        graphics.beginPath();
        graphics.moveTo(0, -5 + runBob);
        graphics.lineTo(bowX * 0.7, bowY + 3);
        graphics.lineTo(bowX * 0.7 + 2, bowY + 3);
        graphics.lineTo(2, -5 + runBob);
        graphics.closePath();
        graphics.fillPath();

        // Bow
        graphics.lineStyle(3, bowColor, 1);
        graphics.beginPath();
        graphics.arc(bowX, bowY, 10, bowAngle - Math.PI / 2.5, bowAngle + Math.PI / 2.5);
        graphics.strokePath();

        // Bow string
        graphics.lineStyle(1, 0xcccccc, 1);
        const stringStart = { x: bowX + Math.cos(bowAngle - Math.PI / 2.5) * 10, y: bowY + Math.sin(bowAngle - Math.PI / 2.5) * 10 };
        const stringEnd = { x: bowX + Math.cos(bowAngle + Math.PI / 2.5) * 10, y: bowY + Math.sin(bowAngle + Math.PI / 2.5) * 10 };
        graphics.lineBetween(stringStart.x, stringStart.y, stringEnd.x, stringEnd.y);

        // Quiver on back
        graphics.fillStyle(0x5d4037, 1);
        graphics.fillRect(-7, -8 + runBob, 4, 10);
        // Arrows in quiver
        graphics.fillStyle(0x8b7355, 1);
        graphics.fillRect(-6, -12 + runBob, 1, 6);
        graphics.fillRect(-5, -11 + runBob, 1, 5);

        // Hood/Head (skinnier)
        graphics.fillStyle(cloakDark, 1);
        graphics.fillCircle(0, -9 + runBob, 4);
        graphics.fillStyle(cloakColor, 1);
        graphics.beginPath();
        graphics.arc(0, -9 + runBob, 4, Math.PI * 0.8, Math.PI * 0.2, false);
        graphics.closePath();
        graphics.fillPath();
        // Face shadow
        graphics.fillStyle(0x000000, 0.4);
        graphics.fillCircle(0, -8 + runBob, 2.5);
        // Eyes
        graphics.fillStyle(0xffffff, 0.8);
        graphics.fillCircle(-1, -9 + runBob, 0.8);
        graphics.fillCircle(1, -9 + runBob, 0.8);
    }

    private static drawGiant(graphics: Phaser.GameObjects.Graphics, isPlayer: boolean, isMoving: boolean) {
        // MASSIVE GIANT - Hulking brute
        const now = Date.now();
        const walkPhase = isMoving ? (now % 1000) / 1000 : 0; // Slower walk
        const walkBob = isMoving ? Math.sin(walkPhase * Math.PI * 2) * 3 : 0;
        const legKick = isMoving ? Math.sin(walkPhase * Math.PI * 2) * 4 : 0;
        const armSwing = isMoving ? Math.sin(walkPhase * Math.PI * 2) * 0.15 : 0;

        const skinColor = isPlayer ? 0xe67e22 : 0x8e44ad;
        const skinDark = isPlayer ? 0xd35400 : 0x6c3483;
        const skinLight = isPlayer ? 0xf39c12 : 0x9b59b6;

        // Large shadow
        graphics.fillStyle(0x000000, 0.35);
        graphics.fillEllipse(0, 14, 28, 12);

        // Massive legs
        graphics.fillStyle(skinDark, 1);
        // Left leg
        graphics.beginPath();
        graphics.moveTo(-8, 2 + walkBob);
        graphics.lineTo(-10 - legKick, 12);
        graphics.lineTo(-4 - legKick, 14);
        graphics.lineTo(-4, 2 + walkBob);
        graphics.closePath();
        graphics.fillPath();
        // Right leg
        graphics.beginPath();
        graphics.moveTo(8, 2 + walkBob);
        graphics.lineTo(10 + legKick, 12);
        graphics.lineTo(4 + legKick, 14);
        graphics.lineTo(4, 2 + walkBob);
        graphics.closePath();
        graphics.fillPath();

        // Feet
        graphics.fillStyle(skinDark, 1);
        graphics.fillEllipse(-7 - legKick, 14, 7, 3);
        graphics.fillEllipse(7 + legKick, 14, 7, 3);

        // Massive body
        graphics.fillStyle(skinDark, 1);
        graphics.fillCircle(0, -4 + walkBob, 16);
        graphics.fillStyle(skinColor, 1);
        graphics.fillCircle(0, -6 + walkBob, 14);

        // Belly
        graphics.fillStyle(skinLight, 0.5);
        graphics.fillCircle(0, -2 + walkBob, 8);

        // Belt
        graphics.fillStyle(0x5d4037, 1);
        graphics.fillRect(-12, 0 + walkBob, 24, 5);
        graphics.fillStyle(0xffd700, 1);
        graphics.fillRect(-3, 0 + walkBob, 6, 5);

        // Arms - both just swinging (no club)
        graphics.fillStyle(skinColor, 1);
        // Left arm
        graphics.beginPath();
        graphics.moveTo(-14, -8 + walkBob);
        graphics.lineTo(-18 + armSwing * 10, 4 + walkBob);
        graphics.lineTo(-14 + armSwing * 10, 6 + walkBob);
        graphics.lineTo(-10, -6 + walkBob);
        graphics.closePath();
        graphics.fillPath();
        // Right arm
        graphics.beginPath();
        graphics.moveTo(14, -8 + walkBob);
        graphics.lineTo(18 - armSwing * 10, 4 + walkBob);
        graphics.lineTo(14 - armSwing * 10, 6 + walkBob);
        graphics.lineTo(10, -6 + walkBob);
        graphics.closePath();
        graphics.fillPath();

        // Head
        graphics.fillStyle(skinDark, 1);
        graphics.fillCircle(0, -18 + walkBob, 9);
        graphics.fillStyle(skinColor, 1);
        graphics.fillCircle(0, -19 + walkBob, 8);

        // Face
        graphics.fillStyle(0x000000, 0.7);
        graphics.fillCircle(-3, -20 + walkBob, 2); // Left eye
        graphics.fillCircle(3, -20 + walkBob, 2);  // Right eye
        graphics.fillStyle(skinDark, 1);
        graphics.fillRect(-2, -16 + walkBob, 4, 3); // Nose

        // Angry eyebrows
        graphics.fillStyle(skinDark, 1);
        graphics.beginPath();
        graphics.moveTo(-6, -23 + walkBob);
        graphics.lineTo(-1, -21 + walkBob);
        graphics.lineTo(-1, -22 + walkBob);
        graphics.lineTo(-6, -24 + walkBob);
        graphics.closePath();
        graphics.fillPath();
        graphics.beginPath();
        graphics.moveTo(6, -23 + walkBob);
        graphics.lineTo(1, -21 + walkBob);
        graphics.lineTo(1, -22 + walkBob);
        graphics.lineTo(6, -24 + walkBob);
        graphics.closePath();
        graphics.fillPath();
    }

    private static drawGolem(graphics: Phaser.GameObjects.Graphics, isPlayer: boolean, isMoving: boolean, slamOffset: number) {
        // COLOSSAL STONE GOLEM - Massive animated rock titan
        const now = Date.now();

        // Walking animation - heavy, lumbering steps
        const walkPhase = isMoving ? (now % 1200) / 1200 : 0;

        // Body movement - only when walking
        const stepBob = isMoving ? Math.abs(Math.sin(walkPhase * Math.PI * 2)) * 4 : 0;

        // Body/head slam - adds slamOffset (for ground pound, body/head drop while legs stay)
        const bodySlam = stepBob + slamOffset;

        const armSwing = isMoving ? Math.sin(walkPhase * Math.PI * 2) * 0.3 : 0;
        const shoulderRoll = isMoving ? Math.sin(walkPhase * Math.PI) * 2 : 0;

        // Stone colors with ancient weathering
        const stoneBase = isPlayer ? 0x5a6a7a : 0x6a5a5a;
        const stoneDark = isPlayer ? 0x3a4a5a : 0x4a3a3a;
        const stoneLight = isPlayer ? 0x7a8a9a : 0x8a7a7a;
        const stoneAccent = isPlayer ? 0x4a5a6a : 0x5a4a4a;
        const mossColor = isPlayer ? 0x4a6a3a : 0x5a4a3a;
        const glowColor = isPlayer ? 0x44aaff : 0xff4444;
        const glowColorBright = isPlayer ? 0x88ccff : 0xff8888;

        // MASSIVE shadow
        graphics.fillStyle(0x000000, 0.45);
        graphics.fillEllipse(0, 18, 40, 20);

        // === LEGS (massive stone pillars) ===
        const legSpread = 12;
        const leftLegPhase = walkPhase;
        const rightLegPhase = (walkPhase + 0.5) % 1;
        // Legs only animate when moving
        const leftLegLift = isMoving ? Math.max(0, Math.sin(leftLegPhase * Math.PI * 2)) * 6 : 0;
        const rightLegLift = isMoving ? Math.max(0, Math.sin(rightLegPhase * Math.PI * 2)) * 6 : 0;

        // Left leg
        graphics.fillStyle(stoneDark, 1);
        graphics.beginPath();
        graphics.moveTo(-legSpread - 6, -5 + stepBob);
        graphics.lineTo(-legSpread - 8, 12 - leftLegLift);
        graphics.lineTo(-legSpread + 4, 14 - leftLegLift);
        graphics.lineTo(-legSpread + 2, -3 + stepBob);
        graphics.closePath();
        graphics.fillPath();
        // Leg highlight
        graphics.fillStyle(stoneBase, 1);
        graphics.beginPath();
        graphics.moveTo(-legSpread - 4, -4 + stepBob);
        graphics.lineTo(-legSpread - 5, 10 - leftLegLift);
        graphics.lineTo(-legSpread, 11 - leftLegLift);
        graphics.lineTo(-legSpread + 1, -3 + stepBob);
        graphics.closePath();
        graphics.fillPath();
        // Left foot (massive stone block)
        graphics.fillStyle(stoneDark, 1);
        graphics.fillRect(-legSpread - 10, 12 - leftLegLift, 16, 6);
        graphics.fillStyle(stoneAccent, 1);
        graphics.fillRect(-legSpread - 8, 11 - leftLegLift, 12, 3);

        // Right leg
        graphics.fillStyle(stoneDark, 1);
        graphics.beginPath();
        graphics.moveTo(legSpread + 6, -5 + stepBob);
        graphics.lineTo(legSpread + 8, 12 - rightLegLift);
        graphics.lineTo(legSpread - 4, 14 - rightLegLift);
        graphics.lineTo(legSpread - 2, -3 + stepBob);
        graphics.closePath();
        graphics.fillPath();
        // Leg highlight
        graphics.fillStyle(stoneBase, 1);
        graphics.beginPath();
        graphics.moveTo(legSpread + 4, -4 + stepBob);
        graphics.lineTo(legSpread + 5, 10 - rightLegLift);
        graphics.lineTo(legSpread, 11 - rightLegLift);
        graphics.lineTo(legSpread - 1, -3 + stepBob);
        graphics.closePath();
        graphics.fillPath();
        // Right foot
        graphics.fillStyle(stoneDark, 1);
        graphics.fillRect(legSpread - 6, 12 - rightLegLift, 16, 6);
        graphics.fillStyle(stoneAccent, 1);
        graphics.fillRect(legSpread - 4, 11 - rightLegLift, 12, 3);

        // === TORSO (massive boulder body) ===
        // Back layer - darker
        graphics.fillStyle(stoneDark, 1);
        graphics.beginPath();
        graphics.moveTo(-22, -8 + bodySlam);
        graphics.lineTo(-18, -28 + bodySlam);
        graphics.lineTo(18, -28 + bodySlam);
        graphics.lineTo(22, -8 + bodySlam);
        graphics.lineTo(16, 2 + bodySlam);
        graphics.lineTo(-16, 2 + bodySlam);
        graphics.closePath();
        graphics.fillPath();

        // Main body
        graphics.fillStyle(stoneBase, 1);
        graphics.beginPath();
        graphics.moveTo(-20, -10 + bodySlam);
        graphics.lineTo(-16, -30 + bodySlam);
        graphics.lineTo(16, -30 + bodySlam);
        graphics.lineTo(20, -10 + bodySlam);
        graphics.lineTo(14, 0 + bodySlam);
        graphics.lineTo(-14, 0 + bodySlam);
        graphics.closePath();
        graphics.fillPath();

        // Chest stone plates
        graphics.fillStyle(stoneLight, 1);
        graphics.beginPath();
        graphics.moveTo(-12, -24 + bodySlam);
        graphics.lineTo(-8, -28 + bodySlam);
        graphics.lineTo(8, -28 + bodySlam);
        graphics.lineTo(12, -24 + bodySlam);
        graphics.lineTo(10, -14 + bodySlam);
        graphics.lineTo(-10, -14 + bodySlam);
        graphics.closePath();
        graphics.fillPath();

        // Glowing rune on chest
        graphics.fillStyle(glowColor, 0.8);
        graphics.beginPath();
        graphics.moveTo(0, -26 + bodySlam);
        graphics.lineTo(-4, -22 + bodySlam);
        graphics.lineTo(0, -18 + bodySlam);
        graphics.lineTo(4, -22 + bodySlam);
        graphics.closePath();
        graphics.fillPath();
        graphics.fillStyle(glowColorBright, 0.6);
        graphics.fillCircle(0, -22 + bodySlam, 2);

        // Stone texture cracks
        graphics.lineStyle(1, stoneDark, 0.6);
        graphics.lineBetween(-15, -20 + bodySlam, -10, -15 + bodySlam);
        graphics.lineBetween(12, -25 + bodySlam, 16, -18 + bodySlam);
        graphics.lineBetween(-8, -8 + bodySlam, -3, -12 + bodySlam);
        graphics.lineBetween(5, -6 + bodySlam, 10, -10 + bodySlam);

        // Moss patches
        graphics.fillStyle(mossColor, 0.7);
        graphics.fillCircle(-14, -16 + bodySlam, 3);
        graphics.fillCircle(16, -12 + bodySlam, 2.5);
        graphics.fillCircle(-8, -4 + bodySlam, 2);

        // === ARMS (boulder appendages) ===
        // Arm swing offsets
        const leftArmSwingX = armSwing * 8;
        const leftArmSwingY = Math.abs(armSwing) * 4;
        const rightArmSwingX = -armSwing * 8;
        const rightArmSwingY = Math.abs(armSwing) * 4;

        // Left arm base position
        const lax = -18;
        const lay = -20 + stepBob + shoulderRoll;

        // Left arm - upper
        graphics.fillStyle(stoneDark, 1);
        graphics.beginPath();
        graphics.moveTo(lax - 4, lay);
        graphics.lineTo(lax - 8 + leftArmSwingX, lay + 18 + leftArmSwingY);
        graphics.lineTo(lax + 4 + leftArmSwingX, lay + 20 + leftArmSwingY);
        graphics.lineTo(lax + 4, lay + 2);
        graphics.closePath();
        graphics.fillPath();
        graphics.fillStyle(stoneBase, 1);
        graphics.beginPath();
        graphics.moveTo(lax - 2, lay + 2);
        graphics.lineTo(lax - 4 + leftArmSwingX * 0.5, lay + 16 + leftArmSwingY * 0.5);
        graphics.lineTo(lax + 2 + leftArmSwingX * 0.5, lay + 17 + leftArmSwingY * 0.5);
        graphics.lineTo(lax + 2, lay + 3);
        graphics.closePath();
        graphics.fillPath();

        // Left forearm
        const lfx = lax - 2 + leftArmSwingX;
        const lfy = lay + 18 + leftArmSwingY;
        graphics.fillStyle(stoneAccent, 1);
        graphics.beginPath();
        graphics.moveTo(lfx - 5, lfy);
        graphics.lineTo(lfx - 7 + leftArmSwingX * 0.5, lfy + 17);
        graphics.lineTo(lfx + 5 + leftArmSwingX * 0.5, lfy + 18);
        graphics.lineTo(lfx + 6, lfy + 1);
        graphics.closePath();
        graphics.fillPath();

        // Left fist
        const lfistX = lfx - 1 + leftArmSwingX * 0.5;
        const lfistY = lfy + 22;
        graphics.fillStyle(stoneDark, 1);
        graphics.fillCircle(lfistX, lfistY, 9);
        graphics.fillStyle(stoneBase, 1);
        graphics.fillCircle(lfistX - 1, lfistY - 1, 7);
        graphics.fillStyle(stoneLight, 0.5);
        graphics.fillCircle(lfistX - 4, lfistY - 3, 2);
        graphics.fillCircle(lfistX, lfistY - 4, 2);
        graphics.fillCircle(lfistX + 4, lfistY - 3, 2);

        // Right arm base position
        const rax = 18;
        const ray = -20 + stepBob - shoulderRoll;

        // Right arm - upper
        graphics.fillStyle(stoneDark, 1);
        graphics.beginPath();
        graphics.moveTo(rax + 4, ray);
        graphics.lineTo(rax + 8 + rightArmSwingX, ray + 18 + rightArmSwingY);
        graphics.lineTo(rax - 4 + rightArmSwingX, ray + 20 + rightArmSwingY);
        graphics.lineTo(rax - 4, ray + 2);
        graphics.closePath();
        graphics.fillPath();
        graphics.fillStyle(stoneBase, 1);
        graphics.beginPath();
        graphics.moveTo(rax + 2, ray + 2);
        graphics.lineTo(rax + 4 + rightArmSwingX * 0.5, ray + 16 + rightArmSwingY * 0.5);
        graphics.lineTo(rax - 2 + rightArmSwingX * 0.5, ray + 17 + rightArmSwingY * 0.5);
        graphics.lineTo(rax - 2, ray + 3);
        graphics.closePath();
        graphics.fillPath();

        // Right forearm
        const rfx = rax + 2 + rightArmSwingX;
        const rfy = ray + 18 + rightArmSwingY;
        graphics.fillStyle(stoneAccent, 1);
        graphics.beginPath();
        graphics.moveTo(rfx + 5, rfy);
        graphics.lineTo(rfx + 7 + rightArmSwingX * 0.5, rfy + 17);
        graphics.lineTo(rfx - 5 + rightArmSwingX * 0.5, rfy + 18);
        graphics.lineTo(rfx - 6, rfy + 1);
        graphics.closePath();
        graphics.fillPath();

        // Right fist
        const rfistX = rfx + 1 + rightArmSwingX * 0.5;
        const rfistY = rfy + 22;
        graphics.fillStyle(stoneDark, 1);
        graphics.fillCircle(rfistX, rfistY, 9);
        graphics.fillStyle(stoneBase, 1);
        graphics.fillCircle(rfistX + 1, rfistY - 1, 7);
        graphics.fillStyle(stoneLight, 0.5);
        graphics.fillCircle(rfistX + 4, rfistY - 3, 2);
        graphics.fillCircle(rfistX, rfistY - 4, 2);
        graphics.fillCircle(rfistX - 4, rfistY - 3, 2);

        // === HEAD (craggy boulder with glowing eyes) ===
        // Neck
        graphics.fillStyle(stoneDark, 1);
        graphics.fillRect(-8, -38 + bodySlam, 16, 10);

        // Head base
        graphics.fillStyle(stoneBase, 1);
        graphics.beginPath();
        graphics.moveTo(-14, -36 + bodySlam);
        graphics.lineTo(-16, -48 + bodySlam);
        graphics.lineTo(-10, -54 + bodySlam);
        graphics.lineTo(10, -54 + bodySlam);
        graphics.lineTo(16, -48 + bodySlam);
        graphics.lineTo(14, -36 + bodySlam);
        graphics.closePath();
        graphics.fillPath();

        // Brow ridge
        graphics.fillStyle(stoneDark, 1);
        graphics.beginPath();
        graphics.moveTo(-14, -46 + bodySlam);
        graphics.lineTo(-12, -50 + bodySlam);
        graphics.lineTo(12, -50 + bodySlam);
        graphics.lineTo(14, -46 + bodySlam);
        graphics.lineTo(10, -44 + bodySlam);
        graphics.lineTo(-10, -44 + bodySlam);
        graphics.closePath();
        graphics.fillPath();

        // Eye sockets (dark)
        graphics.fillStyle(0x1a1a1a, 1);
        graphics.fillCircle(-6, -45 + bodySlam, 4);
        graphics.fillCircle(6, -45 + bodySlam, 4);

        // Glowing eyes
        const eyePulse = 0.7 + Math.sin(now / 200) * 0.3;
        graphics.fillStyle(glowColor, eyePulse);
        graphics.fillCircle(-6, -45 + bodySlam, 3);
        graphics.fillCircle(6, -45 + bodySlam, 3);
        graphics.fillStyle(glowColorBright, eyePulse * 0.8);
        graphics.fillCircle(-6, -45 + bodySlam, 1.5);
        graphics.fillCircle(6, -45 + bodySlam, 1.5);

        // Eye glow effect
        graphics.lineStyle(2, glowColor, eyePulse * 0.4);
        graphics.strokeCircle(-6, -45 + bodySlam, 5);
        graphics.strokeCircle(6, -45 + bodySlam, 5);

        // Jagged mouth
        graphics.fillStyle(0x2a2a2a, 1);
        graphics.beginPath();
        graphics.moveTo(-8, -40 + bodySlam);
        graphics.lineTo(-5, -38 + bodySlam);
        graphics.lineTo(-2, -40 + bodySlam);
        graphics.lineTo(2, -38 + bodySlam);
        graphics.lineTo(5, -40 + bodySlam);
        graphics.lineTo(8, -38 + bodySlam);
        graphics.lineTo(6, -36 + bodySlam);
        graphics.lineTo(-6, -36 + bodySlam);
        graphics.closePath();
        graphics.fillPath();

        // Head cracks and details
        graphics.lineStyle(1, stoneDark, 0.7);
        graphics.lineBetween(-10, -52 + bodySlam, -8, -46 + bodySlam);
        graphics.lineBetween(12, -50 + bodySlam, 10, -44 + bodySlam);
        graphics.lineBetween(0, -54 + bodySlam, 0, -50 + bodySlam);

        // Ancient runes on forehead
        graphics.lineStyle(2, glowColor, eyePulse * 0.6);
        graphics.lineBetween(-3, -52 + bodySlam, 3, -52 + bodySlam);
        graphics.lineBetween(0, -54 + bodySlam, 0, -50 + bodySlam);

        // Shoulder spikes/crystals
        graphics.fillStyle(stoneLight, 1);
        // Left spike
        graphics.beginPath();
        graphics.moveTo(-20, -26 + bodySlam);
        graphics.lineTo(-26, -34 + bodySlam);
        graphics.lineTo(-18, -30 + bodySlam);
        graphics.closePath();
        graphics.fillPath();
        // Right spike
        graphics.beginPath();
        graphics.moveTo(20, -26 + bodySlam);
        graphics.lineTo(26, -34 + bodySlam);
        graphics.lineTo(18, -30 + bodySlam);
        graphics.closePath();
        graphics.fillPath();

        // Glowing crystal cores in spikes
        graphics.fillStyle(glowColor, eyePulse * 0.7);
        graphics.fillCircle(-22, -30 + bodySlam, 2);
        graphics.fillCircle(22, -30 + bodySlam, 2);
    }

    private static drawSharpshooter(graphics: Phaser.GameObjects.Graphics, isPlayer: boolean, isMoving: boolean, facingAngle: number, bowDrawProgress: number) {
        // SHARPSHOOTER - Elite archer with massive crossbow
        const now = Date.now();
        const runPhase = isMoving ? (now % 400) / 400 : 0;
        const legKick = isMoving ? Math.sin(runPhase * Math.PI * 2) * 4 : 0;
        const armBob = isMoving ? Math.sin(runPhase * Math.PI * 2) * 0.08 : 0;

        // Colors - forest green/dark theme
        const cloakColor = isPlayer ? 0x2e7d32 : 0x5d4037;
        const cloakDark = isPlayer ? 0x1b5e20 : 0x4e342e;
        const skinColor = 0xe8d4b8;
        const bowWood = 0x5d4037;
        const bowDark = 0x3e2723;
        const metalColor = 0x888888;

        // Shadow
        graphics.fillStyle(0x000000, 0.3);
        graphics.fillEllipse(0, 12, 14, 7);

        // Legs with animation
        graphics.fillStyle(cloakDark, 1);
        graphics.fillRect(-4, 0 - legKick, 3, 10);
        graphics.fillRect(1, 0 + legKick, 3, 10);

        // Boots
        graphics.fillStyle(0x3e2723, 1);
        graphics.fillEllipse(-2.5, 10 - legKick, 4, 3);
        graphics.fillEllipse(2.5, 10 + legKick, 4, 3);

        // Body/Cloak
        graphics.fillStyle(cloakColor, 1);
        graphics.beginPath();
        graphics.moveTo(-8, -2);
        graphics.lineTo(-6, -18);
        graphics.lineTo(6, -18);
        graphics.lineTo(8, -2);
        graphics.lineTo(4, 2);
        graphics.lineTo(-4, 2);
        graphics.closePath();
        graphics.fillPath();

        // Hood/collar
        graphics.fillStyle(cloakDark, 1);
        graphics.beginPath();
        graphics.moveTo(-5, -16);
        graphics.lineTo(-4, -22);
        graphics.lineTo(4, -22);
        graphics.lineTo(5, -16);
        graphics.closePath();
        graphics.fillPath();

        // Head
        graphics.fillStyle(skinColor, 1);
        graphics.fillCircle(0, -25, 5);

        // Face details
        graphics.fillStyle(0x000000, 1);
        graphics.fillCircle(-2, -26, 0.8);
        graphics.fillCircle(2, -26, 0.8);

        // Eye patch/mask (sniper look)
        graphics.fillStyle(0x1a1a1a, 1);
        graphics.fillRect(-6, -27, 3, 2);

        // Hair
        graphics.fillStyle(0x3e2723, 1);
        graphics.beginPath();
        graphics.arc(0, -27, 5, Math.PI, 0, false);
        graphics.fill();

        // === MASSIVE LONGBOW ===
        const bowAngle = facingAngle + armBob;

        graphics.save();
        graphics.translateCanvas(0, -12);
        graphics.rotateCanvas(bowAngle);

        // Bow limbs - curved wooden bow
        graphics.lineStyle(3, bowWood, 1);
        graphics.beginPath();
        graphics.arc(0, 0, 18, -Math.PI * 0.4, Math.PI * 0.4, false);
        graphics.stroke();

        // Bow highlight
        graphics.lineStyle(1.5, bowDark, 1);
        graphics.beginPath();
        graphics.arc(0, 0, 16, -Math.PI * 0.35, Math.PI * 0.35, false);
        graphics.stroke();

        // Bowstring - animates based on bowDrawProgress
        // When progress = 0, string is at rest (near bow)
        // When progress = 1, string is pulled back fully
        const restPosition = 14; // String at rest position
        const fullyDrawnPosition = -10; // String when fully pulled
        const stringPullBack = restPosition - (restPosition - fullyDrawnPosition) * bowDrawProgress;

        graphics.lineStyle(1, 0xaa9977, 1);
        graphics.lineBetween(
            18 * Math.cos(-Math.PI * 0.4), 18 * Math.sin(-Math.PI * 0.4),
            stringPullBack, 0
        );
        graphics.lineBetween(
            18 * Math.cos(Math.PI * 0.4), 18 * Math.sin(Math.PI * 0.4),
            stringPullBack, 0
        );

        // Arrow - only visible when drawing or drawn (bowDrawProgress > 0)
        if (bowDrawProgress > 0.1) {
            // Arrow shaft
            graphics.fillStyle(bowDark, 1);
            graphics.fillRect(stringPullBack, -1.5, 26, 3);
            // Arrow head
            graphics.fillStyle(metalColor, 1);
            graphics.fillTriangle(stringPullBack + 28, 0, stringPullBack + 22, -3.5, stringPullBack + 22, 3.5);
            // Fletching
            graphics.fillStyle(0x2e7d32, 1);
            graphics.fillTriangle(stringPullBack + 2, 0, stringPullBack - 2, -4, stringPullBack - 2, 4);
        }

        graphics.restore();
    }

    private static drawMobileMortar(graphics: Phaser.GameObjects.Graphics, isPlayer: boolean, isMoving: boolean, facingAngle: number, mortarRecoil: number) {
        // MOBILE MORTAR - Soldier ALWAYS IN FRONT dragging the mortar BEHIND
        const now = Date.now();

        // Soldier walks independently with slight offset from mortar
        const soldierWalkPhase = isMoving ? (now % 400) / 400 : 0;
        const soldierLegKick = isMoving ? Math.sin(soldierWalkPhase * Math.PI * 2) * 4 : 0;
        const soldierArmSwing = isMoving ? Math.sin(soldierWalkPhase * Math.PI * 2) * 0.15 : 0;
        const soldierBob = isMoving ? Math.abs(Math.sin(soldierWalkPhase * Math.PI * 2)) * 2 : 0;

        // Mortar bounces slightly behind
        const mortarBob = isMoving ? Math.abs(Math.sin((soldierWalkPhase + 0.2) * Math.PI * 2)) * 1.5 : 0;
        const wheelRotation = isMoving ? (now % 600) / 600 * Math.PI * 2 : 0;

        // Colors
        const uniformColor = isPlayer ? 0x455a64 : 0x5d4037;
        const uniformDark = isPlayer ? 0x37474f : 0x4e342e;
        const skinColor = 0xe8d4b8;
        const metalColor = 0x555555;
        const metalDark = 0x333333;
        const woodColor = 0x8b4513;

        // DIRECTION LOGIC: Soldier is always in front (direction of travel)
        // facingAngle: 0 = right, PI = left, PI/2 = down, -PI/2 = up
        // If facing left (abs(angle) > PI/2), soldier should be on left, mortar on right
        // If facing right (abs(angle) <= PI/2), soldier should be on right, mortar on left
        const facingLeft = Math.abs(facingAngle) > Math.PI / 2;
        const flip = facingLeft ? -1 : 1;

        // Positions based on direction
        const baseMortarX = -12 * flip; // Mortar is behind
        const baseSoldierX = 14 * flip; // Soldier is in front

        // === MORTAR CART ===
        const mortarX = baseMortarX;
        const mortarY = mortarBob + mortarRecoil;

        // Mortar shadow
        graphics.fillStyle(0x000000, 0.35);
        graphics.fillEllipse(mortarX, 12 + mortarY, 16, 8);

        // Wheels
        graphics.fillStyle(metalDark, 1);
        graphics.fillCircle(mortarX - 8, 6 + mortarY, 6);
        graphics.fillCircle(mortarX + 8, 6 + mortarY, 6);
        graphics.fillStyle(metalColor, 1);
        graphics.fillCircle(mortarX - 8, 6 + mortarY, 4);
        graphics.fillCircle(mortarX + 8, 6 + mortarY, 4);
        graphics.fillStyle(woodColor, 1);
        graphics.fillCircle(mortarX - 8, 6 + mortarY, 1.5);
        graphics.fillCircle(mortarX + 8, 6 + mortarY, 1.5);

        // Wheel spokes
        graphics.lineStyle(1, woodColor, 0.8);
        for (let i = 0; i < 4; i++) {
            const spokeAngle = wheelRotation + (i * Math.PI / 2);
            graphics.lineBetween(
                mortarX - 8 + Math.cos(spokeAngle) * 1.5,
                6 + mortarY + Math.sin(spokeAngle) * 1.5,
                mortarX - 8 + Math.cos(spokeAngle) * 4,
                6 + mortarY + Math.sin(spokeAngle) * 4
            );
            graphics.lineBetween(
                mortarX + 8 + Math.cos(spokeAngle) * 1.5,
                6 + mortarY + Math.sin(spokeAngle) * 1.5,
                mortarX + 8 + Math.cos(spokeAngle) * 4,
                6 + mortarY + Math.sin(spokeAngle) * 4
            );
        }

        // Axle
        graphics.fillStyle(woodColor, 1);
        graphics.fillRect(mortarX - 10, 4 + mortarY, 20, 3);

        // Mortar base
        graphics.fillStyle(metalDark, 1);
        graphics.fillRect(mortarX - 5, -2 + mortarY, 10, 6);

        // Mortar tube (angled up)
        graphics.fillStyle(metalDark, 1);
        graphics.beginPath();
        graphics.moveTo(mortarX - 4, -2 + mortarY);
        graphics.lineTo(mortarX - 3, -22 + mortarY);
        graphics.lineTo(mortarX + 3, -22 + mortarY);
        graphics.lineTo(mortarX + 4, -2 + mortarY);
        graphics.closePath();
        graphics.fillPath();
        graphics.fillStyle(metalColor, 1);
        graphics.beginPath();
        graphics.moveTo(mortarX - 3, -2 + mortarY);
        graphics.lineTo(mortarX - 2, -20 + mortarY);
        graphics.lineTo(mortarX + 2, -20 + mortarY);
        graphics.lineTo(mortarX + 3, -2 + mortarY);
        graphics.closePath();
        graphics.fillPath();

        // Mortar opening
        graphics.fillStyle(0x1a1a1a, 1);
        graphics.fillEllipse(mortarX, -22 + mortarY, 3, 1.5);
        graphics.lineStyle(2, metalColor, 1);
        graphics.strokeEllipse(mortarX, -22 + mortarY, 4, 2);

        // === ROPE connecting soldier to mortar ===
        const soldierX = baseSoldierX;
        const soldierHandY = -4 - soldierBob;
        const ropeAttachMortarX = mortarX + (5 * flip);
        const soldierHandX = soldierX - (6 * flip);
        graphics.lineStyle(2, 0x8b7355, 1);
        // Rope sags in the middle
        const ropeMidX = (ropeAttachMortarX + soldierHandX) / 2;
        const ropeMidY = 4; // Sag point
        graphics.beginPath();
        graphics.moveTo(ropeAttachMortarX, 2 + mortarY);
        graphics.lineTo(ropeMidX, ropeMidY);
        graphics.lineTo(soldierHandX, soldierHandY);
        graphics.stroke();

        // === SOLDIER (in front, walking independently) ===
        const soldierY = -soldierBob;

        // Soldier shadow
        graphics.fillStyle(0x000000, 0.3);
        graphics.fillEllipse(soldierX, 10 + soldierY, 10, 5);

        // Legs with animation
        graphics.fillStyle(uniformDark, 1);
        graphics.fillRect(soldierX - 4, 0 + soldierY - soldierLegKick, 3, 10);
        graphics.fillRect(soldierX + 1, 0 + soldierY + soldierLegKick, 3, 10);

        // Boots
        graphics.fillStyle(0x2d2d2d, 1);
        graphics.fillEllipse(soldierX - 2.5, 10 + soldierY - soldierLegKick, 4, 2.5);
        graphics.fillEllipse(soldierX + 2.5, 10 + soldierY + soldierLegKick, 4, 2.5);

        // Body
        graphics.fillStyle(uniformColor, 1);
        graphics.beginPath();
        graphics.moveTo(soldierX - 6, 0 + soldierY);
        graphics.lineTo(soldierX - 5, -14 + soldierY);
        graphics.lineTo(soldierX + 5, -14 + soldierY);
        graphics.lineTo(soldierX + 6, 0 + soldierY);
        graphics.closePath();
        graphics.fillPath();

        // Collar
        graphics.fillStyle(uniformDark, 1);
        graphics.fillRect(soldierX - 4, -14 + soldierY, 8, 3);

        // Arm holding rope (arm reaching toward mortar)
        const armReachX = soldierX - (4 * flip);
        const armAngle = (soldierArmSwing - 0.3) * flip;
        graphics.fillStyle(uniformColor, 1);
        graphics.save();
        graphics.translateCanvas(armReachX, -8 + soldierY);
        graphics.rotateCanvas(armAngle);
        graphics.fillRect(-2, 0, 4, 10);
        graphics.restore();
        // Hand
        graphics.fillStyle(skinColor, 1);
        graphics.fillCircle(soldierHandX, soldierHandY, 2.5);

        // Other arm (swinging)
        const armSwingX = soldierX + (4 * flip);
        graphics.fillStyle(uniformColor, 1);
        graphics.save();
        graphics.translateCanvas(armSwingX, -8 + soldierY);
        graphics.rotateCanvas(-soldierArmSwing * flip);
        graphics.fillRect(-2, 0, 4, 8);
        graphics.restore();

        // Head
        graphics.fillStyle(skinColor, 1);
        graphics.fillCircle(soldierX, -18 + soldierY, 4);

        // Helmet
        graphics.fillStyle(uniformDark, 1);
        graphics.beginPath();
        graphics.arc(soldierX, -20 + soldierY, 5, Math.PI, 0, false);
        graphics.fill();
        graphics.fillRect(soldierX - 5, -20 + soldierY, 10, 2);

        // Face
        graphics.fillStyle(0x000000, 1);
        graphics.fillCircle(soldierX - 1.5, -19 + soldierY, 0.6);
        graphics.fillCircle(soldierX + 1.5, -19 + soldierY, 0.6);
    }

    private static drawWard(graphics: Phaser.GameObjects.Graphics, isPlayer: boolean) {
        const glowColor = isPlayer ? 0x58d68d : 0x45b39d;
        const robeColor = isPlayer ? 0x2ecc71 : 0x27ae60;
        const robeDark = isPlayer ? 0x1e8449 : 0x196f3d;
        const skinColor = isPlayer ? 0xdeb887 : 0xc9a66b;
        const now = Date.now();

        // Heal radius aura
        const healRadiusPixels = 7 * 32;
        const pulseAlpha = 0.1 + Math.sin(now / 300) * 0.05;

        graphics.lineStyle(3, glowColor, pulseAlpha + 0.15);
        graphics.beginPath();
        const segments = 48;
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const noise = Math.sin(now / 25 + theta * 3) * 4 +
                Math.sin(now / 37 + theta * 7) * 2 +
                Math.sin(now / 20 + theta * 11) * 1.5;
            const rx = (healRadiusPixels + noise) * Math.cos(theta);
            const ry = ((healRadiusPixels / 2) + noise * 0.5) * Math.sin(theta);
            if (i === 0) graphics.moveTo(rx, 5 + ry);
            else graphics.lineTo(rx, 5 + ry);
        }
        graphics.closePath();
        graphics.strokePath();

        graphics.fillStyle(glowColor, pulseAlpha * 0.25);
        graphics.fillEllipse(0, 5, healRadiusPixels, healRadiusPixels / 2);

        // Shadow
        graphics.fillStyle(0x000000, 0.25);
        graphics.fillEllipse(0, 12, 12, 5);

        // Robe skirt (triangular)
        graphics.fillStyle(robeDark, 1);
        graphics.beginPath();
        graphics.moveTo(-7, 2);
        graphics.lineTo(7, 2);
        graphics.lineTo(5, 11);
        graphics.lineTo(-5, 11);
        graphics.closePath();
        graphics.fillPath();
        graphics.fillStyle(robeColor, 1);
        graphics.beginPath();
        graphics.moveTo(-6, 2);
        graphics.lineTo(6, 2);
        graphics.lineTo(4, 10);
        graphics.lineTo(-4, 10);
        graphics.closePath();
        graphics.fillPath();

        // Torso
        graphics.fillStyle(robeDark, 1);
        graphics.fillRect(-5, -5, 10, 8);
        graphics.fillStyle(robeColor, 1);
        graphics.fillRect(-4, -4, 8, 7);

        // Hood/cowl
        graphics.fillStyle(robeDark, 1);
        graphics.beginPath();
        graphics.arc(0, -8, 6, Math.PI, 0, false);
        graphics.closePath();
        graphics.fillPath();
        graphics.fillStyle(robeColor, 1);
        graphics.beginPath();
        graphics.arc(0, -8, 5, Math.PI, 0, false);
        graphics.closePath();
        graphics.fillPath();

        // Face
        graphics.fillStyle(skinColor, 1);
        graphics.fillCircle(0, -8, 4);

        // Eyes
        graphics.fillStyle(0x2a5a1a, 1);
        graphics.fillCircle(-1.5, -8, 1);
        graphics.fillCircle(1.5, -8, 1);

        // Staff held in right hand
        graphics.fillStyle(0x5d4e37, 1);
        graphics.fillRect(7, -16, 3, 24);
        graphics.fillStyle(0x4a3520, 1);
        graphics.fillRect(8, -16, 1.5, 24);

        // Crystal orb on staff
        const orbPulse = 0.8 + Math.sin(now / 200) * 0.15;
        graphics.fillStyle(0x88ffcc, orbPulse);
        graphics.fillCircle(8.5, -18, 4.5);
        graphics.fillStyle(0xffffff, 0.5);
        graphics.fillCircle(7, -19.5, 1.5);

        // Glow around orb
        graphics.lineStyle(2, 0xaaffdd, 0.4);
        graphics.strokeCircle(8.5, -18, 7);

        // Left arm extended (casting)
        graphics.fillStyle(robeColor, 1);
        graphics.beginPath();
        graphics.moveTo(-4, -3);
        graphics.lineTo(-9, -7);
        graphics.lineTo(-8, -9);
        graphics.lineTo(-3, -5);
        graphics.closePath();
        graphics.fillPath();
        // Hand
        graphics.fillStyle(skinColor, 1);
        graphics.fillCircle(-9, -8, 2);
    }

    private static drawRecursion(graphics: Phaser.GameObjects.Graphics, isPlayer: boolean) {
        // Fractal/geometric entity that splits on death
        const bodyColor = isPlayer ? 0x00ffaa : 0xaa00ff;
        const innerColor = isPlayer ? 0x00aa77 : 0x7700aa;
        const now = Date.now();

        // Shadow
        graphics.fillStyle(0x000000, 0.3);
        graphics.fillEllipse(0, 5, 14, 6);

        // Outer hexagonal shell (rotating slowly)
        const rot = now / 2000;
        graphics.fillStyle(bodyColor, 0.9);
        graphics.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = rot + (i / 6) * Math.PI * 2;
            const px = Math.cos(angle) * 10;
            const py = Math.sin(angle) * 10 * 0.6 - 2;
            if (i === 0) graphics.moveTo(px, py);
            else graphics.lineTo(px, py);
        }
        graphics.closePath();
        graphics.fillPath();

        // Inner hexagon (counter-rotating)
        graphics.fillStyle(innerColor, 1);
        graphics.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = -rot * 1.5 + (i / 6) * Math.PI * 2;
            const px = Math.cos(angle) * 5;
            const py = Math.sin(angle) * 5 * 0.6 - 2;
            if (i === 0) graphics.moveTo(px, py);
            else graphics.lineTo(px, py);
        }
        graphics.closePath();
        graphics.fillPath();

        // Central core with split symbol
        graphics.fillStyle(0xffffff, 0.9);
        graphics.fillCircle(0, -2, 2.5);
        graphics.lineStyle(1, bodyColor, 1);
        graphics.lineBetween(-1.5, -2, 1.5, -2);
        graphics.lineBetween(0, -3.5, 0, -0.5);
    }

    private static drawRam(graphics: Phaser.GameObjects.Graphics, isPlayer: boolean, isMoving: boolean, facingAngle: number, troopLevel: number = 1) {
        // MASSIVE BATTERING RAM - Huge meaty tree trunk carried by two warriors
        const now = Date.now();

        const cos = Math.cos(facingAngle);
        const sin = Math.sin(facingAngle);

        // Running animation phase - only animate when moving
        const runPhase = isMoving ? (now % 300) / 300 : 0;
        const runBob = isMoving ? Math.sin(runPhase * Math.PI * 2) * 2 : 0;
        const chargeForward = isMoving ? Math.abs(Math.sin(runPhase * Math.PI)) * 3 : 0;

        // Ram dimensions - MASSIVE tree trunk
        const ramLength = 48;
        const ramWidth = 14;
        const ramHeight = 16;

        // Calculate ram endpoints based on direction
        const backX = -cos * (ramLength / 2) - cos * chargeForward;
        const backY = -sin * (ramLength / 2) * 0.5 + runBob - sin * chargeForward * 0.5;
        const frontX = cos * (ramLength / 2) + cos * chargeForward;
        const frontY = sin * (ramLength / 2) * 0.5 + runBob + sin * chargeForward * 0.5;

        // Perpendicular offset for width
        const perpX = -sin * (ramWidth / 2);
        const perpY = cos * (ramWidth / 2) * 0.5;

        // Giant shadow
        graphics.fillStyle(0x000000, 0.4);
        graphics.fillEllipse(cos * 3, 10 + sin * 2, 44, 18);

        // === WARRIORS CARRYING THE RAM ===
        const warrior1Phase = runPhase;
        const warrior2Phase = (runPhase + 0.5) % 1;
        const warrior1Bob = Math.sin(warrior1Phase * Math.PI * 2) * 3;
        const warrior2Bob = Math.sin(warrior2Phase * Math.PI * 2) * 3;

        const skinColor = isPlayer ? 0xdeb887 : 0xc9a66b;
        const skinDark = isPlayer ? 0xcd9b5a : 0xb8956a;
        const armorColor = isPlayer ? 0x8b4513 : 0x654321;
        const armorDark = isPlayer ? 0x5c3317 : 0x4a2f1a;

        // Warrior positions - at back and middle of ram
        const w1Offset = -0.35; // Back warrior
        const w2Offset = 0.1;   // Front warrior

        for (const [wOffset, wBob, legPhase] of [[w1Offset, warrior1Bob, warrior1Phase], [w2Offset, warrior2Bob, warrior2Phase]] as [number, number, number][]) {
            const wx = backX + (frontX - backX) * (wOffset + 0.5);
            const wy = backY + (frontY - backY) * (wOffset + 0.5);
            const legKick = Math.sin(legPhase * Math.PI * 2) * 3;

            // Warrior shadow
            graphics.fillStyle(0x000000, 0.25);
            graphics.fillEllipse(wx, wy + 12, 10, 5);

            // Running legs
            graphics.fillStyle(armorDark, 1);
            // Back leg
            graphics.beginPath();
            graphics.moveTo(wx - 2, wy + 4);
            graphics.lineTo(wx - 3 - legKick, wy + 10);
            graphics.lineTo(wx - 1 - legKick, wy + 10);
            graphics.lineTo(wx, wy + 4);
            graphics.closePath();
            graphics.fillPath();
            // Front leg
            graphics.beginPath();
            graphics.moveTo(wx + 2, wy + 4);
            graphics.lineTo(wx + 3 + legKick, wy + 10);
            graphics.lineTo(wx + 5 + legKick, wy + 10);
            graphics.lineTo(wx + 4, wy + 4);
            graphics.closePath();
            graphics.fillPath();

            // Feet
            graphics.fillStyle(0x3a2a1a, 1);
            graphics.fillEllipse(wx - 2 - legKick, wy + 11, 3, 2);
            graphics.fillEllipse(wx + 4 + legKick, wy + 11, 3, 2);

            // Body (leather armor)
            graphics.fillStyle(armorColor, 1);
            graphics.fillCircle(wx, wy + wBob, 6);
            graphics.fillStyle(armorDark, 1);
            graphics.fillCircle(wx + 1, wy + wBob + 1, 5);

            // Arms reaching up to hold ram
            graphics.fillStyle(skinColor, 1);
            // Left arm
            graphics.beginPath();
            graphics.moveTo(wx - 4, wy + wBob - 2);
            graphics.lineTo(wx - 5, wy + wBob - 10);
            graphics.lineTo(wx - 3, wy + wBob - 10);
            graphics.lineTo(wx - 2, wy + wBob - 2);
            graphics.closePath();
            graphics.fillPath();
            // Right arm
            graphics.beginPath();
            graphics.moveTo(wx + 4, wy + wBob - 2);
            graphics.lineTo(wx + 5, wy + wBob - 10);
            graphics.lineTo(wx + 3, wy + wBob - 10);
            graphics.lineTo(wx + 2, wy + wBob - 2);
            graphics.closePath();
            graphics.fillPath();

            // Hands gripping (shown as small circles at top of arms)
            graphics.fillStyle(skinDark, 1);
            graphics.fillCircle(wx - 4, wy + wBob - 11, 2);
            graphics.fillCircle(wx + 4, wy + wBob - 11, 2);

            // Head
            graphics.fillStyle(skinColor, 1);
            graphics.fillCircle(wx, wy + wBob - 6, 4);
            // Helmet
            graphics.fillStyle(0x555555, 1);
            graphics.beginPath();
            graphics.arc(wx, wy + wBob - 7, 4, Math.PI, 0, false);
            graphics.closePath();
            graphics.fillPath();
            // Helmet spike
            graphics.fillStyle(0x666666, 1);
            graphics.beginPath();
            graphics.moveTo(wx - 1, wy + wBob - 11);
            graphics.lineTo(wx, wy + wBob - 14);
            graphics.lineTo(wx + 1, wy + wBob - 11);
            graphics.closePath();
            graphics.fillPath();
        }

        // === MASSIVE TREE TRUNK ===
        // Dark bark base layer
        graphics.fillStyle(0x3d2817, 1);
        graphics.beginPath();
        graphics.moveTo(backX + perpX * 1.1, backY + perpY * 1.1 - ramHeight + 2);
        graphics.lineTo(frontX + perpX * 0.9, frontY + perpY * 0.9 - ramHeight + 2);
        graphics.lineTo(frontX - perpX * 0.9, frontY - perpY * 0.9 - ramHeight + 2);
        graphics.lineTo(backX - perpX * 1.1, backY - perpY * 1.1 - ramHeight + 2);
        graphics.closePath();
        graphics.fillPath();

        // Main trunk body - rich brown wood
        graphics.fillStyle(0x5d3a1a, 1);
        graphics.beginPath();
        graphics.moveTo(backX + perpX, backY + perpY - ramHeight);
        graphics.lineTo(frontX + perpX * 0.85, frontY + perpY * 0.85 - ramHeight);
        graphics.lineTo(frontX - perpX * 0.85, frontY - perpY * 0.85 - ramHeight);
        graphics.lineTo(backX - perpX, backY - perpY - ramHeight);
        graphics.closePath();
        graphics.fillPath();

        // Wood highlight - top surface
        graphics.fillStyle(0x7a4a2a, 1);
        graphics.beginPath();
        graphics.moveTo(backX + perpX * 0.8, backY + perpY * 0.8 - ramHeight - 4);
        graphics.lineTo(frontX + perpX * 0.7, frontY + perpY * 0.7 - ramHeight - 4);
        graphics.lineTo(frontX - perpX * 0.4, frontY - perpY * 0.4 - ramHeight - 3);
        graphics.lineTo(backX - perpX * 0.4, backY - perpY * 0.4 - ramHeight - 3);
        graphics.closePath();
        graphics.fillPath();

        // Bark texture - deep grooves running lengthwise
        graphics.lineStyle(2, 0x2a1a0a, 0.7);
        for (let i = 0; i < 5; i++) {
            const offset = (i - 2) * 0.15;
            const gx1 = backX + perpX * offset;
            const gy1 = backY + perpY * offset - ramHeight - 1;
            const gx2 = frontX + perpX * offset * 0.8;
            const gy2 = frontY + perpY * offset * 0.8 - ramHeight - 1;
            graphics.lineBetween(gx1, gy1, gx2, gy2);
        }

        // Knots and wood details
        graphics.fillStyle(0x4a2a15, 1);
        const knot1T = 0.3;
        const knot1X = backX + (frontX - backX) * knot1T + perpX * 0.3;
        const knot1Y = backY + (frontY - backY) * knot1T + perpY * 0.3 - ramHeight - 2;
        graphics.fillCircle(knot1X, knot1Y, 3);
        graphics.fillStyle(0x3a1a0a, 1);
        graphics.fillCircle(knot1X, knot1Y, 1.5);

        const knot2T = 0.65;
        const knot2X = backX + (frontX - backX) * knot2T - perpX * 0.2;
        const knot2Y = backY + (frontY - backY) * knot2T - perpY * 0.2 - ramHeight - 1;
        graphics.fillStyle(0x4a2a15, 1);
        graphics.fillCircle(knot2X, knot2Y, 2.5);
        graphics.fillStyle(0x3a1a0a, 1);
        graphics.fillCircle(knot2X, knot2Y, 1);

        if (troopLevel >= 2) {
            // === IRON REINFORCEMENT RINGS (L2+) ===
            graphics.fillStyle(0x3a3a3a, 1);
            for (let i = 0; i < 5; i++) {
                const t = (i + 1) / 6;
                const bx = backX + (frontX - backX) * t;
                const by = backY + (frontY - backY) * t - ramHeight;
                graphics.beginPath();
                graphics.moveTo(bx + perpX * 1.15, by + perpY * 1.15 + 2);
                graphics.lineTo(bx - perpX * 1.15, by - perpY * 1.15 + 2);
                graphics.lineTo(bx - perpX * 1.15, by - perpY * 1.15 - 4);
                graphics.lineTo(bx + perpX * 1.15, by + perpY * 1.15 - 4);
                graphics.closePath();
                graphics.fillPath();
            }
            graphics.fillStyle(0x5a5a5a, 0.8);
            for (let i = 0; i < 5; i++) {
                const t = (i + 1) / 6;
                const bx = backX + (frontX - backX) * t;
                const by = backY + (frontY - backY) * t - ramHeight - 3;
                graphics.fillRect(bx - perpX * 0.3 - 3, by, 6, 1.5);
            }
            graphics.fillStyle(0x6a6a6a, 1);
            for (let i = 0; i < 5; i++) {
                const t = (i + 1) / 6;
                const bx = backX + (frontX - backX) * t;
                const by = backY + (frontY - backY) * t - ramHeight - 1;
                graphics.fillCircle(bx + perpX * 0.9, by + perpY * 0.9, 1.5);
                graphics.fillCircle(bx - perpX * 0.9, by - perpY * 0.9, 1.5);
            }

            // === MASSIVE IRON RAM HEAD (L2+) ===
            const headLength = 18;
            const tipX = frontX + cos * headLength + cos * chargeForward;
            const tipY = frontY + sin * headLength * 0.5 - ramHeight + sin * chargeForward * 0.5;

            graphics.fillStyle(0x2a2a2a, 1);
            graphics.beginPath();
            graphics.moveTo(frontX + perpX * 1.3, frontY + perpY * 1.3 - ramHeight + 3);
            graphics.lineTo(frontX - perpX * 1.3, frontY - perpY * 1.3 - ramHeight + 3);
            graphics.lineTo(frontX - perpX * 1.3, frontY - perpY * 1.3 - ramHeight - 6);
            graphics.lineTo(frontX + perpX * 1.3, frontY + perpY * 1.3 - ramHeight - 6);
            graphics.closePath();
            graphics.fillPath();

            graphics.fillStyle(0x4a4a4a, 1);
            graphics.beginPath();
            graphics.moveTo(tipX, tipY - 2);
            graphics.lineTo(frontX + perpX * 1.2, frontY + perpY * 1.2 - ramHeight + 2);
            graphics.lineTo(frontX + perpX * 1.2, frontY + perpY * 1.2 - ramHeight - 5);
            graphics.closePath();
            graphics.fillPath();

            graphics.fillStyle(0x3a3a3a, 1);
            graphics.beginPath();
            graphics.moveTo(tipX, tipY - 2);
            graphics.lineTo(frontX - perpX * 1.2, frontY - perpY * 1.2 - ramHeight + 2);
            graphics.lineTo(frontX - perpX * 1.2, frontY - perpY * 1.2 - ramHeight - 5);
            graphics.closePath();
            graphics.fillPath();

            graphics.fillStyle(0x6a6a6a, 1);
            graphics.beginPath();
            graphics.moveTo(tipX + 1, tipY - 4);
            graphics.lineTo(frontX + perpX * 0.3, frontY + perpY * 0.3 - ramHeight - 4);
            graphics.lineTo(frontX + perpX * 0.6, frontY + perpY * 0.6 - ramHeight - 2);
            graphics.closePath();
            graphics.fillPath();

            // Decorative ram horns
            graphics.fillStyle(0x555555, 1);
            graphics.beginPath();
            graphics.moveTo(frontX + perpX * 1.1 + cos * 4, frontY + perpY * 1.1 - ramHeight - 4);
            graphics.lineTo(frontX + perpX * 1.8 + cos * 2, frontY + perpY * 1.8 - ramHeight - 8);
            graphics.lineTo(frontX + perpX * 1.5 + cos * 6, frontY + perpY * 1.5 - ramHeight - 6);
            graphics.closePath();
            graphics.fillPath();
            graphics.beginPath();
            graphics.moveTo(frontX - perpX * 1.1 + cos * 4, frontY - perpY * 1.1 - ramHeight - 4);
            graphics.lineTo(frontX - perpX * 1.8 + cos * 2, frontY - perpY * 1.8 - ramHeight - 8);
            graphics.lineTo(frontX - perpX * 1.5 + cos * 6, frontY - perpY * 1.5 - ramHeight - 6);
            graphics.closePath();
            graphics.fillPath();

            // Menacing eyes
            graphics.fillStyle(0xff3300, 0.9);
            graphics.fillCircle(frontX + perpX * 0.5 + cos * 8, frontY + perpY * 0.5 - ramHeight - 2, 2);
            graphics.fillCircle(frontX - perpX * 0.5 + cos * 8, frontY - perpY * 0.5 - ramHeight - 2, 2);
            graphics.fillStyle(0xffff00, 0.7);
            graphics.fillCircle(frontX + perpX * 0.5 + cos * 8.5, frontY + perpY * 0.5 - ramHeight - 2.5, 0.8);
            graphics.fillCircle(frontX - perpX * 0.5 + cos * 8.5, frontY - perpY * 0.5 - ramHeight - 2.5, 0.8);
        } else {
            // === L1: SIMPLE ROPE BINDINGS ===
            graphics.lineStyle(2, 0x8a7a5a, 1);
            for (let i = 0; i < 3; i++) {
                const t = (i + 1) / 4;
                const bx = backX + (frontX - backX) * t;
                const by = backY + (frontY - backY) * t - ramHeight - 1;
                graphics.lineBetween(bx + perpX * 1.05, by + perpY * 1.05, bx - perpX * 1.05, by - perpY * 1.05);
            }

            // === L1: SIMPLE POINTED WOODEN TIP ===
            const tipLen = 10;
            const tipX = frontX + cos * tipLen + cos * chargeForward;
            const tipY = frontY + sin * tipLen * 0.5 - ramHeight + sin * chargeForward * 0.5;
            // Tapered wood point
            graphics.fillStyle(0x4a2a15, 1);
            graphics.beginPath();
            graphics.moveTo(tipX, tipY - 2);
            graphics.lineTo(frontX + perpX * 0.9, frontY + perpY * 0.9 - ramHeight + 1);
            graphics.lineTo(frontX + perpX * 0.9, frontY + perpY * 0.9 - ramHeight - 4);
            graphics.closePath();
            graphics.fillPath();
            graphics.fillStyle(0x3a1a0a, 1);
            graphics.beginPath();
            graphics.moveTo(tipX, tipY - 2);
            graphics.lineTo(frontX - perpX * 0.9, frontY - perpY * 0.9 - ramHeight + 1);
            graphics.lineTo(frontX - perpX * 0.9, frontY - perpY * 0.9 - ramHeight - 4);
            graphics.closePath();
            graphics.fillPath();
        }

        // === BACK END - Rough cut wood ===
        graphics.fillStyle(0x6a4a2a, 1);
        graphics.beginPath();
        graphics.arc(backX, backY - ramHeight - 1, ramWidth * 0.45, 0, Math.PI * 2);
        graphics.closePath();
        graphics.fillPath();
    }

    private static drawStormMage(graphics: Phaser.GameObjects.Graphics, isPlayer: boolean) {
        const now = Date.now();
        const robeColor = isPlayer ? 0x3344aa : 0x882222;
        const robeDark = isPlayer ? 0x222277 : 0x661111;
        const skinColor = isPlayer ? 0xdeb887 : 0xc9a66b;
        const glowColor = 0x00ffff;

        // Static electricity sparks
        for (let i = 0; i < 3; i++) {
            const angle = (now / 100 + i * 2) % (Math.PI * 2);
            const dist = 12 + Math.sin(now / 200 + i) * 4;
            const px = Math.cos(angle) * dist;
            const py = Math.sin(angle) * dist * 0.6 - 10;
            graphics.fillStyle(glowColor, 0.4 + Math.sin(now / 50 + i) * 0.3);
            graphics.fillCircle(px, py, 1.5);
        }

        // Shadow
        graphics.fillStyle(0x000000, 0.25);
        graphics.fillEllipse(0, 12, 12, 5);

        // Robe skirt
        graphics.fillStyle(robeDark, 1);
        graphics.beginPath();
        graphics.moveTo(-7, 2);
        graphics.lineTo(7, 2);
        graphics.lineTo(5, 11);
        graphics.lineTo(-5, 11);
        graphics.closePath();
        graphics.fillPath();
        graphics.fillStyle(robeColor, 1);
        graphics.beginPath();
        graphics.moveTo(-6, 2);
        graphics.lineTo(6, 2);
        graphics.lineTo(4, 10);
        graphics.lineTo(-4, 10);
        graphics.closePath();
        graphics.fillPath();

        // Torso
        graphics.fillStyle(robeDark, 1);
        graphics.fillRect(-5, -5, 10, 8);
        graphics.fillStyle(robeColor, 1);
        graphics.fillRect(-4, -4, 8, 7);

        // Belt/sash with lightning emblem
        graphics.fillStyle(0xc9a227, 1);
        graphics.fillRect(-5, 0, 10, 2);

        // Head
        graphics.fillStyle(skinColor, 1);
        graphics.fillCircle(0, -9, 4);

        // Pointy wizard hat
        graphics.fillStyle(robeDark, 1);
        graphics.beginPath();
        graphics.moveTo(-6, -8);
        graphics.lineTo(6, -8);
        graphics.lineTo(0, -22);
        graphics.closePath();
        graphics.fillPath();
        graphics.fillStyle(robeColor, 1);
        graphics.beginPath();
        graphics.moveTo(-5, -9);
        graphics.lineTo(5, -9);
        graphics.lineTo(0, -21);
        graphics.closePath();
        graphics.fillPath();
        // Hat brim
        graphics.fillStyle(robeDark, 1);
        graphics.fillEllipse(0, -8, 14, 4);

        // Eyes
        graphics.fillStyle(0x2244aa, 1);
        graphics.fillCircle(-1.5, -9, 1);
        graphics.fillCircle(1.5, -9, 1);

        // Staff in right hand
        graphics.fillStyle(0x5d4e37, 1);
        graphics.fillRect(7, -18, 3, 26);
        graphics.fillStyle(0x4a3520, 1);
        graphics.fillRect(8, -18, 1.5, 26);

        // Staff crystal (electric)
        const crystalGlow = 0.7 + Math.sin(now / 80) * 0.3;
        graphics.fillStyle(glowColor, 0.25 * crystalGlow);
        graphics.fillCircle(8.5, -20, 7);
        graphics.fillStyle(glowColor, 0.9);
        graphics.fillCircle(8.5, -20, 3);
        graphics.fillStyle(0xffffff, 0.8);
        graphics.fillCircle(7.5, -21.5, 1.2);

        // Lightning arc from staff tip (occasional)
        if (Math.sin(now / 60) > 0.6) {
            graphics.lineStyle(1, 0xffffff, 0.8);
            const arcX = 8.5 + Math.sin(now / 30) * 6;
            const arcY = -20 + Math.cos(now / 40) * 5;
            graphics.lineBetween(8.5, -20, arcX, arcY);
        }

        // Left arm raised (casting gesture)
        graphics.fillStyle(robeColor, 1);
        graphics.beginPath();
        graphics.moveTo(-4, -3);
        graphics.lineTo(-10, -10);
        graphics.lineTo(-8, -11);
        graphics.lineTo(-3, -5);
        graphics.closePath();
        graphics.fillPath();
        // Hand with spark
        graphics.fillStyle(skinColor, 1);
        graphics.fillCircle(-9, -10.5, 2);
        const sparkAlpha = 0.3 + Math.sin(now / 70) * 0.3;
        graphics.fillStyle(glowColor, sparkAlpha);
        graphics.fillCircle(-9, -12, 2);
    }

    static drawDaVinciTank(graphics: Phaser.GameObjects.Graphics, isPlayer: boolean, _isMoving: boolean, isDeactivated: boolean = false, facingAngle: number = 0) {
        // LEONARDO DA VINCI'S ARMORED WAR MACHINE
        // Conical wooden tank with cannons all around the base - NO rotation when moving
        // Rotation only happens after each shot (controlled by facingAngle from MainScene)

        // Use facingAngle for rotation - only changes when shooting
        const rotation = facingAngle;

        // Colors - warm wood tones
        const woodMain = isDeactivated ? 0x6a5040 : (isPlayer ? 0xc9a07a : 0xb8956e);
        const woodDark = isDeactivated ? 0x4a3530 : (isPlayer ? 0x9a7050 : 0x8a6548);
        const woodLight = isDeactivated ? 0x8a7060 : (isPlayer ? 0xdab898 : 0xd0a080);
        const woodPlank = isDeactivated ? 0x5a4535 : (isPlayer ? 0xb08560 : 0xa57852);
        const metalColor = isDeactivated ? 0x3a3a3a : 0x4a4a4a;
        const metalDark = isDeactivated ? 0x2a2a2a : 0x333333;
        const cannonColor = isDeactivated ? 0x2a2a2a : 0x1a1a1a;

        // Deactivation visual - darker, no glow
        const alpha = isDeactivated ? 0.7 : 1;

        // Giant shadow
        graphics.fillStyle(0x000000, 0.4 * alpha);
        graphics.fillEllipse(0, 15, 50, 25);

        // === BASE PLATFORM ===
        graphics.fillStyle(woodDark, alpha);
        graphics.beginPath();
        graphics.moveTo(-28, 10);
        graphics.lineTo(28, 10);
        graphics.lineTo(22, 18);
        graphics.lineTo(-22, 18);
        graphics.closePath();
        graphics.fillPath();

        graphics.fillStyle(woodPlank, alpha);
        graphics.beginPath();
        graphics.moveTo(-26, 8);
        graphics.lineTo(26, 8);
        graphics.lineTo(22, 14);
        graphics.lineTo(-22, 14);
        graphics.closePath();
        graphics.fillPath();

        // === CANNON RING (8 cannons around the base) ===
        const numCannons = 8;
        const cannonRingRadius = 26;
        const cannonLength = 12;

        for (let i = 0; i < numCannons; i++) {
            const angle = rotation + (i / numCannons) * Math.PI * 2;
            const cx = Math.cos(angle) * cannonRingRadius;
            const cy = Math.sin(angle) * cannonRingRadius * 0.5 + 2; // Flatten for iso

            // Cannon mount (dark rectangle)
            graphics.fillStyle(metalDark, alpha);
            const mountSize = 5;
            graphics.fillRect(cx - mountSize / 2, cy - mountSize / 2, mountSize, mountSize);

            // Cannon barrel
            const barrelEndX = cx + Math.cos(angle) * cannonLength;
            const barrelEndY = cy + Math.sin(angle) * cannonLength * 0.5;

            graphics.lineStyle(4, cannonColor, alpha);
            graphics.lineBetween(cx, cy, barrelEndX, barrelEndY);

            // Cannon muzzle ring
            graphics.fillStyle(metalColor, alpha);
            graphics.fillCircle(barrelEndX, barrelEndY, 3);
            graphics.fillStyle(0x000000, alpha);
            graphics.fillCircle(barrelEndX, barrelEndY, 1.5);
        }

        // === LOWER CONE (sloped wooden armor) ===
        // Draw as polygonal cone with wood planks
        const coneSegments = 16;
        const coneBaseRadius = 24;
        const coneMidRadius = 18;
        const coneBaseY = 5;
        const coneMidY = -15;

        // Draw cone sides as trapezoids (wood planks)
        for (let i = 0; i < coneSegments; i++) {
            const angle1 = rotation + (i / coneSegments) * Math.PI * 2;
            const angle2 = rotation + ((i + 1) / coneSegments) * Math.PI * 2;

            // Base points
            const bx1 = Math.cos(angle1) * coneBaseRadius;
            const by1 = Math.sin(angle1) * coneBaseRadius * 0.5 + coneBaseY;
            const bx2 = Math.cos(angle2) * coneBaseRadius;
            const by2 = Math.sin(angle2) * coneBaseRadius * 0.5 + coneBaseY;

            // Mid-cone points
            const mx1 = Math.cos(angle1) * coneMidRadius;
            const my1 = Math.sin(angle1) * coneMidRadius * 0.5 + coneMidY;
            const mx2 = Math.cos(angle2) * coneMidRadius;
            const my2 = Math.sin(angle2) * coneMidRadius * 0.5 + coneMidY;

            // Alternate plank colors for texture
            const plankColor = i % 2 === 0 ? woodMain : woodPlank;
            graphics.fillStyle(plankColor, alpha);
            graphics.beginPath();
            graphics.moveTo(bx1, by1);
            graphics.lineTo(bx2, by2);
            graphics.lineTo(mx2, my2);
            graphics.lineTo(mx1, my1);
            graphics.closePath();
            graphics.fillPath();

            // Plank line (groove between planks)
            graphics.lineStyle(1, woodDark, alpha * 0.6);
            graphics.lineBetween(bx1, by1, mx1, my1);
        }

        // === UPPER CONE (steeper slope to turret) ===
        const coneTopRadius = 8;
        const coneTopY = -32;

        for (let i = 0; i < coneSegments; i++) {
            const angle1 = rotation + (i / coneSegments) * Math.PI * 2;
            const angle2 = rotation + ((i + 1) / coneSegments) * Math.PI * 2;

            // Mid-cone points
            const mx1 = Math.cos(angle1) * coneMidRadius;
            const my1 = Math.sin(angle1) * coneMidRadius * 0.5 + coneMidY;
            const mx2 = Math.cos(angle2) * coneMidRadius;
            const my2 = Math.sin(angle2) * coneMidRadius * 0.5 + coneMidY;

            // Top points
            const tx1 = Math.cos(angle1) * coneTopRadius;
            const ty1 = Math.sin(angle1) * coneTopRadius * 0.5 + coneTopY;
            const tx2 = Math.cos(angle2) * coneTopRadius;
            const ty2 = Math.sin(angle2) * coneTopRadius * 0.5 + coneTopY;

            const plankColor = i % 2 === 0 ? woodLight : woodMain;
            graphics.fillStyle(plankColor, alpha);
            graphics.beginPath();
            graphics.moveTo(mx1, my1);
            graphics.lineTo(mx2, my2);
            graphics.lineTo(tx2, ty2);
            graphics.lineTo(tx1, ty1);
            graphics.closePath();
            graphics.fillPath();

            graphics.lineStyle(1, woodDark, alpha * 0.5);
            graphics.lineBetween(mx1, my1, tx1, ty1);
        }

        // === TURRET RIM (metal band) - Only draw FRONT arc to avoid layering issues ===
        graphics.lineStyle(3, metalColor, alpha);
        // Draw front half of ellipse only (from -PI/2 to PI/2 relative to view)
        graphics.beginPath();
        for (let t = 0; t <= Math.PI; t += 0.1) {
            const px = Math.cos(t) * coneMidRadius;
            const py = Math.sin(t) * coneMidRadius * 0.5 + coneMidY;
            if (t === 0) graphics.moveTo(px, py);
            else graphics.lineTo(px, py);
        }
        graphics.strokePath();

        // === TOP TURRET (viewing platform with smaller cone) ===
        const turretRadius = 10;
        const turretY = coneTopY;

        // Turret base ring
        graphics.fillStyle(metalDark, alpha);
        graphics.fillEllipse(0, turretY + 2, turretRadius * 2 + 2, turretRadius + 1);
        graphics.fillStyle(woodDark, alpha);
        graphics.fillEllipse(0, turretY, turretRadius * 2, turretRadius);

        // Small top cone
        const topConeRadius = 6;
        const topConeY = coneTopY - 12;

        for (let i = 0; i < 8; i++) {
            const angle1 = rotation + (i / 8) * Math.PI * 2;
            const angle2 = rotation + ((i + 1) / 8) * Math.PI * 2;

            const bx1 = Math.cos(angle1) * coneTopRadius;
            const by1 = Math.sin(angle1) * coneTopRadius * 0.5 + turretY;
            const bx2 = Math.cos(angle2) * coneTopRadius;
            const by2 = Math.sin(angle2) * coneTopRadius * 0.5 + turretY;

            const tx1 = Math.cos(angle1) * topConeRadius * 0.3;
            const ty1 = Math.sin(angle1) * topConeRadius * 0.3 * 0.5 + topConeY;
            const tx2 = Math.cos(angle2) * topConeRadius * 0.3;
            const ty2 = Math.sin(angle2) * topConeRadius * 0.3 * 0.5 + topConeY;

            const topPlankColor = i % 2 === 0 ? woodLight : woodMain;
            graphics.fillStyle(topPlankColor, alpha);
            graphics.beginPath();
            graphics.moveTo(bx1, by1);
            graphics.lineTo(bx2, by2);
            graphics.lineTo(tx2, ty2);
            graphics.lineTo(tx1, ty1);
            graphics.closePath();
            graphics.fillPath();
        }

        // Top finial (metal spike)
        graphics.fillStyle(metalColor, alpha);
        graphics.beginPath();
        graphics.moveTo(0, topConeY - 8);
        graphics.lineTo(-3, topConeY);
        graphics.lineTo(3, topConeY);
        graphics.closePath();
        graphics.fillPath();
        graphics.fillStyle(metalDark, alpha);
        graphics.fillCircle(0, topConeY, 3);

        // === VIEWING SLITS (between lower and upper cone) - Only FRONT half ===
        for (let i = 0; i < 8; i++) {
            const angle = rotation + (i / 8) * Math.PI * 2 + Math.PI / 8;
            const slitY = Math.sin(angle) * (coneMidRadius - 2) * 0.5 + coneMidY + 3;

            // Only draw if on FRONT side (positive Y relative to center means front)
            if (Math.sin(angle) > -0.2) {
                const slitX = Math.cos(angle) * (coneMidRadius - 2);
                graphics.fillStyle(0x000000, alpha * 0.8);
                graphics.fillRect(slitX - 3, slitY - 1, 6, 2);
            }
        }

        // === RIVETS along the metal bands - Only FRONT half ===
        graphics.fillStyle(metalColor, alpha);
        for (let i = 0; i < 12; i++) {
            const angle = rotation + (i / 12) * Math.PI * 2;

            // Only draw if on FRONT side
            if (Math.sin(angle) > -0.2) {
                const rx = Math.cos(angle) * (coneMidRadius + 1);
                const ry = Math.sin(angle) * (coneMidRadius + 1) * 0.5 + coneMidY;
                graphics.fillCircle(rx, ry, 1.5);
            }
        }

        // === DEACTIVATION EFFECT ===
        if (isDeactivated) {
            // Smoke wisps from deactivated tank
            const now = Date.now();
            for (let i = 0; i < 3; i++) {
                const smokePhase = ((now / 2000) + i * 0.33) % 1;
                const smokeX = (Math.random() - 0.5) * 10;
                const smokeY = -35 - smokePhase * 30;
                const smokeAlpha = (1 - smokePhase) * 0.3;
                graphics.fillStyle(0x333333, smokeAlpha);
                graphics.fillCircle(smokeX, smokeY, 3 + smokePhase * 4);
            }

            // Damage marks
            graphics.fillStyle(0x2a1a0a, 0.6);
            graphics.fillCircle(-8, -5, 4);
            graphics.fillCircle(10, -18, 3);
            graphics.fillCircle(-5, -28, 2);
        }
    }

    // === ROMAN SOLDIER - Individual Legionary ===
    static drawRomanSoldier(graphics: Phaser.GameObjects.Graphics, isPlayer: boolean, isMoving: boolean, facingAngle: number, isTestudo: boolean, spearOffset: number = 0, sx: number = 0, sy: number = 0, stagger: number = 0) {
        const now = Date.now();
        const marchPhase = isMoving ? (now % 600) / 600 : 0;
        const legPhase = (marchPhase + stagger) % 1;

        // Colors - Roman legion colors
        const shieldMain = isPlayer ? 0xcc3333 : 0x554433;
        const shieldTrim = isPlayer ? 0xd4a84b : 0x8b7355;
        const shieldBoss = isPlayer ? 0xffd700 : 0xaa9977;
        const tunicColor = isPlayer ? 0xbb2222 : 0x443322;
        const armorColor = isPlayer ? 0x888899 : 0x777788;
        const skinColor = 0xd4a574;
        const spearWood = 0x5d4e37;
        const spearTip = 0x555566;

        const marchBob = isMoving ? Math.sin((now / 150) + stagger * 10) * 2 : 0;
        const currentSy = sy + marchBob;

        // === SOLDIER BODY ===
        // Legs
        const legSpread = isMoving ? Math.sin(legPhase * Math.PI * 2) * 3 : 0;
        graphics.fillStyle(tunicColor, 1);
        graphics.fillRect(sx - 3 + legSpread, currentSy + 2, 2, 8);
        graphics.fillRect(sx + 1 - legSpread, currentSy + 2, 2, 8);

        // Sandals
        graphics.fillStyle(0x4a3a2a, 1);
        graphics.fillRect(sx - 4 + legSpread, currentSy + 9, 3, 2);
        graphics.fillRect(sx + 1 - legSpread, currentSy + 9, 3, 2);

        // Torso (tunic)
        graphics.fillStyle(tunicColor, 1);
        graphics.fillRect(sx - 4, currentSy - 6, 8, 10);

        // Armor strips (lorica segmentata)
        graphics.fillStyle(armorColor, 1);
        for (let strip = 0; strip < 3; strip++) {
            graphics.fillRect(sx - 4, currentSy - 5 + strip * 3, 8, 2);
        }

        // Arms
        graphics.fillStyle(skinColor, 1);
        graphics.fillRect(sx - 6, currentSy - 4, 2, 6);
        graphics.fillRect(sx + 4, currentSy - 4, 2, 6);

        // Head
        graphics.fillStyle(skinColor, 1);
        graphics.fillCircle(sx, currentSy - 10, 4);

        // Helmet
        graphics.fillStyle(armorColor, 1);
        graphics.fillRect(sx - 4, currentSy - 14, 8, 4);
        graphics.fillStyle(0x666677, 1);
        graphics.fillRect(sx - 1, currentSy - 16, 2, 3); // Crest base
        graphics.fillStyle(0xcc2222, 1);
        graphics.fillRect(sx - 1, currentSy - 19, 2, 4);

        // === SPEAR ===
        const spearLength = 28;
        const thrust = spearOffset * 15;
        const spearStartX = sx + Math.cos(facingAngle) * thrust;
        const spearStartY = currentSy - 8 + Math.sin(facingAngle) * thrust * 0.5;
        const spearEndX = sx + Math.cos(facingAngle) * (spearLength + thrust);
        const spearEndY = currentSy - 8 + Math.sin(facingAngle) * (spearLength + thrust) * 0.5;

        graphics.lineStyle(2, spearWood, 1);
        graphics.lineBetween(spearStartX, spearStartY, spearEndX, spearEndY);

        // Spear tip
        graphics.fillStyle(spearTip, 1);
        graphics.beginPath();
        graphics.moveTo(spearEndX + Math.cos(facingAngle) * 6, spearEndY + Math.sin(facingAngle) * 3);
        graphics.lineTo(spearEndX + Math.cos(facingAngle + 2.5) * 3, spearEndY + Math.sin(facingAngle + 2.5) * 1.5);
        graphics.lineTo(spearEndX + Math.cos(facingAngle - 2.5) * 3, spearEndY + Math.sin(facingAngle - 2.5) * 1.5);
        graphics.closePath();
        graphics.fillPath();

        // === SHIELD ===
        const shieldSize = 11;
        if (isTestudo) {
            // Overhead shield (roof)
            graphics.fillStyle(shieldMain, 1);
            graphics.fillRect(sx - shieldSize / 2, currentSy - 16 - shieldSize / 2, shieldSize, shieldSize);
            graphics.lineStyle(1.5, shieldTrim, 1);
            graphics.strokeRect(sx - shieldSize / 2, currentSy - 16 - shieldSize / 2, shieldSize, shieldSize);
            graphics.fillStyle(shieldBoss, 1);
            graphics.fillCircle(sx, currentSy - 16, 3);
            graphics.fillStyle(0x000000, 0.2);
            graphics.fillCircle(sx, currentSy - 16, 1.5);
        } else {
            // Frontal Scutum (individual soldier)
            const shieldX = sx + Math.cos(facingAngle) * 6;
            const shieldY = currentSy - 4 + Math.sin(facingAngle) * 3;
            graphics.fillStyle(shieldMain, 1);
            graphics.fillRect(shieldX - 5, shieldY - 8, 10, 16);
            graphics.lineStyle(1, shieldTrim, 1);
            graphics.strokeRect(shieldX - 5, shieldY - 8, 10, 16);
            graphics.fillStyle(shieldBoss, 1);
            graphics.fillCircle(shieldX, shieldY, 2.5);
        }
    }

    // === PHALANX - Roman Testudo Formation (3x3 soldiers with shields overhead) ===
    static drawPhalanx(graphics: Phaser.GameObjects.Graphics, isPlayer: boolean, isMoving: boolean, facingAngle: number, spearOffset: number = 0) {
        // Shadow
        graphics.fillStyle(0x000000, 0.4);
        graphics.fillEllipse(0, 8, 50, 25);

        // Draw 3x3 grid of soldiers from back to front for proper layering
        const soldierSpacing = 12;
        const rows = [
            { y: -1, soldiers: [-1, 0, 1] },
            { y: 0, soldiers: [-1, 0, 1] },
            { y: 1, soldiers: [-1, 0, 1] }
        ];

        const cos = Math.cos(facingAngle);
        const sin = Math.sin(facingAngle);

        const soldiers: Array<{ wx: number, wy: number, row: number, col: number }> = [];
        for (const row of rows) {
            for (const col of row.soldiers) {
                const localX = col * soldierSpacing;
                const localY = row.y * soldierSpacing;
                const wx = localX * cos - localY * sin;
                const wy = localX * sin * 0.5 + localY * cos * 0.5;
                soldiers.push({ wx, wy, row: row.y, col });
            }
        }
        soldiers.sort((a, b) => a.wy - b.wy);

        for (const s of soldiers) {
            const stagger = (s.row + s.col) * 0.15;
            this.drawRomanSoldier(graphics, isPlayer, isMoving, facingAngle, true, spearOffset, s.wx, s.wy, stagger);
        }

        // Banner/Standard (center back)
        const bannerX = -Math.cos(facingAngle) * 15;
        const bannerY = -Math.sin(facingAngle) * 7.5 - 5;
        graphics.lineStyle(2, 0x5d4e37, 1);
        graphics.lineBetween(bannerX, bannerY, bannerX, bannerY - 25);
        graphics.fillStyle(isPlayer ? 0xcc3333 : 0x554433, 1);
        graphics.fillRect(bannerX - 5, bannerY - 25, 10, 8);
        graphics.lineStyle(1.5, isPlayer ? 0xd4a84b : 0x8b7355, 1);
        graphics.strokeRect(bannerX - 5, bannerY - 25, 10, 8);
    }
}
