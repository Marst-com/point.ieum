'use strict';
// 샤드 노드: 샤드 하나를 HTTP 로 열어 준다. 라우터(SearchCluster)가 RemoteShard 로 호출한다.
const http = require('http');
const crypto = require('crypto');

const MAX_BODY = 32 * 1024 * 1024;

const keyOk = (given, expected) => {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

function createShardServer(shard, { key }) {
  if (!key) throw new Error('SEARCH_KEY 가 필요해요 (샤드 노드는 키 없이 열 수 없어요)');
  const handlers = {
    put: async (b) => { await shard.put(b.index, b.id, b.d); return { ok: true }; },
    patch: async (b) => ({ ok: await shard.patch(b.index, b.id, b.d) }),
    remove: async (b) => ({ ok: await shard.remove(b.index, b.id) }),
    bulk: async (b) => ({ n: await shard.bulk(b.index, b.items) }),
    clear: async (b) => { await shard.clear(b.index); return { ok: true }; },
    search: (b) => shard.search(b),
    top: (b) => shard.topBy(b),
    greater: async (b) => ({ n: await shard.countGreater(b.index, b.field, b.value) }),
    count: async (b) => ({ n: await shard.count(b.index) }),
    stats: () => shard.stats(),
    flush: async () => { await shard.flush(); return { ok: true }; },
  };

  const send = (res, status, body) => {
    const s = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
    res.end(s);
  };

  return http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
    if (req.method !== 'POST' || !req.url.startsWith('/v1/')) return send(res, 404, { error: 'not found' });
    if (!keyOk(req.headers['x-search-key'], key)) return send(res, 401, { error: 'bad key' });
    const handler = handlers[req.url.slice(4)];
    if (!handler) return send(res, 404, { error: 'unknown op' });
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { send(res, 413, { error: 'too large' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', async () => {
      if (res.writableEnded) return;
      try {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        send(res, 200, await handler(body));
      } catch (e) {
        send(res, e instanceof SyntaxError ? 400 : 500, { error: e.message });
      }
    });
    return undefined;
  });
}

module.exports = { createShardServer };
