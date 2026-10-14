const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env')) {
  try { process.loadEnvFile('.env'); } catch { /* ignore */ }
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) throw new Error('JWT_SECRET 환경변수가 필요해요 (운영 모드)');
  jwtSecret = crypto.randomBytes(32).toString('hex'); // 개발 전용: 재시작하면 로그인 풀림
}

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

// 운영에서 메모리 DB 는 재시작할 때마다 데이터가 사라지니까 시작 자체를 막는다
if (isProd && env.USE_MEMORY_DB === '1') throw new Error('운영(NODE_ENV=production)에서는 USE_MEMORY_DB=1 을 쓸 수 없어요');

// 같은 Firebase 프로젝트를 다른 시스템과 같이 쓸 때 컬렉션 이름이 겹치지 않도록 우리 컬렉션 앞에 붙이는 말
const dbPrefix = env.DB_PREFIX === undefined ? 'ieumps_' : env.DB_PREFIX;
if (!/^[A-Za-z0-9_]{0,20}$/.test(dbPrefix)) throw new Error('DB_PREFIX 는 영문/숫자/_ 로 20자 이하여야 해요');

module.exports = Object.freeze({
  dbPrefix,
  syncOnStart: env.SYNC_ON_START === '1', // 서버를 켤 때 공유용 복사본을 원본 기준으로 맞춘다
  isProd,
  isTest,
  port: Number(env.PORT) || 3000,
  jwtSecret,
  useMemoryDb: env.USE_MEMORY_DB === '1' || isTest,
  tokenTtl: '7d',
  guestTokenTtl: '1d',
  entryTokenTtl: '2m',
  stonesPerPoint: Number(env.STONES_PER_POINT) || 0,
  maxTapsPerSecond: 15,
  // [등급, 필요한 누적 돌 개수] — 위에서 아래로 갈수록 높은 등급
  gradeThresholds: [['F', 0], ['E', 100], ['D', 500], ['C', 2000], ['B', 6000], ['A', 20000], ['S', 60000]],
  // 검색 엔진: SEARCH_NODES 가 있으면 그 샤드 노드들을 쓰고, 없으면 이 프로세스 안에 샤드를 둔다
  search: {
    nodes: (env.SEARCH_NODES || '').split(',').map((s) => s.trim()).filter(Boolean),
    key: env.SEARCH_KEY || '',
    localShards: Number(env.SEARCH_LOCAL_SHARDS) || 1,
    dataDir: env.SEARCH_DATA_DIR || null,
  },
  limits: { messageLength: 1000, groupMembers: 50, groupName: 30 },
  // 프론트를 다른 주소(예: 정적 호스팅)에 따로 올릴 때: 그 주소를 쉼표로. 비워 두면 같은 주소에서만 쓸 수 있다.
  // 'https://*.example.com' 처럼 * 로 서브도메인 전체도 허용할 수 있지만, 남이 만든 서브도메인도 포함되니 가능하면 정확한 주소를 써.
  corsOrigins: list(env.CORS_ORIGIN),
  serveFrontend: env.SERVE_FRONTEND !== '0', // 0 이면 이 서버는 API/소켓만 담당
  frontendDir: path.join(__dirname, '..', '..', 'frontend'), // 프론트 파일은 같은 서버가 그대로 내려준다
});
