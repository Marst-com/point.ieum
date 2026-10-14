'use strict';
// 한 샤드 안의 "이름 붙은 색인" 하나. (예: users, messages)
const { SortedBlocks } = require('./sortedBlocks');
const { normalize, analyzeField, analyzeQuery, docTerms } = require('./analyzer');
const { similarity } = require('./similarity');
const { hitComparator } = require('./ranking');
const { gatherAnd, gatherCount } = require('./candidates');

// 점수가 높은 K개만 들고 있는 수집기 — 후보가 수만 개여도 전부 정렬하지 않는다
class TopK {
  constructor(limit, cmp) { this.limit = limit; this.cmp = cmp; this.items = []; this.scratch = { id: '', score: 0, boost: 0 }; }

  offer(doc, score, boost) {
    const it = this.items;
    if (it.length >= this.limit) {
      const sc = this.scratch;
      sc.id = doc.id; sc.score = score; sc.boost = boost;
      if (this.cmp(sc, it[it.length - 1]) >= 0) return; // 지금 꼴찌보다 낫지 않다
    }
    const hit = { id: doc.id, score, boost, num: doc.num, data: doc.data };
    let lo = 0;
    let hi = it.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.cmp(hit, it[mid]) < 0) hi = mid; else lo = mid + 1; }
    it.splice(lo, 0, hit);
    if (it.length > this.limit) it.pop();
  }
}

const DEFAULTS = { text: [], numeric: [], filters: [], fuzzy: true, choseong: true };
const SCAN_BUDGET = 300_000; // 질의 하나가 훑는 posting 상한
const MAX_CANDIDATES = 50_000;
const CHO_PENALTY = 0.9;
const FILTER_FIRST_MAX = 100_000; // 필터 목록이 이보다 작으면 필터부터 좁힌다

const matchFilters = (doc, filters) => {
  for (const [k, v] of Object.entries(filters)) {
    const want = Array.isArray(v) ? v : [v];
    if (!want.includes(doc.filter[k])) return false;
  }
  return true;
};

class ShardIndex {
  constructor(name, schema) {
    this.name = name;
    this.schema = { ...DEFAULTS, ...schema };
    this._reset();
  }

  _reset() {
    this.docs = []; // ord → doc | null(삭제됨)
    this.idToOrd = new Map();
    this.postings = new Map(); // term → ord[] (오름차순)
    this.numeric = new Map(this.schema.numeric.map((f) => [f, new SortedBlocks()]));
    this.dead = 0;
  }

  get size() { return this.idToOrd.size; }

  clear() { this._reset(); }

  _build(id, input) {
    const text = {};
    for (const f of this.schema.text) {
      const raw = input.text?.[f];
      if (raw == null || raw === '') continue;
      // snapshot 에서 복원할 때는 이미 분석된 값({__jam,__cho})이 들어온다
      text[f] = typeof raw === 'object' ? { jam: raw.__jam, cho: raw.__cho } : analyzeField(raw, this.schema.choseong);
    }
    const num = {};
    for (const f of this.schema.numeric) {
      const v = Number(input.num?.[f]);
      num[f] = Number.isFinite(v) ? v : 0;
    }
    const filter = {};
    for (const f of this.schema.filters) if (input.filter?.[f] != null) filter[f] = String(input.filter[f]);
    return { id, text, num, filter, data: input.data || {} };
  }

  _link(ord, doc) {
    for (const t of docTerms(Object.values(doc.text))) {
      let list = this.postings.get(t);
      if (!list) { list = []; this.postings.set(t, list); }
      list.push(ord);
    }
    for (const [f, v] of Object.entries(doc.filter)) {
      const t = `f:${f}=${v}`;
      let list = this.postings.get(t);
      if (!list) { list = []; this.postings.set(t, list); }
      list.push(ord);
    }
    for (const [f, blocks] of this.numeric) blocks.insert(doc.num[f], ord);
  }

  put(id, input) {
    if (this.idToOrd.has(id)) this.remove(id);
    const doc = this._build(id, input);
    const ord = this.docs.length;
    this.docs.push(doc);
    this.idToOrd.set(id, ord);
    this._link(ord, doc);
  }

