const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { startServer } = require('./_helpers');
const db = require('../server/db');
const col = require('../server/db/collections');
const search = require('../server/search/client');
const { reconcile } = require('../server/shared/reconcile');

let s;
test.before(async () => { s = await startServer(); });
test.after(async () => { await s.close(); });

const mkSite = async (mgr, name, price = 300) =>
  (await s.call('POST', '/admin/shop/sites', { token: mgr.token, body: { name, url: 'https://x.example.com', price } })).body.site;
const give = (adm, id, delta) => s.call('POST', '/admin/points', { token: adm.token, body: { userId: id, delta } });

test('컬렉션 이름 접두사: 기본 ieumps_, 바꿀 수 있고, 잘못된 값은 거부', () => {
  const run = (env) => spawnSync(process.execPath, ['-e', "const c=require('./server/db/collections');console.log(JSON.stringify([c.USERS,c.SHARED_ACCOUNTS,c.pointLog('u1'),c.messages('r1')]))"], {
    cwd: path.join(__dirname, '..'), env: { PATH: process.env.PATH, ...env }, encoding: 'utf8',
  });
  assert.deepEqual(JSON.parse(run({}).stdout), ['ieumps_users', 'ieumps_shared_accounts', 'ieumps_users/u1/points_log', 'ieumps_rooms/r1/messages']);
  assert.deepEqual(JSON.parse(run({ DB_PREFIX: 'ps_' }).stdout)[0], 'ps_users');
  assert.deepEqual(JSON.parse(run({ DB_PREFIX: '' }).stdout)[0], 'users');
  const bad = run({ DB_PREFIX: 'a-b/c' });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /DB_PREFIX/);
  assert.equal(col.USERS, 'ieumps_users', '이 테스트 프로세스도 기본 접두사를 쓴다');
});

test('공유용 계정 복사본: 가입/역할 변경과 같이 맞춰지고, 민감한 값은 없다', async () => {
  const owner = await s.signup('sh_owner', '제작자', 'owner');
  const a = await s.signup('sh_a', '공유A');
  const acc = await db.get(col.SHARED_ACCOUNTS, a.id);
  assert.deepEqual(Object.keys(acc).sort(), ['id', 'name', 'role', 'schema', 'updatedAt', 'username']);
  assert.equal(acc.username, 'sh_a'); assert.equal(acc.name, '공유A'); assert.equal(acc.role, 'member'); assert.equal(acc.schema, 1);
  assert.ok(!JSON.stringify(acc).includes('passHash'));
  assert.equal((await db.get(col.SHARED_ACCOUNTS, owner.id)).role, 'owner'); // 제작자도 복사본에 맞게 들어간다

  await s.call('PATCH', `/admin/roles/${a.id}`, { token: owner.token, body: { role: 'admin' } });
  assert.equal((await db.get(col.SHARED_ACCOUNTS, a.id)).role, 'admin');
  assert.equal((await db.get(col.USERS, a.id)).role, 'admin');
  // 실패한 변경(제작자 변경 시도)은 복사본도 안 바꾼다
  await s.call('PATCH', `/admin/roles/${owner.id}`, { token: owner.token, body: { role: 'member' } });
  assert.equal((await db.get(col.SHARED_ACCOUNTS, owner.id)).role, 'owner');
});

test('입장권 복사본: 구매와 같이 생기고, 실패한 구매에는 생기지 않는다', async () => {
  const mgr = await s.signup('tk_mgr', '관리', 'manager');
  const adm = await s.signup('tk_adm', '어드민', 'admin');
  const rich = await s.signup('tk_rich', '부자');
  const poor = await s.signup('tk_poor', '빈털터리');
  const site = await mkSite(mgr, '티켓 사이트', 300);
  await give(adm, rich.id, 1000);
  assert.equal((await s.call('POST', `/shop/sites/${site.id}/buy`, { token: poor.token })).status, 400);
  assert.equal(await db.get(col.SHARED_TICKETS, `${poor.id}__${site.id}`), null);
  assert.equal((await s.call('POST', `/shop/sites/${site.id}/buy`, { token: rich.token })).status, 200);
  const t = await db.get(col.SHARED_TICKETS, `${rich.id}__${site.id}`);
  assert.equal(t.uid, rich.id); assert.equal(t.siteId, site.id); assert.equal(t.schema, 1); assert.equal(typeof t.at, 'number');
  assert.deepEqual(Object.keys(t).sort(), ['at', 'id', 'schema', 'siteId', 'uid', 'updatedAt']);
  assert.ok(!('points' in t) && !('price' in t), '가격·포인트는 복사본에 넣지 않는다');
});

