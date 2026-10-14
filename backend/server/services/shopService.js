const db = require('../db');
const col = require('../db/collections');
const tokens = require('../utils/tokens');
const { E } = require('../utils/errors');
const { str, optionalStr, int, httpUrl } = require('../utils/validate');
const { newId, newKey } = require('../utils/ids');
const { can } = require('../permissions');
const pointService = require('./pointService');
const search = require('../search/client');
const { ticketId, ticketProjection } = require('../shared/projections');
const { roleCan } = require('../permissions');
const userService = require('./userService');
const indexer = require('../search/indexer');

const toMemberView = (site, owned) => ({
  id: site.id, name: site.name, description: site.description || '', price: site.price, owned,
});
// 주소와 키는 관리 권한이 있는 사람에게만 보여준다. (주소를 알면 구매 없이 들어갈 수 있으니까)
const toManagerView = (site) => ({ ...toMemberView(site, true), url: site.url, siteKey: site.siteKey, active: site.active });

async function ownedSet(user) {
  if (user.isAnonymous) return new Set();
  const rows = await db.list(col.purchases(user.id));
  return new Set(rows.map((r) => r.id));
}

async function listSites(user, { q = '' } = {}) {
  const query = String(q).trim();
  const owned = await ownedSet(user);
  if (query) {
    const { hits } = await search.get().search({ index: 'sites', q: query, limit: 30, tiered: true, filters: { active: '1' } });
    const sites = (await Promise.all(hits.map((h) => db.get(col.SITES, h.id)))).filter((s) => s && s.active);
    return sites.map((s) => toMemberView(s, owned.has(s.id)));
  }
  const sites = await db.list(col.SITES);
  return sites
    .filter((s) => s.active)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((s) => toMemberView(s, owned.has(s.id)));
}

async function listAllForManager() {
  const sites = await db.list(col.SITES);
  return sites.sort((a, b) => a.createdAt - b.createdAt).map(toManagerView);
}

async function createSite(input) {
  const site = {
    name: str(input.name, { field: '사이트 이름', max: 40 }),
    description: optionalStr(input.description, { field: '설명', max: 200 }),
    url: httpUrl(input.url, '사이트 주소'),
    price: int(input.price, { field: '입장권 가격', min: 0, max: 10_000_000 }),
    siteKey: newKey(),
    active: true,
    createdAt: Date.now(),
  };
  const id = newId();
  await db.set(col.SITES, id, site);
  await indexer.syncSite({ id, ...site });
  return toManagerView({ id, ...site });
}

async function updateSite(id, input) {
  const next = await db.transaction(async (tx) => {
    const site = await tx.get(col.SITES, id);
    if (!site) throw E.notFound('사이트를 찾을 수 없어요');
    const patch = {};
    if (input.name !== undefined) patch.name = str(input.name, { field: '사이트 이름', max: 40 });
    if (input.description !== undefined) patch.description = optionalStr(input.description, { field: '설명', max: 200 });
    if (input.url !== undefined) patch.url = httpUrl(input.url, '사이트 주소');
    if (input.price !== undefined) patch.price = int(input.price, { field: '입장권 가격', min: 0, max: 10_000_000 });
    if (input.active !== undefined) patch.active = !!input.active;
    if (Object.keys(patch).length) tx.update(col.SITES, id, patch);
    return { ...site, ...patch };
  });
  await indexer.syncSite(next);
  return toManagerView(next);
}

// 삭제는 목록에서만 숨긴다 (이미 산 사람의 구매 기록은 남겨둠)
const removeSite = (id) => updateSite(id, { active: false });

async function buy(uid, siteId) {
  return db.transaction(async (tx) => {
    const [user, site, purchase] = await Promise.all([
      tx.get(col.USERS, uid), tx.get(col.SITES, siteId), tx.get(col.purchases(uid), siteId),
    ]);
    if (!user) throw E.notFound('사용자를 찾을 수 없어요');
    if (!site || !site.active) throw E.notFound('사이트를 찾을 수 없어요');
    if (purchase) throw E.conflict('이미 가지고 있는 입장권이에요', 'already_owned');
    const points = pointService.applyDelta(tx, user, -site.price, `입장권 구매: ${site.name}`, null);
    const at = Date.now();
    tx.set(col.purchases(uid), siteId, { price: site.price, at });
    tx.set(col.SHARED_TICKETS, ticketId(uid, siteId), { ...ticketProjection({ uid, siteId, at }), updatedAt: at }); // 다른 시스템이 읽는 복사본
    return { points, site: toMemberView(site, true) };
  });
}

/**
 * 들어가기. 결과는 항상 200 + result 로 알려준다:
 *  login_required (익명) / not_purchased (안 산 멤버) / ok (+ url, 입장 토큰)
 */
async function enter(user, siteId) {
  if (user.isAnonymous) return { result: 'login_required' };
  const site = await db.get(col.SITES, siteId);
  if (!site || !site.active) throw E.notFound('사이트를 찾을 수 없어요');
  const owned = can(user, 'shop.manage') || !!(await db.get(col.purchases(user.id), siteId));
  if (!owned) return { result: 'not_purchased' };
  const entryToken = tokens.signEntryToken(user, siteId);
  const url = new URL(site.url);
  url.searchParams.set('ieum_token', entryToken);
  return { result: 'ok', url: url.toString() };
}

// siteKey 로 사이트를 찾는다 (외부 시스템 서버가 "나는 이 사이트다" 를 증명하는 방법)
async function siteByKey(siteKey) {
  const key = str(siteKey, { field: 'siteKey', max: 100 });
  const [site] = await db.list(col.SITES, { where: [['siteKey', '==', key]] });
  if (!site || !site.active) throw E.unauthorized('사이트 키가 올바르지 않아요', 'bad_site_key');
  return site;
}

/** 외부 사이트 백엔드가 입장 토큰을 확인할 때 쓴다. */
async function verifyEntry({ siteKey, token }) {
  const site = await siteByKey(siteKey);
  const who = tokens.verifyEntryToken(str(token, { field: 'token', max: 2000 }), site.id);
  return { valid: true, siteId: site.id, user: who };
}

/** 외부(읽기 전용): 계정 정보. 누구인지만 알려주고 포인트·비밀번호 같은 건 주지 않는다. */
async function externalAccount({ siteKey, userId, username }) {
  await siteByKey(siteKey);
  const user = userId ? await userService.getById(String(userId)) : await userService.getByUsername(username);
  if (!user) throw E.notFound('사용자를 찾을 수 없어요');
  return { id: user.id, username: user.username, name: user.name, role: user.role };
}

/** 외부(읽기 전용): 이 사용자가 "내 사이트"의 입장권을 가졌는지. 다른 사이트의 입장권은 알려주지 않는다. */
async function externalTicket({ siteKey, userId }) {
  const site = await siteByKey(siteKey);
  const user = await userService.getById(str(userId, { field: 'userId', max: 100 }));
  if (!user) throw E.notFound('사용자를 찾을 수 없어요');
  const purchase = await db.get(col.purchases(user.id), site.id);
  const staff = roleCan(user.role, 'shop.manage'); // 관리자는 입장권 없이도 들어갈 수 있다 (enter 와 같은 규칙)
  return { owned: !!purchase || staff, via: purchase ? 'ticket' : staff ? 'staff' : null, since: purchase ? purchase.at : null };
}

module.exports = { listSites, listAllForManager, createSite, updateSite, removeSite, buy, enter, verifyEntry, externalAccount, externalTicket };
