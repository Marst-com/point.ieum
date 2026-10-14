import { h } from '../core/dom.js';

const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const HIT = { x: 214, y: 302 }; // 곡괭이가 돌에 닿는 지점
const ROCK_PTS = '-62,44 -50,-18 -12,-54 40,-46 68,-6 60,46';

// 광산 장면(SVG). 반환: {el, strike(n), reset()} — n 은 현재 돌 단계(0~9)
export function createMiningScene() {
  const svg = (tag, a, ...c) => h(tag, a, ...c);

  const arm = svg('g', { class: 'arm' },
    svg('line', { x1: 160, y1: 296, x2: 196, y2: 296, stroke: '#F2C9A0', 'stroke-width': 11, 'stroke-linecap': 'round' }),
    svg('line', { x1: 190, y1: 296, x2: 232, y2: 296, stroke: '#8A5A2B', 'stroke-width': 7, 'stroke-linecap': 'round' }),
    svg('path', { d: 'M228 268 Q244 296 228 324 L222 324 Q232 296 222 268 Z', fill: '#7D8A97' }));
  arm.style.transformOrigin = '160px 296px';
  arm.style.transform = 'rotate(-62deg)';

  const cracks = svg('g', { stroke: '#4F4F4B', 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none', opacity: 0 },
    svg('path', { d: 'M-8 -50 L-2 -22 L-16 -4 L-6 18' }),
    svg('path', { d: 'M30 -44 L22 -14 L38 8' }),
    svg('path', { d: 'M-40 -10 L-20 4 L-30 28' }));
  const rock = svg('g', { transform: 'translate(262 326)' },
    svg('g', { class: 'rock' },
      svg('polygon', { points: ROCK_PTS, fill: '#8C8C86' }),
      svg('polygon', { points: '-50,-18 -12,-54 40,-46 10,-14', fill: '#A8A8A2' }),
      svg('polygon', { points: '-62,44 -30,10 60,46', fill: '#74746F' }),
      cracks));
  const rockBody = rock.querySelector('.rock');
  rockBody.style.transformBox = 'fill-box';
  rockBody.style.transformOrigin = 'center bottom';

  const fx = svg('g', {});
  const miner = svg('g', {},
    svg('rect', { x: 128, y: 330, width: 14, height: 40, rx: 5, fill: '#24406B' }),
    svg('rect', { x: 150, y: 330, width: 14, height: 40, rx: 5, fill: '#24406B' }),
    svg('rect', { x: 120, y: 366, width: 26, height: 8, rx: 4, fill: '#5B3A1E' }),
    svg('rect', { x: 148, y: 366, width: 26, height: 8, rx: 4, fill: '#5B3A1E' }),
    svg('rect', { x: 122, y: 268, width: 48, height: 68, rx: 14, fill: '#2A7DE1' }),
    svg('rect', { x: 132, y: 268, width: 28, height: 22, rx: 6, fill: '#FFFFFF' }),
    svg('circle', { cx: 146, cy: 246, r: 24, fill: '#F2C9A0' }),
    svg('circle', { cx: 155, cy: 246, r: 3, fill: '#16283C' }),
    svg('path', { d: 'M156 256 Q162 260 167 255', stroke: '#B0643A', 'stroke-width': 2.5, fill: 'none', 'stroke-linecap': 'round' }),
    svg('path', { d: 'M120 240 Q122 208 146 206 Q172 208 172 240 Z', fill: '#FFB81C' }),
    svg('rect', { x: 114, y: 236, width: 64, height: 9, rx: 4.5, fill: '#D98F00' }),
    svg('circle', { cx: 146, cy: 214, r: 6, fill: '#FFF3B0' }),
    arm);

  const root = svg('svg', { viewBox: '0 0 360 420', role: 'img', 'aria-label': '광부가 곡괭이로 돌을 캐는 모습' },
    svg('defs', {},
      svg('linearGradient', { id: 'sky', x1: 0, y1: 0, x2: 0, y2: 1 },
        svg('stop', { offset: '0', 'stop-color': '#BFE3FF' }), svg('stop', { offset: '1', 'stop-color': '#F4FAFF' }))),
    svg('rect', { width: 360, height: 420, fill: 'url(#sky)' }),
    svg('circle', { cx: 300, cy: 62, r: 30, fill: '#FFE08A' }),
    svg('path', { d: 'M0 150 Q70 90 140 140 T290 120 T360 150 V240 H0 Z', fill: '#CFE0EE' }),
    svg('path', { d: 'M0 190 Q90 140 170 185 T360 170 V260 H0 Z', fill: '#B8CEDF' }),
    svg('rect', { x: 30, y: 128, width: 300, height: 246, rx: 6, fill: '#A9BCCD' }),
    svg('polygon', { points: '30,260 90,200 150,236 60,300', fill: '#B7C8D8' }),
    svg('polygon', { points: '250,140 330,128 330,200 290,214', fill: '#B7C8D8' }),
    svg('rect', { x: 14, y: 112, width: 14, height: 262, fill: '#C9955B' }),
    svg('rect', { x: 332, y: 112, width: 14, height: 262, fill: '#C9955B' }),
    svg('rect', { x: 8, y: 104, width: 344, height: 18, rx: 4, fill: '#D9A66A' }),
    svg('rect', { x: 0, y: 372, width: 360, height: 48, fill: '#8FA2B4' }),
    svg('rect', { x: 0, y: 372, width: 360, height: 8, fill: '#A6B8C8' }),
    rock, miner, fx);

  function burst(big) {
    if (reduceMotion()) return;
    const n = big ? 12 : 6;
    for (let i = 0; i < n; i++) {
      const chip = svg('polygon', { points: '0,-5 5,3 -4,4', fill: i % 2 ? '#A8A8A2' : '#74746F' });
      chip.setAttribute('transform', `translate(${HIT.x} ${HIT.y})`);
      fx.append(chip);
      const dx = -30 + Math.random() * 90;
      const dy = -50 - Math.random() * 50;
      const anim = chip.animate(
        [{ transform: `translate(${HIT.x}px, ${HIT.y}px) rotate(0deg)`, opacity: 1 },
          { transform: `translate(${HIT.x + dx}px, ${HIT.y + dy}px) rotate(${180 + Math.random() * 180}deg)`, opacity: 0 }],
        { duration: big ? 650 : 450, easing: 'cubic-bezier(.2,.7,.4,1)' });
      anim.onfinish = () => chip.remove();
    }
  }

  function strike(step) {
    const big = step === 9; // 열 번째 타격에서 돌이 깨진다
    cracks.setAttribute('opacity', String(big ? 1 : (step + 1) / 11));
    if (!reduceMotion()) {
      arm.animate([{ transform: 'rotate(-62deg)' }, { transform: 'rotate(4deg)', offset: .45 }, { transform: 'rotate(-62deg)' }],
        { duration: 240, easing: 'ease-in-out' });
      rockBody.animate([{ transform: 'translateX(0) scale(1)' }, { transform: 'translateX(3px) scale(.97, 1.03)' }, { transform: 'translateX(0) scale(1)' }],
        { duration: big ? 260 : 150 });
    }
    burst(big);
    if (big) setTimeout(() => cracks.setAttribute('opacity', '0'), 200);
  }

  return { el: root, strike };
}
