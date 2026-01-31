import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http';
import { readJson, writeJson } from '../_lib/blob';
import { requireAuth } from '../_lib/auth';
import { normalizeWorld, type SerializedWorld, type WalletRecord } from '../_lib/models';
import { upsertUserIndex } from '../_lib/indexes';

interface SaveBody {
  world: SerializedWorld;
  ifMatchRevision?: number;
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

    const body = await readJsonBody<SaveBody>(req);
    if (!body?.world) {
      sendError(res, 400, 'Missing world payload');
      return;
    }

    const { user } = auth;
    const basePath = `bases/${user.id}.json`;
    const stored = await readJson<SerializedWorld>(basePath);
    if (!stored) {
      sendError(res, 404, 'Base not found');
      return;
    }

    const currentRevision = stored.revision ?? 0;
    const expected = body.ifMatchRevision ?? currentRevision;
    if (expected !== currentRevision) {
      const wallet = await readJson<WalletRecord>(`wallets/${user.id}.json`);
      if (wallet) stored.resources.sol = wallet.balance;
      sendJson(res, 409, { conflict: true, world: stored });
      return;
    }

    const wallet = await readJson<WalletRecord>(`wallets/${user.id}.json`);
    const now = Date.now();
    const normalized = normalizeWorld(body.world, user.username, stored.resources);
    const nextWorld: SerializedWorld = {
      ...normalized,
      ownerId: user.id,
      username: user.username,
      resources: { sol: wallet?.balance ?? normalized.resources.sol },
      lastSaveTime: now,
      revision: currentRevision + 1
    };

    await writeJson(basePath, nextWorld);

    await upsertUserIndex({
      id: user.id,
      username: user.username,
      buildingCount: nextWorld.buildings.length,
      lastSeen: now,
      trophies: user.trophies ?? 0
    });

    sendJson(res, 200, { ok: true, world: nextWorld });
  } catch (error) {
    console.error('save error', error);
    sendError(res, 500, 'Failed to save base');
  }
}
