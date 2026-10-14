// 권한은 전부 여기서만 정의한다. 역할별 기능을 바꾸고 싶으면 이 파일만 고치면 돼.
const BASE = ['shop.view'];
const MEMBER = [...BASE, 'shop.buy', 'chat', 'friends', 'grade.view', 'points.view'];

const MAP = {
  anonymous: BASE,
  member: [...MEMBER, 'work.mine'],
  admin: [...MEMBER, 'work.view', 'points.grant'],
  manager: [...MEMBER, 'work.view', 'points.grant', 'shop.manage'],
  owner: [...MEMBER, 'work.mine', 'work.view', 'points.grant', 'shop.manage', 'roles.manage'],
};

const ROLES = ['member', 'admin', 'manager', 'owner'];
const ASSIGNABLE_ROLES = ['member', 'admin', 'manager']; // 제작자(owner)는 지정 불가

const permissionsFor = (user) => (user.isAnonymous ? MAP.anonymous : MAP[user.role] || MAP.member);
const can = (user, perm) => permissionsFor(user).includes(perm);
const roleCan = (role, perm) => (MAP[role] || []).includes(perm);

module.exports = { ROLES, ASSIGNABLE_ROLES, permissionsFor, can, roleCan };
