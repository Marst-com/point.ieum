// 운영용 Firestore 어댑터 (firebase-admin). 백엔드만 DB에 접근한다.
const fs = require('fs');

const strip = ({ id, ...rest }) => rest; // eslint-disable-line no-unused-vars

function loadCredential(admin) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return admin.credential.applicationDefault(); // GOOGLE_APPLICATION_CREDENTIALS 사용
  const json = raw.trim().startsWith('{') ? raw : fs.readFileSync(raw, 'utf8');
  return admin.credential.cert(JSON.parse(json));
}

class FirestoreDb {
  constructor(firestore) {
    this.fs = firestore;
  }

  ref(col, id) {
    return this.fs.collection(col).doc(id);
  }

  async get(col, id) {
    const s = await this.ref(col, id).get();
    return s.exists ? { id: s.id, ...s.data() } : null;
  }

  async set(col, id, data) {
    await this.ref(col, id).set(strip(data));
  }

  async update(col, id, patch) {
    await this.ref(col, id).update(strip(patch));
  }

  async delete(col, id) {
    await this.ref(col, id).delete();
  }

  async list(col, { where = [], orderBy, desc = false, limit } = {}) {
    let q = this.fs.collection(col);
    for (const [f, op, v] of where) q = q.where(f, op, v);
    if (orderBy) q = q.orderBy(orderBy, desc ? 'desc' : 'asc');
    if (limit) q = q.limit(limit);
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  // Firestore 트랜잭션: 읽기를 모두 끝낸 뒤에 쓰기를 해야 한다.
  transaction(fn) {
    return this.fs.runTransaction(async (t) => {
      const tx = {
        get: async (c, i) => {
          const s = await t.get(this.ref(c, i));
          return s.exists ? { id: s.id, ...s.data() } : null;
        },
        set: (c, i, d) => { t.set(this.ref(c, i), strip(d)); },
        update: (c, i, p) => { t.update(this.ref(c, i), strip(p)); },
        delete: (c, i) => { t.delete(this.ref(c, i)); },
      };
      return fn(tx);
    });
  }
}

function createFirestoreDb() {
  const admin = require('firebase-admin'); // 메모리 DB 모드에서는 로드하지 않는다
  if (!admin.apps.length) admin.initializeApp({ credential: loadCredential(admin) });
  const firestore = admin.firestore();
  firestore.settings({ ignoreUndefinedProperties: true });
  return new FirestoreDb(firestore);
}

module.exports = { FirestoreDb, createFirestoreDb };
