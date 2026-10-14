const { HttpError } = require('../utils/errors');

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'invalid', message: '요청 형식이 올바르지 않아요' } });
  }
  console.error('[error]', err);
  return res.status(500).json({ error: { code: 'server_error', message: '서버에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요' } });
};
