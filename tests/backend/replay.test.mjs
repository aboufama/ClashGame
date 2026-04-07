import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import * as blob from '../../.test-dist/api/_lib/blob.js';
import * as gameState from '../../.test-dist/api/_lib/game_state.js';
import * as indexes from '../../.test-dist/api/_lib/indexes.js';
import * as models from '../../.test-dist/api/_lib/models.js';
import replayHandler from '../../.test-dist/api/attacks/replay.js';
import * as usersList from '../../.test-dist/api/users/list.js';
import { callHandler, installBlobHarness, resetBackendTestState, seedSession, seedUser, sessionCookie, withFakeNow } from './helpers.mjs';

const modules = { blob, gameState, indexes, usersList };

afterEach(() => {
  resetBackendTestState(modules);
});

function seedAuthedParticipants(harness) {
  const now = Date.now();
  seedUser(harness, { id: 'attacker', email: 'attacker@example.com', username: 'Attacker', createdAt: now, lastSeen: now });
  seedUser(harness, { id: 'victim', email: 'victim@example.com', username: 'Victim', createdAt: now, lastSeen: now });
  seedSession(harness, { token: 'sess_attacker', userId: 'attacker', createdAt: now, expiresAt: now + 1000 * 60 * 60 * 24 });
  seedSession(harness, { token: 'sess_victim', userId: 'victim', createdAt: now, expiresAt: now + 1000 * 60 * 60 * 24 });
  return {
    attackerHeaders: { cookie: sessionCookie('sess_attacker') },
    victimHeaders: { cookie: sessionCookie('sess_victim') }
  };
}

function makeEnemyWorld(victimId = 'victim', username = 'Victim') {
  return models.buildStarterWorld(victimId, username);
}

function makeFrame(index, overrides = {}) {
  return {
    t: index * 100,
    destruction: Math.min(100, index),
    solLooted: index * 2,
    buildings: [{ id: `b_${index}`, health: Math.max(0, 100 - index), isDestroyed: index % 3 === 0 }],
    troops: [{ id: `t_${index}`, type: 'bot', level: 1, owner: 'PLAYER', gridX: index, gridY: index, health: 10, maxHealth: 10 }],
    ...overrides
  };
}

function seedReplay(harness, attackId, totalFrames) {
  const frames = Array.from({ length: totalFrames }, (_, index) => makeFrame(index));
  const chunkSize = 30;
  const chunkCount = Math.max(1, Math.ceil(frames.length / chunkSize));
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    harness.set(`attack_replay_chunks/${attackId}/${String(chunkIndex).padStart(6, '0')}.json`, {
      attackId,
      chunkIndex,
      updatedAt: 10_000 + chunkIndex,
      frames: frames.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize)
    });
  }

  harness.set(`attack_replays/${attackId}.json`, {
    attackId,
    attackerId: 'attacker',
    attackerName: 'Attacker',
    victimId: 'victim',
    victimName: 'Victim',
    status: 'live',
    startedAt: 10_000,
    updatedAt: 10_000 + totalFrames,
    enemyWorld: makeEnemyWorld(),
    frames: [],
    frameCount: frames.length,
    latestFrame: frames[frames.length - 1] ?? null,
    firstChunkIndex: 0,
    lastChunkIndex: chunkCount - 1
  });

  return frames;
}

async function startReplay(harness, headers, attackId, victimId = 'victim') {
  return await callHandler(replayHandler, {
    method: 'POST',
    headers,
    body: {
      action: 'start',
      attackId,
      victimId,
      attackerId: 'attacker',
      attackerName: 'Attacker',
      enemyWorld: makeEnemyWorld(victimId, victimId === 'victim' ? 'Victim' : 'Other Victim')
    }
  });
}

test('replay start creates a live session and sanitized replay metadata', async () => {
  const harness = installBlobHarness(modules);
  const { attackerHeaders } = seedAuthedParticipants(harness);

  const res = await startReplay(harness, attackerHeaders, 'live_start');
  const replay = harness.get('attack_replays/live_start.json');
  const liveStore = harness.get('attack_live/victim.json');

  assert.equal(res.statusCode, 200);
  assert.equal(replay.status, 'live');
  assert.equal(replay.frameCount, 0);
  assert.equal(replay.victimName, 'Victim');
  assert.equal(liveStore.sessions.length, 1);
});

