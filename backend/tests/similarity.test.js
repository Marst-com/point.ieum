const test = require('node:test');
const assert = require('node:assert');
const { similarity, rankMatches } = require('../server/utils/similarity');

test('유사도: 정확 > 앞부분 > 포함 > 비슷함 > 무관', () => {
  const exact = similarity('민준', '민준');
  const prefix = similarity('민', '민준');
  const contains = similarity('준', '민준');
  const fuzzy = similarity('minjoon', 'minjun');
  assert.equal(exact, 1);
  assert.ok(exact > prefix && prefix > contains && contains > fuzzy && fuzzy > 0);
  assert.equal(similarity('zzzz', '민준'), 0);
});

test('rankMatches(tiered): 일치 단계가 같으면 tieBreak(등급)가 이긴다', () => {
  const users = [
    { name: '민수', g: 1 }, { name: '민수', g: 5 }, { name: '김민수', g: 9 }, { name: '민수기', g: 3 },
  ];
  const out = rankMatches(users, '민수', { names: (u) => [u.name], tiered: true, tieBreak: (u) => u.g });
  assert.deepEqual(out.map((u) => `${u.name}:${u.g}`), ['민수:5', '민수:1', '민수기:3', '김민수:9']);
});

test('rankMatches(비tiered): 유사도 우선, 같으면 인기순. 검색어 없으면 인기순', () => {
  const users = [{ name: 'abc', pop: 1 }, { name: 'abc', pop: 9 }, { name: 'abcd', pop: 99 }];
  const out = rankMatches(users, 'abc', { names: (u) => [u.name], tieBreak: (u) => u.pop });
  assert.deepEqual(out.map((u) => u.pop), [9, 1, 99]);
  const all = rankMatches(users, '', { names: (u) => [u.name], tieBreak: (u) => u.pop });
  assert.deepEqual(all.map((u) => u.pop), [99, 9, 1]);
});
