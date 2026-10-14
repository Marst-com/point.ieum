'use strict';
// 샤드 = 여러 색인(users, messages…) + 선택적 디스크 저장. 모든 메서드는 async (원격 샤드와 같은 모양).
const { ShardIndex } = require('./shardIndex');
const { Persistence } = require('./persistence');

const SNAPSHOT_EVERY_OPS = 200_000;

class Shard {
  constructor({ schemas, dir = null }) {
    this.schemas = schemas;
    this.indexes = new Map();
    this.persist = dir ? new Persistence(dir) : null;
    this.opened = false;
  }

  _idx(name) {
    let i = this.indexes.get(name);
    if (!i) {
      if (!this.schemas[name]) throw new Error(`없는 색인이에요: ${name}`);
      i = new ShardIndex(name, this.schemas[name]);
      this.indexes.set(name, i);
    }
    return i;
  }

  _apply(op) {
    switch (op.t) {
      case 'put': this._idx(op.i).put(op.id, op.d); break;
      case 'patch': this._idx(op.i).patch(op.id, op.d); break;
      case 'del': this._idx(op.i).remove(op.id); break;
      case 'clear': this._idx(op.i).clear(); break;
      default: throw new Error(`알 수 없는 op: ${op.t}`);
    }
  }

  async open() {
    if (this.persist && !this.opened) this.loadInfo = this.persist.open((op) => this._apply(op));
    this.opened = true;
    return this;
  }

  _log(op) {
    if (!this.persist) return;
    this.persist.append(op);
    if (this.persist.walOps >= SNAPSHOT_EVERY_OPS) this.snapshot();
  }

  async put(index, id, d) { this._idx(index).put(id, d); this._log({ t: 'put', i: index, id, d }); }

  async patch(index, id, d) {
    const ok = this._idx(index).patch(id, d);
    if (ok) this._log({ t: 'patch', i: index, id, d });
    return ok;
  }

  async remove(index, id) {
    const ok = this._idx(index).remove(id);
    if (ok) this._log({ t: 'del', i: index, id });
    return ok;
  }

  async bulk(index, items) { for (const it of items) await this.put(index, it.id, it.d); return items.length; }
  async clear(index) { this._idx(index).clear(); this._log({ t: 'clear', i: index }); }
  async search(req) { return this._idx(req.index).search(req); }
  async topBy(req) { return this._idx(req.index).topBy(req); }
  async countGreater(index, field, value) { return this._idx(index).countGreater(field, value); }
  async count(index) { return this._idx(index).size; }

  async stats() {
    const out = {};
    for (const name of Object.keys(this.schemas)) out[name] = this._idx(name).stats();
    return out;
  }

  * _allOps() {
    for (const [name, idx] of this.indexes) {
      for (const d of idx.entries()) {
        yield { t: 'put', i: name, id: d.id, d: { text: this._textOf(d), num: d.num, filter: d.filter, data: d.data } };
      }
    }
  }

  // snapshot 은 색인된 값에서 복원할 수 없는 원문이 필요 → 문서 입력 원문을 별도로 들고 있지 않으므로 자모/초성을 그대로 저장한다
  _textOf(d) { return Object.fromEntries(Object.entries(d.text).map(([f, v]) => [f, { __jam: v.jam, __cho: v.cho }])); }

  snapshot() { if (this.persist) this.persist.snapshot(this._allOps()); }
  async flush() { if (this.persist) this.persist.flush(); }
  async close() { await this.flush(); }
}

module.exports = { Shard };