test('외부 읽기 API: 계정/입장권 조회, 자기 사이트 것만, 키가 틀리면 거부', async () => {
  const mgr = await s.signup('ex_mgr', '관리', 'manager');
  const adm = await s.signup('ex_adm', '어드민', 'admin');
  const user = await s.signup('ex_user', '이용자');
  const siteA = await mkSite(mgr, '외부A', 100);
  const siteB = await mkSite(mgr, '외부B', 100);
  const post = (p, body) => s.call('POST', `/external/${p}`, { body });

  const acc = await post('account', { siteKey: siteA.siteKey, userId: user.id });
  assert.equal(acc.status, 200);
  assert.deepEqual(acc.body, { id: user.id, username: 'ex_user', name: '이용자', role: 'member' }); // 딱 이 네 필드만
  assert.deepEqual((await post('account', { siteKey: siteA.siteKey, username: 'EX_USER' })).body.id, user.id);
  assert.equal((await post('account', { siteKey: 'wrong', userId: user.id })).status, 401);
  assert.equal((await post('account', { siteKey: siteA.siteKey, userId: 'nope' })).status, 404);
  assert.equal((await post('account', { userId: user.id })).status, 400);

  assert.deepEqual((await post('ticket', { siteKey: siteA.siteKey, userId: user.id })).body, { owned: false, via: null, since: null });
  await give(adm, user.id, 100);
  await s.call('POST', `/shop/sites/${siteA.id}/buy`, { token: user.token });
  const owned = (await post('ticket', { siteKey: siteA.siteKey, userId: user.id })).body;
  assert.equal(owned.owned, true); assert.equal(owned.via, 'ticket'); assert.equal(typeof owned.since, 'number');
  assert.equal((await post('ticket', { siteKey: siteB.siteKey, userId: user.id })).body.owned, false, '다른 사이트의 입장권은 보이지 않는다');
  assert.deepEqual((await post('ticket', { siteKey: siteA.siteKey, userId: mgr.id })).body.via, 'staff'); // 관리자는 입장권 없이도 입장 가능(enter 와 같은 규칙)
  assert.equal((await post('ticket', { siteKey: siteA.siteKey, userId: 'nope' })).status, 404);

  await s.call('DELETE', `/admin/shop/sites/${siteB.id}`, { token: mgr.token });
  assert.equal((await post('ticket', { siteKey: siteB.siteKey, userId: user.id })).status, 401, '숨긴 사이트의 키는 더 이상 통하지 않는다');
});

