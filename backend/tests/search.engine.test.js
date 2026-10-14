const test = require('node:test');
const assert = require('node:assert');
const { decompose, choseong, normalize } = require('../search/engine/analyzer');
const { similarity } = require('../search/engine/similarity');
const { SortedBlocks } = require('../search/engine/sortedBlocks');
const { ShardIndex } = require('../search/engine/shardIndex');
const { lowerBound, gatherAnd } = require('../search/engine/candidates');

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

test('한글 분해/초성', () => {
  assert.equal(decompose('민준'), 'ㅁㅣㄴㅈㅜㄴ');
  assert.equal(decompose('값'), 'ㄱㅏㅂㅅ'); // 겹받침도 풀어서
  assert.equal(decompose('왜'), 'ㅇㅗㅐ');
  assert.equal(decompose('A1 b'), 'A1 b'.replace(/\s/g, '') === 'A1b' ? 'A1 b' : '');
  assert.equal(choseong('김민준'), 'ㄱㅁㅈ');
  assert.equal(choseong('kim민'), 'kimㅁ');
  assert.equal(normalize('  Kim  Min '), 'kimmin');
  // 타이핑 도중(받침만 친 상태)도 앞부분이 맞는다
  assert.ok(decompose('민준').startsWith(decompose('민ㅈ')));
  assert.ok(decompose('가나').startsWith(decompose('간')));
});

