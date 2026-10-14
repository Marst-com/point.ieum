const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./_helpers');

let s;
test.before(async () => { s = await startServer(); });
test.after(async () => { await s.close(); });

test('회원가입/로그인/중복/잘못된 비번', async () => {
  const a = await s.signup('alice', '앨리스');
  const me = await s.call('GET', '/me', { token: a.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'member');
  assert.ok(!JSON.stringify(me.body).includes('passHash'));

  const dup = await s.call('POST', '/auth/register', { body: { username: 'ALICE', password: 'secret1' } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'username_taken');

  const bad = await s.call('POST', '/auth/login', { body: { username: 'alice', password: 'wrongpw' } });
  assert.equal(bad.status, 401);
  const none = await s.call('POST', '/auth/login', { body: { username: 'nobody', password: 'wrongpw' } });
  assert.equal(none.status, 401);
  const ok = await s.call('POST', '/auth/login', { body: { username: 'Alice', password: 'secret1' } });
  assert.equal(ok.status, 200);

  const short = await s.call('POST', '/auth/register', { body: { username: 'bob', password: '123' } });
  assert.equal(short.status, 400);
  const weird = await s.call('POST', '/auth/register', { body: { username: 'a b!', password: 'secret1' } });
  assert.equal(weird.status, 400);
});

test('토큰 없음/변조는 401', async () => {
  assert.equal((await s.call('GET', '/me')).status, 401);
  const r = await s.call('GET', '/me', { token: 'abc.def.ghi' });
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, 'invalid_token');
});

test('익명(게스트): 상점은 볼 수 있고 일하기/톡/친구는 login_required', async () => {
  const g = (await s.call('POST', '/auth/guest')).body;
  assert.equal(g.user.isAnonymous, true);
  assert.deepEqual(g.user.permissions, ['shop.view']);
  assert.equal((await s.call('GET', '/shop/sites', { token: g.token })).status, 200);
  for (const [m, p] of [['POST', '/work/mine'], ['GET', '/chat/rooms'], ['GET', '/friends'], ['GET', '/me/points']]) {
    const r = await s.call(m, p, { token: g.token, body: { taps: 1 } });
    assert.equal(r.status, 401, p);
    assert.equal(r.body.error.code, 'login_required', p);
  }
});

test('일하기: 돌이 쌓이고, 너무 많은 taps 는 잘린다', async () => {
  const u = await s.signup('miner1', '광부1');
  const r1 = await s.call('POST', '/work/mine', { token: u.token, body: { taps: 5 } });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.accepted, 5);
  assert.equal(r1.body.stones, 5);
  assert.equal(r1.body.grade, 'F');
  // 바로 이어서 200번 → 허용량(약 1초 여유 + 경과시간)만 인정
  const r2 = await s.call('POST', '/work/mine', { token: u.token, body: { taps: 200 } });
  assert.ok(r2.body.accepted <= 35, `accepted=${r2.body.accepted}`);
  assert.equal(r2.body.stones, 5 + r2.body.accepted);
  assert.equal((await s.call('POST', '/work/mine', { token: u.token, body: { taps: 0 } })).status, 400);
  assert.equal((await s.call('POST', '/work/mine', { token: u.token, body: { taps: 'x' } })).status, 400);
  const g = await s.call('GET', '/me/grade', { token: u.token });
  assert.equal(g.status, 200);
  assert.equal(g.body.stones, r2.body.stones);
  assert.equal(g.body.rank >= 1, true);
});

test('등급 계산 경계값', () => {
  const { gradeFor, progress } = require('../server/services/gradeService');
  assert.equal(gradeFor(0), 'F');
  assert.equal(gradeFor(99), 'F');
  assert.equal(gradeFor(100), 'E');
  assert.equal(gradeFor(60000), 'S');
  assert.equal(progress(60000).next, null);
  assert.equal(progress(50).next.letter, 'E');
});

test('권한: 멤버는 관리 API 403, 어드민은 포인트/기록 가능·상점관리 불가', async () => {
  const m = await s.signup('plain', '일반');
  const adm = await s.signup('adm1', '어드민', 'admin');
  for (const [method, path] of [['GET', '/admin/work'], ['GET', '/admin/points/search'], ['GET', '/admin/shop/sites'], ['GET', '/admin/roles']]) {
    assert.equal((await s.call(method, path, { token: m.token })).status, 403, path);
  }
  assert.equal((await s.call('GET', '/admin/work', { token: adm.token })).status, 200);
  assert.equal((await s.call('GET', '/admin/points/search', { token: adm.token })).status, 200);
  assert.equal((await s.call('GET', '/admin/shop/sites', { token: adm.token })).status, 403);
  assert.equal((await s.call('GET', '/admin/roles', { token: adm.token })).status, 403);
  // 어드민/관리자는 '일하기' 불가
  assert.equal((await s.call('POST', '/work/mine', { token: adm.token, body: { taps: 1 } })).status, 403);
});

