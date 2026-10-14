'use strict';
// FNV-1a 32bit — 같은 id 는 언제나 같은 샤드로 간다.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
module.exports = { fnv1a };
