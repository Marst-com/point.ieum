// 프론트 정적 검사 (브라우저 없이):
//  1) 모든 JS 모듈 문법 검사  2) import 경로/이름이 실제로 존재하는지  3) JS 에서 쓰는 CSS 클래스가 css 에 있는지
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PUB = path.join(__dirname, '..', '..', 'frontend');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(path.join(PUB, 'js')).filter((f) => f.endsWith('.js'));
let errors = 0;
const fail = (m) => { errors++; console.error('✗', m); };

// 1) 문법
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chk-'));
for (const f of files) {
  const t = path.join(tmp, `${path.basename(f, '.js')}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.copyFileSync(f, t);
  const r = spawnSync(process.execPath, ['--check', t], { encoding: 'utf8' });
  if (r.status !== 0) fail(`문법 오류 ${path.relative(PUB, f)}\n${r.stderr}`);
}

// 2) import/export
const exportsOf = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) m[1].split(',').forEach((n) => names.add(n.trim().split(/\s+as\s+/).pop()));
  return names;
};
const resolveImp = (from, spec) => path.join(path.dirname(from), spec);
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(PUB, f);
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)) {
    const target = resolveImp(f, m[2]);
    if (!fs.existsSync(target)) { fail(`${rel}: 없는 파일 import '${m[2]}'`); continue; }
    const ex = exportsOf(fs.readFileSync(target, 'utf8'));
    for (const name of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
      if (!ex.has(name)) fail(`${rel}: '${m[2]}' 에 export '${name}' 없음`);
    }
  }
  for (const m of src.matchAll(/import\('([^']+)'\)/g)) {
    const target = resolveImp(f, m[1]);
    if (!fs.existsSync(target)) { fail(`${rel}: 없는 파일 dynamic import '${m[1]}'`); continue; }
    if (/screens\//.test(m[1]) && !/export\s+(async\s+)?function\s+mount/.test(fs.readFileSync(target, 'utf8'))) fail(`${m[1]}: mount() export 없음`);
  }
}

// 3) CSS 클래스
const css = walk(path.join(PUB, 'css')).filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const DYNAMIC_OK = /^(grade--[FEDCBAS]|rank--\d+|delta--(plus|minus)|toast--.*|pill--.*|btn--.*)$/;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/class:\s*'([^']*)'/g)) {
    for (const c of m[1].split(/\s+/).filter(Boolean)) {
      if (!defined.has(c) && !DYNAMIC_OK.test(c)) fail(`${path.relative(PUB, f)}: CSS 에 없는 클래스 '${c}'`);
    }
  }
}

// 3.5) 배포 설정: index.html 이 config.js 를 먼저 읽고, socket.io 스크립트를 고정 주소로 박아 두지 않았는지
{
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  const cfgAt = html.indexOf('src="/config.js"');
  const mainAt = html.indexOf('src="/js/main.js"');
  if (cfgAt < 0 || mainAt < 0 || cfgAt > mainAt) fail('index.html: config.js 가 main.js 보다 먼저 로드돼야 해요');
  if (html.includes('/socket.io/socket.io.js')) fail('index.html: socket.io 스크립트를 고정 주소로 넣으면 프론트를 따로 배포할 수 없어요 (socket.js 가 API_BASE 기준으로 불러와요)');
  const cfg = path.join(PUB, 'config.js');
  if (!fs.existsSync(cfg) || !/window\.IEUM_CONFIG\s*=/.test(fs.readFileSync(cfg, 'utf8'))) fail('config.js: window.IEUM_CONFIG 가 없어요');
  const api = fs.readFileSync(path.join(PUB, 'js/core/api.js'), 'utf8');
  if (/fetch\(\s*[`'"]\/api/.test(api)) fail('api.js: fetch 주소가 /api 로 고정돼 있어요 (apiUrl 을 써야 해요)');
}

// 4) 인라인 style 속성 금지 (CSP)
for (const f of [...files, path.join(PUB, 'index.html')]) {
  const src = fs.readFileSync(f, 'utf8');
  if (/\bstyle\s*=\s*"/.test(src) || /setAttribute\(\s*'style'/.test(src)) fail(`${path.relative(PUB, f)}: 인라인 style 속성은 CSP 에 막혀요`);
}

console.log(errors ? `\n${errors}개 문제 발견` : `프론트 검사 통과 (JS ${files.length}개)`);
process.exit(errors ? 1 : 0);
