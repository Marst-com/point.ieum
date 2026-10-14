const config = require('../config');
const db = require('../db');
const { USERS } = require('../db/collections');
const { E } = require('../utils/errors');
const { int } = require('../utils/validate');
const { gradeFor, progress, GRADES } = require('./gradeService');
const pointService = require('./pointService');
const userService = require('./userService');
const search = require('../search/client');
const indexer = require('../search/indexer');
const { roleCan } = require('../permissions');

const RANKING_LIMIT = 100; // 일한 내역 화면에 보여줄 최대 인원 (1위부터)
const SEARCH_LIMIT = 30;

// 사용자별 마지막 전송 시각 — 비정상적으로 빠른 요청(매크로)을 걸러내는 용도
const lastFlush = new Map();

function allowedTaps(uid, now = Date.now()) {
  const last = lastFlush.get(uid);
  const elapsed = last == null ? 1 : Math.min((now - last) / 1000, 10);
  lastFlush.set(uid, now);
  if (lastFlush.size > 1000) {
    for (const [k, t] of lastFlush) if (now - t > 60_000) lastFlush.delete(k);
  }
  return Math.ceil(elapsed * config.maxTapsPerSecond) + config.maxTapsPerSecond; // 1초 분량 여유
}

async function mine(uid, taps) {
  const requested = int(taps, { field: '횟수', min: 1, max: 200 });
  const accepted = Math.min(requested, allowedTaps(uid));
  const result = await db.transaction(async (tx) => {
    const user = await tx.get(USERS, uid);
    if (!user) throw E.notFound('사용자를 찾을 수 없어요');
    const before = user.stones || 0;
    const stones = before + accepted;
    let points = user.points || 0;
    const per = config.stonesPerPoint;
    const gained = per > 0 ? Math.floor(stones / per) - Math.floor(before / per) : 0;
    if (gained > 0) points = pointService.applyDelta(tx, user, gained, '일하기 보상', null, { stones });
    else tx.update(USERS, uid, { stones });
    return { accepted, stones, points, grade: gradeFor(stones), gradeBefore: gradeFor(before) };
  });
  await indexer.userStones(uid, result.stones); // 순위·등급 검색에 바로 반영
  return result;
}

const rowOf = (hit, rank) => ({
  id: hit.id, username: hit.data.username, name: hit.data.name,
  stones: hit.num.stones, grade: gradeFor(hit.num.stones), rank,
});

async function myStats(uid) {
  const user = await userService.getById(uid);
  if (!user) throw E.notFound('사용자를 찾을 수 없어요');
  const stones = user.stones || 0;
  const c = search.get();
  const isWorker = roleCan(user.role, 'work.mine');
  const [greater, totalWorkers] = await Promise.all([
    isWorker ? c.countGreater('workers', 'stones', stones) : null,
    c.count('workers'),
  ]);
  return { stones, rank: isWorker ? 1 + greater : null, totalWorkers, ...progress(stones), grades: GRADES };
}

// 관리자용: 검색어가 없으면 돌 많은 순 1위부터, 있으면 이름이 비슷한 순. 순위 숫자는 항상 전체 기준.
async function ranking({ search: q = '' } = {}) {
  const c = search.get();
  const query = String(q).trim();
  if (!query) {
    const { hits } = await c.topBy({ index: 'workers', field: 'stones', limit: RANKING_LIMIT });
    // 상위 N명 목록 안에서는 앞사람과 돌 수가 같으면 같은 순위 (동점은 같은 순위)
    const first = hits.length ? 1 + (await c.countGreater('workers', 'stones', hits[0].num.stones)) : 1;
    let lastStones = null;
    let lastRank = first;
    return hits.map((h, i) => {
      if (h.num.stones !== lastStones) { lastRank = i === 0 ? first : first + i; lastStones = h.num.stones; }
      return rowOf(h, lastRank);
    });
  }
  const { hits } = await c.search({ index: 'workers', q: query, limit: SEARCH_LIMIT });
  return Promise.all(hits.map(async (h) => rowOf(h, 1 + (await c.countGreater('workers', 'stones', h.num.stones)))));
}

module.exports = { mine, myStats, ranking, allowedTaps };
