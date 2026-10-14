'use strict';
// 디스크 저장: snapshot.jsonl(전체) + wal.jsonl(그 뒤의 변경). 시작할 때 snapshot → wal 순서로 다시 적용한다.
const fs = require('fs');
const path = require('path');

class Persistence {
  constructor(dir, { flushMs = 20, flushOps = 1000 } = {}) {
    this.dir = dir;
    this.flushMs = flushMs;
    this.flushOps = flushOps;
    this.buffer = [];
    this.timer = null;
    this.walOps = 0;
    this.snapshotPath = path.join(dir, 'snapshot.jsonl');
    this.walPath = path.join(dir, 'wal.jsonl');
  }

  /** apply(op) 를 저장된 순서대로 호출한다. 끝이 잘린(비정상 종료) 마지막 줄은 건너뛴다. */
  open(apply) {
    fs.mkdirSync(this.dir, { recursive: true });
    let skipped = 0;
    for (const file of [this.snapshotPath, this.walPath]) {
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line) continue;
        try { apply(JSON.parse(line)); if (file === this.walPath) this.walOps++; } catch { skipped++; }
      }
    }
    return { skipped };
  }

  append(op) {
    this.buffer.push(JSON.stringify(op));
    this.walOps++;
    if (this.buffer.length >= this.flushOps) this.flush();
    else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushMs);
      this.timer.unref?.();
    }
  }

  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.buffer.length) return;
    fs.appendFileSync(this.walPath, `${this.buffer.join('\n')}\n`);
    this.buffer = [];
  }

  /** 지금 메모리 상태 전체를 snapshot 으로 저장하고 wal 을 비운다. (동기 실행 — 중간에 새 변경이 끼어들지 않는다) */
  snapshot(iterOps) {
    const tmp = `${this.snapshotPath}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    let chunk = [];
    let size = 0;
    const writeOut = () => { if (chunk.length) { fs.writeSync(fd, `${chunk.join('\n')}\n`); chunk = []; size = 0; } };
    for (const op of iterOps) {
      const line = JSON.stringify(op);
      chunk.push(line);
      size += line.length;
      if (size > 1 << 20) writeOut();
    }
    writeOut();
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tmp, this.snapshotPath);
    this.buffer = [];
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    fs.writeFileSync(this.walPath, '');
    this.walOps = 0;
  }
}

module.exports = { Persistence };