test('frame publishing stores chunked replay data and state windows stay correct', async t => {
  const totals = [1, 2, 30, 31, 60, 61, 90, 120];

  for (const total of totals) {
    await t.test(`total=${total}`, async () => {
      const harness = installBlobHarness(modules);
      const { attackerHeaders } = seedAuthedParticipants(harness);
      await startReplay(harness, attackerHeaders, `chunk_${total}`);

      for (let index = 0; index < total; index += 1) {
        const res = await callHandler(replayHandler, {
          method: 'POST',
          headers: attackerHeaders,
          body: {
            action: 'frame',
            attackId: `chunk_${total}`,
            frame: makeFrame(index)
          }
        });
        assert.equal(res.statusCode, 200);
      }

      const stateRes = await callHandler(replayHandler, {
        method: 'POST',
        headers: attackerHeaders,
        body: { action: 'state', attackId: `chunk_${total}`, limit: 36 }
      });
      const afterT = total > 6 ? (total - 6) * 100 : 0;
      const deltaRes = await callHandler(replayHandler, {
        method: 'POST',
        headers: attackerHeaders,
        body: { action: 'state', attackId: `chunk_${total}`, afterT, limit: 10 }
      });

      const replay = harness.get(`attack_replays/chunk_${total}.json`);
      const chunkFiles = harness.pathnames(`attack_replay_chunks/chunk_${total}/`);

      assert.equal(stateRes.statusCode, 200);
      assert.equal(stateRes.body.replay.frameCount, total);
      assert.equal(stateRes.body.replay.latestFrame.t, (total - 1) * 100);
      assert.equal(stateRes.body.replay.frames.length, Math.min(total, 36));
      assert.equal(chunkFiles.length, Math.ceil(total / 30));
      assert.deepEqual(
        deltaRes.body.replay.frames.map(frame => frame.t),
        Array.from({ length: Math.min(5, total - (afterT / 100) - 1) }, (_, index) => afterT + (index + 1) * 100)
      );
      assert.equal(replay.frames.length, 0);
    });
  }
});

test('duplicate frame timestamps are coalesced instead of appended', async t => {
  const repeats = [1, 2, 3, 5, 8, 13];

  for (const repeat of repeats) {
    await t.test(`repeat=${repeat}`, async () => {
      const harness = installBlobHarness(modules);
      const { attackerHeaders } = seedAuthedParticipants(harness);
      await startReplay(harness, attackerHeaders, `dup_${repeat}`);

      for (let index = 0; index < repeat; index += 1) {
        await callHandler(replayHandler, {
          method: 'POST',
          headers: attackerHeaders,
          body: {
            action: 'frame',
            attackId: `dup_${repeat}`,
            frame: makeFrame(1, { t: 100, destruction: index * 10 })
          }
        });
      }

      const stateRes = await callHandler(replayHandler, {
        method: 'POST',
        headers: attackerHeaders,
        body: { action: 'state', attackId: `dup_${repeat}`, limit: 10 }
      });

      assert.equal(stateRes.body.replay.frameCount, 1);
      assert.equal(stateRes.body.replay.latestFrame.destruction, Math.min(100, (repeat - 1) * 10));
      assert.equal(stateRes.body.replay.frames.length, 1);
    });
  }
});

test('state action slices frames correctly across afterT and limit combinations', async t => {
  const totals = [20, 45, 75, 120];
  const afterTs = [undefined, 0, 1_500, 4_500];
  const limits = [5, 12, 30];

  for (const total of totals) {
    for (const afterT of afterTs) {
      for (const limit of limits) {
        await t.test(`total=${total} afterT=${String(afterT)} limit=${limit}`, async () => {
          const harness = installBlobHarness(modules);
          const { attackerHeaders } = seedAuthedParticipants(harness);
          const frames = seedReplay(harness, `seeded_${total}`, total);

          const res = await callHandler(replayHandler, {
            method: 'POST',
            headers: attackerHeaders,
            body: {
              action: 'state',
              attackId: `seeded_${total}`,
              ...(afterT === undefined ? {} : { afterT }),
              limit
            }
          });

          const expected = afterT === undefined
            ? frames.slice(Math.max(0, frames.length - limit))
            : frames.filter(frame => frame.t > afterT).slice(0, limit);

          assert.equal(res.statusCode, 200);
          assert.equal(res.body.replay.frameCount, total);
          assert.deepEqual(res.body.replay.frames.map(frame => frame.t), expected.map(frame => frame.t));
        });
      }
    }
  }
});

