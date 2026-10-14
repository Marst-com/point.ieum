const http = require('http');
const config = require('./config');
const db = require('./db');
const { createApp } = require('./app');
const { attachSocket } = require('./socket');
const search = require('./search/client');
const { ensureIndexed } = require('./search/bootstrap');

db.init();
const server = http.createServer(createApp());
attachSocket(server);

async function start() {
  if (!config.serveFrontend && !config.corsOrigins.length) console.warn('[경고] SERVE_FRONTEND=0 인데 CORS_ORIGIN 이 비어 있어요. 따로 올린 프론트에서 이 서버를 부를 수 없어요');
  await search.init();
  if (config.syncOnStart) { // 켤 때마다 원본 기준으로 공유용 복사본을 맞춘다 (멱등)
    const rec = await require('./shared/reconcile').reconcile({ repair: true });
    console.log('[sync] 공유용 복사본', { 계정: rec.accounts, 입장권: rec.tickets });
  }
  const r = await ensureIndexed();
  if (!r.skipped) console.log('[search] 색인 완료', r);
  if (config.useMemoryDb && process.env.DEMO_SEED === '1') await require('./devSeed').seedDemo();
  server.listen(config.port, () => {
    console.log(`IEUM PointSystem 실행 중 → http://localhost:${config.port}`);
  });
}

start().catch((e) => { console.error(e); process.exit(1); });
