
import type { SerializedBuilding } from '../data/Models';

export class LootSystem {
    // 20% of resources are lootable
    private static LOOT_PERCENTAGE = 0.2;

    public static calculateLootDistribution(
        buildings: SerializedBuilding[],
        totalSol: number
    ): Map<string, { sol: number }> {
        const lootMap = new Map<string, { sol: number }>();

        const availableSol = Math.floor(totalSol * this.LOOT_PERCENTAGE);

        // Identify storage containers
        // In the future, include dedicated storage buildings here
        const townHalls = buildings.filter(b => b.type === 'town_hall');
        const resourceBuildings = buildings.filter(b => {
            const type = b.type as string;
            return type === 'solana_collector' || type === 'mine' || type === 'elixir_collector';
        });

        // Distribution Rules:
        // TH holds 50%
        // Resource buildings hold 50%
        const solInTH = Math.floor(availableSol * 0.5);
        const solInResources = availableSol - solInTH;

        // Assign TH loot
        if (townHalls.length > 0) {
            const perTH = {
                sol: Math.floor(solInTH / townHalls.length)
            };
            townHalls.forEach(b => lootMap.set(b.id, perTH));
        }

        // Assign resource building loot
        if (resourceBuildings.length > 0) {
            const perResource = Math.floor(solInResources / resourceBuildings.length);
            resourceBuildings.forEach(b => {
                const existing = lootMap.get(b.id) || { sol: 0 };
                existing.sol += perResource;
                lootMap.set(b.id, existing);
            });
        }

        return lootMap;
    }
}
