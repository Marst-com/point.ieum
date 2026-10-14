// socket.io 클라이언트 얇은 래퍼. 화면들은 on()/emit() 만 쓴다.
import { API_BASE } from './config.js';

const registry = new Map(); // event -> Set(fn)
let sock = null;

// socket.io 클라이언트는 백엔드가 내려주는 스크립트를 필요할 때 불러온다 (프론트를 따로 올려도 동작하도록)
let loading = null;
function loadClient() {
  if (typeof window.io === 'function') return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = `${API_BASE}/socket.io/socket.io.js`;
      el.onload = resolve;
      el.onerror = () => reject(new Error('실시간 연결 스크립트를 불러오지 못했어요'));
      document.head.append(el);
    }).catch((e) => { loading = null; throw e; });
  }
  return loading;
}

let epoch = 0; // 연결하는 사이에 로그아웃 등이 일어나면 이전 연결 시도를 버린다

export async function connectSocket(token) {
  disconnectSocket();
  const mine = epoch;
  try { await loadClient(); } catch { return; }
  if (mine !== epoch) return;
  sock = window.io(API_BASE || window.location.origin, { auth: { token } });
  sock.onAny((event, ...args) => registry.get(event)?.forEach((fn) => fn(...args)));
}

export function disconnectSocket() {
  epoch++;
  if (sock) sock.close();
  sock = null;
}

export function on(event, fn) {
  if (!registry.has(event)) registry.set(event, new Set());
  registry.get(event).add(fn);
  return () => registry.get(event)?.delete(fn);
}

export const isConnected = () => !!sock && sock.connected;

export function emit(event, data) {
  return new Promise((resolve, reject) => {
    if (!isConnected()) return reject(new Error('not_connected'));
    return sock.timeout(8000).emit(event, data, (err, res) => (err ? reject(err) : resolve(res)));
  });
}
