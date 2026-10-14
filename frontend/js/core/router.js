import { ROUTES } from '../routes.js';
import { can } from './store.js';
import { toast } from './toast.js';
import { clear } from './dom.js';

let root = null;
let cleanup = null;
let seq = 0;

export const navigate = (path) => { location.hash = `#${path}`; };
export const back = (fallback = '/') => {
  if (history.length > 1) history.back();
  else navigate(fallback);
};

function match(path) {
  for (const r of ROUTES) {
    const names = [];
    const re = new RegExp(`^${r.path.replace(/:([a-zA-Z]+)/g, (_, n) => { names.push(n); return '([^/]+)'; })}$`);
    const m = path.match(re);
    if (m) return { route: r, params: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

async function render() {
  const mySeq = ++seq;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  const path = (location.hash.slice(1) || '/').split('?')[0];
  const found = match(path);
  if (!found) return navigate('/');
  if (found.route.perm && !can(found.route.perm)) {
    toast('이 화면은 쓸 수 없어요');
    return navigate('/');
  }
  clear(root);
  window.scrollTo(0, 0);
  const mod = await found.route.load();
  if (mySeq !== seq) return undefined; // 로딩 중에 다른 화면으로 이동함
  const result = await mod.mount({ root, params: found.params, navigate });
  if (mySeq !== seq) { if (typeof result === 'function') result(); return undefined; }
  cleanup = typeof result === 'function' ? result : null;
  return undefined;
}

export function startRouter(el) {
  root = el;
  window.addEventListener('hashchange', render);
  render();
}

export function stopRouter() {
  window.removeEventListener('hashchange', render);
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  seq++;
}
