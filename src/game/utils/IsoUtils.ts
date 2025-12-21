
import Phaser from 'phaser';

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

export class IsoUtils {
    static cartToIso(cartX: number, cartY: number): Phaser.Math.Vector2 {
        const isoX = (cartX - cartY) * TILE_WIDTH * 0.5;
        const isoY = (cartX + cartY) * TILE_HEIGHT * 0.5;
        return new Phaser.Math.Vector2(isoX, isoY);
    }

    static isoToCart(isoX: number, isoY: number): Phaser.Math.Vector2 {
        const cartX = (isoX / (TILE_WIDTH * 0.5) + isoY / (TILE_HEIGHT * 0.5)) * 0.5;
        const cartY = (isoY / (TILE_HEIGHT * 0.5) - isoX / (TILE_WIDTH * 0.5)) * 0.5;
        return new Phaser.Math.Vector2(cartX, cartY);
    }
}
