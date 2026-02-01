import { readJson, writeJson } from './blob.js';
import { clamp, type SerializedWorld, type WalletRecord } from './models.js';

const RATE_TABLE: Record<string, number[]> = {
  solana_collector: [5, 8],
  mine: [5, 8],
  elixir_collector: [5, 8]
};

function rateForBuilding(type: string, level: number): number {
  const rates = RATE_TABLE[type] ?? RATE_TABLE.solana_collector;
  const idx = Math.max(0, Math.min((level || 1) - 1, rates.length - 1));
  return rates[idx] ?? 0;
}

export async function applyProduction(userId: string): Promise<{ wallet: WalletRecord; added: number; world: SerializedWorld | null }> {
  const basePath = `bases/${userId}.json`;
  const walletPath = `wallets/${userId}.json`;

  const world = await readJson<SerializedWorld>(basePath);
  const wallet = (await readJson<WalletRecord>(walletPath)) ?? { balance: 1000, updatedAt: Date.now() };

  if (!world || !Array.isArray(world.buildings)) {
    return { wallet, added: 0, world: world ?? null };
  }

  const now = Date.now();
  const last = wallet.updatedAt ?? world.lastSaveTime ?? now;
  const elapsedSec = Math.max(0, (now - last) / 1000);

  if (elapsedSec <= 0) {
    return { wallet, added: 0, world };
  }

  let rate = 0;
  for (const b of world.buildings) {
    if (!b) continue;
    if (!RATE_TABLE[b.type]) continue;
    rate += rateForBuilding(b.type, b.level ?? 1);
  }

  const added = Math.floor(rate * elapsedSec);
  if (added > 0) {
    wallet.balance = clamp(wallet.balance + added, 0, 1_000_000_000);
    wallet.updatedAt = now;
    await writeJson(walletPath, wallet);
  } else if (!wallet.updatedAt) {
    wallet.updatedAt = now;
    await writeJson(walletPath, wallet);
  }

  return { wallet, added, world };
}
