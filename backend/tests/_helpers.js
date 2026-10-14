process.env.NODE_ENV = 'test';
process.env.SEARCH_LOCAL_SHARDS = '3'; // 여러 샤드에 흩어져 있어도 결과가 같아야 한다
const http = require('http');
const db = require('../server/db');
const col = require('../server/db/collections');
const { createApp } = require('../server/app');
const { attachSocket } = require('../server/socket');
const authService = require('../server/services/authService');
const search = require('../server/search/client');
const userService = require('../server/services/userService');

async function startServer() {
  db.init();
  await search.init();
  const server = http.createServer(createApp());
  const io = attachSocket(server);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const signup = async (username, name, role = 'member') => {
    const r = await call('POST', '/auth/register', { body: { username, password: 'secret1', name } });
    if (r.status !== 201) throw new Error(`signup failed: ${JSON.stringify(r.body)}`);
    if (role !== 'member') await userService.applyRole(r.body.user.id, role, { allowOwnerChange: true }); // 공유 복사본·검색 색인까지 같이 맞춘다
    return { token: r.body.token, id: r.body.user.id, username };
  };

  const close = async () => { await new Promise((r) => { io.close(() => r()); }); await search.close(); };
  return { base, call, signup, close, authService };
}

module.exports = { startServer };
