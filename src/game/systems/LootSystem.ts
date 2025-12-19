
import type { SerializedBuilding } from '../data/Models';

export class LootSystem {
    // 20% of resources are lootable
    private static LOOT_PERCENTAGE = 0.2;

    public static calculateLootDistribution(
        buildings: SerializedBuilding[],
        totalGold: number,
        totalElixir: number
    ): Map<string, { gold: number, elixir: number }> {
        const lootMap = new Map<string, { gold: number, elixir: number }>();

        const availableGold = Math.floor(totalGold * this.LOOT_PERCENTAGE);
        const availableElixir = Math.floor(totalElixir * this.LOOT_PERCENTAGE);

        // Identify storage containers
        // In the future, include Gold Storage / Elixir Storage here
        const townHalls = buildings.filter(b => b.type === 'town_hall');
        const mines = buildings.filter(b => b.type === 'mine');
        const collectors = buildings.filter(b => b.type === 'elixir_collector');

        // Distribution Rules:
        // TH holds 50%
        // Collectors/Mines hold 50%

        const goldInTH = Math.floor(availableGold * 0.5);
        const elixirInTH = Math.floor(availableElixir * 0.5);

        const goldInMines = availableGold - goldInTH;
        const elixirInCollectors = availableElixir - elixirInTH;

        // Assign TH loot
        if (townHalls.length > 0) {
            const perTH = {
                gold: Math.floor(goldInTH / townHalls.length),
                elixir: Math.floor(elixirInTH / townHalls.length)
            };
            townHalls.forEach(b => lootMap.set(b.id, perTH));
        }

        // Assign Mine loot
        if (mines.length > 0) {
            const perMine = Math.floor(goldInMines / mines.length);
            mines.forEach(b => {
                const existing = lootMap.get(b.id) || { gold: 0, elixir: 0 };
                existing.gold += perMine;
                lootMap.set(b.id, existing);
            });
        }

        // Assign Collector loot
        if (collectors.length > 0) {
            const perColl = Math.floor(elixirInCollectors / collectors.length);
            collectors.forEach(b => {
                const existing = lootMap.get(b.id) || { gold: 0, elixir: 0 };
                existing.elixir += perColl;
                lootMap.set(b.id, existing);
            });
        }

        return lootMap;
    }
}
