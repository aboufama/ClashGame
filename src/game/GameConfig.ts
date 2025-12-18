
import Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';

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
    }
};
