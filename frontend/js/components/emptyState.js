import { h } from '../core/dom.js';

export const emptyState = (title, hint = '') =>
  h('div', { class: 'empty' }, h('strong', {}, title), hint && h('span', {}, hint));

export const loadingBlock = () => h('div', { class: 'spinner', role: 'status', 'aria-label': '불러오는 중' });
