import Phaser from 'phaser';

export interface ParticleOptions {
    x: number;
    y: number;
    depth?: number;
    onDraw: (graphics: Phaser.GameObjects.Graphics) => void;
    duration?: number;
    onComplete?: () => void;
    scale?: { from: number; to: number } | number;
    alpha?: { from: number; to: number } | number;
    move?: { x: number; y: number }; // Target position
    rotation?: number;
    blendMode?: Phaser.BlendModes | string;
}

export class ParticleManager {
    private static instance: ParticleManager;
    private scene!: Phaser.Scene;
    private pool: Phaser.GameObjects.Graphics[] = [];
    private active: Phaser.GameObjects.Graphics[] = [];

    private constructor() { }

    public static getInstance(): ParticleManager {
        if (!ParticleManager.instance) {
            ParticleManager.instance = new ParticleManager();
        }
        return ParticleManager.instance;
    }

    public init(scene: Phaser.Scene) {
        this.scene = scene;
        // Pre-warm the pool
        for (let i = 0; i < 50; i++) {
            this.createGraphic();
        }
    }

    private createGraphic(): Phaser.GameObjects.Graphics {
        const g = this.scene.add.graphics();
        g.setVisible(false);
        this.pool.push(g);
        return g;
    }

    public getPooledGraphic(): Phaser.GameObjects.Graphics {
        let g = this.pool.pop();
        if (!g) {
            g = this.scene.add.graphics();
        }
        this.active.push(g);
        g.clear();
        g.setVisible(true);
        g.setAlpha(1);
        g.setScale(1);
        g.setRotation(0);
        g.setPosition(0, 0); // CRITICAL: Reset position to prevent ghost graphics
        g.setDepth(1);
        return g;
    }

    public spawn(options: ParticleOptions): Phaser.GameObjects.Graphics | null {
        if (!this.scene) return null;

        let g = this.pool.pop();
        if (!g) {
            g = this.scene.add.graphics();
        }

        this.active.push(g);

        // Reset state
        g.clear();
        g.setVisible(true);
        g.setAlpha(1);
        g.setScale(1);
        g.setRotation(options.rotation || 0);
        g.setPosition(options.x, options.y);
        g.setDepth(options.depth || 10000);
        if (options.blendMode) g.setBlendMode(options.blendMode);

        // Draw
        options.onDraw(g);

        // Animate
        const tweenConfig: any = {
            targets: g,
            duration: options.duration || 1000,
            onComplete: () => {
                if (options.onComplete) options.onComplete();
                this.returnToPool(g!);
            }
        };

        if (options.scale !== undefined) {
            if (typeof options.scale === 'number') tweenConfig.scale = options.scale;
            else tweenConfig.scale = options.scale;
        }

        if (options.alpha !== undefined) {
            if (typeof options.alpha === 'number') tweenConfig.alpha = options.alpha;
            else tweenConfig.alpha = options.alpha;
        }

        if (options.move) {
            tweenConfig.x = options.move.x;
            tweenConfig.y = options.move.y;
        }

        this.scene.tweens.add(tweenConfig);

        return g;
    }

    public returnToPool(g: Phaser.GameObjects.Graphics) {
        g.setVisible(false);
        g.clear();
        // Remove from active
        const idx = this.active.indexOf(g);
        if (idx !== -1) {
            this.active.splice(idx, 1);
        }
        this.pool.push(g);
    }

    public clearAll() {
        this.active.forEach(g => g.destroy());
        this.pool.forEach(g => g.destroy());
        this.active = [];
        this.pool = [];
    }
}

export const particleManager = ParticleManager.getInstance();
