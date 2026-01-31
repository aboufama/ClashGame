import type { BuildingType } from './config/GameDefinitions';
import type { GameMode } from './types/GameMode';

export type BuildingSelection = { id: string; type: BuildingType; level: number } | null;

type UIHandlers = {
    showCloudOverlay: () => void;
    hideCloudOverlay: () => void;
    addSol: (amount: number) => void;
    setGameMode: (mode: GameMode) => void;
    updateBattleStats: (destruction: number, sol: number) => void;
    onBuildingSelected: (data: BuildingSelection) => void;
    onPlacementCancelled: () => void;
    onRaidEnded: (solLooted: number) => void | Promise<void>;
    getArmy: () => Record<string, number>;
    getSelectedTroopType: () => string | null;
    deployTroop: (type: string) => void;
    refreshCampCapacity: (campLevels: number[]) => void;
    onBuildingPlaced: (type: string, isFree?: boolean) => void;
    closeMenus: () => void;
};

type SceneCommands = {
    selectBuilding: (type: string | null) => void;
    startAttack: () => void;
    startPracticeAttack: () => void;
    startOnlineAttack: () => void;
    startAttackOnUser: (userId: string, username: string) => void;
    findNewMap: () => void;
    deleteSelectedBuilding: () => void;
    moveSelectedBuilding: () => void;
    upgradeSelectedBuilding: () => number | null;
    setPixelation: (size: number) => void;
    setSensitivity: (val: number) => void;
    loadBase: () => Promise<boolean>;
};

class GameManager {
    private uiHandlers: Partial<UIHandlers> = {};
    private sceneCommands: Partial<SceneCommands> = {};

    registerUI(handlers: Partial<UIHandlers>) {
        this.uiHandlers = { ...this.uiHandlers, ...handlers };
    }

    registerScene(handlers: Partial<SceneCommands>) {
        this.sceneCommands = { ...this.sceneCommands, ...handlers };
    }

    clearUI() {
        this.uiHandlers = {};
    }

    clearScene() {
        this.sceneCommands = {};
    }

    showCloudOverlay() {
        this.uiHandlers.showCloudOverlay?.();
    }

    hideCloudOverlay() {
        this.uiHandlers.hideCloudOverlay?.();
    }

    addSol(amount: number) {
        this.uiHandlers.addSol?.(amount);
    }

    setGameMode(mode: GameMode) {
        this.uiHandlers.setGameMode?.(mode);
    }

    updateBattleStats(destruction: number, sol: number) {
        this.uiHandlers.updateBattleStats?.(destruction, sol);
    }

    onBuildingSelected(data: BuildingSelection) {
        this.uiHandlers.onBuildingSelected?.(data);
    }

    onPlacementCancelled() {
        this.uiHandlers.onPlacementCancelled?.();
    }

    onRaidEnded(solLooted: number) {
        if (this.uiHandlers.onRaidEnded) {
            this.uiHandlers.onRaidEnded(solLooted);
            return true;
        }
        return false;
    }

    getArmy() {
        return this.uiHandlers.getArmy?.() ?? {};
    }

    getSelectedTroopType() {
        return this.uiHandlers.getSelectedTroopType?.() ?? null;
    }

    deployTroop(type: string) {
        this.uiHandlers.deployTroop?.(type);
    }

    refreshCampCapacity(campLevels: number[]) {
        this.uiHandlers.refreshCampCapacity?.(campLevels);
    }

    onBuildingPlaced(type: string, isFree: boolean = false) {
        this.uiHandlers.onBuildingPlaced?.(type, isFree);
    }

    selectBuilding(type: string | null) {
        this.sceneCommands.selectBuilding?.(type);
    }

    startAttack() {
        this.sceneCommands.startAttack?.();
    }

    startPracticeAttack() {
        this.sceneCommands.startPracticeAttack?.();
    }

    startOnlineAttack() {
        this.sceneCommands.startOnlineAttack?.();
    }

    startAttackOnUser(userId: string, username: string) {
        this.sceneCommands.startAttackOnUser?.(userId, username);
    }

    findNewMap() {
        this.sceneCommands.findNewMap?.();
    }

    deleteSelectedBuilding() {
        this.sceneCommands.deleteSelectedBuilding?.();
    }

    moveSelectedBuilding() {
        this.sceneCommands.moveSelectedBuilding?.();
    }

    upgradeSelectedBuilding() {
        return this.sceneCommands.upgradeSelectedBuilding?.() ?? null;
    }

    setPixelation(size: number) {
        this.sceneCommands.setPixelation?.(size);
    }

    setSensitivity(val: number) {
        this.sceneCommands.setSensitivity?.(val);
    }

    closeMenus() {
        this.uiHandlers.closeMenus?.();
    }

    async loadBase() {
        return await this.sceneCommands.loadBase?.() ?? false;
    }
}

export const gameManager = new GameManager();
