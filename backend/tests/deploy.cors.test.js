// 프론트를 따로 올리는 구성: CORS_ORIGIN 설정 + API 전용(SERVE_FRONTEND=0)
process.env.CORS_ORIGIN = 'https://app.example.com, https://*.preview.example.com';
process.env.SERVE_FRONTEND = '0';
const test = require('node:test');
const assert = require('node:assert');
const { io: ioc } = require('socket.io-client');
const { startServer } = require('./_helpers');
const { isAllowedOrigin } = require('../server/middleware/cors');

let s;
test.before(async () => { s = await startServer(); });
test.after(async () => { await s.close(); });

const GOOD = 'https://app.example.com';
const BAD = 'https://evil.example.org';

test('허용 규칙: 정확 일치 / 와일드카드 / 비슷하게 속이는 주소 거부', () => {
  for (const o of [GOOD, 'https://APP.example.com/', 'https://pr-12.preview.example.com', 'https://a.b.preview.example.com']) assert.equal(isAllowedOrigin(o), true, o);
  for (const o of ['https://preview.example.com', BAD, 'https://app.example.com.evil.org', 'http://app.example.com',
    'https://pr-1.preview.example.com.evil.org', undefined, 'null', '']) assert.equal(isAllowedOrigin(o), false, String(o));
});

test('프리플라이트: 허용된 주소만 CORS 헤더를 받는다', async () => {
  const pre = (origin) => fetch(`${s.base}/api/auth/login`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
  const ok = await pre(GOOD);
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), GOOD);
  assert.match(ok.headers.get('access-control-allow-headers'), /authorization/);
  assert.match(ok.headers.get('access-control-allow-methods'), /PATCH/);
  assert.equal(ok.headers.get('access-control-allow-credentials'), null, '쿠키는 쓰지 않는다');
  assert.equal(ok.headers.get('vary'), 'Origin');
  const no = await pre(BAD);
  assert.equal(no.status, 204);
  assert.equal(no.headers.get('access-control-allow-origin'), null);
});

test('실제 요청: 허용 주소에만 Access-Control-Allow-Origin', async () => {
  const post = (origin) => fetch(`${s.base}/api/auth/guest`, { method: 'POST', headers: origin ? { origin } : {} });
  assert.equal((await post(GOOD)).headers.get('access-control-allow-origin'), GOOD);
  assert.equal((await post(BAD)).headers.get('access-control-allow-origin'), null);
  assert.equal((await post(null)).headers.get('access-control-allow-origin'), null);
  // 인증 오류 응답에도 CORS 헤더가 붙어야 프론트가 오류 내용을 읽을 수 있다
  const unauth = await fetch(`${s.base}/api/me`, { headers: { origin: GOOD } });
  assert.equal(unauth.status, 401);
  assert.equal(unauth.headers.get('access-control-allow-origin'), GOOD);
  assert.equal(unauth.headers.get('cross-origin-resource-policy'), 'cross-origin');
});

test('헬스체크 + API 전용 모드(프론트 파일을 내려주지 않음)', async () => {
  const h = await fetch(`${s.base}/healthz`);
  assert.equal(h.status, 200);
  assert.deepEqual(await h.json(), { ok: true });
  const root = await fetch(`${s.base}/`);
  assert.equal((await root.json()).name, 'IEUM PointSystem API');
  assert.equal((await fetch(`${s.base}/css/tokens.css`)).status, 404);
});

const connect = (origin, extra = {}) => new Promise((resolve, reject) => {
  const sock = ioc(s.base, { auth: { token: extra.token }, transports: ['websocket'], reconnection: false, extraHeaders: origin ? { origin } : {} });
  sock.on('connect', () => resolve(sock));
  sock.on('connect_error', (e) => { sock.close(); reject(e); });
});

test('실시간 소켓: 허용 주소만 연결, 폴링 CORS 헤더', async () => {
  const { token } = await s.signup('cors_user', '코스');
  const okSock = await connect(GOOD, { token });
  okSock.close();
  await connect(null, { token }).then((x) => x.close()); // Origin 없는 클라이언트(앱/서버)는 통과
  await assert.rejects(connect(BAD, { token }));
  const poll = await fetch(`${s.base}/socket.io/?EIO=4&transport=polling`, { headers: { origin: GOOD } });
  assert.equal(poll.headers.get('access-control-allow-origin'), GOOD);
  const pollBad = await fetch(`${s.base}/socket.io/?EIO=4&transport=polling`, { headers: { origin: BAD } });
  assert.equal(pollBad.headers.get('access-control-allow-origin'), null);
});