  remove(id) {
    const ord = this.idToOrd.get(id);
    if (ord === undefined) return false;
    const doc = this.docs[ord];
    for (const [f, blocks] of this.numeric) blocks.remove(doc.num[f], ord);
    this.docs[ord] = null;
    this.idToOrd.delete(id);
    this.dead++;
    if (this.dead > 1000 && this.dead > this.size) this.compact();
    return true;
  }

  /** 숫자/표시 데이터만 부분 수정 (이름·필터가 바뀌면 put 으로 다시 넣는다) */
  patch(id, { num, data }) {
    const ord = this.idToOrd.get(id);
    if (ord === undefined) return false;
    const doc = this.docs[ord];
    if (num) {
      for (const [f, v] of Object.entries(num)) {
        const blocks = this.numeric.get(f);
        const nv = Number(v);
        if (!blocks || !Number.isFinite(nv) || nv === doc.num[f]) continue;
        blocks.remove(doc.num[f], ord);
        doc.num[f] = nv;
        blocks.insert(nv, ord);
      }
    }
    if (data) doc.data = { ...doc.data, ...data };
    return true;
  }

  /** 삭제된 문서를 정리하고 posting 을 다시 만든다 */
  compact() {
    const live = this.docs.filter(Boolean);
    this._reset();
    for (const d of live) {
      const ord = this.docs.length;
      this.docs.push(d);
      this.idToOrd.set(d.id, ord);
      this._link(ord, d);
    }
  }

  * entries() {
    for (const d of this.docs) if (d) yield d;
  }

  _filterFirst(filters) {
    if (!filters) return null;
    let best = null;
    for (const f of this.schema.filters) {
      if (filters[f] == null) continue;
      const vals = Array.isArray(filters[f]) ? filters[f] : [filters[f]];
      const lists = vals.map((v) => this.postings.get(`f:${f}=${v}`)).filter(Boolean);
      const total = lists.reduce((s, l) => s + l.length, 0);
      if (total <= FILTER_FIRST_MAX && (!best || total < best.total)) best = { lists, total };
    }
    if (!best) return null;
    return best.lists.length === 1 ? best.lists[0] : [...new Set(best.lists.flat())];
  }

  // exact: 모든 term 을 가진 문서(교집합, 빠름) / fuzzy: 일부 term 만 맞아도 후보(오타 허용, 느림 — 정확 결과가 모자랄 때만)
  _gather(plan, mode) {
    const all = new Set();
    let truncated = false;
    for (const path of plan.paths) {
      const fuzzyPath = path.minHits < path.terms.length;
      if (mode === 'fuzzy' && !fuzzyPath) continue;
      const lists = path.terms.map((t) => this.postings.get(t));
      const present = lists.filter(Boolean);
      const needAll = mode === 'exact' || !fuzzyPath;
      if (needAll && present.length < lists.length) continue; // 필수 term 이 아예 없다
      if (!present.length) continue;
      const r = needAll ? gatherAnd(present, SCAN_BUDGET) : gatherCount(present, path.minHits, SCAN_BUDGET);
      truncated = truncated || r.truncated;
      for (const o of r.ords) { all.add(o); if (all.size >= MAX_CANDIDATES) { truncated = true; break; } }
    }
    return { ords: all, truncated };
  }

  _score(doc, plan) {
    let best = 0;
    for (const f of Object.values(doc.text)) {
      let sc = similarity(plan.jam, f.jam, this.schema.fuzzy);
      if (plan.choOnly && f.cho) sc = Math.max(sc, CHO_PENALTY * similarity(plan.raw, f.cho, false)); // 초성 일치는 글자 일치보다 한 단계 아래
      if (sc > best) best = sc;
    }
    return best * plan.penalty;
  }

  // 질의 하나(원래 질의 또는 자판 변환 질의)에 대한 점수 중 가장 높은 값
  _scoreAny(doc, plans) {
    let best = 0;
    for (const p of plans) {
      const sc = this._score(doc, p);
      if (sc > best) best = sc;
    }
    return best;
  }

