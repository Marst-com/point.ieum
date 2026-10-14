import { h } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { store } from '../../core/store.js';
import { on, emit, isConnected } from '../../core/socket.js';
import { toast, toastError } from '../../core/toast.js';
import { fmtTime } from '../../core/format.js';
import { screenHeader } from '../../components/header.js';
import { openModal, confirmModal } from '../../components/modal.js';
import { userRow } from '../../components/userRow.js';

export async function mount({ root, params, navigate }) {
  const roomId = params.roomId;
  const meId = store.state.me.id;
  const list = h('div', { class: 'messages', 'aria-live': 'polite' });
  const seen = new Set();
  let room = null;

  const input = h('input', { class: 'input', placeholder: '메시지 입력', maxlength: '1000', autocomplete: 'off', 'aria-label': '메시지' });
  const sendBtn = h('button', { class: 'btn', type: 'submit' }, '보내기');
  const infoBtn = h('button', { class: 'icon-btn', 'aria-label': '대화방 정보', onclick: () => showInfo() }, 'ⓘ');
  const title = h('span', {});
  const header = screenHeader('', { right: infoBtn, backTo: '/chat' });
  header.querySelector('h1').append(title);

  root.append(h('div', { class: 'chat-screen' }, header, list,
    h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); send(); } }, input, sendBtn)));

  const nearBottom = () => document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 160;
  const toBottom = () => window.scrollTo(0, document.documentElement.scrollHeight);

  function addMessage(m, { force = false } = {}) {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    const stick = force || nearBottom();
    const mine = m.senderId === meId;
    list.append(h('div', { class: `msg ${mine ? 'msg--mine' : ''}` },
      mine || room?.type === 'dm' ? null : h('span', { class: 'who' }, m.senderName),
      h('div', { class: 'bubble' }, m.text),
      h('time', {}, fmtTime(m.createdAt))));
    if (stick) toBottom();
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendBtn.disabled = true;
    try {
      if (isConnected()) {
        const res = await emit('chat:send', { roomId, text });
        if (!res.ok) throw new Error(res.message || '보내지 못했어요');
      } else {
        const { message } = await api.post(`/chat/rooms/${roomId}/messages`, { text });
        addMessage(message, { force: true }); // 소켓이 없으면 직접 화면에 넣는다
      }
    } catch (e) { input.value = text; toastError(e); } finally { sendBtn.disabled = false; input.focus(); }
  }

  async function showInfo() {
    if (!room) return;
    const inviteInput = h('input', { class: 'input', placeholder: '초대할 아이디 (쉼표로 여러 명)', autocapitalize: 'none', 'aria-label': '초대할 아이디' });
    const body = h('div', { class: 'field' },
      h('ul', { class: 'list' }, room.members.map((u) => h('li', {}, userRow({ user: u, showGrade: true })))),
      room.type === 'group' ? h('div', { class: 'field' }, inviteInput,
        h('button', { class: 'btn btn--small', onclick: async () => {
          const usernames = inviteInput.value.split(',').map((s) => s.trim()).filter(Boolean);
          try {
            const r = await api.post(`/chat/rooms/${roomId}/members`, { usernames });
            room = r.room; toast('초대했어요', 'ok'); m.close(); showInfo();
          } catch (e) { toastError(e); }
        } }, '초대하기')) : null);
    const m = openModal({
      title: room.type === 'group' ? `${room.title} (${room.members.length}명)` : room.title, body,
      actions: room.type === 'group' ? [h('button', { class: 'btn btn--danger grow', onclick: async () => {
        if (!(await confirmModal({ title: '단톡방을 나갈까요?', message: '나가면 이전 대화를 볼 수 없어요.', confirmLabel: '나가기', danger: true }))) return;
        try { await api.post(`/chat/rooms/${roomId}/leave`); m.close(); navigate('/chat'); } catch (e) { toastError(e); }
      } }, '나가기')] : [],
    });
  }

  try {
    const [rooms, hist] = await Promise.all([api.get('/chat/rooms'), api.get(`/chat/rooms/${roomId}/messages`)]);
    room = rooms.items.find((r) => r.id === roomId);
    if (!room) { toast('대화방을 찾을 수 없어요', 'error'); navigate('/chat'); return undefined; }
    title.textContent = room.title;
    hist.items.forEach((m) => addMessage(m, { force: true }));
  } catch (e) { toastError(e); navigate('/chat'); return undefined; }

  const offMsg = on('chat:message', (m) => { if (m.roomId === roomId) addMessage(m); });
  input.focus();
  return () => offMsg();
}
