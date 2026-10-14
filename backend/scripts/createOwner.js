// 사용법: node scripts/createOwner.js <아이디> <비밀번호> [이름]
// 제작자(owner) 계정을 만든다. 이미 있는 아이디면 제작자로 승격한다.
const db = require('../server/db');
const authService = require('../server/services/authService');
const userService = require('../server/services/userService');
const search = require('../server/search/client');

(async () => {
  const [username, password, name] = process.argv.slice(2);
  if (!username || !password) {
    console.error('사용법: node scripts/createOwner.js <아이디> <비밀번호> [이름]');
    process.exit(1);
  }
  db.init();
  await search.init();
  const existing = await userService.getByUsername(username);
  if (existing) {
    await userService.applyRole(existing.id, 'owner', { allowOwnerChange: true });
    console.log(`'${existing.username}' 계정을 제작자로 승격했어요`);
  } else {
    const u = await authService.createUser({ username, password, name }, 'owner');
    console.log(`제작자 계정 '${u.username}' 을(를) 만들었어요`);
  }
  process.exit(0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
