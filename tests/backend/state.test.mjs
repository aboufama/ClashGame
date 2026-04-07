import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import * as blob from '../../.test-dist/api/_lib/blob.js';
import * as gameState from '../../.test-dist/api/_lib/game_state.js';
import * as indexes from '../../.test-dist/api/_lib/indexes.js';
import * as models from '../../.test-dist/api/_lib/models.js';
import * as usersList from '../../.test-dist/api/users/list.js';
import { installBlobHarness, resetBackendTestState } from './helpers.mjs';

const modules = { blob, gameState, indexes, usersList };

afterEach(() => {
  resetBackendTestState(modules);
});

function seedStoredState(harness, userId, username, balance, overrides = {}) {
  const now = Date.now();
  const world = models.buildStarterWorld(userId, username);
  world.resources.sol = balance;
  world.lastSaveTime = now;
  world.revision = 1;
  Object.assign(world, overrides);
  harness.set(`game/${userId}/state.json`, {
    schemaVersion: 2,
    updatedAt: now,
    world,
    requestKeys: []
  });
  return world;
}

test('materializeState migrates legacy base and wallet data into state storage', async () => {
  const harness = installBlobHarness(modules);
  const world = models.buildStarterWorld('legacy_user', 'Legacy');
  world.resources.sol = 222;
  world.lastSaveTime = 9_000;

  harness.set('bases/legacy_user.json', world);
  harness.set('wallets/legacy_user.json', {
    userId: 'legacy_user',
    balance: 345,
    updatedAt: 9_500
  });

  const materialized = await gameState.materializeState('legacy_user', 'Legacy', 9_000);
  assert.equal(materialized.balance, 345);
  assert.equal(materialized.world.resources.sol, 345);
  assert.ok(harness.has('game/legacy_user/state.json'));
});

test('concurrent resource mutations preserve all credits', async t => {
  const workerCounts = [1, 2, 3, 5, 8, 13, 21, 34, 55];
  const deltas = [1, 2, 5, 9, 17];

  for (const workers of workerCounts) {
    for (const delta of deltas) {
      await t.test(`workers=${workers} delta=${delta}`, async () => {
        const harness = installBlobHarness(modules);
        const userId = `credit_${workers}_${delta}`;
        const username = `Credit${workers}${delta}`;

        await gameState.ensurePlayerState(userId, username);
        await Promise.all(Array.from({ length: workers }, (_, index) =>
          gameState.appendResourceDeltaEvent(userId, delta, 'reward', `ref_${index}`, `credit:${index}`)
        ));

        const materialized = await gameState.materializeState(userId, username, 10_000);
        assert.equal(materialized.balance, models.STARTING_BALANCE + workers * delta);
        assert.equal(materialized.revision, 1 + workers);
        assert.equal(harness.get(`game/${userId}/state.json`).requestKeys.length, workers);
      });
    }
  }
});

test('resource debit logic honors insufficiency and partial application', async t => {
  const balances = [0, 1, 5, 27, 125];
  const debits = [1, 2, 7, 30, 200];

  for (const balance of balances) {
    for (const debit of debits) {
      await t.test(`balance=${balance} debit=${debit}`, async () => {
        const harness = installBlobHarness(modules);
        const strictUserId = `strict_${balance}_${debit}`;
        const partialUserId = `partial_${balance}_${debit}`;

        seedStoredState(harness, strictUserId, 'Strict', balance);
        seedStoredState(harness, partialUserId, 'Partial', balance);

        const strictMutation = await gameState.appendResourceDeltaEvent(
          strictUserId,
          -debit,
          'spend',
          undefined,
          `strict:${balance}:${debit}`
        );
        assert.equal(strictMutation.applied, balance >= debit);
        assert.equal(strictMutation.appliedDelta, balance >= debit ? -debit : 0);
        assert.equal(strictMutation.balance, balance >= debit ? balance - debit : balance);

        const partialMutation = await gameState.appendResourceDeltaEvent(
          partialUserId,
          -debit,
          'spend',
          undefined,
          `partial:${balance}:${debit}`,
          { allowPartial: true }
        );
        assert.equal(partialMutation.applied, true);
        assert.equal(partialMutation.appliedDelta, balance > 0 ? -Math.min(balance, debit) : 0);
        assert.equal(partialMutation.balance, Math.max(0, balance - debit));
      });
    }
  }
});

test('request keys dedupe resource mutations and zero deltas', async t => {
  const deltas = [-30, -1, 0, 1, 7, 50, 120];

  for (const delta of deltas) {
    await t.test(`delta=${delta}`, async () => {
      const harness = installBlobHarness(modules);
      const userId = `dedupe_${delta}`;
      seedStoredState(harness, userId, 'Dedupe', 80);

      const first = await gameState.appendResourceDeltaEvent(userId, delta, 'update', undefined, 'same-key', {
        allowPartial: true
      });
      const second = await gameState.appendResourceDeltaEvent(userId, delta, 'update', undefined, 'same-key', {
        allowPartial: true
      });
      const stored = harness.get(`game/${userId}/state.json`);

      assert.equal(second.deduped, true);
      assert.equal(second.balance, first.balance);
      assert.equal(stored.requestKeys.filter(key => key === 'same-key').length, 1);
    });
  }
});

test('saveWorldState and appendWorldPatchEvent persist deterministic world changes', async t => {
  const removeCounts = [0, 1, 2, 3];
  const wallLevels = [1, 2, 4, 7];

  for (const removeCount of removeCounts) {
    for (const wallLevel of wallLevels) {
      await t.test(`removeCount=${removeCount} wallLevel=${wallLevel}`, async () => {
        const harness = installBlobHarness(modules);
        const userId = `world_${removeCount}_${wallLevel}`;
        const username = 'Builder';
        const base = seedStoredState(harness, userId, username, 240);
        const incoming = structuredClone(base);
        incoming.wallLevel = wallLevel;
        incoming.buildings = incoming.buildings.slice(removeCount);
        incoming.resources.sol = 321;

        const saved = await gameState.saveWorldState(userId, username, incoming, `save:${removeCount}:${wallLevel}`);
        assert.equal(saved.wallLevel, wallLevel);
        assert.equal(saved.resources.sol, 321);
        assert.equal(saved.buildings.length, Math.max(0, base.buildings.length - removeCount));

        const duplicated = await gameState.saveWorldState(userId, username, incoming, `save:${removeCount}:${wallLevel}`);
        assert.deepEqual(duplicated, saved);

        const patchTarget = structuredClone(saved);
        patchTarget.army = { bot: removeCount + wallLevel };
        patchTarget.wallLevel = wallLevel + 1;
        const patch = gameState.buildPatchFromClientState(saved, patchTarget, userId, username);
        const applied = await gameState.appendWorldPatchEvent(userId, patch, `patch:${removeCount}:${wallLevel}`);
        const deduped = await gameState.appendWorldPatchEvent(userId, patch, `patch:${removeCount}:${wallLevel}`);
        const materialized = await gameState.materializeState(userId, username, 12_000);

        assert.equal(applied, true);
        assert.equal(deduped, false);
        assert.equal(materialized.world.wallLevel, wallLevel + 1);
        assert.equal(materialized.world.army.bot, removeCount + wallLevel);
      });
    }
  }
});