test('live session updates are throttled while frames stream in', async () => {
  const harness = installBlobHarness(modules);
  const { attackerHeaders } = seedAuthedParticipants(harness);

  await withFakeNow(10_000, async clock => {
    await startReplay(harness, attackerHeaders, 'throttle');
    for (let index = 0; index < 5; index += 1) {
      clock.tick(100);
      await callHandler(replayHandler, {
        method: 'POST',
        headers: attackerHeaders,
        body: { action: 'frame', attackId: 'throttle', frame: makeFrame(index) }
      });
    }

    const beforeThreshold = harness.get('attack_live/victim.json');
    assert.equal(beforeThreshold.sessions[0].updatedAt, 10_000);

    clock.tick(1_000);
    await callHandler(replayHandler, {
      method: 'POST',
      headers: attackerHeaders,
      body: { action: 'frame', attackId: 'throttle', frame: makeFrame(6) }
    });

    const afterThreshold = harness.get('attack_live/victim.json');
    assert.equal(afterThreshold.sessions[0].updatedAt, 11_500);
  });
});

test('restarting an existing live replay uses the stored victim id for live session updates', async () => {
  const harness = installBlobHarness(modules);
  const { attackerHeaders } = seedAuthedParticipants(harness);

  await startReplay(harness, attackerHeaders, 'victim_pin', 'victim');
  const res = await startReplay(harness, attackerHeaders, 'victim_pin', 'wrong_target');

  assert.equal(res.statusCode, 200);
  assert.ok(harness.has('attack_live/victim.json'));
  assert.equal(harness.has('attack_live/wrong_target.json'), false);
});

test('incoming prunes stale live sessions', async () => {
  const harness = installBlobHarness(modules);
  const { victimHeaders } = seedAuthedParticipants(harness);
  harness.set('attack_live/victim.json', {
    sessions: [
      { attackId: 'fresh', attackerId: 'attacker', attackerName: 'Attacker', victimId: 'victim', startedAt: 10_000, updatedAt: 35_000 },
      { attackId: 'stale', attackerId: 'attacker', attackerName: 'Attacker', victimId: 'victim', startedAt: 10_000, updatedAt: 1_000 }
    ]
  });

  const res = await withFakeNow(36_000, () =>
    callHandler(replayHandler, {
      method: 'POST',
      headers: victimHeaders,
      body: { action: 'incoming' }
    })
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.sessions.map(session => session.attackId), ['fresh']);
  assert.deepEqual(harness.get('attack_live/victim.json').sessions.map(session => session.attackId), ['fresh']);
});

test('ending a replay compacts frames, removes chunks, and clears the live session', async () => {
  const harness = installBlobHarness(modules);
  const { attackerHeaders } = seedAuthedParticipants(harness);
  await startReplay(harness, attackerHeaders, 'finish_me');

  for (let index = 0; index < 35; index += 1) {
    await callHandler(replayHandler, {
      method: 'POST',
      headers: attackerHeaders,
      body: { action: 'frame', attackId: 'finish_me', frame: makeFrame(index) }
    });
  }

  const endRes = await callHandler(replayHandler, {
    method: 'POST',
    headers: attackerHeaders,
    body: { action: 'end', attackId: 'finish_me', destruction: 88, solLooted: 222 }
  });
  const replay = harness.get('attack_replays/finish_me.json');

  assert.equal(endRes.statusCode, 200);
  assert.equal(replay.status, 'finished');
  assert.equal(replay.frames.length, 35);
  assert.equal(replay.finalResult.solLooted, 222);
  assert.equal(harness.pathnames('attack_replay_chunks/finish_me/').length, 0);
  assert.equal(harness.get('attack_live/victim.json').sessions.length, 0);
});
