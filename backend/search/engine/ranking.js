'use strict';
const { tierOf } = require('./similarity');

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 검색 결과 비교기. tiered: 일치 단계 → 부스트 → 점수 / 아니면: 점수 → 부스트. (샤드 내부와 라우터가 똑같이 쓴다) */
const hitComparator = (tiered) => (tiered
  ? (a, b) => tierOf(b.score) - tierOf(a.score) || b.boost - a.boost || b.score - a.score || byId(a, b)
  : (a, b) => b.score - a.score || b.boost - a.boost || byId(a, b));

const topComparator = (a, b) => b.boost - a.boost || byId(a, b);

module.exports = { hitComparator, topComparator };
