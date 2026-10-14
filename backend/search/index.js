'use strict';
// 검색 엔진 진입점. 샤드를 같은 프로세스에 둘 수도 있고(LOCAL), 다른 서버의 샤드 노드를 쓸 수도 있다(REMOTE).
const path = require('path');
const { Shard } = require('./engine/shard');
const { RemoteShard } = require('./cluster/remoteShard');
const { SearchCluster } = require('./cluster/cluster');

async function createSearch({ schemas, nodes = [], key = '', localShards = 1, dataDir = null, timeoutMs = 2000 }) {
  let shards;
  if (nodes.length) {
    shards = nodes.map((url) => new RemoteShard(url, { key, timeoutMs }));
  } else {
    shards = [];
    for (let i = 0; i < Math.max(1, localShards); i++) {
      shards.push(await new Shard({ schemas, dir: dataDir ? path.join(dataDir, `shard-${i}`) : null }).open());
    }
  }
  const cluster = new SearchCluster(shards);
  return { cluster, close: () => cluster.close() };
}

module.exports = { createSearch, SearchCluster, Shard, RemoteShard };
