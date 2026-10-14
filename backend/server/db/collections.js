// 컬렉션 이름은 전부 여기서만 정의한다. 모두 DB_PREFIX(기본 "ieumps_")가 붙어서,
// 같은 Firebase 프로젝트의 다른 시스템 컬렉션(users, rooms …)과 이름이 겹치지 않는다.
const { dbPrefix } = require('../config');

const n = (name) => `${dbPrefix}${name}`;

module.exports = {
  PREFIX: dbPrefix,
  // --- 우리만 읽고 쓴다 (다른 시스템은 건드리지 않는다) ---
  USERS: n('users'),
  USERNAMES: n('usernames'), // 아이디 → uid (중복 방지용)
  SITES: n('shop_sites'),
  ROOMS: n('rooms'),
  pointLog: (uid) => `${n('users')}/${uid}/points_log`,
  purchases: (uid) => `${n('users')}/${uid}/purchases`,
  friends: (uid) => `${n('users')}/${uid}/friends`,
  messages: (roomId) => `${n('rooms')}/${roomId}/messages`,
  // --- 다른 시스템이 "읽기만" 하는 공유용 복사본 (우리만 쓴다. 비밀번호·포인트 같은 건 넣지 않는다) ---
  SHARED_ACCOUNTS: n('shared_accounts'), // 문서 id = 사용자 id
  SHARED_TICKETS: n('shared_tickets'), // 문서 id = `${사용자 id}__${사이트 id}`
};
