'use strict';
// 한글 분해(자모) · 초성 추출 · 색인용 term 생성. 외부 의존성 없음.
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
// 겹모음/겹받침은 홑자모 두 개로 풀어서, 타이핑 도중("값"→"갑"→"가")에도 앞부분이 맞게 한다.
const SPLIT = {
  ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ', ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅢ: 'ㅡㅣ',
  ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ',
};
const S_BASE = 0xAC00;
const S_END = 0xD7A3;

const MAX_JAM = 600; // 색인할 자모 길이 상한 (긴 메시지 보호)
const MAX_CHO = 12;

const normalize = (s) => String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, '');

function decompose(str) {
  let out = '';
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c >= S_BASE && c <= S_END) {
      const i = c - S_BASE;
      const jong = JONG[i % 28];
      const jung = JUNG[Math.floor((i % 588) / 28)];
      out += CHO[Math.floor(i / 588)] + (SPLIT[jung] || jung) + (jong ? (SPLIT[jong] || jong) : '');
    } else {
      out += SPLIT[ch] || ch;
    }
  }
  return out;
}

function choseong(str) {
  let out = '';
  for (const ch of str) {
    const c = ch.codePointAt(0);
    out += c >= S_BASE && c <= S_END ? CHO[Math.floor((c - S_BASE) / 588)] : ch;
  }
  return out;
}

const trigrams = (s) => {
  const out = new Set();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
};

/** 문서(필드 값들)의 색인 term. 'p1/p2'=1·2자 접두, 't'=자모 3-gram, 'c/cb/ct'=초성 접두/2-gram/3-gram */
function docTerms(fields) {
  const terms = new Set();
  for (const { jam, cho } of fields) {
    if (jam.length >= 1) terms.add(`p1:${jam[0]}`);
    if (jam.length >= 2) terms.add(`p2:${jam.slice(0, 2)}`);
    for (const g of trigrams(jam)) terms.add(`t:${g}`);
    if (cho) {
      for (let k = 1; k <= Math.min(6, cho.length); k++) terms.add(`c:${cho.slice(0, k)}`);
      for (let i = 0; i + 2 <= cho.length; i++) terms.add(`cb:${cho.slice(i, i + 2)}`);
      for (const g of trigrams(cho)) terms.add(`ct:${g}`);
    }
  }
  return terms;
}

function analyzeField(raw, withChoseong) {
  const n = normalize(raw);
  return { jam: decompose(n).slice(0, MAX_JAM), cho: withChoseong ? choseong(n).slice(0, MAX_CHO) : '' };
}

// ---- 두벌식 자판 변환: 한/영 상태를 잘못 두고 친 검색어를 구해 준다 ("alswns" ↔ "민준") ----
const KEY_TO_JAMO = {
  q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
  a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
  z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
  Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ', // Shift 를 누른 자모
};
const JAMO_TO_KEY = Object.fromEntries(Object.entries(KEY_TO_JAMO).map(([k, v]) => [v, k.toLowerCase()]));
const MIN_SWAP = 3; // 이보다 짧은 질의는 변환하지 않는다 (엉뚱한 결과가 섞이는 걸 막기)

// 영문 자판으로 친 글자 → 자모 문자열. 이 문자열은 decompose("민준") 과 같은 모양이라 그대로 비교할 수 있다.
const englishKeysToJamo = (raw) => [...raw].map((c) => KEY_TO_JAMO[c] || KEY_TO_JAMO[c.toLowerCase()] || c).join('');
// 한글로 친 글자 → 영문 자판 글자열 (한글 모드로 영어를 친 경우)
const jamoToEnglishKeys = (jam) => [...jam].map((c) => JAMO_TO_KEY[c] || c).join('');

const hasJamo = (s) => /[ㄱ-ㅣ가-힣]/.test(s);

/** 자모 문자열(jam)에서 후보 찾기 계획을 만든다 */
function pathsFor(jam, fuzzy) {
  if (jam.length >= 3) {
    const terms = [...trigrams(jam)].map((g) => `t:${g}`);
    const minHits = fuzzy && jam.length >= 5 ? Math.max(1, Math.ceil(terms.length * 0.5)) : terms.length;
    return [{ terms, minHits }];
  }
  return [{ terms: [`${jam.length === 2 ? 'p2' : 'p1'}:${jam}`], minHits: 1 }];
}

/**
 * 질의 분석. 초성만 입력했는지(choOnly)에 따라 초성 경로도 함께 탄다.
 * alts: 자판을 잘못 눌렀을 가능성에 대한 대체 질의들 (점수에 penalty 를 곱한다)
 */
function analyzeQuery(q, { fuzzy = true, choseong: useCho = true } = {}) {
  const raw = normalize(q);
  if (!raw) return null;
  const jam = decompose(raw).slice(0, MAX_JAM);
  const choOnly = useCho && [...raw].every((c) => CHO.includes(c));
  const paths = pathsFor(jam, fuzzy);
  if (choOnly) {
    const c = raw.slice(0, MAX_CHO);
    if (c.length >= 3) paths.push({ terms: [...trigrams(c)].map((g) => `ct:${g}`), minHits: trigrams(c).size });
    else paths.push({ terms: [`${c.length === 2 ? 'cb' : 'c'}:${c}`], minHits: 1 });
  }

  const alts = [];
  const compact = String(q ?? '').replace(/\s+/g, '');
  if (/^[A-Za-z]+$/.test(compact) && compact.length >= MIN_SWAP) {
    // "alswns" → 자모 "ㅁㅣㄴㅈㅜㄴ" (= 민준)
    const aj = englishKeysToJamo(compact).slice(0, MAX_JAM);
    alts.push({ raw: aj, jam: aj, choOnly: false, paths: pathsFor(aj, fuzzy), penalty: ALT_PENALTY });
  } else if (!/[A-Za-z]/.test(compact) && hasJamo(compact) && jam.length >= MIN_SWAP) {
    // "ㅡㅑㅜㅓㅕㅜ" → "minjun"
    const en = normalize(jamoToEnglishKeys(jam)).slice(0, MAX_JAM);
    if (en !== jam) alts.push({ raw: en, jam: en, choOnly: false, paths: pathsFor(en, fuzzy), penalty: ALT_PENALTY });
  }
  return { raw, jam, choOnly, paths, alts, penalty: 1 };
}

const ALT_PENALTY = 0.95; // 원래 질의로 맞은 결과가 자판 변환으로 맞은 결과보다 앞에 오게

module.exports = { normalize, decompose, choseong, trigrams, docTerms, analyzeField, analyzeQuery, englishKeysToJamo, jamoToEnglishKeys, MAX_JAM, MAX_CHO };
