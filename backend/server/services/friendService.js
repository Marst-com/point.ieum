const db = require('../db');
const col = require('../db/collections');
const { E } = require('../utils/errors');
const userService = require('./userService');
const search = require('../search/client');
const indexer = require('../search/indexer');
const { gradeFor } = require('./gradeService');

const friendIds = async (uid) => new Set((await db.list(col.friends(uid))).map((f) => f.id));

async function list(uid) {
  const ids = [...(await friendIds(uid))];
  const users = await userService.getManyPublic(ids);
  return users.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

// 아이디로 추가하면 바로 서로 친구가 된다.
async function add(uid, username) {
  const target = await userService.requireByUsername(username);
  if (target.id === uid) throw E.badRequest('나 자신은 친구로 추가할 수 없어요');
  const counts = await db.transaction(async (tx) => {
    const [me, other, existing] = await Promise.all([
      tx.get(col.USERS, uid), tx.get(col.USERS, target.id), tx.get(col.friends(uid), target.id),
    ]);
    if (existing) throw E.conflict('이미 친구예요', 'already_friends');
    const at = Date.now();
    const mine = (me.friendCount || 0) + 1;
    const theirs = (other.friendCount || 0) + 1;
    tx.set(col.friends(uid), target.id, { at });
    tx.set(col.friends(target.id), uid, { at });
    tx.update(col.USERS, uid, { friendCount: mine });
    tx.update(col.USERS, target.id, { friendCount: theirs });
    return { mine, theirs };
  });
  await Promise.all([indexer.userFriendCount(uid, counts.mine), indexer.userFriendCount(target.id, counts.theirs)]);
  return userService.toPublic(target);
}

async function remove(uid, friendId) {
  const counts = await db.transaction(async (tx) => {
    const [me, other, existing] = await Promise.all([
      tx.get(col.USERS, uid), tx.get(col.USERS, friendId), tx.get(col.friends(uid), friendId),
    ]);
    if (!existing) throw E.notFound('친구 목록에 없어요');
    const mine = Math.max(0, (me.friendCount || 0) - 1);
    const theirs = other ? Math.max(0, (other.friendCount || 0) - 1) : 0;
    tx.delete(col.friends(uid), friendId);
    tx.delete(col.friends(friendId), uid);
    tx.update(col.USERS, uid, { friendCount: mine });
    if (other) tx.update(col.USERS, friendId, { friendCount: theirs });
    return { mine, theirs, hasOther: !!other };
  });
  await indexer.userFriendCount(uid, counts.mine);
  if (counts.hasOther) await indexer.userFriendCount(friendId, counts.theirs);
}

// 비슷한 순 → 같으면 친구 많은(인기) 순. 검색어가 없으면 인기순. (초성·오타·타이핑 도중 검색 지원)
async function searchUsers(uid, q) {
  const [{ hits }, mine] = await Promise.all([
    search.get().search({ index: 'users', q, limit: 30, boost: 'friendCount', excludeIds: [uid] }),
    friendIds(uid),
  ]);
  return hits.map((h) => ({
    id: h.id, username: h.data.username, name: h.data.name, role: h.data.role,
    grade: gradeFor(h.num.stones), friendCount: h.num.friendCount, isFriend: mine.has(h.id),
  }));
}

module.exports = { list, add, remove, search: searchUsers };
