import { h } from '../core/dom.js';
import { back } from '../core/router.js';

export function screenHeader(title, { right = null, backTo = '/' } = {}) {
  return h('header', { class: 'header' },
    h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: () => back(backTo) }, '←'),
    h('h1', { class: 'ellipsis' }, title),
    right);
}
