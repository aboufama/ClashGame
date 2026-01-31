import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, readJsonBody, sendError, sendJson } from '../_lib/http';
import { readJson, writeJson } from '../_lib/blob';
import { createSession, hashSecret, randomId, sanitizeId } from '../_lib/auth';
import { sanitizeUsername, type UserRecord, type WalletRecord, type LedgerRecord, type NotificationStore } from '../_lib/models';
import { upsertUserIndex } from '../_lib/indexes';

interface RegisterBody {
  username?: string;
  playerId?: string;
  deviceSecret?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const body = await readJsonBody<RegisterBody>(req);
    const deviceSecret = body.deviceSecret?.trim();
    if (!deviceSecret) {
      sendError(res, 400, 'deviceSecret required');
      return;
    }

    const username = sanitizeUsername(body.username);
    const playerId = body.playerId ? sanitizeId(body.playerId) : randomId('p_');
    const secretHash = hashSecret(deviceSecret);
    const now = Date.now();

    const existing = await readJson<UserRecord>(`users/${playerId}.json`);
    let user: UserRecord;

    if (existing) {
      if (existing.secretHash !== secretHash) {
        sendError(res, 403, 'Invalid credentials');
        return;
      }
      user = { ...existing, lastSeen: now };
    } else {
      user = {
        id: playerId,
        username,
        createdAt: now,
        lastSeen: now,
        secretHash,
        trophies: 0
      };
    }

    const session = await createSession(user.id);
    user.activeSessionId = session.token;
    user.sessionExpiresAt = session.expiresAt;

    await writeJson(`users/${user.id}.json`, user);

    const wallet: WalletRecord = (await readJson<WalletRecord>(`wallets/${user.id}.json`)) ?? {
      balance: 1000,
      updatedAt: now
    };
    await writeJson(`wallets/${user.id}.json`, wallet);

    const ledger: LedgerRecord = (await readJson<LedgerRecord>(`ledger/${user.id}.json`)) ?? { events: [] };
    await writeJson(`ledger/${user.id}.json`, ledger);

    const notifications: NotificationStore = (await readJson<NotificationStore>(`notifications/${user.id}.json`)) ?? { items: [] };
    await writeJson(`notifications/${user.id}.json`, notifications);

    await upsertUserIndex({
      id: user.id,
      username: user.username,
      buildingCount: 0,
      lastSeen: now,
      trophies: user.trophies ?? 0
    });

    sendJson(res, 200, {
      user: { id: user.id, username: user.username },
      token: session.token,
      expiresAt: session.expiresAt
    });
  } catch (error) {
    console.error('register error', error);
    sendError(res, 500, 'Registration failed');
  }
}
