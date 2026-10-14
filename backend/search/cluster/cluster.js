'use strict';
// 라우터: 쓰기는 id 해시로 한 샤드에, 읽기는 모든 샤드에 동시에 물어 합친다.
const { fnv1a } = require('./hash');
const { hitComparator, topComparator } = require('../engine/ranking');

class SearchCluster {
  constructor(shards, { onShardError = (e, shard) => console.error(`[search] 샤드 실패 ${shard.name || ''}:`, e.message) } = {}) {
    if (!shards.length) throw new Error('샤드가 하나 이상 필요해요');
    this.shards = shards;
    this.onShardError = onShardError;
  }

  shardFor(id) { return this.shards[fnv1a(String(id)) % this.shards.length]; }

  put(index, id, d) { return this.shardFor(id).put(index, id, d); }
  patch(index, id, d) { return this.shardFor(id).patch(index, id, d); }
  remove(index, id) { return this.shardFor(id).remove(index, id); }

  /** items: [{id, d}] — 샤드별로 묶어서 한 번에 보낸다 */
  async bulk(index, items) {
    const groups = this.shards.map(() => []);
    for (const it of items) groups[fnv1a(String(it.id)) % this.shards.length].push(it);
    await Promise.all(groups.map((g, i) => (g.length ? this.shards[i].bulk(index, g) : null)));
    return items.length;
  }

  clear(index) { return Promise.all(this.shards.map((s) => s.clear(index))); }

  // 샤드 하나가 죽어도 나머지 결과로 답한다 (partial=true). 전부 죽으면 오류.
  async _fanOut(fn) {
    const settled = await Promise.allSettled(this.shards.map(fn));
    const ok = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') ok.push(r.value); else this.onShardError(r.reason, this.shards[i]);
    });
    if (!ok.length) throw new Error('모든 검색 샤드가 응답하지 않아요');
    return { ok, partial: ok.length < this.shards.length };
  }

  async search(req) {
    const limit = req.limit ?? 20;
    const { ok, partial } = await this._fanOut((s) => s.search({ ...req, limit }));
    const hits = ok.flatMap((r) => r.hits).sort(hitComparator(!!req.tiered)).slice(0, limit);
    return { hits, truncated: ok.some((r) => r.truncated), partial };
  }

  async topBy(req) {
    const limit = req.limit ?? 20;
    const { ok, partial } = await this._fanOut((s) => s.topBy({ ...req, limit }));
    const hits = ok.flatMap((r) => r.hits).sort(topComparator).slice(0, limit);
    return { hits, truncated: false, partial };
  }

  /** 값이 value 보다 큰 문서 수 (전체 샤드 합) → 순위 = 1 + 이 값 */
  async countGreater(index, field, value) {
    const { ok } = await this._fanOut((s) => s.countGreater(index, field, value));
    return ok.reduce((a, b) => a + b, 0);
  }

  async count(index) {
    const { ok } = await this._fanOut((s) => s.count(index));
    return ok.reduce((a, b) => a + b, 0);
  }

  stats() { return Promise.all(this.shards.map((s) => s.stats())); }
  flush() { return Promise.all(this.shards.map((s) => s.flush())); }
  close() { return Promise.all(this.shards.map((s) => s.close())); }
}

module.exports = { SearchCluster };
