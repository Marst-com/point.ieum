import { h } from '../core/dom.js';

// openModal({title, body, actions}) → {close}. 바깥을 누르거나 ESC 로 닫힌다.
export function openModal({ title, body, actions = [], onClose = null }) {
  const opener = document.activeElement;
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('h2', {}, title), body,
    actions.length ? h('div', { class: 'btn-row' }, actions) : null);
  const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, box);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    if (opener && opener.focus) opener.focus();
    if (onClose) onClose();
  }
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  (box.querySelector('input, textarea, select, button') || box).focus();
  return { close, box };
}

export function confirmModal({ title, message, confirmLabel = '확인', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const m = openModal({
      title, body: h('p', {}, message), onClose: () => finish(false),
      actions: [
        h('button', { class: 'btn btn--secondary grow', onclick: () => m.close() }, '취소'),
        h('button', { class: `btn grow ${danger ? 'btn--danger' : ''}`, onclick: () => { finish(true); m.close(); } }, confirmLabel),
      ],
    });
  });
}
