const config = require('../config');

const normalize = (o) => String(o || '').trim().replace(/\/+$/, '').toLowerCase();
const escapeRe = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const SUBDOMAIN = '[a-z0-9-]+(?:\\.[a-z0-9-]+)*'; // 별표 하나가 대신하는 서브도메인

// 'https://*.example.com' → 정규식. 별표는 서브도메인(한 덩어리 이상)만 대신한다.
const rules = config.corsOrigins.map((p) => {
  const n = normalize(p);
  if (!n.includes('*')) return (o) => o === n;
  const re = new RegExp(`^${n.split('*').map(escapeRe).join(SUBDOMAIN)}$`);
  return (o) => re.test(o);
});

const isAllowedOrigin = (origin) => {
  const o = normalize(origin);
  return !!o && rules.some((r) => r(o));
};

// 같은 주소에서 온 요청(브라우저가 Origin 을 붙여도)은 CORS 대상이 아니다
function isSameHost(origin, hostHeader) {
  try { return new URL(origin).host === hostHeader; } catch { return false; }
}

const ALLOW_HEADERS = 'authorization, content-type';
const ALLOW_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';

// 로그인 토큰은 Authorization 헤더로만 보내니까 쿠키(credentials)는 쓰지 않는다
function corsMiddleware(req, res, next) {
  const origin = req.get('origin');
  const allowed = !!origin && isAllowedOrigin(origin);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    if (allowed) {
      res.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
      res.setHeader('Access-Control-Max-Age', '600');
    }
    return res.sendStatus(204);
  }
  return next();
}

module.exports = { corsMiddleware, isAllowedOrigin, isSameHost };
