
import Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import { MobileUtils } from './utils/MobileUtils';

const isMobile = MobileUtils.isMobile();

export const GameConfig: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    backgroundColor: '#87CEEB', // Sky color, or we fill with grass
    scene: [MainScene],
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    pixelArt: true, // Crisper for pixel art or rigid shapes
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    },
    // Mobile optimizations
    fps: {
        target: isMobile ? 30 : 60, // Lower FPS target on mobile for battery life
        forceSetTimeOut: isMobile // More battery-friendly on mobile
    },
    render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true,
        powerPreference: isMobile ? 'low-power' : 'high-performance'
    },
    input: {
        touch: true,
        mouse: true
    }
};
