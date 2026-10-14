// 원본(users, purchases)과 공유용 복사본, 검색 색인이 어긋났는지 점검하고 필요하면 고친다. 몇 번 돌려도 결과는 같다(멱등).
const db = require('../db');
const col = require('../db/collections');
const { accountProjection, ticketId, ticketProjection, ACCOUNT_FIELDS, TICKET_FIELDS } = require('./projections');
const { roleCan } = require('../permissions');

const SAMPLE = 10; // 보고서에 보여줄 id 개수
const differs = (expected, actual, fields) => fields.some((f) => expected[f] !== actual[f]);
const sample = (arr) => arr.slice(0, SAMPLE);

async function checkAccounts({ repair }) {
  const [users, rows] = await Promise.all([db.list(col.USERS), db.list(col.SHARED_ACCOUNTS)]);
  const have = new Map(rows.map((r) => [r.id, r]));
  const missing = [];
  const stale = [];
  for (const u of users) {
    const want = accountProjection(u);
    const got = have.get(u.id);
    if (!got) missing.push(u.id);
    else if (differs(want, got, ACCOUNT_FIELDS)) stale.push(u.id);
    if (repair && (!got || differs(want, got, ACCOUNT_FIELDS))) await db.set(col.SHARED_ACCOUNTS, u.id, { ...want, updatedAt: Date.now() });
    have.delete(u.id);
  }
  const orphan = [...have.keys()]; // 원본이 없는데 복사본만 남은 것
  if (repair) for (const id of orphan) await db.delete(col.SHARED_ACCOUNTS, id);
  return { source: users.length, missing: missing.length, stale: stale.length, orphan: orphan.length, sample: sample([...missing, ...stale, ...orphan]) };
}

async function checkTickets({ repair }) {
  const [users, rows] = await Promise.all([db.list(col.USERS), db.list(col.SHARED_TICKETS)]);
  const have = new Map(rows.map((r) => [r.id, r]));
  const missing = [];
  const stale = [];
  let source = 0;
  for (const u of users) {
    for (const p of await db.list(col.purchases(u.id))) {
      source++;
      const id = ticketId(u.id, p.id);
      const want = ticketProjection({ uid: u.id, siteId: p.id, at: p.at });
      const got = have.get(id);
      if (!got) missing.push(id);
      else if (differs(want, got, TICKET_FIELDS)) stale.push(id);
      if (repair && (!got || differs(want, got, TICKET_FIELDS))) await db.set(col.SHARED_TICKETS, id, { ...want, updatedAt: Date.now() });
      have.delete(id);
    }
  }
  const orphan = [...have.keys()];
  if (repair) for (const id of orphan) await db.delete(col.SHARED_TICKETS, id);
  return { source, missing: missing.length, stale: stale.length, orphan: orphan.length, sample: sample([...missing, ...stale, ...orphan]) };
}

// 검색 색인: 개수로 어긋남을 확인하고, 고칠 때는 DB 기준으로 통째로 다시 만든다
async function checkSearch({ repair }) {
  const search = require('../search/client');
  const { reindexAll } = require('../search/bootstrap');
  const count = async () => {
    const [users, sites, c] = [await db.list(col.USERS), (await db.list(col.SITES)).filter((s) => s.active), search.get()];
    return {
      users: { db: users.length, index: await c.count('users') },
      workers: { db: users.filter((u) => roleCan(u.role, 'work.mine')).length, index: await c.count('workers') },
      sites: { db: sites.length, index: await c.count('sites') },
    };
  };
  const before = await count();
  const drift = Object.entries(before).filter(([, v]) => v.db !== v.index).map(([k]) => k);
  let after = null;
  if (repair && drift.length) { await reindexAll({ clear: true }); after = await count(); }
  return { before, drift, after };
}

async function reconcile({ repair = false, search = false } = {}) {
  const out = { repair, accounts: await checkAccounts({ repair }), tickets: await checkTickets({ repair }) };
  if (search) out.search = await checkSearch({ repair });
  out.clean = out.accounts.missing + out.accounts.stale + out.accounts.orphan + out.tickets.missing + out.tickets.stale + out.tickets.orphan === 0
    && (!out.search || out.search.drift.length === 0);
  return out;
}

module.exports = { reconcile };
