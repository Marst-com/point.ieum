class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const E = {
  badRequest: (message, code = 'invalid') => new HttpError(400, code, message),
  unauthorized: (message = '로그인이 필요해요', code = 'login_required') => new HttpError(401, code, message),
  forbidden: (message = '권한이 없어요') => new HttpError(403, 'forbidden', message),
  notFound: (message = '찾을 수 없어요') => new HttpError(404, 'not_found', message),
  conflict: (message, code = 'conflict') => new HttpError(409, code, message),
};

module.exports = { HttpError, E };
