import { h } from './dom.js';

export function toast(message, kind = '') {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = h('div', { class: `toast ${kind ? `toast--${kind}` : ''}`, role: 'status' }, message);
  host.append(el);
  setTimeout(() => el.remove(), 2800);
}

export const toastError = (e) => toast(e?.message || '문제가 생겼어요', 'error');
