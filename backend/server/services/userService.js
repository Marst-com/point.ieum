const db = require('../db');
const { USERS, USERNAMES, SHARED_ACCOUNTS } = require('../db/collections');
const { accountProjection } = require('../shared/projections');
const { permissionsFor } = require('../permissions');
const { gradeFor } = require('./gradeService');
const { E } = require('../utils/errors');
const { ASSIGNABLE_ROLES } = require('../permissions');
const indexer = require('../search/indexer');

const toPublic = (u) => ({
  id: u.id,
  username: u.username,
  name: u.name,
  role: u.role,
  grade: gradeFor(u.stones || 0),
});

const toMe = (u) => ({
  id: u.id,
  username: u.username || null,
  name: u.name,
  role: u.role,
  isAnonymous: !!u.isAnonymous,
  points: u.points || 0,
  stones: u.stones || 0,
  grade: gradeFor(u.stones || 0),
  permissions: permissionsFor(u),
});

const getById = (id) => db.get(USERS, id);
const listUsers = () => db.list(USERS);

async function getByUsername(username) {
  const key = String(username || '').trim().toLowerCase();
  if (!key) return null;
  const link = await db.get(USERNAMES, key);
  return link ? getById(link.uid) : null;
}

async function requireByUsername(username) {
  const u = await getByUsername(username);
  if (!u) throw E.notFound(`'${String(username).trim()}' 아이디를 찾을 수 없어요`);
  return u;
}

async function getManyPublic(ids) {
  const users = await Promise.all(ids.map(getById));
  return users.filter(Boolean).map(toPublic);
}

/** 역할을 바꾸고, 공유용 계정 복사본도 같은 트랜잭션에서 맞춘다. (제작자 승격은 스크립트에서 allowOwner 로) */
async function applyRole(targetId, role, { allowOwnerChange = false } = {}) {
  const updated = await db.transaction(async (tx) => {
    const target = await tx.get(USERS, targetId);
    if (!target) throw E.notFound('사용자를 찾을 수 없어요');
    if (target.role === 'owner' && !allowOwnerChange) throw E.forbidden('제작자의 등급은 바꿀 수 없어요');
    tx.update(USERS, targetId, { role });
    tx.set(SHARED_ACCOUNTS, targetId, { ...accountProjection({ ...target, role }), updatedAt: Date.now() });
    return { ...target, role };
  });
  await indexer.syncUser(updated);
  return updated;
}

async function setRole(targetId, role, byId) {
  if (!ASSIGNABLE_ROLES.includes(role)) throw E.badRequest('지정할 수 없는 등급이에요');
  if (targetId === byId) throw E.badRequest('내 등급은 바꿀 수 없어요');
  return toPublic(await applyRole(targetId, role));
}

module.exports = { toPublic, toMe, getById, listUsers, getByUsername, requireByUsername, getManyPublic, setRole, applyRole };
