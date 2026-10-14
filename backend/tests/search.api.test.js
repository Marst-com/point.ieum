const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./_helpers');
const indexer = require('../server/search/indexer');
const db = require('../server/db');

let s;
test.before(async () => { s = await startServer(); });
test.after(async () => { await s.close(); });

const col = require('../server/db/collections');
const setStones = async (id, stones) => { await db.update(col.USERS, id, { stones }); await indexer.userStones(id, stones); };

test('친구 검색: 초성·오타·인기순', async () => {
  const me = await s.signup('seeker', '찾는이');
  const pop = await s.signup('sp_pop', '스타일러');
  const unpop = await s.signup('sp_unpop', '스타일러');
  await s.signup('other_x', '박영희');
  for (const n of ['fan_a', 'fan_b']) { const f = await s.signup(n, n); await s.call('POST', '/friends', { token: f.token, body: { username: 'sp_pop' } }); }

  const q = async (text) => (await s.call('GET', `/friends/search?q=${encodeURIComponent(text)}`, { token: me.token })).body.items;
  const cho = await q('ㅅㅌㅇㄹ');
  assert.deepEqual(cho.map((u) => u.id), [pop.id, unpop.id], '초성 일치 → 같은 이름이면 인기(친구 수) 순');
  assert.equal(cho[0].friendCount, 2);
  assert.equal((await q('스타일'))[0].id, pop.id);   // 타이핑 도중
  assert.equal((await q('스타일'))[1].id, unpop.id);
  assert.equal((await q('박영히'))[0].name, '박영희'); // 오타
  assert.equal((await q('ㅂㅇㅎ'))[0].name, '박영희');
  assert.ok(!(await q('seeker')).some((u) => u.id === me.id), '나는 검색 결과에서 빠진다');
  // 친구 수가 바뀌면 순서도 바뀐다
  for (const n of ['fan_c', 'fan_d', 'fan_e']) { const f = await s.signup(n, n); await s.call('POST', '/friends', { token: f.token, body: { username: 'sp_unpop' } }); }
  assert.equal((await q('ㅅㅌㅇㄹ'))[0].id, unpop.id);
});

test('톡 메시지 검색: 내가 속한 방만, 나가면 제외, 최신순', async () => {
  const a = await s.signup('ms_a', '에이');
  const b = await s.signup('ms_b', '비');
  const c = await s.signup('ms_c', '씨');
  const dm = (await s.call('POST', '/chat/dm', { token: a.token, body: { username: 'ms_b' } })).body.room;
  const secret = (await s.call('POST', '/chat/dm', { token: b.token, body: { username: 'ms_c' } })).body.room;
  const send = (tok, room, text) => s.call('POST', `/chat/rooms/${room.id}/messages`, { token: tok, body: { text } });
  await send(a.token, dm, '오늘 점심 뭐 먹지?');
  await send(b.token, dm, '김치찌개 어때? 점심 같이 먹자');
  await send(b.token, secret, '비밀 점심 약속');
  await send(c.token, secret, '점심은 둘이서만');

  const search = async (tok, text) => (await s.call('GET', `/chat/search?q=${encodeURIComponent(text)}`, { token: tok })).body.items;
  const mine = await search(a.token, '점심');
  assert.equal(mine.length, 2);
  assert.ok(mine.every((m) => m.roomId === dm.id), '내가 속하지 않은 방의 메시지는 안 나온다');
  assert.equal(mine[0].text, '김치찌개 어때? 점심 같이 먹자', '최신 메시지가 먼저');
  assert.equal(mine[0].roomTitle, '비');
  assert.equal((await search(c.token, '점심')).length, 2);
  assert.ok((await search(c.token, '점심')).every((m) => m.roomId === secret.id));
  assert.equal((await search(a.token, '비밀')).length, 0, '남의 대화는 검색돼도 안 보인다');
  assert.equal((await search(a.token, '')).length, 0);
  assert.equal((await search(a.token, 'ㅈㅅ')).length, 0, '메시지는 초성 검색을 쓰지 않는다');

  const g = (await s.call('POST', '/chat/groups', { token: a.token, body: { name: '모임', members: ['ms_b'] } })).body.room;
  await send(a.token, g, '주말 산행 갈 사람');
  assert.equal((await search(b.token, '산행')).length, 1);
  await s.call('POST', `/chat/rooms/${g.id}/leave`, { token: b.token });
  assert.equal((await search(b.token, '산행')).length, 0, '나간 방의 메시지는 더 이상 검색되지 않는다');
  const lonely = await s.signup('ms_lonely', '외톨이');
  assert.equal((await search(lonely.token, '산행')).length, 0, '방이 하나도 없으면 결과도 없다');
  const guest = (await s.call('POST', '/auth/guest')).body;
  assert.equal((await s.call('GET', '/chat/search?q=a', { token: guest.token })).status, 401);
});

