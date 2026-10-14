// 사용법: node --expose-gc scripts/benchSearch.js [사용자수=200000] [샤드수=1]
// 가짜 사용자를 넣고, 질의 종류별 지연시간(p50/p95/p99)과 메모리를 잰다. (한 프로세스 안에서 도는 값이라 "노드 1대" 기준 수치)
const { createSearch } = require('../search');
const schemas = require('../search/schema');

const N = Number(process.argv[2]) || 200_000;
const SHARDS = Number(process.argv[3]) || 1;

let seed = 12345;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (s) => s[Math.floor(rnd() * s.length)];
// 성씨는 실제처럼 한쪽으로 쏠리게(김·이·박이 절반 이상), 이름 음절은 흔한 것 위주
const SURNAMES = '김김김김김김김이이이이이이박박박박박최최최정정정강조윤장임한오서신권황안송류홍';
const GIVEN = '민준서연지우현도하은수빈아영철호진성태훈별나라윤재혁승유채원예진주건희소율시은다온서아';
const name = () => pick(SURNAMES) + pick(GIVEN) + pick(GIVEN);
const choOf = (n) => n.split('').map((c) => 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor((c.charCodeAt(0) - 0xAC00) / 588)]).join('');

const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
const ms = (x) => (x < 1 ? x.toFixed(2) : x.toFixed(1)).padStart(7);

(async () => {
  const { cluster } = await createSearch({ schemas, localShards: SHARDS });
  if (global.gc) global.gc();
  const base = process.memoryUsage().heapUsed;

  const names = [];
  const t0 = Date.now();
  const BATCH = 5000;
  for (let i = 0; i < N; i += BATCH) {
    const items = [];
    for (let j = i; j < Math.min(N, i + BATCH); j++) {
      const n = name();
      if (j < 20000) names.push(n);
      items.push({ id: `u${j}`, d: { text: { name: n, username: `user_${j.toString(36)}` }, num: { friendCount: Math.floor(rnd() ** 3 * 500), stones: Math.floor(rnd() ** 2 * 70000), gradeRank: Math.floor(rnd() * 7), createdAt: j }, data: { id: `u${j}`, name: n } } });
    }
    await cluster.bulk('users', items);
  }
  const buildSec = (Date.now() - t0) / 1000;
  if (global.gc) global.gc();
  const heap = process.memoryUsage().heapUsed - base;
  console.log(`\n사용자 ${N.toLocaleString()}명 / 샤드 ${SHARDS}개 — 색인 ${buildSec.toFixed(1)}s (${Math.round(N / buildSec).toLocaleString()}건/s), 메모리 ${(heap / 1048576).toFixed(0)}MB (1명당 ${(heap / N).toFixed(0)}B)`);

  const cases = {
    '이름 전체 ("김민준")': () => pick(names),
    '앞 두 글자 ("김민")': () => pick(names).slice(0, 2),
    '이름 일부 ("민준")': () => pick(names).slice(1),
    '한 글자 ("김")': () => pick(names).slice(0, 1),
    '초성 3자 ("ㄱㅁㅈ")': () => choOf(pick(names)),
    '초성 2자 ("ㅁㅈ")': () => choOf(pick(names)).slice(1),
    '오타 ("김민쥰")': () => { const n = pick(names); return n.slice(0, 2) + String.fromCharCode(n.charCodeAt(2) + 1); },
    '아이디 ("user_1a2b")': () => `user_${Math.floor(rnd() * N).toString(36)}`,
  };
  console.log('\n질의 종류                        p50(ms)  p95(ms)  p99(ms)  평균 결과수');
  for (const [label, gen] of Object.entries(cases)) {
    const qs = Array.from({ length: 400 }, gen);
    for (let i = 0; i < 30; i++) await cluster.search({ index: 'users', q: qs[i], limit: 20, tiered: true, boost: 'friendCount' }); // 워밍업
    const times = []; let hits = 0;
    for (const q of qs) {
      const t = process.hrtime.bigint();
      const r = await cluster.search({ index: 'users', q, limit: 20, tiered: true, boost: 'friendCount' });
      times.push(Number(process.hrtime.bigint() - t) / 1e6); hits += r.hits.length;
    }
    times.sort((a, b) => a - b);
    console.log(`${label.padEnd(30)} ${ms(pct(times, 0.5))} ${ms(pct(times, 0.95))} ${ms(pct(times, 0.99))}   ${(hits / qs.length).toFixed(1)}`);
  }
  for (const [label, fn] of [
    ['인기순 상위 20 (검색어 없음)', () => cluster.topBy({ index: 'users', field: 'friendCount', limit: 20 })],
    ['내 순위 (countGreater)', () => cluster.countGreater('users', 'stones', Math.floor(rnd() * 70000))],
    ['돌 개수 갱신 (patch)', () => cluster.patch('users', `u${Math.floor(rnd() * N)}`, { num: { stones: Math.floor(rnd() * 70000) } })],
    ['가입 (put 1건)', () => cluster.put('users', `n${Math.floor(rnd() * 1e9)}`, { text: { name: name(), username: 'x' }, num: {}, data: {} })],
  ]) {
    const times = [];
    for (let i = 0; i < 300; i++) { const t = process.hrtime.bigint(); await fn(); times.push(Number(process.hrtime.bigint() - t) / 1e6); }
    times.sort((a, b) => a - b);
    console.log(`${label.padEnd(30)} ${ms(pct(times, 0.5))} ${ms(pct(times, 0.95))} ${ms(pct(times, 0.99))}`);
  }
  process.exit(0);
})();
