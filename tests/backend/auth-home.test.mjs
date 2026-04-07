import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import * as auth from '../../.test-dist/api/_lib/auth.js';
import * as blob from '../../.test-dist/api/_lib/blob.js';
import * as gameState from '../../.test-dist/api/_lib/game_state.js';
import * as homeWorld from '../../.test-dist/api/_lib/home_world.js';
import * as indexes from '../../.test-dist/api/_lib/indexes.js';
import * as models from '../../.test-dist/api/_lib/models.js';
import * as usersList from '../../.test-dist/api/users/list.js';
import { installBlobHarness, resetBackendTestState, seedUser, withFakeNow } from './helpers.mjs';

const modules = { blob, gameState, indexes, usersList };

afterEach(() => {
  resetBackendTestState(modules);
});

function seedStoredState(harness, userId, username, world) {
  const now = Date.now();
  world.lastSaveTime = now;
  harness.set(`game/${userId}/state.json`, {
    schemaVersion: 2,
    updatedAt: now,
    world,
    requestKeys: []
  });
}

test('identifier lookups resolve via direct auth indexes', async t => {
  const variants = [
    ['user@example.com', 'user@example.com'],
    ['USER@EXAMPLE.COM', 'user@example.com'],
    ['Mixed_Name', 'Mixed_Name'],
    ['mixed_name', 'Mixed_Name'],
    ['another-player', 'another-player'],
    ['ANOTHER-PLAYER', 'another-player']
  ];

  for (const [identifier, username] of variants) {
    await t.test(`identifier=${identifier}`, async () => {
      const harness = installBlobHarness(modules);
      const userId = `user_${identifier.replace(/[^a-z0-9]/gi, '_')}`;
      const user = seedUser(harness, {
        id: userId,
        email: 'user@example.com',
        username,
        lastSeen: 100,
        createdAt: 50
      });

      await auth.upsertUserAuthLookups(user);
      const found = await auth.findUserByIdentifier(identifier);
      assert.equal(found?.id, user.id);
    });
  }
});

test('findUserByIdentifier only full-scans users when explicitly enabled', async t => {
  const identifiers = [
    ['scan@example.com', 'ScanUser'],
    ['ScanUser', 'ScanUser'],
    ['scan_only_user', 'scan_only_user']
  ];

  for (const [identifier, username] of identifiers) {
    await t.test(`identifier=${identifier}`, async () => {
      const harness = installBlobHarness(modules);
      seedUser(harness, {
        id: 'scan_only_user',
        email: 'scan@example.com',
        username
      });

      const withoutFallback = await auth.findUserByIdentifier(identifier);
      const withFallback = await auth.findUserByIdentifier(identifier, { fullScanFallback: true });

      assert.equal(withoutFallback, null);
      assert.equal(withFallback?.id, 'scan_only_user');
      assert.ok(harness.stats.listPathnames >= 1);
    });
  }
});

test('reserveUserAuthLookups rejects email and username conflicts', async t => {
  const cases = [
    { id: 'c1', email: 'alpha@example.com', username: 'alpha', conflict: 'email' },
    { id: 'c2', email: 'beta@example.com', username: 'alpha', conflict: 'username' },
    { id: 'c3', email: 'alpha@example.com', username: 'gamma', conflict: 'email' },
    { id: 'c4', email: 'delta@example.com', username: 'delta', conflict: undefined }
  ];

  for (const entry of cases) {
    await t.test(`user=${entry.id}`, async () => {
      const harness = installBlobHarness(modules);
      await auth.reserveUserAuthLookups({ id: 'taken', email: 'alpha@example.com', username: 'alpha' });
      const result = await auth.reserveUserAuthLookups(entry);
      assert.equal(result.ok, !entry.conflict);
      if (entry.conflict) {
        assert.equal(result.conflict, entry.conflict);
        assert.equal(result.reservedPathnames.length, 0);
      } else {
        assert.ok(result.reservedPathnames.length > 0);
      }
    });
  }

});