test('SortedBlocks: 무작위 삽입/삭제/순위가 단순 구현과 같다', () => {
  const r = rng(7);
  const sb = new SortedBlocks();
  const naive = new Map(); // key → value
  for (let step = 0; step < 6000; step++) {
    const op = r();
    if (op < 0.65 || !naive.size) {
      const k = step; const v = Math.floor(r() * 300);
      sb.insert(v, k); naive.set(k, v);
    } else {
      const keys = [...naive.keys()]; const k = keys[Math.floor(r() * keys.length)];
      assert.equal(sb.remove(naive.get(k), k), true); naive.delete(k);
    }
    if (step % 500 === 0) {
      const probe = Math.floor(r() * 320);
      assert.equal(sb.countGreater(probe), [...naive.values()].filter((v) => v > probe).length);
    }
  }
  assert.equal(sb.size, naive.size);
  const desc = [...sb.iterDesc()];
  const expected = [...naive.entries()].map(([k, v]) => [v, k]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  assert.deepEqual(desc, expected);
  assert.equal(sb.remove(9999, 9999), false);
});

test('후보 교집합: 이진탐색 교집합이 정답과 같다', () => {
  const a = [1, 3, 5, 7, 9, 11, 13]; const b = [3, 4, 5, 6, 7, 13, 20]; const c = [0, 3, 7, 13, 14];
  assert.deepEqual(gatherAnd([a, b, c], 1e6).ords, [3, 7, 13]);
  assert.equal(lowerBound([1, 3, 5], 4), 2);
});

// 임의의 이름 말뭉치로 엔진 결과가 "정답(전수 비교)"과 같은지 확인
const SYL = '김이박최정강조윤장임민준서연지우현도하은수빈아영철호진성태훈별나라다마바사자차카타파';
const makeName = (r) => Array.from({ length: 2 + Math.floor(r() * 3) }, () => SYL[Math.floor(r() * SYL.length)]).join('');

test('검색 결과가 전수 비교(정답)와 같다 — 글자·접두·초성', () => {
  const r = rng(42);
  const idx = new ShardIndex('t', { text: ['name'], numeric: ['n'] });
  const names = [];
  for (let i = 0; i < 3000; i++) { const n = makeName(r); names.push(n); idx.put(`d${i}`, { text: { name: n }, num: { n: i } }); }

  const oracle = (q) => {
    const qj = decompose(normalize(q)); const choQ = [...normalize(q)].every((c) => 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'.includes(c));
    const out = new Set();
    names.forEach((n, i) => {
      const nj = decompose(normalize(n));
      let s = qj.length >= 3 ? similarity(qj, nj, false) : (nj.startsWith(qj) ? 0.8 : 0);
      // 한 글자 초성은 "앞부분 일치"만 지원한다 (중간 포함은 2글자부터)
      const cn = choseong(normalize(n)); const qn = normalize(q);
      if (choQ) s = Math.max(s, 0.9 * (qn.length === 1 && !cn.startsWith(qn) ? 0 : similarity(qn, cn, false)));
      if (qj.length < 3 && choQ) s = Math.max(s, nj.startsWith(qj) ? 0.8 : 0);
      if (s >= 0.6) out.add(`d${i}`);
    });
    return out;
  };

  const queries = [];
  for (let i = 0; i < 40; i++) { const n = names[Math.floor(r() * names.length)]; queries.push(n, n.slice(0, 2), n.slice(1), choseong(n), choseong(n).slice(0, 2), choseong(n).slice(1)); }
  let checked = 0;
  for (const q of queries) {
    const want = oracle(q);
    const got = new Set(idx.search({ q, limit: 5000 }).hits.filter((h) => h.score >= 0.6).map((h) => h.id));
    // 초성 2글자(cb)·3글자 이상(ct)·접두 모두 정확히 같아야 한다
    const qj = decompose(normalize(q));
    if (qj.length >= 3 || [...q].every((c) => 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'.includes(c))) {
      assert.deepEqual([...got].sort(), [...want].sort(), `질의 "${q}"`);
      checked++;
    }
  }
  assert.ok(checked > 100, `검증한 질의 수 ${checked}`);
});

test('수정/삭제/패치 후에도 결과가 맞다 + 순위(countGreater)', () => {
  const idx = new ShardIndex('t', { text: ['name'], numeric: ['score'], filters: ['g'] });
  idx.put('a', { text: { name: '철수' }, num: { score: 10 }, filter: { g: 'x' } });
  idx.put('b', { text: { name: '철수야' }, num: { score: 30 }, filter: { g: 'y' } });
  idx.put('c', { text: { name: '영희' }, num: { score: 30 }, filter: { g: 'x' } });
  assert.deepEqual(idx.search({ q: '철수', tiered: true }).hits.map((h) => h.id), ['a', 'b']);
  assert.deepEqual(idx.search({ q: '철수', filters: { g: 'y' } }).hits.map((h) => h.id), ['b']);
  assert.equal(idx.countGreater('score', 10), 2);
  assert.equal(idx.countGreater('score', 30), 0);
  idx.patch('a', { num: { score: 99 } });
  assert.equal(idx.countGreater('score', 30), 1);
  assert.deepEqual(idx.topBy({ field: 'score', limit: 2 }).hits.map((h) => h.id), ['a', 'c']);
  idx.put('a', { text: { name: '민수' }, num: { score: 1 } }); // 같은 id 로 덮어쓰기
  assert.deepEqual(idx.search({ q: '철수' }).hits.map((h) => h.id), ['b']);
  assert.deepEqual(idx.search({ q: '민수' }).hits.map((h) => h.id), ['a']);
  assert.equal(idx.remove('b'), true);
  assert.equal(idx.remove('b'), false);
  assert.deepEqual(idx.search({ q: '철수' }).hits, []);
  assert.equal(idx.search({ q: '', limit: 5 }).hits.length, 2); // 검색어 없으면 최근 순 목록
  assert.deepEqual(idx.search({ q: '영희', excludeIds: ['c'] }).hits, []);
});

test('삭제가 많이 쌓이면 compact 후에도 결과가 같다', () => {
  const idx = new ShardIndex('t', { text: ['name'], numeric: ['n'] });
  for (let i = 0; i < 3000; i++) idx.put(`d${i}`, { text: { name: `사용자${i}` }, num: { n: i } });
  for (let i = 0; i < 2500; i++) idx.remove(`d${i}`); // 1000 넘게 삭제 → 자동 compact
  assert.equal(idx.size, 500);
  assert.ok(idx.dead < 1000, 'compact 됨');
  assert.equal(idx.search({ q: '사용자2999' }).hits[0].id, 'd2999'); // 정확히 같은 것이 1등 (오타 허용 결과가 뒤에 따라올 수 있음)
  assert.equal(idx.search({ q: '사용자1' }).hits.filter((h) => h.score >= 0.6).length, 0); // 글자가 맞는 결과는 없다
  assert.equal(idx.countGreater('n', 2990), 9);
});

test('오타·타이핑 도중 검색', () => {
  const idx = new ShardIndex('t', { text: ['name', 'username'], numeric: [] });
  idx.put('1', { text: { name: '김철수', username: 'chulsoo' } });
  idx.put('2', { text: { name: '박영희', username: 'younghee' } });
  assert.deepEqual(idx.search({ q: '김철소' }).hits.map((h) => h.id), ['1']); // 오타
  assert.deepEqual(idx.search({ q: 'chulso' }).hits.map((h) => h.id), ['1']); // 영문 접두
  assert.deepEqual(idx.search({ q: 'yonghee' }).hits.map((h) => h.id), ['2']); // 영문 오타
  assert.deepEqual(idx.search({ q: '철ㅅ' }).hits.map((h) => h.id), ['1']); // 쓰는 중
  assert.deepEqual(idx.search({ q: '완전다른' }).hits, []);
});

test('한/영 자판을 잘못 두고 친 검색어: alswns ↔ 민준', () => {
  const { englishKeysToJamo, jamoToEnglishKeys } = require('../search/engine/analyzer');
  assert.equal(englishKeysToJamo('alswns'), decompose('민준'));
  assert.equal(englishKeysToJamo('AlSwns'), decompose('민준'), '대문자가 섞여도');
  assert.equal(englishKeysToJamo('Rkskek'), decompose('까나다'), 'Shift 로 친 쌍자음');
  assert.equal(jamoToEnglishKeys(decompose('ㅡㅑㅜㅓㅕㅜ')), 'minjun');
  assert.equal(jamoToEnglishKeys(decompose('한글')), 'gksrmf'); // 한글 모드로 gksrmf 를 친 것

  const idx = new ShardIndex('t', { text: ['name', 'username'], numeric: [] });
  idx.put('1', { text: { name: '김민준', username: 'kimmj' } });
  idx.put('2', { text: { name: '민준', username: 'mj2' } });
  idx.put('3', { text: { name: 'Minjun Park', username: 'mpark' } });
  idx.put('4', { text: { name: '박영희', username: 'younghee' } });
  const ids = (q) => idx.search({ q, tiered: true }).hits.map((h) => h.id);
  assert.deepEqual(ids('alswns'), ['2', '1']);              // 영타로 친 "민준"
  assert.deepEqual(ids('AlSwns'), ['2', '1']);
  assert.deepEqual(ids('qkrdudgml'), ['4']);                // 영타로 친 "박영희"
  assert.deepEqual(ids('ㅡㅑㅜㅓㅕㅜ'), ['3']);             // 한글 모드로 친 "minjun"
  assert.deepEqual(ids('민준'), ['2', '1']);                // 정상 질의는 그대로
  assert.ok(idx.search({ q: 'minjun' }).hits.some((h) => h.id === '3'));
  assert.deepEqual(ids('al'), [], '2글자 이하는 변환하지 않는다');
});
