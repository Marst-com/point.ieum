import { h, clear } from '../core/dom.js';
import { api } from '../core/api.js';
import { store, can } from '../core/store.js';
import { refreshMe, logout } from '../core/session.js';
import { on } from '../core/socket.js';
import { fmtNum, fmtDateTime } from '../core/format.js';
import { ROLE_LABEL, isStaffRole } from '../core/labels.js';
import { emptyState } from '../components/emptyState.js';
import { TILES } from './homeTiles.js';

function tileEl(t, hero) {
  return h('a', { class: `tile ${hero ? 'tile--hero' : ''}`, href: `#${t.to}` },
    h('span', { class: 'icon', 'aria-hidden': 'true' }, t.icon),
    h('span', {}, h('span', { class: 'name' }, t.name), h('br'), h('span', { class: 'desc' }, t.desc)));
}

function logItem(it) {
  const plus = it.delta > 0;
  return h('li', { class: 'log-item' },
    h('div', { class: 'grow' },
      h('div', { class: 'row-title ellipsis' }, it.reason),
      h('div', { class: 'small muted' }, fmtDateTime(it.createdAt), ' · 잔액 ', fmtNum(it.balance))),
    h('div', { class: `delta ${plus ? 'delta--plus' : 'delta--minus'}` }, `${plus ? '+' : ''}${fmtNum(it.delta)}`));
}

export async function mount({ root }) {
  const topbar = h('div', { class: 'topbar' });
  const pointsHost = h('div');
  const tilesHost = h('nav', { class: 'tiles', 'aria-label': '메뉴' });
  const logHost = h('div');
  root.append(h('div', { class: 'screen' }, topbar, pointsHost, tilesHost, logHost));

  const paintMe = () => {
    const me = store.state.me;
    clear(topbar).append(
      h('div', { class: 'who' },
        h('strong', {}, me.name),
        h('span', { class: `pill ${isStaffRole(me.role) ? 'pill--staff' : ''}` }, me.isAnonymous ? '익명' : ROLE_LABEL[me.role])),
      h('button', { class: 'btn btn--secondary btn--small', onclick: logout }, me.isAnonymous ? '로그인' : '로그아웃'));

    clear(pointsHost);
    if (me.isAnonymous) {
      pointsHost.append(h('div', { class: 'banner' },
        h('p', {}, '익명으로 둘러보는 중이에요. 로그인하면 일하기·톡·친구를 쓸 수 있어요.'),
        h('button', { class: 'btn btn--small', onclick: logout }, '로그인하러 가기')));
    } else {
      pointsHost.append(h('div', { class: 'points-card' },
        h('div', { class: 'label' }, '내 포인트'),
        h('div', { class: 'value' }, fmtNum(me.points), h('small', {}, 'P'))));
    }

    clear(tilesHost);
    TILES.filter((t) => can(t.perm)).forEach((t, i) => tilesHost.append(tileEl(t, i === 0)));
  };

  let alive = true;
  async function paintLog() {
    if (!can('points.view')) return;
    try {
      const { items } = await api.get('/me/points');
      if (!alive) return;
      clear(logHost).append(h('h2', {}, '포인트 내역'),
        items.length
          ? h('ul', { class: 'list card' }, items.slice(0, 20).map(logItem))
          : emptyState('아직 내역이 없어요', '포인트를 받거나 쓰면 여기에 쌓여요'));
    } catch { /* 홈 화면은 내역이 없어도 쓸 수 있다 */ }
  }

  paintMe();
  paintLog();
  const unsubStore = store.subscribe(paintMe);
  const offUpdated = on('me:updated', paintLog);
  refreshMe().catch(() => {});
  return () => { alive = false; unsubStore(); offUpdated(); };
}
