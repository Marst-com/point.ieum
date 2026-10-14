import { h, clear } from '../core/dom.js';
import { api } from '../core/api.js';
import { tabs } from '../components/tabs.js';

export function renderLogin(root, { onDone }) {
  clear(root);
  let mode = 'login';
  const username = h('input', { class: 'input', id: 'f-user', autocomplete: 'username', autocapitalize: 'none', placeholder: '영문 소문자·숫자·_ (3~20자)' });
  const password = h('input', { class: 'input', id: 'f-pw', type: 'password', autocomplete: 'current-password', placeholder: '6자 이상' });
  const name = h('input', { class: 'input', id: 'f-name', autocomplete: 'nickname', placeholder: '친구들에게 보일 이름 (비우면 아이디)', maxlength: '20' });
  const nameField = h('div', { class: 'field', hidden: true }, h('label', { for: 'f-name' }, '이름'), name);
  const error = h('p', { class: 'error-text', role: 'alert' });
  const submit = h('button', { class: 'btn btn--block', type: 'submit' }, '로그인');

  const setMode = (m) => {
    mode = m;
    nameField.hidden = m === 'login';
    submit.textContent = m === 'login' ? '로그인' : '가입하기';
    password.setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
    error.textContent = '';
  };

  async function run(fn) {
    error.textContent = '';
    submit.disabled = true;
    try { onDone(await fn()); } catch (e) { error.textContent = e.message; } finally { submit.disabled = false; }
  }

  const form = h('form', {
    class: 'login',
    onsubmit: (e) => {
      e.preventDefault();
      const body = { username: username.value, password: password.value };
      if (mode === 'register') body.name = name.value;
      run(() => api.post(mode === 'login' ? '/auth/login' : '/auth/register', body));
    },
  },
  h('h1', { class: 'brand' }, 'IEUM', h('br'), h('span', {}, 'PointSystem')),
  tabs([{ id: 'login', label: '로그인' }, { id: 'register', label: '가입하기' }], 'login', setMode),
  h('div', { class: 'field' }, h('label', { for: 'f-user' }, '아이디'), username),
  h('div', { class: 'field' }, h('label', { for: 'f-pw' }, '비밀번호'), password),
  nameField, error, submit,
  h('button', { class: 'btn btn--secondary btn--block', type: 'button', onclick: () => run(() => api.post('/auth/guest')) }, '익명으로 둘러보기'),
  h('p', { class: 'hint' }, '익명으로는 상점 구경만 할 수 있어요. 일하기·톡·친구는 로그인 후에 쓸 수 있어요.'));

  root.append(form);
  username.focus();
}
