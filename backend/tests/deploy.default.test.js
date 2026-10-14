// 기본 구성(서버 하나가 프론트까지 서빙): CORS 는 꺼져 있어야 하고, 운영 모드 안전장치가 있어야 한다
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { io: ioc } = require('socket.io-client');
const { startServer } = require('./_helpers');

let s;
test.before(async () => { s = await startServer(); });
test.after(async () => { await s.close(); });

test('기본값: CORS 헤더를 주지 않고, 프론트 파일을 내려준다', async () => {
  const pre = await fetch(`${s.base}/api/auth/login`, { method: 'OPTIONS', headers: { origin: 'https://anything.example.com', 'access-control-request-method': 'POST' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
  const r = await fetch(`${s.base}/api/auth/guest`, { method: 'POST', headers: { origin: 'https://anything.example.com' } });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.equal(r.headers.get('cross-origin-resource-policy'), 'same-origin');
  const html = await (await fetch(`${s.base}/`)).text();
  assert.match(html, /<title>IEUM PointSystem<\/title>/);
  assert.match(html, /\/config\.js/);
  assert.equal((await fetch(`${s.base}/config.js`)).status, 200);
  assert.equal((await fetch(`${s.base}/healthz`)).status, 200);
});

test('기본값: 같은 주소에서 온 소켓은 되고, 다른 사이트에서 온 소켓은 거부', async () => {
  const { token } = await s.signup('same_origin_user', '동일');
  const connect = (origin) => new Promise((resolve, reject) => {
    const sock = ioc(s.base, { auth: { token }, transports: ['websocket'], reconnection: false, extraHeaders: { origin } });
    sock.on('connect', () => resolve(sock));
    sock.on('connect_error', (e) => { sock.close(); reject(e); });
  });
  (await connect(s.base)).close();
  await assert.rejects(connect('https://evil.example.org'));
});

test('운영 모드 안전장치: 메모리 DB / JWT_SECRET 없이는 시작하지 않는다', () => {
  const run = (env) => spawnSync(process.execPath, ['-e', "require('./server/config')"], {
    cwd: path.join(__dirname, '..'), env: { PATH: process.env.PATH, ...env }, encoding: 'utf8',
  });
  const mem = run({ NODE_ENV: 'production', JWT_SECRET: 'x', USE_MEMORY_DB: '1' });
  assert.notEqual(mem.status, 0);
  assert.match(mem.stderr, /USE_MEMORY_DB/);
  const noSecret = run({ NODE_ENV: 'production' });
  assert.notEqual(noSecret.status, 0);
  assert.match(noSecret.stderr, /JWT_SECRET/);
  assert.equal(run({ NODE_ENV: 'production', JWT_SECRET: 'x' }).status, 0);
});
