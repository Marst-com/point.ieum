import { h, clear, debounce } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { on } from '../../core/socket.js';
import { toastError } from '../../core/toast.js';
import { fmtWhen } from '../../core/format.js';
import { screenHeader } from '../../components/header.js';
import { emptyState, loadingBlock } from '../../components/emptyState.js';
import { navigate } from '../../core/router.js';
import { searchBox } from '../../components/searchBox.js';

export async function mount({ root }) {
  const host = h('div', {}, loadingBlock());
  let query = '';
  root.append(h('div', {}, screenHeader('톡', {
    right: h('button', { class: 'btn btn--small', onclick: () => navigate('/chat/new') }, '새 대화'),
  }), h('div', { class: 'screen' },
    searchBox({ placeholder: '대화 내용 검색', onSearch: (q) => { query = q; load(); } }), host)));

  const roomRow = (r) => h('li', {}, h('button', { class: 'row', type: 'button', onclick: () => navigate(`/chat/${r.id}`) },
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, r.type === 'group' ? '👥' : r.title.slice(0, 1)),
    h('span', { class: 'grow' },
      h('span', { class: 'row-title ellipsis' }, r.title, r.type === 'group' ? h('span', { class: 'small muted' }, ` ${r.members.length}명`) : null),
      h('span', { class: 'room-last ellipsis' }, r.lastMessage ? `${r.lastMessage.senderName}: ${r.lastMessage.text}` : '아직 대화가 없어요')),
    h('span', { class: 'small muted' }, fmtWhen(r.lastMessageAt))));

  const hitRow = (m) => h('li', {}, h('button', { class: 'row', type: 'button', onclick: () => navigate(`/chat/${m.roomId}`) },
    h('span', { class: 'grow' },
      h('span', { class: 'row-title ellipsis' }, m.roomTitle),
      h('span', { class: 'room-last ellipsis' }, `${m.senderName}: ${m.text}`)),
    h('span', { class: 'small muted' }, fmtWhen(m.createdAt))));

  async function load() {
    try {
      if (query) {
        const { items: hits } = await api.get(`/chat/search?q=${encodeURIComponent(query)}`);
        clear(host).append(hits.length ? h('ul', { class: 'list' }, hits.map(hitRow)) : emptyState('찾는 대화가 없어요', '내가 속한 대화방에서만 찾아요'));
        return;
      }
      const { items } = await api.get('/chat/rooms');
      clear(host).append(items.length
        ? h('ul', { class: 'list' }, items.map(roomRow))
        : emptyState('대화방이 없어요', '‘새 대화’로 DM이나 단톡을 시작해 보세요'));
    } catch (e) { toastError(e); }
  }
  await load();

  const reload = debounce(load, 300);
  const offs = [on('chat:message', reload), on('chat:rooms-changed', reload)];
  return () => offs.forEach((off) => off());
}
