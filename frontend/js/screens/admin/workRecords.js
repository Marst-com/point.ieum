import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { toastError } from '../../core/toast.js';
import { fmtNum } from '../../core/format.js';
import { screenHeader } from '../../components/header.js';
import { searchBox } from '../../components/searchBox.js';
import { gradeBadge } from '../../components/gradeBadge.js';
import { emptyState, loadingBlock } from '../../components/emptyState.js';

export async function mount({ root }) {
  const results = h('div', {}, loadingBlock());
  root.append(h('div', {}, screenHeader('일한 내역'), h('div', { class: 'screen' },
    h('p', { class: 'hint' }, '돌을 많이 캔 상위 100명을 1위부터 보여줘요. 이름·아이디(초성 가능)로 찾으면 전체에서 찾고, 순위는 전체 기준이에요.'),
    searchBox({ placeholder: '이름 또는 아이디 검색', onSearch: load }), results)));

  let token = 0;
  async function load(q = '') {
    const mine = ++token;
    try {
      const { items } = await api.get(`/admin/work?search=${encodeURIComponent(q)}`);
      if (mine !== token) return; // 더 최근 검색이 있으면 버린다
      clear(results).append(items.length
        ? h('ul', { class: 'list' }, items.map((r) => h('li', {}, rowWithRank(r))))
        : emptyState('결과가 없어요', q ? '다른 이름으로 찾아 보세요' : '아직 일한 사람이 없어요'));
    } catch (e) { toastError(e); }
  }

  function rowWithRank(r) {
    return h('div', { class: 'row' },
      h('span', { class: `rank rank--${r.rank}` }, String(r.rank)),
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, r.name.slice(0, 1)),
      h('span', { class: 'grow' },
        h('span', { class: 'row-title ellipsis' }, r.name),
        h('span', { class: 'small muted ellipsis' }, `@${r.username}`)),
      gradeBadge(r.grade),
      h('span', { class: 'stat' }, `${fmtNum(r.stones)}`));
  }
  await load();
}
