const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSearch, Shard, RemoteShard, SearchCluster } = require('../search');
const { createShardServer } = require('../search/node/shardServer');
const schemas = require('../search/schema');

const SYL = '김이박최정강조윤장임민준서연지우현도하은수빈';
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const corpus = () => {
  const r = rng(5); const docs = [];
  for (let i = 0; i < 1500; i++) {
    const name = Array.from({ length: 2 + Math.floor(r() * 2) }, () => SYL[Math.floor(r() * SYL.length)]).join('');
    docs.push({ id: `u${i}`, d: { text: { name, username: `user${i}` }, num: { friendCount: Math.floor(r() * 50), stones: Math.floor(r() * 1000), gradeRank: Math.floor(r() * 7) }, data: { name } } });
  }
  return docs;
};
const queries = ['민준', '김', 'ㅁㅈ', 'ㄱㅇ', '서연지', 'user12', '최정', '하은수'];
const ids = (r) => r.hits.map((h) => h.id);

test('샤드 1개 vs 5개: 검색·상위·순위 결과가 완전히 같다', async () => {
  const one = (await createSearch({ schemas, localShards: 1 })).cluster;
  const five = (await createSearch({ schemas, localShards: 5 })).cluster;
  const docs = corpus();
  await one.bulk('users', docs); await five.bulk('users', docs);
  assert.equal(await five.count('users'), 1500);
  const spread = (await five.stats()).map((s) => s.users.docs);
  assert.ok(spread.every((n) => n > 150 && n < 450), `고르게 나뉨: ${spread}`);
  for (const q of queries) {
    for (const tiered of [true, false]) {
      const req = { index: 'users', q, limit: 25, tiered, boost: 'friendCount' };
      assert.deepEqual(ids(await five.search(req)), ids(await one.search(req)), `q=${q} tiered=${tiered}`);
    }
  }
  const top1 = await one.topBy({ index: 'users', field: 'stones', limit: 40 });
  const top5 = await five.topBy({ index: 'users', field: 'stones', limit: 40 });
  assert.deepEqual(ids(top5), ids(top1));
  for (const v of [0, 10, 500, 999, 5000]) assert.equal(await five.countGreater('users', 'stones', v), await one.countGreater('users', 'stones', v));
  assert.deepEqual(ids(await five.search({ index: 'users', q: '민', limit: 10, excludeIds: [ids(await five.search({ index: 'users', q: '민', limit: 1 }))[0]] })).length, 10);
});

test('디스크 저장: 껐다 켜도 같은 결과 + 깨진 마지막 줄 무시 + snapshot', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shard-'));
  const open = () => new Shard({ schemas, dir }).open();
  let s = await open();
  await s.put('users', 'a', { text: { name: '김민준', username: 'a' }, num: { stones: 5 }, data: { name: '김민준' } });
  await s.put('users', 'b', { text: { name: '이서연', username: 'b' }, num: { stones: 50 }, data: { name: '이서연' } });
  await s.patch('users', 'a', { num: { stones: 500 } });
  await s.remove('users', 'b');
  await s.put('users', 'c', { text: { name: '박지우', username: 'c' }, num: { stones: 7 }, data: { name: '박지우' } });
  await s.flush();

  s = await open();
  assert.equal(await s.count('users'), 2);
  assert.deepEqual((await s.search({ index: 'users', q: '민준' })).hits.map((h) => h.id), ['a']);
  assert.deepEqual((await s.search({ index: 'users', q: '서연' })).hits, []);
  assert.equal(await s.countGreater('users', 'stones', 100), 1); // patch 반영
  assert.equal(await s.countGreater('users', 'stones', 6), 2);

  s.snapshot(); // 전체 저장 후 wal 비움
  assert.equal(fs.readFileSync(path.join(dir, 'wal.jsonl'), 'utf8'), '');
  await s.put('users', 'd', { text: { name: '최현도', username: 'd' }, num: { stones: 1 }, data: {} });
  await s.flush();
  fs.appendFileSync(path.join(dir, 'wal.jsonl'), '{"t":"put","i":"users","id":"zzz","d":{"text":{"na'); // 전원이 나가서 잘린 줄

  s = await open();
  assert.equal(s.loadInfo.skipped, 1);
  assert.equal(await s.count('users'), 3);
  assert.deepEqual((await s.search({ index: 'users', q: 'ㅊㅎㄷ' })).hits.map((h) => h.id), ['d']); // snapshot 에서 복원된 초성 검색
  assert.deepEqual((await s.search({ index: 'users', q: '지우' })).hits.map((h) => h.id), ['c']);
});

test('원격 샤드 노드(HTTP): 로컬과 결과 동일, 키 검증, 노드 하나가 죽어도 부분 결과', async () => {
  const key = 'secret-key';
  const nodes = [];
  for (let i = 0; i < 3; i++) {
    const shard = await new Shard({ schemas }).open();
    const server = createShardServer(shard, { key });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    nodes.push({ server, url: `http://127.0.0.1:${server.address().port}` });
  }
  const remote = (await createSearch({ schemas, nodes: nodes.map((n) => n.url), key, timeoutMs: 1500 })).cluster;
  const local = (await createSearch({ schemas, localShards: 3 })).cluster;
  const docs = corpus();
  await remote.bulk('users', docs); await local.bulk('users', docs);
  await remote.patch('users', 'u3', { num: { stones: 99999 } }); await local.patch('users', 'u3', { num: { stones: 99999 } });
  await remote.remove('users', 'u4'); await local.remove('users', 'u4');

  for (const q of queries) {
    const req = { index: 'users', q, limit: 20, tiered: true, boost: 'friendCount' };
    assert.deepEqual(ids(await remote.search(req)), ids(await local.search(req)), q);
  }
  assert.equal((await remote.topBy({ index: 'users', field: 'stones', limit: 1 })).hits[0].id, 'u3');
  assert.equal(await remote.count('users'), 1499);

  // 틀린 키는 거부
  const bad = new RemoteShard(nodes[0].url, { key: 'wrong' });
  await assert.rejects(bad.count('users'), /401/);
  const noKey = new SearchCluster([new RemoteShard(nodes[0].url, { key: '' })], { onShardError() {} });
  await assert.rejects(noKey.count('users'), /응답하지 않아요/);
  await assert.rejects(async () => createShardServer(await new Shard({ schemas }).open(), { key: '' }), /SEARCH_KEY/);

  // 노드 하나 장애 → 나머지로 답하고 partial 표시
  await new Promise((r) => { nodes[1].server.closeAllConnections(); nodes[1].server.close(r); });
  const errors = [];
  const survivor = new SearchCluster(remote.shards, { onShardError: (e) => errors.push(e.message) });
  const r = await survivor.search({ index: 'users', q: '민준', limit: 10 });
  assert.equal(r.partial, true);
  assert.ok(r.hits.length > 0);
  assert.equal(errors.length, 1);
  assert.ok((await survivor.count('users')) < 1499);

  await remote.close();
  for (const n of [nodes[0], nodes[2]]) await new Promise((res) => { n.server.closeAllConnections(); n.server.close(res); });
});
