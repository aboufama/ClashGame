import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import * as blob from '../../.test-dist/api/_lib/blob.js';
import * as gameState from '../../.test-dist/api/_lib/game_state.js';
import * as indexes from '../../.test-dist/api/_lib/indexes.js';
import * as models from '../../.test-dist/api/_lib/models.js';
import applyHandler from '../../.test-dist/api/resources/apply.js';
import balanceHandler from '../../.test-dist/api/resources/balance.js';
import resolveHandler from '../../.test-dist/api/attacks/resolve.js';
import * as usersList from '../../.test-dist/api/users/list.js';
import { callHandler, installBlobHarness, resetBackendTestState, seedSession, seedUser, sessionCookie } from './helpers.mjs';

const modules = { blob, gameState, indexes, usersList };

afterEach(() => {
  resetBackendTestState(modules);
});

function seedStoredState(harness, userId, username, balance) {
  const now = Date.now();
  const world = models.buildStarterWorld(userId, username);
  world.resources.sol = balance;
  world.lastSaveTime = now;
  world.revision = 1;
  harness.set(`game/${userId}/state.json`, {
    schemaVersion: 2,
    updatedAt: now,
    world,
    requestKeys: []
  });
}

function seedAuthedUser(harness, userId, username) {
  seedUser(harness, {
    id: userId,
    email: `${userId}@example.com`,
    username,
    createdAt: Date.now(),
    lastSeen: Date.now()
  });
  const token = `sess_${userId}`;
  seedSession(harness, {
    token,
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 1000 * 60 * 60 * 24
  });
  return { cookie: sessionCookie(token) };
}

test('resource apply handler dedupes request ids and rejects invalid deltas', async t => {
  const cases = [
    [-25, 55],
    [-1, 79],
    [0, 80],
    [1, 81],
    [9, 89],
    [120, 200]
  ];

  for (const [delta, expected] of cases) {
    await t.test(`delta=${delta}`, async () => {
      const harness = installBlobHarness(modules);
      const headers = seedAuthedUser(harness, `apply_${delta}`, `Apply${delta}`);
      seedStoredState(harness, `apply_${delta}`, `Apply${delta}`, 80);

      const first = await callHandler(applyHandler, {
        method: 'POST',
        headers,
        body: { delta, reason: 'test', requestId: 'req-1' }
      });
      const second = await callHandler(applyHandler, {
        method: 'POST',
        headers,
        body: { delta, reason: 'test', requestId: 'req-1' }
      });
      const invalid = await callHandler(applyHandler, {
        method: 'POST',
        headers,
        body: { delta: Number.NaN }
      });

      assert.equal(first.statusCode, 200);
      assert.equal(first.body.sol, expected);
      assert.equal(second.statusCode, 200);
      assert.equal(second.body.sol, expected);
      assert.equal(invalid.statusCode, 400);
    });
  }
});

test('balance handler returns materialized wallet state', async () => {
  const harness = installBlobHarness(modules);
  const headers = seedAuthedUser(harness, 'balance_user', 'Balance');
  seedStoredState(harness, 'balance_user', 'Balance', 432);

  const res = await callHandler(balanceHandler, {
    method: 'POST',
    headers
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.wallet.balance, 432);
  assert.equal(typeof res.body.added, 'number');
});

test('users list prefers cached index data and falls back to user files', async () => {
  const harness = installBlobHarness(modules);

  harness.set('indexes/users.json', {
    users: Array.from({ length: 4 }, (_, index) => ({
      id: `idx_${index}`,
      username: `Indexed${index}`,
      buildingCount: index + 1,
      lastSeen: 10_000 - index
    })),
    updatedAt: 10_000
  });

  const first = await callHandler(usersList.default, { method: 'GET' });
  const listCallsAfterFirst = harness.stats.listPathnames;
  const second = await callHandler(usersList.default, { method: 'GET' });

  assert.equal(first.statusCode, 200);
  assert.equal(first.body.users.length, 4);
  assert.equal(second.statusCode, 200);
  assert.equal(harness.stats.listPathnames, listCallsAfterFirst);

  resetBackendTestState(modules);
  blob.setBlobTestAdapter(harness.adapter);
  harness.set('indexes/users.json', { users: [], updatedAt: Date.now() });
  for (let index = 0; index < 20; index += 1) {
    seedUser(harness, {
      id: `fallback_${index}`,
      email: `fallback_${index}@example.com`,
      username: `Fallback${index}`,
      createdAt: 1_000 + index,
      lastSeen: 5_000 + index
    });
    if (index < 10) {
      seedStoredState(harness, `fallback_${index}`, `Fallback${index}`, 100 + index);
    }
  }

  const fallback = await callHandler(usersList.default, { method: 'GET' });
  assert.equal(fallback.statusCode, 200);
  assert.equal(fallback.body.users.length, 20);
  assert.ok(fallback.body.users.some(user => user.buildingCount > 0));
});

test('attack resolve credits only what the victim can actually lose and is idempotent by attackId', async t => {
  const victimBalances = [0, 5, 20, 75, 180];
  const requestedLoots = [0, 1, 5, 25, 200];

  for (const victimBalance of victimBalances) {
    for (const requestedLoot of requestedLoots) {
      await t.test(`victimBalance=${victimBalance} requestedLoot=${requestedLoot}`, async () => {
        const harness = installBlobHarness(modules);
        const headers = seedAuthedUser(harness, 'attacker', 'Attacker');
        seedAuthedUser(harness, 'victim', 'Victim');
        seedStoredState(harness, 'attacker', 'Attacker', models.STARTING_BALANCE);
        seedStoredState(harness, 'victim', 'Victim', victimBalance);

        const first = await callHandler(resolveHandler, {
          method: 'POST',
          headers,
          body: {
            attackId: `attack_${victimBalance}_${requestedLoot}`,
            attackerId: 'attacker',
            attackerName: 'Attacker',
            victimId: 'victim',
            solLooted: requestedLoot,
            destruction: 67
          }
        });
        const second = await callHandler(resolveHandler, {
          method: 'POST',
          headers,
          body: {
            attackId: `attack_${victimBalance}_${requestedLoot}`,
            attackerId: 'attacker',
            attackerName: 'Attacker',
            victimId: 'victim',
            solLooted: requestedLoot,
            destruction: 67
          }
        });

        const applied = Math.min(victimBalance, requestedLoot);
        const attackerState = await gameState.materializeState('attacker', 'Attacker', 12_000);
        const victimState = await gameState.materializeState('victim', 'Victim', 12_000);

        assert.equal(first.statusCode, 200);
        assert.equal(first.body.lootApplied, applied);
        assert.equal(first.body.attackerBalance, models.STARTING_BALANCE + applied);
        assert.equal(second.statusCode, 200);
        assert.deepEqual(second.body, first.body);
        assert.equal(attackerState.balance, models.STARTING_BALANCE + applied);
        assert.equal(victimState.balance, victimBalance - applied);
      });
    }
  }
});
