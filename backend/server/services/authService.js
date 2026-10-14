const crypto = require('crypto');
const { promisify } = require('util');
const db = require('../db');
const { USERS, USERNAMES } = require('../db/collections');
const tokens = require('../utils/tokens');
const userService = require('./userService');
const { E } = require('../utils/errors');
const { str } = require('../utils/validate');
const { newId } = require('../utils/ids');
const indexer = require('../search/indexer');
const col = require('../db/collections');
const { accountProjection } = require('../shared/projections');

const scrypt = promisify(crypto.scrypt);
const KEYLEN = 64;
const DUMMY_HASH = `${'00'.repeat(16)}:${'00'.repeat(KEYLEN)}`; // 없는 아이디도 같은 시간이 걸리게

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, KEYLEN);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

async function verifyPassword(pw, stored) {
  const [s, h] = String(stored).split(':');
  if (!s || !h) return false;
  const hash = await scrypt(pw, Buffer.from(s, 'hex'), KEYLEN);
  const expected = Buffer.from(h, 'hex');
  return expected.length === hash.length && crypto.timingSafeEqual(hash, expected);
}

function parseCredentials({ username, password, name }) {
  const uname = str(username, { field: '아이디', min: 3, max: 20 }).toLowerCase();
  if (!/^[a-z0-9_]+$/.test(uname)) throw E.badRequest('아이디는 영문 소문자, 숫자, _ 만 쓸 수 있어요');
  const pw = str(password, { field: '비밀번호', min: 6, max: 64, trim: false });
  const display = name == null || name === '' ? uname : str(name, { field: '이름', min: 1, max: 20 });
  return { uname, pw, display };
}

// 내부용: role 을 지정할 수 있다 (회원가입 API 는 항상 member). 제작자 생성 스크립트에서도 사용.
async function createUser(input, role = 'member') {
  const { uname, pw, display } = parseCredentials(input);
  const id = newId();
  const passHash = await hashPassword(pw);
  await db.transaction(async (tx) => {
    if (await tx.get(USERNAMES, uname)) throw E.conflict('이미 사용 중인 아이디예요', 'username_taken');
    const data = {
      username: uname, name: display, passHash, role,
      points: 0, stones: 0, friendCount: 0, createdAt: Date.now(),
    };
    tx.set(USERNAMES, uname, { uid: id });
    tx.set(USERS, id, data);
    tx.set(col.SHARED_ACCOUNTS, id, { ...accountProjection(data), updatedAt: data.createdAt }); // 다른 시스템이 읽는 복사본
  });
  const user = await userService.getById(id);
  await indexer.syncUser(user);
  return user;
}

async function register(input) {
  const user = await createUser(input, 'member');
  return { token: tokens.signUserToken(user.id), user: userService.toMe(user) };
}

async function login({ username, password }) {
  const uname = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const pw = typeof password === 'string' ? password : '';
  const user = uname ? await userService.getByUsername(uname) : null;
  const ok = await verifyPassword(pw, user ? user.passHash : DUMMY_HASH);
  if (!user || !ok) throw E.unauthorized('아이디 또는 비밀번호가 맞지 않아요', 'bad_credentials');
  return { token: tokens.signUserToken(user.id), user: userService.toMe(user) };
}

function guest() {
  const id = `guest_${newId()}`;
  return { token: tokens.signGuestToken(id), user: userService.toMe(guestUser(id)) };
}

// 익명(게스트)은 DB에 저장하지 않는다.
const guestUser = (id) => ({ id, name: '익명', role: 'guest', isAnonymous: true });

async function userFromToken(token) {
  const { id, isGuest } = tokens.verifyAuthToken(token);
  if (isGuest) return guestUser(id);
  const user = await userService.getById(id);
  if (!user) throw E.unauthorized('계정을 찾을 수 없어요. 다시 로그인해 주세요', 'invalid_token');
  return user;
}

module.exports = { createUser, register, login, guest, userFromToken, hashPassword, verifyPassword };
