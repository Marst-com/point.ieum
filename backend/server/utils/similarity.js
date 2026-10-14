// 이름/아이디 검색용 유사도. 정확히 같음 > 앞부분 일치 > 포함 > 비슷함(바이그램) 순.
const norm = (s) => String(s || '').normalize('NFC').toLowerCase().replace(/\s+/g, '');

function bigrams(s) {
  if (s.length < 2) return s ? [s] : [];
  const out = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

function dice(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const counts = new Map();
  for (const x of A) counts.set(x, (counts.get(x) || 0) + 1);
  let hit = 0;
  for (const x of B) {
    const c = counts.get(x);
    if (c > 0) { hit++; counts.set(x, c - 1); }
  }
  return (2 * hit) / (A.length + B.length);
}

// 0 ~ 1. 1 = 완전 일치, [0.8,1) 앞부분 일치, [0.6,0.8) 포함, (0,0.55] 비슷함
function similarity(query, target) {
  const q = norm(query);
  const t = norm(target);
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (t.startsWith(q)) return 0.8 + 0.19 * (q.length / t.length);
  if (t.includes(q)) return 0.6 + 0.19 * (q.length / t.length);
  const d = dice(q, t);
  return d >= 0.4 ? d * 0.55 : 0;
}

const tierOf = (s) => (s >= 1 ? 3 : s >= 0.8 ? 2 : s >= 0.6 ? 1 : 0);

/**
 * items 를 query 와의 유사도로 정렬해서 돌려준다.
 * names(item) → 비교할 문자열 배열, tieBreak(item) → 클수록 먼저(인기/등급 등)
 * tiered=true  : 일치 단계(정확/앞부분/포함/비슷)가 같으면 tieBreak 로 우선순위 결정
 * tiered=false : 유사도 점수가 먼저, 같으면 tieBreak
 */
function rankMatches(items, query, { names, tieBreak = () => 0, tiered = false, limit } = {}) {
  const q = String(query || '').trim();
  let rows = items.map((item) => ({
    item,
    score: q ? Math.max(0, ...names(item).map((n) => similarity(q, n))) : 0,
    tie: tieBreak(item),
  }));
  if (q) rows = rows.filter((r) => r.score > 0);
  rows.sort((a, b) =>
    tiered
      ? tierOf(b.score) - tierOf(a.score) || b.tie - a.tie || b.score - a.score
      : b.score - a.score || b.tie - a.tie);
  const out = rows.map((r) => r.item);
  return limit ? out.slice(0, limit) : out;
}

module.exports = { similarity, rankMatches, norm };
