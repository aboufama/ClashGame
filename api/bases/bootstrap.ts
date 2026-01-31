import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError, sendJson } from '../_lib/http';
import { readJson, writeJson } from '../_lib/blob';
import { requireAuth } from '../_lib/auth';
import { buildStarterWorld, type SerializedWorld, type WalletRecord } from '../_lib/models';
import { upsertUserIndex } from '../_lib/indexes';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const { user } = auth;
    const now = Date.now();

    const walletPath = `wallets/${user.id}.json`;
    const existingWallet = await readJson<WalletRecord>(walletPath);
    const wallet: WalletRecord = existingWallet ?? { balance: 1000, updatedAt: now };
    if (!existingWallet) {
      await writeJson(walletPath, wallet);
    }

    const basePath = `bases/${user.id}.json`;
    let world = await readJson<SerializedWorld>(basePath);

    if (!world || !world.buildings || world.buildings.length === 0) {
      world = buildStarterWorld(user.id, user.username);
      world.resources.sol = wallet.balance;
      await writeJson(basePath, world);
    } else {
      world.username = user.username;
      world.resources.sol = wallet.balance;
    }

    await upsertUserIndex({
      id: user.id,
      username: user.username,
      buildingCount: world.buildings.length,
      lastSeen: now,
      trophies: user.trophies ?? 0
    });

    sendJson(res, 200, { world });
  } catch (error) {
    console.error('bootstrap error', error);
    sendError(res, 500, 'Failed to bootstrap base');
  }
}
