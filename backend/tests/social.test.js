const test = require('node:test');
const assert = require('node:assert');
const { io: ioc } = require('socket.io-client');
const { startServer } = require('./_helpers');

let s;
test.before(async () => { s = await startServer(); });
test.after(async () => { await s.close(); });

test('친구: 아이디로 추가(서로), 중복/자기자신/없는아이디, 삭제', async () => {
  const a = await s.signup('fr_a', '에이');
  const b = await s.signup('fr_b', '비');
  assert.equal((await s.call('POST', '/friends', { token: a.token, body: { username: 'FR_B' } })).status, 201);
  assert.equal((await s.call('POST', '/friends', { token: a.token, body: { username: 'fr_b' } })).status, 409);
  assert.equal((await s.call('POST', '/friends', { token: b.token, body: { username: 'fr_a' } })).status, 409);
  assert.equal((await s.call('POST', '/friends', { token: a.token, body: { username: 'fr_a' } })).status, 400);
  assert.equal((await s.call('POST', '/friends', { token: a.token, body: { username: 'ghost' } })).status, 404);
  assert.equal((await s.call('GET', '/friends', { token: b.token })).body.items[0].username, 'fr_a');
  assert.equal((await s.call('DELETE', `/friends/${b.id}`, { token: a.token })).status, 200);
  assert.equal((await s.call('GET', '/friends', { token: b.token })).body.items.length, 0);
  assert.equal((await s.call('DELETE', `/friends/${b.id}`, { token: a.token })).status, 404);
});

test('친구 검색: 비슷한 순 → 인기(친구 수) 순', async () => {
  const me = await s.signup('searcher', '검색자');
  const pop = await s.signup('star_pop', '스타');
  const unpop = await s.signup('star_unpop', '스타');
  const fans = await Promise.all(['fan1', 'fan2', 'fan3'].map((n) => s.signup(n, n)));
  for (const f of fans) await s.call('POST', '/friends', { token: f.token, body: { username: 'star_pop' } });
  const r = (await s.call('GET', `/friends/search?q=${encodeURIComponent('스타')}`, { token: me.token })).body.items;
  assert.equal(r[0].id, pop.id);
  assert.equal(r[1].id, unpop.id);
  assert.equal(r[0].isFriend, false);
  const top = (await s.call('GET', '/friends/search', { token: me.token })).body.items;
  assert.equal(top[0].id, pop.id, '검색어 없으면 인기순');
  assert.ok(!top.some((x) => x.id === me.id), '나는 제외');
});

