const { E } = require('./errors');

function str(v, { field = '값', min = 1, max = 100, trim = true } = {}) {
  if (typeof v !== 'string') throw E.badRequest(`${field} 값을 확인해 주세요`);
  const s = trim ? v.trim() : v;
  if (s.length < min || s.length > max) {
    throw E.badRequest(min === max ? `${field}: ${min}자로 입력해 주세요` : `${field}: ${min}~${max}자로 입력해 주세요`);
  }
  return s;
}

function optionalStr(v, opts = {}) {
  if (v == null || v === '') return opts.fallback ?? '';
  return str(v, { min: 0, ...opts });
}

function int(v, { field = '숫자', min = -Infinity, max = Infinity } = {}) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw E.badRequest(`${field} 값을 확인해 주세요`);
  }
  return n;
}

function oneOf(v, list, field = '값') {
  if (!list.includes(v)) throw E.badRequest(`${field} 값을 확인해 주세요`);
  return v;
}

function httpUrl(v, field = '주소') {
  const s = str(v, { field, max: 500 });
  let u;
  try { u = new URL(s); } catch { throw E.badRequest(`${field}이 올바르지 않아요`); }
  if (!['http:', 'https:'].includes(u.protocol)) throw E.badRequest(`${field}: http(s)로 시작해야 해요`);
  return u.toString();
}

module.exports = { str, optionalStr, int, oneOf, httpUrl };
