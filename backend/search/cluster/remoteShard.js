'use strict';
// 다른 서버에서 도는 샤드 노드를 HTTP 로 부르는 클라이언트. Shard 와 같은 메서드를 가진다.
const http = require('http');
const https = require('https');

class RemoteShard {
  constructor(baseUrl, { key = '', timeoutMs = 2000 } = {}) {
    this.url = new URL(baseUrl);
    this.key = key;
    this.timeoutMs = timeoutMs;
    const Agent = this.url.protocol === 'https:' ? https.Agent : http.Agent;
    this.agent = new Agent({ keepAlive: true, maxSockets: 64 });
    this.name = baseUrl;
  }

  _call(op, body = {}, timeoutMs = this.timeoutMs) {
    const payload = JSON.stringify(body);
    const lib = this.url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = lib.request({
        agent: this.agent, method: 'POST', hostname: this.url.hostname, port: this.url.port,
        path: `/v1/${op}`, timeout: timeoutMs,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'x-search-key': this.key },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* 아래에서 처리 */ }
          if (res.statusCode !== 200) return reject(new Error(`샤드 ${this.name} 오류 ${res.statusCode}: ${json?.error || ''}`));
          return resolve(json);
        });
      });
      req.on('timeout', () => req.destroy(new Error(`샤드 ${this.name} 응답 시간 초과`)));
      req.on('error', reject);
      req.end(payload);
    });
  }

  async put(index, id, d) { await this._call('put', { index, id, d }); }
  async patch(index, id, d) { return (await this._call('patch', { index, id, d })).ok; }
  async remove(index, id) { return (await this._call('remove', { index, id })).ok; }
  async bulk(index, items) { return (await this._call('bulk', { index, items }, 30_000)).n; }
  async clear(index) { await this._call('clear', { index }); }
  async search(req) { return this._call('search', req); }
  async topBy(req) { return this._call('top', req); }
  async countGreater(index, field, value) { return (await this._call('greater', { index, field, value })).n; }
  async count(index) { return (await this._call('count', { index })).n; }
  async stats() { return this._call('stats'); }
  async flush() { await this._call('flush'); }
  async close() { this.agent.destroy(); }
}

module.exports = { RemoteShard };
