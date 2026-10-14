import { h, debounce } from '../core/dom.js';

export function searchBox({ placeholder = '검색', onSearch, delay = 250, value = '' }) {
  const input = h('input', {
    class: 'input', type: 'search', placeholder, value, autocomplete: 'off', 'aria-label': placeholder,
    oninput: debounce(() => onSearch(input.value.trim()), delay),
  });
  return input;
}
