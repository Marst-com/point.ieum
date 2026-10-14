'use strict';
// 자모 공간에서의 유사도. 1=완전일치, [0.8,1)=앞부분, [0.6,0.8)=포함, (0,0.55]=비슷함(오타)
function bigramCounts(s) {
  const m = new Map();
  for (let i = 0; i + 2 <= s.length; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
}

function dice(a, b) {
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigramCounts(a);
  let hit = 0;
  for (let i = 0; i + 2 <= b.length; i++) {
    const g = b.slice(i, i + 2);
    const c = A.get(g);
    if (c > 0) { hit++; A.set(g, c - 1); }
  }
  return (2 * hit) / (a.length - 1 + b.length - 1);
}

function similarity(q, t, fuzzy = true) {
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (t.startsWith(q)) return 0.8 + 0.19 * (q.length / t.length);
  if (t.includes(q)) return 0.6 + 0.19 * (q.length / t.length);
  if (!fuzzy || q.length < 4 || t.length > 40) return 0;
  const d = dice(q, t);
  return d >= 0.4 ? d * 0.55 : 0;
}

const tierOf = (s) => (s >= 1 ? 3 : s >= 0.8 ? 2 : s >= 0.6 ? 1 : 0);

module.exports = { similarity, tierOf, dice };
