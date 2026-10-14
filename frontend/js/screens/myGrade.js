import { h } from '../core/dom.js';
import { api } from '../core/api.js';
import { fmtNum } from '../core/format.js';
import { toastError } from '../core/toast.js';
import { screenHeader } from '../components/header.js';
import { gradeBadge } from '../components/gradeBadge.js';
import { loadingBlock } from '../components/emptyState.js';

export async function mount({ root }) {
  const body = h('div', { class: 'screen' }, loadingBlock());
  root.append(h('div', {}, screenHeader('내 일한 등급'), body));
  try {
    const d = await api.get('/me/grade');
    const bar = h('i', {});
    bar.style.width = `${Math.round(d.ratio * 100)}%`;
    body.replaceChildren(
      h('div', { class: 'card grade-hero' },
        gradeBadge(d.grade, { large: true }),
        h('div', { class: 'grow' },
          h('h2', {}, `${fmtNum(d.stones)}개`),
          h('p', { class: 'muted' }, d.rank ? `${fmtNum(d.totalWorkers)}명 중 ${fmtNum(d.rank)}위` : '아직 순위가 없어요'))),
      h('div', { class: 'card' },
        h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(d.ratio * 100)) }, bar),
        h('p', { class: 'small muted' },
          d.next ? `${d.next.letter}등급까지 돌 ${fmtNum(d.next.remaining)}개 남았어요` : '가장 높은 S등급이에요!')),
      h('h2', {}, '등급표'),
      h('ul', { class: 'list ladder' }, [...d.grades].reverse().map((g) =>
        h('li', { class: `row ${g.letter === d.grade ? 'current' : ''}` },
          gradeBadge(g.letter),
          h('span', { class: 'grow' }, `${g.letter}등급`),
          h('span', { class: 'muted' }, `${fmtNum(g.min)}개 이상`)))));
  } catch (e) { toastError(e); }
}
