// 사용법: node scripts/syncShared.js [--repair] [--search]
//   (옵션 없음)  점검만: 원본 ↔ 공유용 복사본(계정·입장권)이 어긋났는지 보고
//   --repair     어긋난 것을 원본 기준으로 고침 (몇 번 돌려도 같은 결과)
//   --search     검색 색인(users/workers/sites 개수)도 같이 점검 — --repair 와 함께면 다시 만든다
const db = require('../server/db');
const searchClient = require('../server/search/client');
const { reconcile } = require('../server/shared/reconcile');

(async () => {
  const args = new Set(process.argv.slice(2));
  const repair = args.has('--repair');
  const search = args.has('--search');
  db.init();
  if (search) await searchClient.init();
  const r = await reconcile({ repair, search });
  console.log(JSON.stringify(r, null, 2));
  console.log(r.clean ? '\n어긋난 것이 없어요' : repair ? '\n어긋난 것을 고쳤어요 (다시 점검해서 확인해 봐)' : '\n어긋난 것이 있어요 → --repair 로 고칠 수 있어요');
  if (search) await searchClient.close();
  process.exit(r.clean || repair ? 0 : 2);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