test('톡: DM/단톡 생성, 메시지 주고받기, 비멤버 차단, 초대/나가기', async () => {
  const a = await s.signup('ch_a', '에이');
  const b = await s.signup('ch_b', '비');
  const c = await s.signup('ch_c', '씨');
  const d = await s.signup('ch_d', '디');

  const dm = (await s.call('POST', '/chat/dm', { token: a.token, body: { username: 'ch_b' } })).body.room;
  const dm2 = (await s.call('POST', '/chat/dm', { token: b.token, body: { username: 'ch_a' } })).body.room;
  assert.equal(dm.id, dm2.id, '같은 두 사람은 같은 DM 방');
  assert.equal(dm.title, '비');
  assert.equal(dm2.title, '에이');
  assert.equal((await s.call('POST', '/chat/dm', { token: a.token, body: { username: 'ch_a' } })).status, 400);

  const sent = await s.call('POST', `/chat/rooms/${dm.id}/messages`, { token: a.token, body: { text: '  안녕  ' } });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.message.text, '안녕');
  assert.equal((await s.call('POST', `/chat/rooms/${dm.id}/messages`, { token: a.token, body: { text: '   ' } })).status, 400);
  assert.equal((await s.call('POST', `/chat/rooms/${dm.id}/messages`, { token: a.token, body: { text: 'x'.repeat(1001) } })).status, 400);
  assert.equal((await s.call('POST', `/chat/rooms/${dm.id}/messages`, { token: c.token, body: { text: 'hi' } })).status, 403);
  assert.equal((await s.call('GET', `/chat/rooms/${dm.id}/messages`, { token: c.token })).status, 403);

  const hist = (await s.call('GET', `/chat/rooms/${dm.id}/messages`, { token: b.token })).body.items;
  assert.deepEqual(hist.map((m) => m.text), ['안녕']);
  const rooms = (await s.call('GET', '/chat/rooms', { token: b.token })).body.items;
  assert.equal(rooms[0].lastMessage.text, '안녕');

  const g = await s.call('POST', '/chat/groups', { token: a.token, body: { name: '우리방', members: ['ch_b', 'ch_c'] } });
  assert.equal(g.status, 201);
  const room = g.body.room;
  assert.equal(room.members.length, 3);
  assert.equal((await s.call('POST', '/chat/groups', { token: a.token, body: { name: '혼자', members: [] } })).status, 400);
  assert.equal((await s.call('POST', '/chat/groups', { token: a.token, body: { name: '', members: ['ch_b'] } })).status, 400);
  assert.equal((await s.call('POST', `/chat/rooms/${room.id}/members`, { token: d.token, body: { usernames: ['ch_d'] } })).status, 403);
  const inv = await s.call('POST', `/chat/rooms/${room.id}/members`, { token: a.token, body: { usernames: ['ch_d', 'ch_d'] } });
  assert.equal(inv.body.room.members.length, 4);
  assert.equal((await s.call('POST', `/chat/rooms/${dm.id}/members`, { token: a.token, body: { usernames: ['ch_c'] } })).status, 400);
  assert.equal((await s.call('POST', `/chat/rooms/${room.id}/leave`, { token: c.token })).status, 200);
  assert.equal((await s.call('GET', '/chat/rooms', { token: c.token })).body.items.filter((r) => r.id === room.id).length, 0);
  assert.equal((await s.call('POST', `/chat/rooms/${dm.id}/leave`, { token: a.token })).status, 400);
});

const connect = (token) => new Promise((resolve, reject) => {
  const sock = ioc(s.base, { auth: { token }, transports: ['websocket'], reconnection: false });
  sock.on('connect', () => resolve(sock));
  sock.on('connect_error', (e) => { sock.close(); reject(e); });
});
const once = (sock, ev) => new Promise((r) => sock.once(ev, r));

test('소켓: 실시간 메시지, 새 방 알림, 익명/잘못된 토큰 거부', async () => {
  const a = await s.signup('so_a', '에스에이');
  const b = await s.signup('so_b', '에스비');
  const guest = (await s.call('POST', '/auth/guest')).body;
  await assert.rejects(connect(guest.token), /login_required/);
  await assert.rejects(connect('bad.token.here'), /invalid_token/);

  const sa = await connect(a.token);
  const sb = await connect(b.token);
  try {
    const changed = once(sb, 'chat:rooms-changed');
    const dm = (await s.call('POST', '/chat/dm', { token: a.token, body: { username: 'so_b' } })).body.room;
    await changed; // 새 방이 생기면 상대에게 알려준다

    const incoming = once(sb, 'chat:message');
    const ack = await new Promise((r) => sa.emit('chat:send', { roomId: dm.id, text: '실시간!' }, r));
    assert.equal(ack.ok, true);
    const msg = await incoming;
    assert.equal(msg.text, '실시간!');
    assert.equal(msg.roomId, dm.id);

    // 내가 속하지 않은 방엔 못 보낸다
    const c = await s.signup('so_c', '에스씨');
    const sc = await connect(c.token);
    const denied = await new Promise((r) => sc.emit('chat:send', { roomId: dm.id, text: 'x' }, r));
    assert.equal(denied.ok, false);
    assert.equal(denied.code, 'forbidden');
    sc.close();

    // 포인트 지급 시 me:updated 알림
    const owner = await s.signup('sboss', '제작', 'owner');
    const ping = once(sb, 'me:updated');
    await s.call('POST', '/admin/points', { token: owner.token, body: { userId: b.id, delta: 10 } });
    await ping;
  } finally {
    sa.close(); sb.close();
  }
});
