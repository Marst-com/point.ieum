// 개발/테스트용 메모리 DB. Firestore 어댑터와 같은 인터페이스를 가진다.
const clone = (v) => structuredClone(v);
const strip = ({ id, ...rest }) => rest; // eslint-disable-line no-unused-vars

class MemoryDb {
  constructor() {
    this.cols = new Map();
    this.lock = Promise.resolve();
  }

  _col(name) {
    if (!this.cols.has(name)) this.cols.set(name, new Map());
    return this.cols.get(name);
  }

  async get(col, id) {
    const v = this._col(col).get(id);
    return v ? { id, ...clone(v) } : null;
  }

  async set(col, id, data) {
    this._col(col).set(id, clone(strip(data)));
  }

  async update(col, id, patch) {
    const c = this._col(col);
    const cur = c.get(id);
    if (!cur) throw new Error(`not-found: ${col}/${id}`);
    c.set(id, { ...cur, ...clone(strip(patch)) });
  }

  async delete(col, id) {
    this._col(col).delete(id);
  }

  async list(col, { where = [], orderBy, desc = false, limit } = {}) {
    let rows = [...this._col(col).entries()].map(([id, d]) => ({ id, ...clone(d) }));
    for (const [field, op, value] of where) {
      rows = rows.filter((r) => {
        if (op === '==') return r[field] === value;
        if (op === 'array-contains') return Array.isArray(r[field]) && r[field].includes(value);
        throw new Error(`unsupported op: ${op}`);
      });
    }
    if (orderBy) {
      const dir = desc ? -1 : 1;
      rows.sort((a, b) => (a[orderBy] > b[orderBy] ? 1 : a[orderBy] < b[orderBy] ? -1 : 0) * dir);
    }
    return limit ? rows.slice(0, limit) : rows;
  }

  // 트랜잭션: 한 번에 하나씩만 실행(직렬화). 쓰기는 끝에서 한꺼번에 반영.
  transaction(fn) {
    const run = async () => {
      const writes = [];
      const tx = {
        get: (c, i) => this.get(c, i),
        set: (c, i, d) => { writes.push(() => this.set(c, i, d)); },
        update: (c, i, p) => { writes.push(() => this.update(c, i, p)); },
        delete: (c, i) => { writes.push(() => this.delete(c, i)); },
      };
      const result = await fn(tx);
      for (const w of writes) await w();
      return result;
    };
    const p = this.lock.then(run, run);
    this.lock = p.catch(() => {});
    return p;
  }
}

module.exports = { MemoryDb };
