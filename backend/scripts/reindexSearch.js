// 사용법: node scripts/reindexSearch.js   — DB 기준으로 검색 색인을 비우고 다시 만든다
const db = require('../server/db');
const search = require('../server/search/client');
const { reindexAll } = require('../server/search/bootstrap');

(async () => {
  db.init();
  await search.init();
  const t = Date.now();
  const r = await reindexAll({ clear: true });
  console.log('색인 완료', r, `${((Date.now() - t) / 1000).toFixed(1)}s`);
  await search.close();
  process.exit(0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
