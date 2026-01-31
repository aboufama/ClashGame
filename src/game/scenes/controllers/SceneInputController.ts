import Phaser from 'phaser';
import { Backend } from '../../backend/GameBackend';
import { BUILDING_DEFINITIONS, type BuildingType, type TroopType } from '../../config/GameDefinitions';
import { gameManager } from '../../GameManager';
import { depthForBuilding, depthForGroundPlane } from '../../systems/DepthSystem';
import { IsoUtils } from '../../utils/IsoUtils';
import { MobileUtils } from '../../utils/MobileUtils';
import type { MainScene } from '../MainScene';

const BUILDINGS = BUILDING_DEFINITIONS as any;

export class SceneInputController {
    private scene: MainScene;

    // Touch/pinch state
    private isPinching: boolean = false;
    private pinchStartDistance: number = 0;
    private pinchStartZoom: number = 1;
    private lastPinchCenter: { x: number; y: number } | null = null;
    private lastTouchCount: number = 0;
    private touchStartTime: number = 0;
    private lastTapTime: number = 0;
    private isTouchDragging: boolean = false;

    constructor(scene: MainScene) {
        this.scene = scene;
        this.setupTouchHandlers();
    }

    /**
     * Setup native touch handlers for pinch-to-zoom
     */
    private setupTouchHandlers(): void {
        if (!MobileUtils.isTouchDevice()) return;

        const canvas = this.scene.game.canvas;

        canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
    }

    private onTouchStart(e: TouchEvent): void {
        this.touchStartTime = Date.now();
        this.lastTouchCount = e.touches.length;

        if (e.touches.length === 2) {
            // Start pinch gesture
            e.preventDefault();
            this.isPinching = true;
            this.isTouchDragging = false;
            this.pinchStartDistance = MobileUtils.getTouchDistance(e.touches[0], e.touches[1]);
            this.pinchStartZoom = this.scene.cameras.main.zoom;
            // Store initial pinch center for pan tracking
            const canvas = this.scene.game.canvas;
            this.lastPinchCenter = MobileUtils.getTouchCenter(e.touches[0], e.touches[1], canvas);
        } else if (e.touches.length === 1) {
            this.isTouchDragging = false;
            this.lastPinchCenter = null;
        }
    }

    private onTouchMove(e: TouchEvent): void {
        if (e.touches.length === 2 && this.isPinching) {
            e.preventDefault();

            const camera = this.scene.cameras.main;
            const canvas = this.scene.game.canvas;

            // Get current pinch center
            const pinchCenter = MobileUtils.getTouchCenter(e.touches[0], e.touches[1], canvas);

            // Handle panning (movement of pinch center)
            if (this.lastPinchCenter) {
                const panDeltaX = this.lastPinchCenter.x - pinchCenter.x;
                const panDeltaY = this.lastPinchCenter.y - pinchCenter.y;

                // Convert screen delta to world delta using current zoom
                camera.scrollX += panDeltaX / camera.zoom;
                camera.scrollY += panDeltaY / camera.zoom;
            }

            // Handle zooming
            const currentDistance = MobileUtils.getTouchDistance(e.touches[0], e.touches[1]);
            const scale = currentDistance / this.pinchStartDistance;
            let newZoom = this.pinchStartZoom * scale;

            // Clamp zoom
            const minZoom = MobileUtils.getMinZoom();
            const maxZoom = MobileUtils.getMaxZoom();
            newZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));

            const oldZoom = camera.zoom;

            if (newZoom !== oldZoom) {
                // In Phaser, camera.scrollX/Y is where the CENTER of the camera view is in world space
                const viewportCenterX = camera.width / 2;
                const viewportCenterY = camera.height / 2;

                // Calculate the world point under the pinch center with current zoom
                const worldX = camera.scrollX + (pinchCenter.x - viewportCenterX) / oldZoom;
                const worldY = camera.scrollY + (pinchCenter.y - viewportCenterY) / oldZoom;

                // Apply new zoom
                camera.setZoom(newZoom);

                // Calculate new scroll so the same world point stays under the pinch center
                camera.scrollX = worldX - (pinchCenter.x - viewportCenterX) / newZoom;
                camera.scrollY = worldY - (pinchCenter.y - viewportCenterY) / newZoom;
            }

