import { h, clear } from '../core/dom.js';
import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { logout } from '../core/session.js';
import { toast, toastError } from '../core/toast.js';
import { fmtNum } from '../core/format.js';
import { screenHeader } from '../components/header.js';
import { emptyState, loadingBlock } from '../components/emptyState.js';
import { openModal, confirmModal } from '../components/modal.js';
import { searchBox } from '../components/searchBox.js';

export async function mount({ root }) {
  const me = () => store.state.me;
  const listHost = h('div', {}, loadingBlock());
  let query = '';
  const pointsEl = h('span', { class: 'pill pill--ok' });
  const paintPoints = () => { pointsEl.textContent = me().isAnonymous ? '익명' : `${fmtNum(me().points)}P`; };
  paintPoints();
  root.append(h('div', {}, screenHeader('상점', { right: pointsEl }), h('div', { class: 'screen' },
    me().isAnonymous ? h('div', { class: 'banner' }, h('p', {}, '입장권을 사려면 로그인이 필요해요.')) : null,
    searchBox({ placeholder: '사이트 검색 (초성도 돼요)', onSearch: (q) => { query = q; load(); } }), listHost)));

  function loginPrompt() {
    const m = openModal({
      title: '로그인이 필요해요', body: h('p', {}, '익명으로는 들어갈 수 없어요. 로그인하고 다시 눌러 주세요.'),
      actions: [
        h('button', { class: 'btn btn--secondary grow', onclick: () => m.close() }, '닫기'),
        h('button', { class: 'btn grow', onclick: () => { m.close(); logout(); } }, '로그인'),
      ],
    });
  }

  async function buy(site) {
    const ok = await confirmModal({
      title: '입장권을 살까요?',
      message: `${site.name} 입장권은 ${fmtNum(site.price)}P예요. 지금 포인트는 ${fmtNum(me().points)}P예요.`,
      confirmLabel: `${fmtNum(site.price)}P로 사기`,
    });
    if (!ok) return;
    try {
      const r = await api.post(`/shop/sites/${site.id}/buy`);
      store.set({ me: { ...me(), points: r.points } });
      paintPoints();
      toast('입장권을 샀어요', 'ok');
    } catch (e) { toastError(e); }
    await load();
  }

  async function enter(site) {
    try {
      const r = await api.post(`/shop/sites/${site.id}/enter`);
      if (r.result === 'login_required') return loginPrompt();
      if (r.result === 'not_purchased') { toast('입장권을 먼저 사야 해요', 'error'); return load(); } // 이 페이지에 그대로 남는다
      if (r.result === 'ok') { window.location.assign(r.url); return undefined; }
    } catch (e) { toastError(e); }
    return undefined;
  }

  function card(site) {
    const anon = me().isAnonymous;
    let action;
    if (site.owned) action = h('button', { class: 'btn', onclick: () => enter(site) }, '들어가기');
    else if (anon) action = h('button', { class: 'btn', onclick: () => enter(site) }, '들어가기');
    else action = h('button', { class: 'btn btn--ok', onclick: () => buy(site) }, '입장권 사기');
    return h('li', { class: 'card site-card' },
      h('div', { class: 'top' },
        h('div', { class: 'grow' }, h('h2', {}, site.name), site.description ? h('p', { class: 'muted' }, site.description) : null),
        h('div', { class: 'price' }, site.price ? `${fmtNum(site.price)}P` : '무료')),
      h('div', { class: 'btn-row' }, site.owned ? h('span', { class: 'pill pill--ok' }, '입장권 있음') : null, action));
  }

  async function load() {
    try {
      const { items } = await api.get(`/shop/sites?q=${encodeURIComponent(query)}`);
      clear(listHost).append(items.length
        ? h('ul', { class: 'list' }, items.map(card))
        : query
          ? emptyState('찾는 사이트가 없어요', '다른 말로 검색해 보세요')
          : emptyState('아직 열린 사이트가 없어요', '관리자가 사이트를 추가하면 여기에 보여요'));
    } catch (e) { toastError(e); }
  }
  await load();
}
