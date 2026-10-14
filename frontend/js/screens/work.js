import { h } from '../core/dom.js';
import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { toast } from '../core/toast.js';
import { fmtNum } from '../core/format.js';
import { screenHeader } from '../components/header.js';
import { gradeBadge } from '../components/gradeBadge.js';
import { createMiningScene } from '../components/miningScene.js';

const FLUSH_MS = 700;

export async function mount({ root }) {
  const me = store.state.me;
  let serverStones = me.stones;
  let grade = me.grade;
  let pending = 0;
  let session = 0;
  let inflight = false;
  let timer = null;
  let lastErrorAt = 0;
  let step = 0;

  const scene = createMiningScene();
  const countEl = h('div', { class: 'count' });
  const sessionEl = h('div', { class: 'sub' });
  const badgeHost = h('div');
  const stage = h('button', {
    class: 'stage', type: 'button', 'aria-label': '돌 캐기 (화면을 누르세요)',
    onpointerdown: (e) => { e.preventDefault(); tap(); },
    onkeydown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tap(); } },
  }, scene.el);

  root.append(h('div', {},
    screenHeader('일하기'),
    h('div', { class: 'screen' },
      h('div', { class: 'work-hud' }, badgeHost, h('div', { class: 'grow' }, countEl, sessionEl)),
      stage,
      h('p', { class: 'work-hint' }, '화면을 눌러서 돌을 캐요'))));

  function paint() {
    countEl.textContent = `${fmtNum(serverStones + pending)}개`;
    sessionEl.textContent = session > 0 ? `이번에 ${fmtNum(session)}개 캤어요` : '지금까지 캔 돌';
    badgeHost.replaceChildren(gradeBadge(grade, { large: true }));
  }

  function tap() {
    pending += 1;
    session += 1;
    scene.strike(step);
    step = (step + 1) % 10;
    if (navigator.vibrate) navigator.vibrate(6);
    paint();
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  }

  async function flush() {
    timer = null;
    if (inflight || pending === 0) return;
    const n = Math.min(pending, 200);
    pending -= n;
    inflight = true;
    try {
      const r = await api.post('/work/mine', { taps: n });
      serverStones = r.stones; // 서버가 인정한 값으로 맞춘다
      session -= n - r.accepted;
      if (r.grade !== r.gradeBefore) toast(`등급이 ${r.gradeBefore} → ${r.grade} 로 올랐어요!`, 'ok');
      grade = r.grade;
      store.set({ me: { ...store.state.me, stones: r.stones, grade: r.grade, points: r.points } });
    } catch (e) {
      pending += n; // 실패하면 다시 보낸다
      if (Date.now() - lastErrorAt > 5000) { toast(e.message, 'error'); lastErrorAt = Date.now(); }
    } finally {
      inflight = false;
      paint();
      if (pending > 0 && !timer) timer = setTimeout(flush, FLUSH_MS * 2);
    }
  }

  const onHide = () => { if (document.hidden) flush(); };
  document.addEventListener('visibilitychange', onHide);
  paint();

  return () => {
    document.removeEventListener('visibilitychange', onHide);
    clearTimeout(timer);
    if (pending > 0) api.post('/work/mine', { taps: Math.min(pending, 200) }, { keepalive: true }).catch(() => {});
  };
}
