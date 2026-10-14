import { api, tokenStore, setInvalidTokenHandler } from './core/api.js';
import { store } from './core/store.js';
import { startRouter, stopRouter } from './core/router.js';
import { connectSocket, disconnectSocket, on } from './core/socket.js';
import { refreshMe, logout } from './core/session.js';
import { renderLogin } from './screens/login.js';
import { toast } from './core/toast.js';

const app = document.getElementById('app');
let offMeUpdated = null;

function showLogin() {
  stopRouter();
  disconnectSocket();
  if (offMeUpdated) { offMeUpdated(); offMeUpdated = null; }
  store.set({ me: null });
  renderLogin(app, { onDone: ({ token, user }) => { tokenStore.set(token); location.hash = '#/'; enter(user); } });
}

function enter(user) {
  store.set({ me: user });
  if (!user.isAnonymous) {
    connectSocket(tokenStore.get());
    // 포인트를 받는 등 내 정보가 바뀌면 서버가 알려준다
    offMeUpdated = on('me:updated', () => refreshMe().catch(() => {}));
  }
  startRouter(app);
}

async function boot() {
  if (!tokenStore.get()) return showLogin();
  try {
    const { user } = await api.get('/me');
    return enter(user);
  } catch {
    tokenStore.clear();
    return showLogin();
  }
}

setInvalidTokenHandler(() => { toast('로그인이 만료됐어요', 'error'); logout(); });
window.addEventListener('ieum:logout', showLogin);
boot();
