import { h } from '../core/dom.js';

// items: [{id,label}] — 선택이 바뀌면 onChange(id)
export function tabs(items, active, onChange) {
  const el = h('div', { class: 'tabs', role: 'tablist' });
  const paint = (id) => el.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === id)));
  for (const it of items) {
    el.append(h('button', {
      class: 'tab', role: 'tab', 'data-id': it.id, 'aria-selected': String(it.id === active),
      onclick: () => { paint(it.id); onChange(it.id); },
    }, it.label));
  }
  return el;
}
