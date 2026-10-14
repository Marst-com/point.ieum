// 앱 전체에서 같이 쓰는 상태 (지금은 내 정보 하나뿐)
const state = { me: null };
const subs = new Set();

export const store = {
  get state() { return state; },
  set(patch) {
    Object.assign(state, patch);
    subs.forEach((fn) => fn(state));
  },
  subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};

export const can = (perm) => !!state.me && state.me.permissions.includes(perm);
