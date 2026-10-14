import { api, tokenStore } from './api.js';
import { store } from './store.js';

export async function refreshMe() {
  const { user } = await api.get('/me');
  store.set({ me: user });
  return user;
}

// main.js 가 'ieum:logout' 을 듣고 로그인 화면으로 돌려보낸다
export function logout() {
  tokenStore.clear();
  window.dispatchEvent(new Event('ieum:logout'));
}
