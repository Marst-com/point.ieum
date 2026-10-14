const db = require('../db');
const { USERS } = require('../db/collections');
const search = require('../search/client');
const { gradeFor } = require('./gradeService');

const toRow = (hit) => ({
  id: hit.id, username: hit.data.username, name: hit.data.name, role: hit.data.role, grade: gradeFor(hit.num.stones),
});

// 포인트 배부: 이름 일치 단계가 먼저, 같은 단계면 일한 등급이 높은 사람이 먼저. 잔액은 DB 의 최신 값을 붙인다.
async function forPointGrant(q, limit = 30) {
  const { hits } = await search.get().search({ index: 'users', q, limit, tiered: true, boost: 'gradeRank' });
  const fresh = await Promise.all(hits.map((h) => db.get(USERS, h.id)));
  return hits.map((h, i) => ({ ...toRow(h), points: fresh[i]?.points || 0 }));
}

// 등급 관리: 이름 우선 검색. 검색어가 없으면 최근 가입 순.
async function forRoleManagement(q, limit = 50) {
  const query = String(q || '').trim();
  const req = query
    ? { index: 'users', q: query, limit, tiered: true }
    : { index: 'users', q: '', limit, boost: 'createdAt' };
  const { hits } = await search.get().search(req);
  return hits.map(toRow);
}

module.exports = { forPointGrant, forRoleManagement };