test('점검·복구: 어긋난 복사본(누락/다름/고아)을 찾고, 원본 기준으로 고치며, 반복해도 같다', async () => {
  const mgr = await s.signup('rc_mgr', '관리', 'manager');
  const adm = await s.signup('rc_adm', '어드민', 'admin');
  const [u1, u2, u3] = await Promise.all(['rc_1', 'rc_2', 'rc_3'].map((n) => s.signup(n, n)));
  const site = await mkSite(mgr, '복구 사이트', 10);
  for (const u of [u1, u2]) { await give(adm, u.id, 50); await s.call('POST', `/shop/sites/${site.id}/buy`, { token: u.token }); }
  assert.equal((await reconcile()).clean, true, '처음엔 어긋난 게 없다');

  await db.delete(col.SHARED_ACCOUNTS, u1.id);                                   // 누락
  await db.update(col.SHARED_ACCOUNTS, u2.id, { role: 'owner' });                // 다름
  await db.set(col.SHARED_ACCOUNTS, 'ghost', { schema: 1, username: 'ghost', name: 'g', role: 'member' }); // 고아
  await db.delete(col.SHARED_TICKETS, `${u1.id}__${site.id}`);                   // 입장권 누락
  await db.set(col.SHARED_TICKETS, `${u3.id}__${site.id}`, { schema: 1, uid: u3.id, siteId: site.id, at: 1 }); // 안 산 사람의 가짜 입장권

  const found = await reconcile();
  assert.equal(found.clean, false);
  assert.deepEqual([found.accounts.missing, found.accounts.stale, found.accounts.orphan], [1, 1, 1]);
  assert.deepEqual([found.tickets.missing, found.tickets.stale, found.tickets.orphan], [1, 0, 1]);
  assert.equal(await db.get(col.SHARED_ACCOUNTS, u1.id), null, '점검만 할 때는 고치지 않는다');

  const fixed = await reconcile({ repair: true });
  assert.equal(fixed.repair, true);
  assert.equal((await db.get(col.SHARED_ACCOUNTS, u1.id)).username, 'rc_1');
  assert.equal((await db.get(col.SHARED_ACCOUNTS, u2.id)).role, 'member');
  assert.equal(await db.get(col.SHARED_ACCOUNTS, 'ghost'), null);
  assert.ok(await db.get(col.SHARED_TICKETS, `${u1.id}__${site.id}`));
  assert.equal(await db.get(col.SHARED_TICKETS, `${u3.id}__${site.id}`), null, '원본에 없는 입장권은 지운다');
  assert.equal((await reconcile()).clean, true);
  assert.equal((await reconcile({ repair: true })).clean, true, '반복해도 같다');
});

test('검색 색인 어긋남 점검·복구', async () => {
  const u = await s.signup('ix_user', '색인점검');
  const c = search.get();
  await c.remove('users', u.id); await c.remove('workers', u.id); // 색인에서만 사라진 상황
  const found = await reconcile({ search: true });
  assert.equal(found.clean, false);
  assert.deepEqual(found.search.drift.sort(), ['users', 'workers']);
  assert.equal((await c.search({ index: 'users', q: '색인점검' })).hits.length, 0);
  const fixed = await reconcile({ repair: true, search: true });
  assert.deepEqual(fixed.search.after.users, { db: fixed.search.after.users.db, index: fixed.search.after.users.db });
  assert.equal((await c.search({ index: 'users', q: '색인점검' })).hits[0].id, u.id);
  assert.equal((await reconcile({ search: true })).clean, true);
});

test('동시 요청: 더블클릭 구매는 한 번만, 같은 아이디 동시 가입은 한 명만, 포인트는 정확히 합산', async () => {
  const mgr = await s.signup('cc_mgr', '관리', 'manager');
  const adm = await s.signup('cc_adm', '어드민', 'admin');
  const buyer = await s.signup('cc_buyer', '연타');
  const site = await mkSite(mgr, '동시 사이트', 300);
  await give(adm, buyer.id, 1000);
  const buys = await Promise.all(Array.from({ length: 8 }, () => s.call('POST', `/shop/sites/${site.id}/buy`, { token: buyer.token })));
  assert.deepEqual(buys.map((r) => r.status).sort(), [200, 409, 409, 409, 409, 409, 409, 409]);
  assert.equal((await db.get(col.USERS, buyer.id)).points, 700, '포인트는 한 번만 차감');
  assert.equal((await db.list(col.SHARED_TICKETS, { where: [['uid', '==', buyer.id]] })).length, 1);
  assert.equal((await db.list(col.pointLog(buyer.id))).filter((l) => l.delta === -300).length, 1);

  const regs = await Promise.all(Array.from({ length: 8 }, () => s.call('POST', '/auth/register', { body: { username: 'cc_same', password: 'secret1' } })));
  assert.equal(regs.filter((r) => r.status === 201).length, 1);
  assert.equal(regs.filter((r) => r.status === 409).length, 7);
  const sameName = (await db.list(col.USERS)).filter((u) => u.username === 'cc_same');
  assert.equal(sameName.length, 1);
  assert.ok(await db.get(col.SHARED_ACCOUNTS, sameName[0].id));

  const target = await s.signup('cc_target', '합산');
  await Promise.all(Array.from({ length: 30 }, () => give(adm, target.id, 1)));
  assert.equal((await db.get(col.USERS, target.id)).points, 30);
  assert.equal((await db.list(col.pointLog(target.id))).length, 30);
});

