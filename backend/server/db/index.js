// 서비스들은 이 파일만 import 해서 DB를 쓴다. 어댑터는 init()/use() 로 정해진다.
let adapter = null;

const current = () => {
  if (!adapter) throw new Error('DB가 초기화되지 않았어요: db.init() 먼저 호출해 줘');
  return adapter;
};

function init() {
  if (adapter) return adapter;
  const config = require('../config');
  if (config.useMemoryDb) {
    const { MemoryDb } = require('./memoryAdapter');
    adapter = new MemoryDb();
    if (!config.isTest) console.warn('[db] 메모리 DB 사용 중 — 서버를 끄면 데이터가 사라져요 (개발 전용)');
  } else {
    adapter = require('./firestoreAdapter').createFirestoreDb();
  }
  return adapter;
}

const use = (a) => { adapter = a; };

module.exports = {
  init,
  use,
  get: (...a) => current().get(...a),
  set: (...a) => current().set(...a),
  update: (...a) => current().update(...a),
  delete: (...a) => current().delete(...a),
  list: (...a) => current().list(...a),
  transaction: (...a) => current().transaction(...a),
};
