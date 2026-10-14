#!/usr/bin/env node
'use strict';
// 사용법: SEARCH_KEY=비밀 SEARCH_PORT=7001 SEARCH_DATA_DIR=./data/shard-0 node search/bin/shardNode.js
const { Shard } = require('../engine/shard');
const { createShardServer } = require('../node/shardServer');
const schemas = require('../schema');

(async () => {
  const port = Number(process.env.SEARCH_PORT) || 7001;
  const host = process.env.SEARCH_HOST || '127.0.0.1';
  const dir = process.env.SEARCH_DATA_DIR || null;
  const shard = await new Shard({ schemas, dir }).open();
  if (shard.loadInfo) console.log(`[shard] 저장된 데이터 복원 완료 (깨진 줄 ${shard.loadInfo.skipped}개 건너뜀)`);
  const server = createShardServer(shard, { key: process.env.SEARCH_KEY });
  server.listen(port, host, () => console.log(`[shard] ${host}:${port} 실행 중 ${dir ? `(저장: ${dir})` : '(메모리 전용)'}`));
  const stop = async () => { await shard.flush(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((e) => { console.error(e.message); process.exit(1); });