test('동시 채팅: 마지막 메시지는 항상 가장 새 메시지, DM 을 동시에 열어도 방이 초기화되지 않는다', async () => {
  const a = await s.signup('ct_a', '에이');
  const b = await s.signup('ct_b', '비');
  const opens = await Promise.all(Array.from({ length: 10 }, (_, i) => s.call('POST', '/chat/dm', { token: i % 2 ? a.token : b.token, body: { username: i % 2 ? 'ct_b' : 'ct_a' } })));
  const ids = new Set(opens.map((r) => r.body.room.id));
  assert.equal(ids.size, 1);
  const roomId = [...ids][0];

  const sent = await Promise.all(Array.from({ length: 25 }, (_, i) => s.call('POST', `/chat/rooms/${roomId}/messages`, { token: i % 2 ? a.token : b.token, body: { text: `메시지 ${i}` } })));
  assert.ok(sent.every((r) => r.status === 201));
  const msgs = (await s.call('GET', `/chat/rooms/${roomId}/messages`, { token: a.token })).body.items;
  assert.equal(msgs.length, 25);
  const newest = Math.max(...msgs.map((m) => m.createdAt));
  const room = await db.get(col.ROOMS, roomId);
  assert.equal(room.lastMessageAt, newest, '마지막 메시지 시각은 가장 새 메시지');
  assert.equal(msgs.filter((m) => m.createdAt === newest).map((m) => m.text.slice(0, 6)).includes(room.lastMessage.text.slice(0, 6)), true);

  // 이미 대화가 있는 방을 다시 열어도 마지막 메시지가 지워지지 않는다
  await Promise.all([s.call('POST', '/chat/dm', { token: a.token, body: { username: 'ct_b' } }), s.call('POST', '/chat/dm', { token: b.token, body: { username: 'ct_a' } })]);
  assert.equal((await db.get(col.ROOMS, roomId)).lastMessageAt, newest);
  assert.ok((await db.get(col.ROOMS, roomId)).lastMessage);
});

test('동시 단톡: 여러 명이 동시에 나가도 멤버가 정확하다', async () => {
  const users = await Promise.all(['gl_a', 'gl_b', 'gl_c', 'gl_d', 'gl_e'].map((n) => s.signup(n, n)));
  const room = (await s.call('POST', '/chat/groups', { token: users[0].token, body: { name: '동시나가기', members: users.slice(1).map((u) => u.username) } })).body.room;
  const leaves = await Promise.all(users.slice(1).map((u) => s.call('POST', `/chat/rooms/${room.id}/leave`, { token: u.token })));
  assert.ok(leaves.every((r) => r.status === 200));
  assert.deepEqual((await db.get(col.ROOMS, room.id)).members, [users[0].id], '남은 사람은 방장 한 명');
});

test('늦게 도착한 옛 메시지는 "마지막 메시지"를 덮어쓰지 못한다 (순서가 뒤바뀐 상황을 직접 만든다)', async () => {
  const a = await s.signup('ord_a', '에이');
  const b = await s.signup('ord_b', '비');
  const room = (await s.call('POST', '/chat/dm', { token: a.token, body: { username: 'ord_b' } })).body.room;
  // 다른 서버가 "더 새로운" 메시지를 이미 반영한 상태를 만든다
  const future = Date.now() + 60_000;
  await db.update(col.ROOMS, room.id, { lastMessageAt: future, lastMessage: { text: '더 새로운 메시지', senderName: '비', at: future } });
  const r = await s.call('POST', `/chat/rooms/${room.id}/messages`, { token: a.token, body: { text: '늦게 도착한 옛 메시지' } });
  assert.equal(r.status, 201);
  const after = await db.get(col.ROOMS, room.id);
  assert.equal(after.lastMessage.text, '더 새로운 메시지');
  assert.equal(after.lastMessageAt, future);
  assert.equal((await s.call('GET', `/chat/rooms/${room.id}/messages`, { token: b.token })).body.items.length, 1, '메시지 자체는 저장된다');
});
