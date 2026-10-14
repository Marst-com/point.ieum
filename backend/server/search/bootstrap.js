// DB 의 데이터로 검색 색인을 (다시) 만든다.
const db = require('../db');
const col = require('../db/collections');
const client = require('./client');
const docs = require('./documents');
const { roleCan } = require('../permissions');

const CHUNK = 1000;
const chunks = (arr) => Array.from({ length: Math.ceil(arr.length / CHUNK) }, (_, i) => arr.slice(i * CHUNK, (i + 1) * CHUNK));

async function reindexAll({ clear = false } = {}) {
  const c = client.get();
  if (clear) await Promise.all(['users', 'workers', 'sites', 'messages'].map((i) => c.clear(i)));
  const out = { users: 0, workers: 0, sites: 0, messages: 0 };

  const users = await db.list(col.USERS);
  for (const part of chunks(users)) {
    await c.bulk('users', part.map((u) => ({ id: u.id, d: docs.userDoc(u) })));
    const workers = part.filter((u) => roleCan(u.role, 'work.mine'));
    if (workers.length) await c.bulk('workers', workers.map((u) => ({ id: u.id, d: docs.workerDoc(u) })));
    out.users += part.length;
    out.workers += workers.length;
  }

  const sites = (await db.list(col.SITES)).filter((s) => s.active);
  if (sites.length) await c.bulk('sites', sites.map((s) => ({ id: s.id, d: docs.siteDoc(s) })));
  out.sites = sites.length;

  for (const room of await db.list(col.ROOMS)) {
    const msgs = await db.list(col.messages(room.id));
    for (const part of chunks(msgs)) {
      await c.bulk('messages', part.map((m) => ({ id: m.id, d: docs.messageDoc({ ...m, roomId: room.id }) })));
    }
    out.messages += msgs.length;
  }
  return out;
}

// 서버가 켜질 때: 색인이 비어 있을 때만 DB 에서 채운다 (저장된 샤드가 있으면 건너뜀)
async function ensureIndexed() {
  if ((await client.get().count('users')) > 0) return { skipped: true };
  return reindexAll();
}

module.exports = { reindexAll, ensureIndexed };
