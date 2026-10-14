import { h, clear } from '../core/dom.js';
import { api } from '../core/api.js';
import { toast, toastError } from '../core/toast.js';
import { screenHeader } from '../components/header.js';
import { tabs } from '../components/tabs.js';
import { searchBox } from '../components/searchBox.js';
import { userRow } from '../components/userRow.js';
import { emptyState, loadingBlock } from '../components/emptyState.js';
import { confirmModal } from '../components/modal.js';

export async function mount({ root, navigate }) {
  const host = h('div', {});
  let tab = 'mine';

  const openDm = async (u) => {
    try { const { room } = await api.post('/chat/dm', { username: u.username }); navigate(`/chat/${room.id}`); } catch (e) { toastError(e); }
  };

  async function showMine() {
    clear(host).append(loadingBlock());
    try {
      const { items } = await api.get('/friends');
      clear(host).append(items.length
        ? h('ul', { class: 'list' }, items.map((u) => h('li', {}, userRow({
          user: u, showGrade: true,
          right: h('span', { class: 'btn-row' },
            h('button', { class: 'btn btn--small', onclick: () => openDm(u) }, 'DM'),
            h('button', { class: 'btn btn--small btn--secondary', 'aria-label': `${u.name} 삭제`, onclick: async () => {
              if (await confirmModal({ title: '친구를 삭제할까요?', message: `${u.name}님이 친구 목록에서 사라져요.`, confirmLabel: '삭제', danger: true })) {
                try { await api.del(`/friends/${u.id}`); toast('삭제했어요'); showMine(); } catch (e) { toastError(e); }
              }
            } }, '삭제')),
        }))))
        : emptyState('아직 친구가 없어요', '‘친구 찾기’에서 아이디로 추가해 보세요'));
    } catch (e) { toastError(e); }
  }

  async function search(q) {
    const results = h('div', {}, loadingBlock());
    host.querySelector('.results')?.replaceWith(results);
    results.className = 'results';
    try {
      const { items } = await api.get(`/friends/search?q=${encodeURIComponent(q)}`);
      clear(results).append(items.length
        ? h('ul', { class: 'list' }, items.map((u) => h('li', {}, userRow({
          user: u, showGrade: true, sub: `@${u.username} · 친구 ${u.friendCount}명`,
          right: u.isFriend
            ? h('span', { class: 'pill pill--ok' }, '친구')
            : h('button', { class: 'btn btn--small', onclick: async (e) => {
              e.currentTarget.disabled = true;
              try { await api.post('/friends', { username: u.username }); toast(`${u.name}님과 친구가 됐어요`, 'ok'); search(q); } catch (err) { toastError(err); e.currentTarget.disabled = false; }
            } }, '추가'),
        }))))
        : emptyState('찾는 사람이 없어요', '아이디나 이름을 다시 확인해 보세요'));
    } catch (e) { toastError(e); }
  }

  function showFind() {
    clear(host).append(
      h('p', { class: 'hint' }, '아이디나 이름으로 찾아요. 초성(ㅅㅌ)이나 오타, 한/영 키를 잘못 눌러도 괜찮아요. 비슷한 순서, 친구가 많은 순서로 보여줘요.'),
      searchBox({ placeholder: '아이디 또는 이름', onSearch: search }),
      h('div', { class: 'results' }));
    search('');
  }

  const setTab = (id) => { tab = id; (tab === 'mine' ? showMine : showFind)(); };
  root.append(h('div', {}, screenHeader('친구'), h('div', { class: 'screen' },
    tabs([{ id: 'mine', label: '내 친구' }, { id: 'find', label: '친구 찾기' }], tab, setTab), host)));
  showMine();
}
