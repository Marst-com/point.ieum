import { h } from '../core/dom.js';

export const gradeBadge = (letter, { large = false } = {}) =>
  h('span', { class: `grade grade--${letter} ${large ? 'grade--lg' : ''}`, 'aria-label': `${letter}등급`, title: `${letter}등급` }, letter);
