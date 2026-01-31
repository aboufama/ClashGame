import type { ResourceLedger, ResourceTx, StoredBase } from './types.js';
import { clampNumber } from './utils.js';

const SOL_MAX = 1_000_000_000;
const MAX_TX_HISTORY = 80;

function ensureLedger(base: StoredBase): ResourceLedger {
  if (base.resourceLedger && Array.isArray(base.resourceLedger.recent)) {
    return base.resourceLedger;
  }
  const ledger: ResourceLedger = {
    lastUpdated: base.lastSaveTime || Date.now(),
    recent: [],
  };
  base.resourceLedger = ledger;
  return ledger;
}

export function findResourceTx(base: StoredBase, txId: string): ResourceTx | undefined {
  const ledger = ensureLedger(base);
  return ledger.recent.find((tx) => tx.id === txId);
}

export function applyResourceDelta(base: StoredBase, delta: number, txId: string, reason?: string) {
  const ledger = ensureLedger(base);
  const existing = ledger.recent.find((tx) => tx.id === txId);
  if (existing) {
    return {
      applied: false,
      balance: base.resources.sol,
      tx: existing,
    };
  }

  const rawNext = base.resources.sol + delta;
  if (delta < 0 && rawNext < 0) {
    return {
      applied: false,
      balance: base.resources.sol,
      tx: undefined,
      insufficient: true,
    };
  }

  const next = clampNumber(rawNext, 0, SOL_MAX);

  base.resources.sol = next;
  const entry: ResourceTx = {
    id: txId,
    delta,
    timestamp: Date.now(),
    reason,
  };
  ledger.recent.unshift(entry);
  if (ledger.recent.length > MAX_TX_HISTORY) {
    ledger.recent.length = MAX_TX_HISTORY;
  }
  ledger.lastUpdated = entry.timestamp;
  base.resourceLedger = ledger;
  return {
    applied: true,
    balance: base.resources.sol,
    tx: entry,
  };
}

export function clampLootAmount(victimBalance: number, requested: number, maxPercent: number) {
  const safeVictim = clampNumber(victimBalance, 0, SOL_MAX);
  const safeRequested = clampNumber(requested, 0, SOL_MAX);
  const maxLoot = Math.floor(safeVictim * maxPercent);
  return Math.min(safeRequested, safeVictim, maxLoot);
}