test('상점 검색: 초성·수정·숨김 반영', async () => {
  const mgr = await s.signup('sh_mgr', '관리', 'manager');
  const m = await s.signup('sh_member', '구경꾼');
  const mk = (name, desc) => s.call('POST', '/admin/shop/sites', { token: mgr.token, body: { name, description: desc, url: 'https://x.example.com', price: 10 } });
  const quiz = (await mk('퀴즈 사이트', '상식 퀴즈')).body.site;
  await mk('수학 게임', '두뇌 훈련');
  const q = async (text) => (await s.call('GET', `/shop/sites?q=${encodeURIComponent(text)}`, { token: m.token })).body.items;
  assert.deepEqual((await q('ㅋㅈ')).map((x) => x.name), ['퀴즈 사이트']);
  assert.deepEqual((await q('두뇌')).map((x) => x.name), ['수학 게임']); // 설명으로도 찾는다
  assert.equal((await q('퀴즈'))[0].url, undefined, '검색 결과에도 주소는 안 보인다');
  await s.call('PATCH', `/admin/shop/sites/${quiz.id}`, { token: mgr.token, body: { name: '영어 단어장' } });
  assert.equal((await q('ㅋㅈ')).filter((x) => x.name === '퀴즈 사이트').length, 0);
  assert.equal((await q('단어장'))[0].name, '영어 단어장');
  await s.call('DELETE', `/admin/shop/sites/${quiz.id}`, { token: mgr.token });
  assert.equal((await q('단어장')).length, 0, '숨긴 사이트는 검색되지 않는다');
  assert.equal((await s.call('GET', '/shop/sites', { token: m.token })).body.items.length, 1);
});

test('일한 내역/순위: 동점은 같은 순위, 검색해도 전체 기준 순위, 역할이 바뀌면 목록에서 빠진다', async () => {
  const adm = await s.signup('rk_adm', '심사', 'admin');
  const owner = await s.signup('rk_owner', '제작', 'owner');
  const w = {};
  for (const [u, n, st] of [['rk1', '순위가', 500], ['rk2', '순위나', 500], ['rk3', '순위다', 100], ['rk4', '순위라', 0]]) {
    w[u] = await s.signup(u, n); await setStones(w[u].id, st);
  }
  const list = (await s.call('GET', '/admin/work', { token: adm.token })).body.items;
  const mineRows = list.filter((r) => r.username.startsWith('rk') && r.username !== 'rk_adm' && r.username !== 'rk_owner');
  const byUser = Object.fromEntries(mineRows.map((r) => [r.username, r.rank]));
  const above = list.filter((r) => r.stones > 500).length;
  assert.equal(byUser.rk1, above + 1);
  assert.equal(byUser.rk2, above + 1, '동점은 같은 순위');
  assert.equal(byUser.rk3, above + 3, '그 다음은 건너뛴 순위');
  const found = (await s.call('GET', `/admin/work?search=${encodeURIComponent('순위다')}`, { token: adm.token })).body.items;
  assert.equal(found[0].username, 'rk3');
  assert.equal(found[0].rank, above + 3, '검색해도 순위는 전체 기준');
  const cho = (await s.call('GET', `/admin/work?search=${encodeURIComponent('ㅅㅇㄹ')}`, { token: adm.token })).body.items;
  assert.equal(cho[0].username, 'rk4'); // 초성 검색 + 정확도 순이 아니라 일치 단계 → 같으면 이름 순서
  const mine = await s.call('GET', '/me/grade', { token: w.rk3.token });
  assert.equal(mine.body.rank, above + 3);
  assert.equal(mine.body.totalWorkers, list.length >= 100 ? mine.body.totalWorkers : list.length);

  // 어드민으로 올리면 일하는 사람 목록에서 빠지고, 다시 멤버로 내리면 돌아온다 (돌 개수는 그대로)
  await s.call('PATCH', `/admin/roles/${w.rk1.id}`, { token: owner.token, body: { role: 'admin' } });
  assert.ok(!(await s.call('GET', '/admin/work', { token: adm.token })).body.items.some((r) => r.username === 'rk1'));
  await s.call('PATCH', `/admin/roles/${w.rk1.id}`, { token: owner.token, body: { role: 'member' } });
  const back = (await s.call('GET', '/admin/work', { token: adm.token })).body.items.find((r) => r.username === 'rk1');
  assert.equal(back.stones, 500);
});

test('돌을 캐면 순위/검색에 바로 반영된다', async () => {
  const adm = await s.signup('live_adm', '심사2', 'admin');
  const u = await s.signup('live_u', '실시간광부');
  await s.call('POST', '/work/mine', { token: u.token, body: { taps: 7 } });
  const row = (await s.call('GET', `/admin/work?search=${encodeURIComponent('실시간광부')}`, { token: adm.token })).body.items[0];
  assert.equal(row.stones, 7);
  const grade = await s.call('GET', '/me/grade', { token: u.token });
  assert.equal(grade.body.stones, 7);
});

test('영타로 잘못 친 검색어도 찾는다 (alswns → 민준)', async () => {
  const me = await s.signup('kb_me', '검색자3');
  const target = await s.signup('kb_target', '민준');
  const eng = await s.signup('kb_eng', 'Minjun Lee');
  const q = async (text) => (await s.call('GET', `/friends/search?q=${encodeURIComponent(text)}`, { token: me.token })).body.items.map((u) => u.id);
  assert.equal((await q('alswns'))[0], target.id);
  assert.equal((await q('AlSwns'))[0], target.id);
  assert.ok((await q('ㅡㅑㅜㅓㅕㅜ')).includes(eng.id));
  assert.equal((await q('민준'))[0], target.id);
});