            // Store current center for next frame
            this.lastPinchCenter = pinchCenter;
        } else if (e.touches.length === 1 && !this.isPinching) {
            this.isTouchDragging = true;
        }
    }

    private onTouchEnd(e: TouchEvent): void {
        const touchDuration = Date.now() - this.touchStartTime;

        if (e.touches.length < 2) {
            this.isPinching = false;
            this.lastPinchCenter = null;
        }

        // Detect double-tap for quick zoom (only if not pinching and short touch)
        if (e.touches.length === 0 && this.lastTouchCount === 1 && touchDuration < 200 && !this.isTouchDragging) {
            const now = Date.now();
            if (now - this.lastTapTime < 300) {
                // Double tap - toggle zoom
                const camera = this.scene.cameras.main;
                const defaultZoom = MobileUtils.getDefaultZoom();
                if (camera.zoom > defaultZoom + 0.3) {
                    camera.setZoom(defaultZoom);
                } else {
                    camera.setZoom(Math.min(MobileUtils.getMaxZoom(), defaultZoom + 0.6));
                }
                this.lastTapTime = 0; // Reset to prevent triple tap
            } else {
                this.lastTapTime = now;
            }
        }

        this.lastTouchCount = e.touches.length;
        this.isTouchDragging = false;
    }

    /**
     * Check if currently in a pinch gesture (used to prevent other interactions)
     */
    isPinchGesture(): boolean {
        return this.isPinching;
    }

    onPointerDown(pointer: Phaser.Input.Pointer) {
        // Skip if pinching
        if (this.isPinching) return;

        const scene = this.scene;
        if (pointer.button === 0) {
            scene.isManualFiring = false; // Reset firing on interaction start

            // If a building is selected, we can start manual firing immediately on press
            if (scene.mode === 'HOME' && scene.selectedInWorld && !scene.selectedBuildingType && !scene.isMoving) {
                const worldPoint = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
                const gridPosFloat = IsoUtils.isoToCart(worldPoint.x, worldPoint.y);
                scene.isManualFiring = scene.isManualFireableAt(gridPosFloat.x, gridPosFloat.y);
            }

            // Just set up for potential drag
            scene.isDragging = false;
            scene.dragOrigin.set(pointer.x, pointer.y);

            // Anchor for robust panning
            scene.dragStartCam.set(scene.cameras.main.scrollX, scene.cameras.main.scrollY);
            scene.dragStartScreen.set(pointer.position.x, pointer.position.y);

            // Start deployment timer and spawn first troop immediately for responsiveness
            if (scene.mode === 'ATTACK') {
                scene.deployStartTime = scene.time.now;
                const worldPoint = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
                const gridPosFloat = IsoUtils.isoToCart(worldPoint.x, worldPoint.y);
                const bounds = scene.getBuildingsBounds('ENEMY');
                const margin = 2;
                const isInsideMap = gridPosFloat.x >= -margin && gridPosFloat.x < scene.mapSize + margin &&
                    gridPosFloat.y >= -margin && gridPosFloat.y < scene.mapSize + margin;
                const isForbidden = bounds && gridPosFloat.x >= bounds.minX && gridPosFloat.x <= bounds.maxX &&
                    gridPosFloat.y >= bounds.minY && gridPosFloat.y <= bounds.maxY;

                if (isInsideMap && !isForbidden) {
                    const army = gameManager.getArmy();
                    const selectedType = gameManager.getSelectedTroopType();
                    scene.isLockingDragForTroops = true; // Lock camera panning for this drag
                    if (selectedType && army[selectedType] > 0) {
                        scene.spawnTroop(gridPosFloat.x, gridPosFloat.y, selectedType as TroopType, 'PLAYER');
                        gameManager.deployTroop(selectedType);
                        scene.lastDeployTime = scene.time.now;
                    }
                }
            }
        }
    }

    async onPointerUp(pointer: Phaser.Input.Pointer) {
        // Skip if pinching
        if (this.isPinching) return;

        const scene = this.scene;
        // Calculate drag distance
        const dist = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY);

        // If moved significantly, treat as drag and do nothing else
        if (dist > 10) {
            scene.isDragging = false;
            scene.isManualFiring = false;
            scene.isLockingDragForTroops = false;
            if (scene.selectedInWorld && (scene.selectedInWorld as any).type === 'prism') {
                scene.cleanupPrismLaser(scene.selectedInWorld);
            }
            return;
        }

        // --- CLICK HANDLING (Previously in onPointerDown) ---
        if (pointer.button === 0) {
            const worldPoint = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
            const gridPosFloat = IsoUtils.isoToCart(worldPoint.x, worldPoint.y);
            const gridPosSnap = new Phaser.Math.Vector2(Math.floor(gridPosFloat.x), Math.floor(gridPosFloat.y));

            if (scene.mode === 'ATTACK') {
                // Check if clicking on an enemy building to show its range
                const clickedBuilding = scene.buildings.find(b => {
                    if (b.owner !== 'ENEMY' || b.health <= 0) return false;
                    const info = BUILDINGS[b.type];
                    return gridPosSnap.x >= b.gridX && gridPosSnap.x < b.gridX + info.width &&
                        gridPosSnap.y >= b.gridY && gridPosSnap.y < b.gridY + info.height;
                });

                if (clickedBuilding) {
                    // Toggle range indicator: If already active, clear it. Else show it.
                    if (clickedBuilding.rangeIndicator) {
                        scene.clearBuildingRangeIndicator();
                    } else {
                        scene.showBuildingRangeIndicator(clickedBuilding);
                    }
                    scene.lastForbiddenInteractionTime = scene.time.now;
                    return;
                }

                // Clear any existing range indicator when clicking elsewhere
                scene.clearBuildingRangeIndicator();
                return;
            }

            if (scene.isMoving && scene.selectedInWorld) {
                // Calculate centered position for the building being moved
                const info = BUILDINGS[scene.selectedInWorld.type];
                const targetX = Math.round(gridPosFloat.x - info.width / 2);
                const targetY = Math.round(gridPosFloat.y - info.height / 2);

                if (scene.isPositionValid(targetX, targetY, scene.selectedInWorld.type, scene.selectedInWorld.id)) {
                    // Clear any obstacles at the new position
                    scene.removeOverlappingObstacles(targetX, targetY, info.width, info.height);

                    // Store old position before updating (needed for wall neighbor refresh)
                    const oldGridX = scene.selectedInWorld.gridX;
                    const oldGridY = scene.selectedInWorld.gridY;
                    const isWall = scene.selectedInWorld.type === 'wall';

                    scene.selectedInWorld.gridX = targetX;
                    scene.selectedInWorld.gridY = targetY;
                    scene.selectedInWorld.graphics.clear();
                    if (scene.selectedInWorld.baseGraphics) {
                        scene.selectedInWorld.baseGraphics.clear();
                    }
                    scene.drawBuildingVisuals(
                        scene.selectedInWorld.graphics,
                        targetX,
                        targetY,
                        scene.selectedInWorld.type,
                        1,
                        null,
                        scene.selectedInWorld,
                        scene.selectedInWorld.baseGraphics,
                        true  // skipBase=true since base is baked to ground texture
                    );
                    const depth = depthForBuilding(targetX, targetY, scene.selectedInWorld.type as BuildingType);
                    scene.selectedInWorld.graphics.setDepth(depth);
                    if (scene.selectedInWorld.baseGraphics) {
                        scene.selectedInWorld.baseGraphics.setDepth(depthForGroundPlane());
                    }
                    if (scene.selectedInWorld.barrelGraphics) {
                        scene.selectedInWorld.barrelGraphics.setDepth(scene.selectedInWorld.graphics.depth + 1);
                    }
                    scene.updateHealthBar(scene.selectedInWorld);
                    if (scene.selectedInWorld.rangeIndicator) {
                        scene.showBuildingRangeIndicator(scene.selectedInWorld);
                    }
                    // Bake the building's base to the ground texture at new position
                    (scene as any).bakeBuildingToGround(scene.selectedInWorld);

                    // Update wall neighbor connections at both old and new positions
                    if (isWall) {
                        scene.refreshWallNeighbors(oldGridX, oldGridY, scene.selectedInWorld.owner);
                        scene.refreshWallNeighbors(targetX, targetY, scene.selectedInWorld.owner);
                    }

                    scene.isMoving = false;
                    scene.ghostBuilding.setVisible(false);
                    if (scene.selectedInWorld.owner === 'PLAYER') {
                        await Backend.moveBuilding(scene.userId, scene.selectedInWorld.id, targetX, targetY);
                    }
                }
                return;
            }

            if (pointer.rightButtonDown()) {
                scene.cancelPlacement();
                return;
            }

            if (scene.selectedBuildingType) {
                // Calculate centered position for new placement
                const info = BUILDINGS[scene.selectedBuildingType];
                const targetX = Math.round(gridPosFloat.x - info.width / 2);
                const targetY = Math.round(gridPosFloat.y - info.height / 2);

                if (scene.isPositionValid(targetX, targetY, scene.selectedBuildingType)) {
                    const type = scene.selectedBuildingType;
                    const success = await scene.placeBuilding(targetX, targetY, type, 'PLAYER');

                    if (success) {
                        const pos = IsoUtils.cartToIso(targetX + info.width / 2, targetY + info.height / 2);
                        scene.createSmokeEffect(pos.x, pos.y, 8);

                        if (type !== 'wall') {
                            scene.selectedBuildingType = null;
                            scene.ghostBuilding.setVisible(false);
                            gameManager.onPlacementCancelled();
                        }
                    } else {
                        scene.tweens.add({
                            targets: scene.ghostBuilding,
                            x: scene.ghostBuilding.x + 5,
                            duration: 50,
                            yoyo: true,
                            repeat: 3
                        });
                    }
                }
                return;
            }

            const clicked = scene.buildings.find(b => {
                const info = BUILDINGS[b.type];
                return gridPosSnap.x >= b.gridX && gridPosSnap.x < b.gridX + info.width &&
                    gridPosSnap.y >= b.gridY && gridPosSnap.y < b.gridY + info.height && b.owner === 'PLAYER';
            });
            if (clicked) {
                if (scene.selectedInWorld === clicked) {
                    scene.selectedInWorld = null;
                    gameManager.onBuildingSelected(null);
                    scene.clearBuildingRangeIndicator();
                    if (clicked.type === 'prism') {
                        scene.cleanupPrismLaser(clicked);
                    }
                } else {
                    if (scene.selectedInWorld !== clicked) {
                        scene.clearBuildingRangeIndicator();
                    }
                    scene.selectedInWorld = clicked;
                    gameManager.onBuildingSelected({ id: clicked.id, type: clicked.type as BuildingType, level: clicked.level || 1 });
                    scene.showBuildingRangeIndicator(clicked);
                }
                scene.isManualFiring = false;
                return;
            } else {
                const consumedManualFire = scene.consumeManualFireClick(gridPosFloat.x, gridPosFloat.y, scene.time.now);
                if (consumedManualFire) {
                    scene.isManualFiring = false;
                    scene.isDragging = false;
                    scene.isLockingDragForTroops = false;
                    if (scene.selectedInWorld && (scene.selectedInWorld as any).type === 'prism') {
                        scene.cleanupPrismLaser(scene.selectedInWorld);
                    }
                    return;
                }

                if (scene.selectedInWorld && scene.selectedInWorld.type === 'prism') {
                    scene.cleanupPrismLaser(scene.selectedInWorld);
                }
                scene.selectedInWorld = null;
                gameManager.onBuildingSelected(null);
                scene.clearBuildingRangeIndicator();
                scene.isManualFiring = false;
            }
        }

        // Final cleanup for interactions that rely on holding mouse down (like prism)
        scene.isDragging = false;
        scene.isManualFiring = false;
        scene.isLockingDragForTroops = false;
        if (scene.selectedInWorld && (scene.selectedInWorld as any).type === 'prism') {
            scene.cleanupPrismLaser(scene.selectedInWorld);
        }
    }

    onPointerMove(pointer: Phaser.Input.Pointer) {
        // Skip if pinching
        if (this.isPinching) return;

        const scene = this.scene;
        // 1. Calculate common coordinate data immediately to avoid redundancy and shadowing
        const worldPoint = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const cartFloat = IsoUtils.isoToCart(worldPoint.x, worldPoint.y);
        const gridPosSnap = new Phaser.Math.Vector2(Math.floor(cartFloat.x), Math.floor(cartFloat.y));
        const gridPosFloat = cartFloat;

        scene.hoverGrid.set(gridPosSnap.x, gridPosSnap.y);

        // Drag detection threshold
        if (pointer.isDown) {
            if (!scene.isDragging) {
                // Check if moved enough to start drag
                const dist = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.x, pointer.y);
                if (dist > 10) {
                    scene.isDragging = true;
                    // Optional: Reset anchor here to avoid 'jump', but keeping it means we SNAP to the cursor, which feels tighter.
                    // To avoid snap, we would do:
                    // scene.dragStartCam.set(scene.cameras.main.scrollX, scene.cameras.main.scrollY);
                    // scene.dragStartScreen.set(pointer.position.x, pointer.position.y);
                    // Reset the anchor to prevent the "jump" artifact when drag starts
                    scene.dragStartCam.set(scene.cameras.main.scrollX, scene.cameras.main.scrollY);
                    scene.dragStartScreen.set(pointer.position.x, pointer.position.y);
                }
            }

            if (scene.isDragging) {
                // Camera Drag Logic - Anchor Based for 1:1 movement
                // Fix: explicit exception for walls to prevent panning while painting walls
                const isWallPlacement = scene.selectedBuildingType === 'wall';

                // Fix: explicit exception for troops to prevent panning while deploying army
                // BUT: if dragging on red area (forbidden), we SHOULD pan


                // Determine if we are hovering a valid deployment zone
                // We reuse the pre-calculated coordinates
                const bounds = scene.getBuildingsBounds('ENEMY');
                const isForbidden = bounds && cartFloat.x >= bounds.minX && cartFloat.x <= bounds.maxX &&
                    cartFloat.y >= bounds.minY && cartFloat.y <= bounds.maxY;

                // Is strictly placing troops (Attack mode, troop selected, AND in valid spot OR already locked)
                const isTroopPlacement = scene.mode === 'ATTACK' && scene.isLockingDragForTroops && !isForbidden;

                if (!isWallPlacement && !isTroopPlacement && (scene.mode === 'ATTACK' || (!scene.selectedBuildingType && !scene.selectedInWorld) || (scene.selectedInWorld && !scene.isMoving))) {
                    // formula: currentScroll = startScroll + (startScreen - currentScreen) / zoom
                    const diffX = scene.dragStartScreen.x - pointer.position.x;
                    const diffY = scene.dragStartScreen.y - pointer.position.y;

                    scene.cameras.main.scrollX = scene.dragStartCam.x + diffX / scene.cameras.main.zoom;
                    scene.cameras.main.scrollY = scene.dragStartCam.y + diffY / scene.cameras.main.zoom;
                }
            }

            // Update manual firing state during movement (allows following cursor with laser/gun)
            if (scene.mode === 'HOME' && scene.selectedInWorld && !scene.selectedBuildingType && !scene.isMoving && !scene.isDragging) {
                scene.isManualFiring = scene.isManualFireableAt(gridPosFloat.x, gridPosFloat.y);
                if (!scene.isManualFiring && scene.selectedInWorld.type === 'prism') {
                    scene.cleanupPrismLaser(scene.selectedInWorld);
                }
            }
        }

        // Drag to build walls
        if (pointer.isDown && scene.selectedBuildingType === 'wall') {
            const targetX = Math.round(gridPosFloat.x - 0.5); // Wall width 1, offset 0.5
            const targetY = Math.round(gridPosFloat.y - 0.5);
            if (scene.isPositionValid(targetX, targetY, scene.selectedBuildingType)) {
                scene.placeBuilding(targetX, targetY, scene.selectedBuildingType, 'PLAYER');
            }
        }

        if (scene.mode === 'ATTACK' && pointer.isDown) {
            const now = scene.time.now;
            const holdDuration = now - scene.deployStartTime;

            // Ramping fire rate: Start slow (500ms), speed up (250ms), then turbo (100ms)
            let interval = 500;
            if (holdDuration > 1000) interval = 100;
            else if (holdDuration > 500) interval = 250;

            if (now - scene.lastDeployTime > interval) {
                const bounds = scene.getBuildingsBounds('ENEMY');
                const margin = 2;
                const isInsideMap = gridPosFloat.x >= -margin && gridPosFloat.x < scene.mapSize + margin &&
                    gridPosFloat.y >= -margin && gridPosFloat.y < scene.mapSize + margin;
                const isForbidden = bounds && gridPosFloat.x >= bounds.minX && gridPosFloat.x <= bounds.maxX &&
                    gridPosFloat.y >= bounds.minY && gridPosFloat.y <= bounds.maxY;

                if (isForbidden) {
                    scene.lastForbiddenInteractionTime = now;
                }

                if (isInsideMap && !isForbidden) {
                    const army = gameManager.getArmy();
                    const selectedType = gameManager.getSelectedTroopType();
                    if (selectedType && army[selectedType] > 0) {
                        scene.spawnTroop(gridPosFloat.x, gridPosFloat.y, selectedType as TroopType, 'PLAYER');
                        gameManager.deployTroop(selectedType);
                        scene.lastDeployTime = now;
                        return;
                    }
                }
            }
        }


        scene.ghostBuilding.clear();
        if (scene.selectedBuildingType || (scene.isMoving && scene.selectedInWorld)) {
            const type = scene.selectedBuildingType || scene.selectedInWorld?.type;
            if (type) {
                const info = BUILDINGS[type];
                // Calculate ghost position centered on cursor
                const ghostX = Math.round(gridPosFloat.x - info.width / 2);
                const ghostY = Math.round(gridPosFloat.y - info.height / 2);

                if (ghostX >= 0 && ghostX < scene.mapSize && ghostY >= 0 && ghostY < scene.mapSize) {
                    scene.ghostBuilding.setVisible(true);

                    // Determine Ghost Level for accurate preview
                    let level = 1;
                    if (scene.selectedInWorld) {
                        level = scene.selectedInWorld.level || 1;
                    } else if (type === 'wall') {
                        const walls = scene.buildings.filter(b => b.type === 'wall');
                        if (walls.length > 0) level = Math.max(...walls.map(w => w.level || 1));
                    }

                    const ghostObj = { type: type as BuildingType, level: level, gridX: ghostX, gridY: ghostY };
                    scene.drawBuildingVisuals(scene.ghostBuilding, ghostX, ghostY, type, 0.5, null, ghostObj as any);

                    // Ghost depth should be on top of everything for visibility
                    scene.ghostBuilding.setDepth(200000);
                } else { scene.ghostBuilding.setVisible(false); }
            }
        }
    }
}