test('관리자 기록: 1위부터 정렬 + 검색', async () => {
  const adm = await s.signup('adm2', '어드민2', 'admin');
  const a = await s.signup('rk_a', '가나다');
  const b = await s.signup('rk_b', '가나');
  await s.call('POST', '/work/mine', { token: a.token, body: { taps: 3 } });
  await s.call('POST', '/work/mine', { token: b.token, body: { taps: 9 } });
  const all = (await s.call('GET', '/admin/work', { token: adm.token })).body.items;
  const stones = all.map((r) => r.stones);
  assert.deepEqual(stones, [...stones].sort((x, y) => y - x));
  assert.equal(all[0].rank, 1);
  assert.ok(!all.some((r) => r.id === adm.id), '일 안 하는 어드민은 순위에 없음');
  const found = (await s.call('GET', `/admin/work?search=${encodeURIComponent('가나')}`, { token: adm.token })).body.items;
  assert.equal(found[0].name, '가나'); // 정확히 일치가 먼저
  assert.equal(found[1].name, '가나다');
});

test('포인트 배부: 검색 우선순위, +/-, 부족하면 거부, 내역', async () => {
  const adm = await s.signup('adm3', '어드민3', 'admin');
  const t1 = await s.signup('pt_low', '철수');
  const t2 = await s.signup('pt_high', '철수');
  await s.call('POST', '/work/mine', { token: t2.token, body: { taps: 15 } });
  const { db } = { db: require('../server/db') };
  await db.update(require('../server/db/collections').USERS, t2.id, { stones: 700 }); // C 등급 쪽으로
  await require('../server/search/indexer').userStones(t2.id, 700);
  const found = (await s.call('GET', `/admin/points/search?q=${encodeURIComponent('철수')}`, { token: adm.token })).body.items;
  assert.equal(found[0].id, t2.id, '이름이 같으면 등급 높은 사람이 먼저');
  assert.equal(found[1].id, t1.id);

  const plus = await s.call('POST', '/admin/points', { token: adm.token, body: { userId: t1.id, delta: 500, reason: '이벤트' } });
  assert.equal(plus.body.points, 500);
  const minus = await s.call('POST', '/admin/points', { token: adm.token, body: { userId: t1.id, delta: -200 } });
  assert.equal(minus.body.points, 300);
  const over = await s.call('POST', '/admin/points', { token: adm.token, body: { userId: t1.id, delta: -301 } });
  assert.equal(over.status, 400);
  assert.equal(over.body.error.code, 'insufficient_points');
  assert.equal((await s.call('POST', '/admin/points', { token: adm.token, body: { userId: t1.id, delta: 0 } })).status, 400);
  assert.equal((await s.call('POST', '/admin/points', { token: adm.token, body: { userId: t1.id, delta: 1.5 } })).status, 400);
  assert.equal((await s.call('POST', '/admin/points', { token: adm.token, body: { userId: 'nope', delta: 5 } })).status, 404);

  const hist = (await s.call('GET', '/me/points', { token: t1.token })).body.items;
  assert.equal(hist.length, 2);
  assert.equal(hist[0].delta, -200);
  assert.equal(hist[0].balance, 300);
  assert.equal(hist[1].reason, '이벤트');
});

