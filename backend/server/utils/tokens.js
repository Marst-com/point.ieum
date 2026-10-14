const jwt = require('jsonwebtoken');
const config = require('../config');
const { E } = require('./errors');

const sign = (payload, opts) => jwt.sign(payload, config.jwtSecret, { algorithm: 'HS256', ...opts });

function verify(token, opts = {}) {
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], ...opts });
  } catch {
    throw E.unauthorized('로그인이 만료됐어요. 다시 로그인해 주세요', 'invalid_token');
  }
}

module.exports = {
  signUserToken: (uid) => sign({ sub: uid, typ: 'user' }, { expiresIn: config.tokenTtl }),
  signGuestToken: (gid) => sign({ sub: gid, typ: 'guest' }, { expiresIn: config.guestTokenTtl }),
  verifyAuthToken(token) {
    const p = verify(token);
    if (p.typ !== 'user' && p.typ !== 'guest') throw E.unauthorized('잘못된 토큰이에요', 'invalid_token');
    return { id: p.sub, isGuest: p.typ === 'guest' };
  },
  signEntryToken: (user, siteId) =>
    sign({ sub: user.id, username: user.username, name: user.name, typ: 'entry' }, { expiresIn: config.entryTokenTtl, audience: siteId }),
  verifyEntryToken(token, siteId) {
    const p = verify(token, { audience: siteId });
    if (p.typ !== 'entry') throw E.unauthorized('잘못된 입장 토큰이에요', 'invalid_token');
    return { id: p.sub, username: p.username, name: p.name };
  },
};