test('resolveHomeWorld repairs malformed stored worlds', async t => {
  const defects = [
    ['empty_buildings', world => { world.buildings = []; }, resolved => assert.ok(resolved.repairReasons.includes('empty_buildings'))],
    ['missing_townhall', world => { world.buildings = world.buildings.filter(building => building.type !== 'town_hall'); }, resolved => assert.ok(resolved.world.buildings.some(building => building.type === 'town_hall'))],
    ['no_playable_structures', world => { world.buildings = [{ ...world.buildings[0], id: 'wall_only', type: 'wall' }]; }, resolved => assert.ok(resolved.world.buildings.some(building => building.type !== 'wall'))],
    ['invalid_resources', world => { world.resources = { sol: -5 }; }, resolved => assert.ok(resolved.world.resources.sol >= 0)],
    ['invalid_obstacles', world => { world.obstacles = null; }, resolved => assert.ok(Array.isArray(resolved.world.obstacles))],
    ['invalid_revision', world => { world.revision = 0; }, resolved => assert.ok(resolved.world.revision >= 1)],
    ['invalid_wall_level', world => { world.wallLevel = 0; }, resolved => assert.ok(resolved.world.wallLevel >= 1)],
    ['invalid_last_save_time', world => { world.lastSaveTime = 0; }, resolved => assert.ok(resolved.world.lastSaveTime > 0)],
    ['missing_world_id', world => { world.id = ''; }, resolved => assert.ok(resolved.world.id)],
    ['owner_mismatch', world => { world.ownerId = 'someone_else'; }, resolved => assert.equal(resolved.world.ownerId, 'repair_user')],
    ['username_mismatch', world => { world.username = 'Wrong'; }, resolved => assert.ok(resolved.repairReasons.includes('username_mismatch'))]
  ];

  for (const [reason, mutate, validate] of defects) {
    await t.test(reason, async () => {
      const harness = installBlobHarness(modules);
      const world = models.buildStarterWorld('repair_user', 'Repair');
      mutate(world);
      seedStoredState(harness, 'repair_user', 'Repair', world);

      const resolved = await withFakeNow(20_000, () =>
        homeWorld.resolveHomeWorld('repair_user', 'Repair', { now: 20_000, source: 'test' })
      );

      assert.equal(resolved.world.ownerId, 'repair_user');
      assert.equal(resolved.world.username, 'Repair');
      assert.ok(Array.isArray(resolved.world.buildings));
      assert.ok(resolved.world.buildings.length > 0);
      validate(resolved);
    });
  }
});

test('resolveHomeWorld restores stronger history snapshots when current state is broken', async t => {
  const historyCases = [
    ['empty_current', world => { world.buildings = []; }, true],
    ['single_building', world => { world.buildings = world.buildings.slice(0, 1); }, false],
    ['missing_hall', world => { world.buildings = world.buildings.filter(building => building.type !== 'town_hall'); }, true],
    ['walls_only', world => { world.buildings = [{ ...world.buildings[0], id: 'only_wall', type: 'wall' }]; }, true],
    ['tiny_fraction', world => { world.buildings = world.buildings.slice(0, 4); }, false],
    ['healthy_state', world => { world.buildings = world.buildings.slice(0, 6); }, false]
  ];

  for (const [label, mutateCurrent, shouldRecover] of historyCases) {
    await t.test(label, async () => {
      const harness = installBlobHarness(modules);
      const currentWorld = models.buildStarterWorld('history_user', 'History');
      const historyWorld = models.buildStarterWorld('history_user', 'History');
      while (historyWorld.buildings.length < 20) {
        historyWorld.buildings.push({
          ...historyWorld.buildings[historyWorld.buildings.length - 1],
          id: `extra_${historyWorld.buildings.length}`,
          type: historyWorld.buildings.length % 2 === 0 ? 'cannon' : 'wall',
          gridX: historyWorld.buildings.length,
          gridY: historyWorld.buildings.length
        });
      }

      mutateCurrent(currentWorld);
      seedStoredState(harness, 'history_user', 'History', currentWorld);
      harness.setHistory('game/history_user/state.json', [{ world: historyWorld }]);

      const resolved = await withFakeNow(30_000, () =>
        homeWorld.resolveHomeWorld('history_user', 'History', { now: 30_000, source: 'history-test' })
      );

      assert.equal(resolved.recoveredFromHistory, shouldRecover);
      if (shouldRecover) {
        assert.ok(resolved.world.buildings.length >= historyWorld.buildings.length);
      }
    });
  }
});
