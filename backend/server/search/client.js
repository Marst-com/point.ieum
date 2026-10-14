// 검색 엔진(클러스터) 하나를 서버 전체가 같이 쓴다.
const config = require('../config');
const { createSearch } = require('../../search');
const schemas = require('../../search/schema');

let handle = null;

async function init() {
  if (handle) return handle.cluster;
  const { nodes, key } = config.search;
  if (nodes.length && !key) throw new Error('SEARCH_NODES 를 쓰려면 SEARCH_KEY 도 필요해요');
  handle = await createSearch({ schemas, ...config.search });
  return handle.cluster;
}

const get = () => {
  if (!handle) throw new Error('검색 엔진이 아직 시작되지 않았어요: search.init() 먼저 호출해 줘');
  return handle.cluster;
};

const close = async () => { if (handle) { await handle.close(); handle = null; } };

module.exports = { init, get, close };
