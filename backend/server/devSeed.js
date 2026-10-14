// 개발용 데모 데이터 (메모리 DB + DEMO_SEED=1 일 때만). Firebase 없이 화면을 바로 써 볼 수 있다.
const db = require('./db');
const col = require('./db/collections');
const authService = require('./services/authService');
const shopService = require('./services/shopService');
const config = require('./config');
const indexer = require('./search/indexer');
const userService = require('./services/userService');

const ACCOUNTS = [
  { username: 'owner', password: 'owner1234', name: '제작자', role: 'owner' },
  { username: 'manager', password: 'manager1234', name: '관리자', role: 'manager' },
  { username: 'admin', password: 'admin1234', name: '어드민', role: 'admin' },
  { username: 'miner', password: 'miner1234', name: '광부', role: 'member', points: 500, stones: 130 },
  { username: 'miner2', password: 'miner1234', name: '광부둘', role: 'member', points: 0, stones: 640 },
];

async function seedDemo() {
  for (const a of ACCOUNTS) {
    const u = await authService.createUser(a, a.role);
    if (a.points || a.stones) {
      await db.update(col.USERS, u.id, { points: a.points || 0, stones: a.stones || 0 });
      await indexer.syncUser(await userService.getById(u.id));
    }
  }
  await shopService.createSite({ name: '데모 사이트', description: '입장권 테스트용', url: `http://localhost:${config.port}/`, price: 100 });
  console.log('[seed] 데모 계정: owner/owner1234, manager/manager1234, admin/admin1234, miner/miner1234, miner2/miner1234');
}

module.exports = { seedDemo };
