'use strict';
// 정렬된 (값, 키) 목록을 블록으로 나눠 관리한다. 삽입/삭제 O(√n), 상위 K개 · "이 값보다 큰 개수"(순위) 계산 가능.
const BLOCK = 512;

class SortedBlocks {
  constructor() {
    this.blocks = []; // { v: number[], k: number[] }
    this.size = 0;
  }

  // 블록 안에서 (v,k) 이상인 첫 위치
  static _lower(b, v, k) {
    let lo = 0;
    let hi = b.v.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (b.v[mid] < v || (b.v[mid] === v && b.k[mid] < k)) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  // (v,k) 가 들어갈 블록 번호: 마지막 원소가 (v,k) 이상인 첫 블록, 없으면 마지막 블록
  _blockFor(v, k) {
    let lo = 0;
    let hi = this.blocks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const b = this.blocks[mid];
      const lv = b.v[b.v.length - 1];
      const lk = b.k[b.k.length - 1];
      if (lv < v || (lv === v && lk < k)) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  insert(v, k) {
    if (!this.blocks.length) this.blocks.push({ v: [], k: [] });
    const bi = this._blockFor(v, k);
    const b = this.blocks[bi];
    const pos = SortedBlocks._lower(b, v, k);
    b.v.splice(pos, 0, v);
    b.k.splice(pos, 0, k);
    this.size++;
    if (b.v.length > BLOCK * 2) {
      const half = b.v.length >> 1;
      this.blocks.splice(bi + 1, 0, { v: b.v.splice(half), k: b.k.splice(half) });
    }
  }

  remove(v, k) {
    if (!this.blocks.length) return false;
    const bi = this._blockFor(v, k);
    const b = this.blocks[bi];
    const pos = SortedBlocks._lower(b, v, k);
    if (b.v[pos] !== v || b.k[pos] !== k) return false;
    b.v.splice(pos, 1);
    b.k.splice(pos, 1);
    this.size--;
    if (!b.v.length) this.blocks.splice(bi, 1);
    return true;
  }

  /** 값이 v 보다 "큰" 항목 수 (동점은 제외) → 순위 = 1 + countGreater */
  countGreater(v) {
    let total = 0;
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      if (b.v[b.v.length - 1] <= v) break;
      if (b.v[0] > v) { total += b.v.length; continue; }
      let lo = 0;
      let hi = b.v.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (b.v[mid] <= v) lo = mid + 1; else hi = mid;
      }
      total += b.v.length - lo;
      break;
    }
    return total;
  }

  /** 값이 큰 순서(같으면 키가 큰 순서)로 [값, 키] 를 하나씩 돌려준다 */
  * iterDesc() {
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      for (let j = b.v.length - 1; j >= 0; j--) yield [b.v[j], b.k[j]];
    }
  }
}

module.exports = { SortedBlocks };
