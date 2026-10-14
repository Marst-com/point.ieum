import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { toast, toastError } from '../../core/toast.js';
import { ROLE_LABEL } from '../../core/labels.js';
import { screenHeader } from '../../components/header.js';
import { searchBox } from '../../components/searchBox.js';
import { userRow } from '../../components/userRow.js';
import { emptyState, loadingBlock } from '../../components/emptyState.js';

const ASSIGNABLE = ['member', 'admin', 'manager'];

export async function mount({ root }) {
  const results = h('div', {}, loadingBlock());
  root.append(h('div', {}, screenHeader('등급 관리'), h('div', { class: 'screen' },
    h('p', { class: 'hint' }, '이름이 비슷한 순서로 찾아요. 일한 등급(F~S)과는 별개인 역할이에요.'),
    searchBox({ placeholder: '이름 또는 아이디 검색', onSearch: (q) => load(q) }), results)));

  function roleControl(u) {
    if (u.role === 'owner') return h('span', { class: 'pill pill--staff' }, ROLE_LABEL.owner);
    const sel = h('select', { class: 'role-select', 'aria-label': `${u.name} 역할` },
      ASSIGNABLE.map((r) => h('option', { value: r, selected: r === u.role }, ROLE_LABEL[r])));
    sel.addEventListener('change', async () => {
      const prev = u.role;
      try {
        await api.patch(`/admin/roles/${u.id}`, { role: sel.value });
        u.role = sel.value;
        toast(`${u.name}님을 ${ROLE_LABEL[sel.value]}(으)로 바꿨어요`, 'ok');
      } catch (e) { sel.value = prev; toastError(e); }
    });
    return sel;
  }

  let token = 0;
  async function load(q = '') {
    const mine = ++token;
    try {
      const { items } = await api.get(`/admin/roles?q=${encodeURIComponent(q)}`);
      if (mine !== token) return;
      clear(results).append(items.length
        ? h('ul', { class: 'list' }, items.map((u) => h('li', {}, userRow({ user: u, right: roleControl(u) }))))
        : emptyState('결과가 없어요'));
    } catch (e) { toastError(e); }
  }
  await load();
}
