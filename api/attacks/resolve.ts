import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { readJson, writeJson } from '../_lib/blob.js';
import { requireAuth } from '../_lib/auth.js';
import { clamp, randomId, type LedgerRecord, type WalletRecord, type NotificationStore } from '../_lib/models.js';

interface ResolveBody {
  victimId: string;
  attackerId: string;
  attackerName: string;
  solLooted: number;
  destruction: number;
  attackId?: string;
}

interface AttackResult {
  lootApplied: number;
  attackerBalance: number;
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

    const body = await readJsonBody<ResolveBody>(req);
    const victimId = body?.victimId?.trim();
    const attackerId = body?.attackerId?.trim();

    if (!victimId || !attackerId) {
      sendError(res, 400, 'victimId and attackerId required');
      return;
    }

    if (attackerId !== auth.user.id) {
      sendError(res, 403, 'Invalid attacker');
      return;
    }

    if (victimId === attackerId) {
      sendError(res, 400, 'Cannot attack yourself');
      return;
    }

    if (body.attackId) {
      const existing = await readJson<AttackResult>(`attacks/${body.attackId}.json`);
      if (existing) {
        sendJson(res, 200, existing);
        return;
      }
    }

    const now = Date.now();
    const victimWalletPath = `wallets/${victimId}.json`;
    const attackerWalletPath = `wallets/${attackerId}.json`;

    const victimWallet = await readJson<WalletRecord>(victimWalletPath);
    const attackerWallet = (await readJson<WalletRecord>(attackerWalletPath)) ?? { balance: 0, updatedAt: now };

    if (!victimWallet) {
      sendError(res, 404, 'Victim not found');
      return;
    }

    const requestedLoot = Number(body?.solLooted ?? 0);
    const lootApplied = clamp(Math.floor(requestedLoot), 0, victimWallet.balance);

    victimWallet.balance = clamp(victimWallet.balance - lootApplied, 0, 1_000_000_000);
    victimWallet.updatedAt = now;
    attackerWallet.balance = clamp(attackerWallet.balance + lootApplied, 0, 1_000_000_000);
    attackerWallet.updatedAt = now;

    await writeJson(victimWalletPath, victimWallet);
    await writeJson(attackerWalletPath, attackerWallet);

    const victimLedgerPath = `ledger/${victimId}.json`;
    const attackerLedgerPath = `ledger/${attackerId}.json`;
    const victimLedger = (await readJson<LedgerRecord>(victimLedgerPath)) ?? { events: [] };
    const attackerLedger = (await readJson<LedgerRecord>(attackerLedgerPath)) ?? { events: [] };

    victimLedger.events.push({
      id: randomId('evt_'),
      delta: -lootApplied,
      reason: 'raid_loss',
      refId: body.attackId,
      time: now
    });
    attackerLedger.events.push({
      id: randomId('evt_'),
      delta: lootApplied,
      reason: 'raid_loot',
      refId: body.attackId,
      time: now
    });

    if (victimLedger.events.length > 200) victimLedger.events = victimLedger.events.slice(-200);
    if (attackerLedger.events.length > 200) attackerLedger.events = attackerLedger.events.slice(-200);

    await writeJson(victimLedgerPath, victimLedger);
    await writeJson(attackerLedgerPath, attackerLedger);

    const notifPath = `notifications/${victimId}.json`;
    const notifications = (await readJson<NotificationStore>(notifPath)) ?? { items: [] };
    notifications.items.unshift({
      id: body.attackId ?? randomId('atk_'),
      attackerId,
      attackerName: body.attackerName ?? 'Unknown',
      solLost: lootApplied,
      destruction: clamp(Number(body?.destruction ?? 0), 0, 100),
      time: now,
      read: false
    });
    if (notifications.items.length > 50) {
      notifications.items = notifications.items.slice(0, 50);
    }
    await writeJson(notifPath, notifications);

    const result: AttackResult = { lootApplied, attackerBalance: attackerWallet.balance };

    if (body.attackId) {
      await writeJson(`attacks/${body.attackId}.json`, result);
    }

    sendJson(res, 200, result);
  } catch (error) {
    console.error('attack resolve error', error);
    sendError(res, 500, 'Failed to resolve attack');
  }
}