test('상점: 등록→구매→입장 흐름 (익명/미구매/구매자), 외부 검증', async () => {
  const mgr = await s.signup('mgr1', '관리자', 'manager');
  const adm = await s.signup('adm4', '어드민4', 'admin');
  const buyer = await s.signup('buyer', '구매자');
  const other = await s.signup('other', '타인');
  const guest = (await s.call('POST', '/auth/guest')).body;

  assert.equal((await s.call('POST', '/admin/shop/sites', { token: adm.token, body: { name: 'x', url: 'https://a.com', price: 1 } })).status, 403);
  assert.equal((await s.call('POST', '/admin/shop/sites', { token: mgr.token, body: { name: '나쁜', url: 'javascript:alert(1)', price: 1 } })).status, 400);
  const created = await s.call('POST', '/admin/shop/sites', { token: mgr.token, body: { name: '퀴즈 사이트', description: '퀴즈', url: 'https://quiz.example.com/play', price: 300 } });
  assert.equal(created.status, 201);
  const site = created.body.site;
  assert.ok(site.siteKey && site.url);

  // 멤버가 보는 목록엔 url / siteKey 가 없어야 한다
  const list = (await s.call('GET', '/shop/sites', { token: buyer.token })).body.items;
  const seen = list.find((x) => x.id === site.id);
  assert.equal(seen.owned, false);
  assert.equal(seen.url, undefined);
  assert.equal(seen.siteKey, undefined);

  // 포인트 없이 구매 → 거부
  const poor = await s.call('POST', `/shop/sites/${site.id}/buy`, { token: buyer.token });
  assert.equal(poor.status, 400);
  assert.equal(poor.body.error.code, 'insufficient_points');

  // 입장 시도: 익명 / 안 산 멤버
  const g = await s.call('POST', `/shop/sites/${site.id}/enter`, { token: guest.token });
  assert.deepEqual(g.body, { result: 'login_required' });
  const n = await s.call('POST', `/shop/sites/${site.id}/enter`, { token: other.token });
  assert.deepEqual(n.body, { result: 'not_purchased' });
  assert.equal((await s.call('POST', `/shop/sites/${site.id}/buy`, { token: guest.token })).status, 401);

  // 포인트 지급 후 구매
  await s.call('POST', '/admin/points', { token: adm.token, body: { userId: buyer.id, delta: 1000 } });
  const bought = await s.call('POST', `/shop/sites/${site.id}/buy`, { token: buyer.token });
  assert.equal(bought.status, 200);
  assert.equal(bought.body.points, 700);
  assert.equal((await s.call('POST', `/shop/sites/${site.id}/buy`, { token: buyer.token })).status, 409);
  assert.equal((await s.call('GET', '/me', { token: buyer.token })).body.user.points, 700);

  const ok = (await s.call('POST', `/shop/sites/${site.id}/enter`, { token: buyer.token })).body;
  assert.equal(ok.result, 'ok');
  const u = new URL(ok.url);
  assert.equal(u.origin + u.pathname, 'https://quiz.example.com/play');
  const entryToken = u.searchParams.get('ieum_token');
  assert.ok(entryToken);

  // 외부 사이트 백엔드의 검증
  const v = await s.call('POST', '/external/verify', { body: { siteKey: site.siteKey, token: entryToken } });
  assert.equal(v.status, 200);
  assert.equal(v.body.user.username, 'buyer');
  assert.equal((await s.call('POST', '/external/verify', { body: { siteKey: 'wrong', token: entryToken } })).status, 401);

  // 다른 사이트용 키로는 같은 토큰이 통하지 않는다
  const site2 = (await s.call('POST', '/admin/shop/sites', { token: mgr.token, body: { name: '두번째', url: 'https://two.example.com', price: 0 } })).body.site;
  assert.equal((await s.call('POST', '/external/verify', { body: { siteKey: site2.siteKey, token: entryToken } })).status, 401);

  // 사이트 숨기기 후엔 목록/입장에서 빠진다
  await s.call('DELETE', `/admin/shop/sites/${site2.id}`, { token: mgr.token });
  const after = (await s.call('GET', '/shop/sites', { token: buyer.token })).body.items;
  assert.ok(!after.some((x) => x.id === site2.id));
});

test('등급 관리: 제작자만, 제작자/본인은 변경 불가, 이름 우선 검색', async () => {
  const owner = await s.signup('boss', '제작자', 'owner');
  const adm = await s.signup('adm5', '어드민5', 'admin');
  const target = await s.signup('target1', '홍길동');
  await s.signup('target2', '길동이');

  assert.equal((await s.call('GET', '/admin/roles', { token: adm.token })).status, 403);
  const found = (await s.call('GET', `/admin/roles?q=${encodeURIComponent('홍길동')}`, { token: owner.token })).body.items;
  assert.equal(found[0].id, target.id);

  const up = await s.call('PATCH', `/admin/roles/${target.id}`, { token: owner.token, body: { role: 'manager' } });
  assert.equal(up.body.user.role, 'manager');
  // 바뀐 권한은 기존 토큰으로도 바로 적용된다
  assert.equal((await s.call('GET', '/admin/shop/sites', { token: target.token })).status, 200);
  assert.equal((await s.call('PATCH', `/admin/roles/${target.id}`, { token: owner.token, body: { role: 'owner' } })).status, 400);
  assert.equal((await s.call('PATCH', `/admin/roles/${owner.id}`, { token: owner.token, body: { role: 'member' } })).status, 400);
  assert.equal((await s.call('PATCH', `/admin/roles/${target.id}`, { token: adm.token, body: { role: 'admin' } })).status, 403);
});
