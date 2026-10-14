'use strict';
// 역색인(posting list)에서 후보 문서 번호(ord)를 모으는 단계. posting 은 항상 오름차순.

// arr 에서 x 이상인 첫 위치 (from 부터 탐색)
function lowerBound(arr, x, from = 0) {
  let lo = from;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** 모든 term 을 가진 문서(교집합). 가장 짧은 목록을 훑으며 나머지는 이진탐색 → 흔한 term 이 섞여도 빠르다 */
function gatherAnd(lists, scanBudget) {
  const sorted = [...lists].sort((a, b) => a.length - b.length);
  const [small, ...rest] = sorted;
  const cursors = rest.map(() => 0);
  const out = [];
  let truncated = false;
  const limit = Math.min(small.length, scanBudget);
  if (small.length > scanBudget) truncated = true;
  for (let i = 0; i < limit; i++) {
    const ord = small[i];
    let ok = true;
    for (let j = 0; j < rest.length; j++) {
      const pos = lowerBound(rest[j], ord, cursors[j]);
      cursors[j] = pos;
      if (pos >= rest[j].length || rest[j][pos] !== ord) { ok = false; break; }
    }
    if (ok) out.push(ord);
  }
  return { ords: out, truncated };
}

const FUZZY_LIST_MAX = 40_000; // 오타 허용 단계에서 건너뛰는 "너무 흔한" term 의 길이

/** minHits 개 이상의 term 을 가진 문서 (오타 허용). 너무 흔한 term(예: "use")은 건너뛰고, 그래도 minHits 개가 남으면 그것만으로 센다 */
function gatherCount(lists, minHits, scanBudget) {
  const sorted = [...lists].sort((a, b) => a.length - b.length);
  const rare = sorted.filter((l) => l.length <= FUZZY_LIST_MAX);
  // 드문 term 이 minHits 개보다 적으면, 가장 짧은 목록부터 minHits 개까지만 채운다 (제일 흔한 목록은 끝까지 안 읽는다)
  const usable = sorted.slice(0, Math.max(minHits, rare.length));
  const counts = new Map();
  let scanned = 0;
  let truncated = false;
  for (const l of usable) {
    if (scanned + l.length > scanBudget && counts.size) { truncated = true; continue; }
    scanned += l.length;
    for (let i = 0; i < l.length; i++) counts.set(l[i], (counts.get(l[i]) || 0) + 1);
  }
  const out = [];
  for (const [ord, c] of counts) if (c >= minHits) out.push(ord);
  return { ords: out, truncated };
}

module.exports = { gatherAnd, gatherCount, lowerBound };
