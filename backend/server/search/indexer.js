// 데이터가 바뀔 때 색인을 맞춰 주는 곳. 색인 실패가 본 기능(로그인, 구매 등)을 막지 않도록 오류는 삼키고 기록만 한다.
// (색인이 어긋나면 `npm run search:reindex` 로 DB 기준으로 다시 만들 수 있다)
const client = require('./client');
const docs = require('./documents');
const { gradeFor, gradeRank } = require('../services/gradeService');
const { roleCan } = require('../permissions');

async function safe(label, fn) {
  try { await fn(); } catch (e) { console.error(`[search] ${label} 색인 실패:`, e.message); }
}

const syncUser = (u) => safe(`user ${u.id}`, async () => {
  const c = client.get();
  await c.put('users', u.id, docs.userDoc(u));
  if (roleCan(u.role, 'work.mine')) await c.put('workers', u.id, docs.workerDoc(u));
  else await c.remove('workers', u.id);
});

const userStones = (id, stones) => safe(`stones ${id}`, async () => {
  const c = client.get();
  await Promise.all([
    c.patch('users', id, { num: { stones, gradeRank: gradeRank(gradeFor(stones)) } }),
    c.patch('workers', id, { num: { stones } }),
  ]);
});

const userFriendCount = (id, friendCount) => safe(`friendCount ${id}`, () => client.get().patch('users', id, { num: { friendCount } }));

const syncSite = (s) => safe(`site ${s.id}`, async () => {
  const c = client.get();
  if (s.active) await c.put('sites', s.id, docs.siteDoc(s));
  else await c.remove('sites', s.id);
});

const indexMessage = (m) => safe(`message ${m.id}`, () => client.get().put('messages', m.id, docs.messageDoc(m)));

module.exports = { syncUser, userStones, userFriendCount, syncSite, indexMessage };