  search({ q, limit = 20, tiered = false, boost = null, filters = null, excludeIds = null } = {}) {
    const plan = analyzeQuery(q, this.schema);
    if (!plan) return this._browse({ limit, boost, filters, excludeIds });
    const excluded = excludeIds && excludeIds.length ? new Set(excludeIds) : null;
    const topk = new TopK(limit, hitComparator(tiered));
    const seen = new Set();
    let truncated = false;
    let good = 0; // 글자가 실제로 맞는(오타가 아닌) 결과 수

    const plans = [plan];
    const run = (ords) => {
      for (const ord of ords) {
        if (seen.has(ord)) continue;
        seen.add(ord);
        const doc = this.docs[ord];
        if (!doc || (excluded && excluded.has(doc.id)) || (filters && !matchFilters(doc, filters))) continue;
        const score = this._scoreAny(doc, plans);
        if (score <= 0) continue;
        if (score >= 0.6) good++;
        topk.offer(doc, score, boost ? (doc.num[boost] ?? 0) : 0);
      }
    };
    const gather = (p, mode) => {
      const g = this._gather(p, mode);
      truncated = truncated || g.truncated;
      run(g.ords);
    };

    const first = this._filterFirst(filters);
    if (first) {
      plans.push(...plan.alts);
      run(first); // 범위(예: 내 대화방들)가 작으면 그 안에서 바로 전수 비교
    } else {
      gather(plan, 'exact');
      // 정상 질의로 결과가 충분하면 여기서 끝. 모자랄 때만 자판을 잘못 친 경우를 같이 찾는다.
      if (good < limit && plan.alts.length) {
        plans.push(...plan.alts);
        for (const alt of plan.alts) gather(alt, 'exact');
      }
      // 그래도 모자라면 오타 허용(느림)
      if (this.schema.fuzzy && good < limit) for (const p of plans) gather(p, 'fuzzy');
    }
    return { hits: topk.items, truncated };
  }

  // 검색어가 비었을 때: boost 숫자 순(인기/등급 등), 없으면 최근 추가 순
  _browse({ limit, boost, filters, excludeIds }) {
    if (boost && this.numeric.has(boost)) return this.topBy({ field: boost, limit, filters, excludeIds });
    const excluded = excludeIds && excludeIds.length ? new Set(excludeIds) : null;
    const hits = [];
    for (let ord = this.docs.length - 1; ord >= 0 && hits.length < limit; ord--) {
      const doc = this.docs[ord];
      if (!doc || (excluded && excluded.has(doc.id)) || (filters && !matchFilters(doc, filters))) continue;
      hits.push({ id: doc.id, score: 0, boost: 0, num: doc.num, data: doc.data });
    }
    return { hits, truncated: false };
  }

  /** 숫자 필드 기준 상위 N개 (검색어 없이). 예: 일한 돌 많은 순 */
  topBy({ field, limit = 20, filters = null, excludeIds = null } = {}) {
    const blocks = this.numeric.get(field);
    if (!blocks) throw new Error(`숫자 필드가 아니에요: ${this.name}.${field}`);
    const excluded = excludeIds && excludeIds.length ? new Set(excludeIds) : null;
    const hits = [];
    for (const [value, ord] of blocks.iterDesc()) {
      const doc = this.docs[ord];
      if (!doc || (excluded && excluded.has(doc.id)) || (filters && !matchFilters(doc, filters))) continue;
      hits.push({ id: doc.id, score: 0, boost: value, num: doc.num, data: doc.data });
      if (hits.length >= limit) break;
    }
    return { hits, truncated: false };
  }

  countGreater(field, value) {
    const blocks = this.numeric.get(field);
    if (!blocks) throw new Error(`숫자 필드가 아니에요: ${this.name}.${field}`);
    return blocks.countGreater(value);
  }

  stats() {
    let postingEntries = 0;
    for (const l of this.postings.values()) postingEntries += l.length;
    return { docs: this.size, dead: this.dead, terms: this.postings.size, postingEntries };
  }
}

module.exports = { ShardIndex, normalize };
