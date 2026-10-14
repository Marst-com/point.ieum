import { h } from '../core/dom.js';
import { gradeBadge } from './gradeBadge.js';
import { ROLE_LABEL, isStaffRole } from '../core/labels.js';

// user: {name, username, grade?, role?}
export function userRow({ user, sub = null, right = null, showGrade = false, onclick = null }) {
  const body = [
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, (user.name || '?').slice(0, 1)),
    h('span', { class: 'grow' },
      h('span', { class: 'row-title ellipsis' }, user.name, ' ',
        isStaffRole(user.role) ? h('span', { class: 'pill pill--staff' }, ROLE_LABEL[user.role]) : null),
      h('span', { class: 'small muted ellipsis' }, sub ?? `@${user.username}`)),
    showGrade && user.grade ? gradeBadge(user.grade) : null,
    right,
  ];
  return onclick
    ? h('button', { class: 'row', type: 'button', onclick }, body)
    : h('div', { class: 'row' }, body);
}
