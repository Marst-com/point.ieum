import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { toast, toastError } from '../../core/toast.js';
import { screenHeader } from '../../components/header.js';
import { tabs } from '../../components/tabs.js';
import { userRow } from '../../components/userRow.js';
import { emptyState } from '../../components/emptyState.js';

export async function mount({ root, navigate }) {
  const host = h('div', {});
  root.append(h('div', {}, screenHeader('새 대화', { backTo: '/chat' }), h('div', { class: 'screen' },
    tabs([{ id: 'dm', label: 'DM' }, { id: 'group', label: '단톡 만들기' }], 'dm', (id) => (id === 'dm' ? showDm() : showGroup())), host)));

  let friends = [];
  try { friends = (await api.get('/friends')).items; } catch { /* 친구 목록 없이도 아이디로 시작할 수 있다 */ }

  async function startDm(username) {
    try { const { room } = await api.post('/chat/dm', { username }); navigate(`/chat/${room.id}`); } catch (e) { toastError(e); }
  }

  function showDm() {
    const input = h('input', { class: 'input', placeholder: '상대 아이디', autocapitalize: 'none', 'aria-label': '상대 아이디' });
    clear(host).append(
      h('form', { class: 'field', onsubmit: (e) => { e.preventDefault(); startDm(input.value.trim()); } },
        h('label', {}, '아이디로 시작'), input, h('button', { class: 'btn', type: 'submit' }, 'DM 시작')),
      h('h2', {}, '친구'),
      friends.length
        ? h('ul', { class: 'list' }, friends.map((u) => h('li', {}, userRow({ user: u, onclick: () => startDm(u.username) }))))
        : emptyState('친구가 없어요', '아이디를 직접 입력해도 돼요'));
  }

  function showGroup() {
    const name = h('input', { class: 'input', placeholder: '단톡방 이름', maxlength: '30', 'aria-label': '단톡방 이름' });
    const extra = h('input', { class: 'input', placeholder: '아이디를 쉼표로 구분 (예: kim, lee)', autocapitalize: 'none', 'aria-label': '추가할 아이디' });
    const picked = new Set();
    const create = async (e) => {
      e.preventDefault();
      const typed = extra.value.split(',').map((s) => s.trim()).filter(Boolean);
      try {
        const { room } = await api.post('/chat/groups', { name: name.value, members: [...new Set([...picked, ...typed])] });
        toast('단톡방을 만들었어요', 'ok');
        navigate(`/chat/${room.id}`);
      } catch (err) { toastError(err); }
    };
    clear(host).append(h('form', { class: 'field', onsubmit: create },
      h('label', {}, '이름'), name,
      h('span', { class: 'label' }, '친구 고르기'),
      friends.length
        ? h('ul', { class: 'list' }, friends.map((u) => h('li', {}, h('label', { class: 'row check-row' },
          h('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? picked.add(u.username) : picked.delete(u.username)) }),
          h('span', { class: 'grow' }, u.name, h('span', { class: 'small muted' }, ` @${u.username}`))))))
        : h('p', { class: 'hint' }, '친구가 없어도 아이디로 초대할 수 있어요'),
      h('label', {}, '아이디로 추가'), extra,
      h('button', { class: 'btn', type: 'submit' }, '단톡 만들기')));
  }

  showDm();
}
