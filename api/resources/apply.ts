import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { readJson, writeJson } from '../_lib/blob.js';
import { requireAuth } from '../_lib/auth.js';
import { clamp, randomId, type LedgerRecord, type WalletRecord } from '../_lib/models.js';
import { applyProduction } from '../_lib/production.js';

interface ApplyBody {
  delta: number;
  reason?: string;
  refId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const body = await readJsonBody<ApplyBody>(req);
    const delta = Number(body?.delta ?? 0);
    if (!Number.isFinite(delta)) {
      sendError(res, 400, 'Invalid delta');
      return;
    }

    const { user } = auth;
    const now = Date.now();

    // Apply any pending production first so the wallet is up-to-date
    // before processing the delta (e.g., spending on upgrades).
    await applyProduction(user.id);

    const walletPath = `wallets/${user.id}.json`;
    const existingWallet = await readJson<WalletRecord>(walletPath);
    const wallet: WalletRecord = existingWallet ?? { balance: 1000, updatedAt: now };

    const nextBalance = clamp(wallet.balance + delta, 0, 1_000_000_000);
    wallet.balance = nextBalance;
    wallet.updatedAt = now;
    await writeJson(walletPath, wallet);

    const ledgerPath = `ledger/${user.id}.json`;
    const ledger = (await readJson<LedgerRecord>(ledgerPath)) ?? { events: [] };
    ledger.events.push({
      id: randomId('evt_'),
      delta,
      reason: body?.reason ?? 'update',
      refId: body?.refId,
      time: now
    });
    if (ledger.events.length > 200) {
      ledger.events = ledger.events.slice(-200);
    }
    await writeJson(ledgerPath, ledger);

    // NOTE: We intentionally do NOT read/write the base blob here.
    // The wallet is the source of truth for balance. Writing the whole
    // base just to update resources.sol creates a race condition that
    // can overwrite building positions/levels saved by the client.
    // The base's resources.sol is synced from the wallet on load and save.

    sendJson(res, 200, { applied: true, sol: nextBalance });
  } catch (error) {
    console.error('apply resource error', error);
    sendError(res, 500, 'Failed to apply resources');
  }
}
