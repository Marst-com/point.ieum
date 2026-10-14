import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { toast, toastError } from '../../core/toast.js';
import { fmtNum } from '../../core/format.js';
import { screenHeader } from '../../components/header.js';
import { searchBox } from '../../components/searchBox.js';
import { userRow } from '../../components/userRow.js';
import { openModal } from '../../components/modal.js';
import { emptyState, loadingBlock } from '../../components/emptyState.js';

export async function mount({ root }) {
  const results = h('div', {}, loadingBlock());
  let lastQuery = '';
  root.append(h('div', {}, screenHeader('포인트 배부'), h('div', { class: 'screen' },
    h('p', { class: 'hint' }, '이름이 같을수록, 같은 이름이면 일한 등급이 높은 사람이 위에 나와요.'),
    searchBox({ placeholder: '이름 또는 아이디 검색', onSearch: (q) => load(q) }), results)));

  function openGrant(user) {
    const amount = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '1', step: '1', placeholder: '포인트 수', 'aria-label': '포인트 수' });
    const reason = h('input', { class: 'input', placeholder: '사유 (선택)', maxlength: '60', 'aria-label': '사유' });
    const balance = h('p', { class: 'muted' }, `지금 ${fmtNum(user.points)}P`);
    const submit = async (sign) => {
      const n = Number(amount.value);
      if (!Number.isInteger(n) || n <= 0) return toast('1 이상의 정수를 넣어 주세요', 'error');
      try {
        const r = await api.post('/admin/points', { userId: user.id, delta: sign * n, reason: reason.value.trim() || undefined });
        user.points = r.points;
        balance.textContent = `지금 ${fmtNum(r.points)}P`;
        amount.value = '';
        toast(`${sign > 0 ? '+' : '-'}${fmtNum(n)}P 적용했어요`, 'ok');
        load(lastQuery);
      } catch (e) { toastError(e); }
      return undefined;
    };
    const quick = h('div', { class: 'quick' }, [10, 50, 100, 500].map((n) =>
      h('button', { class: 'btn btn--secondary btn--small', type: 'button', onclick: () => { amount.value = String(n); } }, `${n}`)));
    const m = openModal({
      title: `${user.name}님`,
      body: h('div', { class: 'field' }, balance, amount, quick, reason),
      actions: [
        h('button', { class: 'btn btn--danger grow', onclick: () => submit(-1) }, '− 차감'),
        h('button', { class: 'btn btn--ok grow', onclick: () => submit(1) }, '+ 지급'),
        h('button', { class: 'btn btn--secondary', onclick: () => m.close() }, '닫기'),
      ],
    });
  }

  let token = 0;
  async function load(q = '') {
    lastQuery = q;
    const mine = ++token;
    try {
      const { items } = await api.get(`/admin/points/search?q=${encodeURIComponent(q)}`);
      if (mine !== token) return;
      clear(results).append(items.length
        ? h('ul', { class: 'list' }, items.map((u) => h('li', {}, userRow({
          user: u, showGrade: true, sub: `@${u.username} · ${fmtNum(u.points)}P`, onclick: () => openGrant(u),
        }))))
        : emptyState('결과가 없어요', '이름이나 아이디를 다시 확인해 보세요'));
    } catch (e) { toastError(e); }
  }
  await load();
}
