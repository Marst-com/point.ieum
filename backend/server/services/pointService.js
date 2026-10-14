const db = require('../db');
const col = require('../db/collections');
const realtime = require('../realtime');
const { E } = require('../utils/errors');
const { int, optionalStr } = require('../utils/validate');
const { newId } = require('../utils/ids');

/**
 * 트랜잭션 안에서 포인트를 더하고/빼고 내역을 남긴다. (읽기는 호출 전에 끝나 있어야 함)
 * extraPatch: 같은 사용자 문서에 같이 반영할 필드 (예: stones)
 */
function applyDelta(tx, user, delta, reason, byId, extraPatch = {}) {
  const balance = (user.points || 0) + delta;
  if (balance < 0) throw E.badRequest('포인트가 부족해요', 'insufficient_points');
  tx.update(col.USERS, user.id, { ...extraPatch, points: balance });
  if (delta !== 0) {
    tx.set(col.pointLog(user.id), newId(), { delta, balance, reason, by: byId || null, createdAt: Date.now() });
  }
  return balance;
}

async function grant({ userId, delta, reason, byId }) {
  const d = int(delta, { field: '포인트', min: -1_000_000, max: 1_000_000 });
  if (d === 0) throw E.badRequest('0은 넣을 수 없어요');
  const why = optionalStr(reason, { field: '사유', max: 60, fallback: d > 0 ? '포인트 지급' : '포인트 차감' });
  const points = await db.transaction(async (tx) => {
    const user = await tx.get(col.USERS, userId);
    if (!user) throw E.notFound('사용자를 찾을 수 없어요');
    return applyDelta(tx, user, d, why, byId);
  });
  realtime.toUser(userId, 'me:updated');
  return { points };
}

const history = (uid, { limit = 50 } = {}) =>
  db.list(col.pointLog(uid), { orderBy: 'createdAt', desc: true, limit });

module.exports = { applyDelta, grant, history };
