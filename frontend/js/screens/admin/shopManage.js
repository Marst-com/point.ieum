import { h, clear } from '../../core/dom.js';
import { api } from '../../core/api.js';
import { toast, toastError } from '../../core/toast.js';
import { fmtNum } from '../../core/format.js';
import { screenHeader } from '../../components/header.js';
import { openModal, confirmModal } from '../../components/modal.js';
import { emptyState, loadingBlock } from '../../components/emptyState.js';

export async function mount({ root }) {
  const results = h('div', {}, loadingBlock());
  root.append(h('div', {}, screenHeader('상점 사이트', {
    right: h('button', { class: 'btn btn--small', onclick: () => openForm() }, '사이트 추가'),
  }), h('div', { class: 'screen' },
    h('p', { class: 'hint' }, '사이트는 같은 DB를 쓰는 곳이어야 해요. 입장할 때 주소 뒤에 ieum_token 이 붙고, 사이트 서버가 사이트 키로 확인해요.'),
    results)));

  function openForm(site = null) {
    const f = {
      name: h('input', { class: 'input', value: site?.name || '', maxlength: '40', 'aria-label': '사이트 이름' }),
      description: h('input', { class: 'input', value: site?.description || '', maxlength: '200', 'aria-label': '설명' }),
      url: h('input', { class: 'input', type: 'url', value: site?.url || '', placeholder: 'https://', autocapitalize: 'none', 'aria-label': '사이트 주소' }),
      price: h('input', { class: 'input', type: 'number', min: '0', step: '1', value: site ? String(site.price) : '0', 'aria-label': '입장권 가격' }),
    };
    const field = (label, el) => h('div', { class: 'field' }, h('span', { class: 'label' }, label), el);
    const m = openModal({
      title: site ? '사이트 수정' : '사이트 추가',
      body: h('div', { class: 'field' }, field('이름', f.name), field('설명', f.description), field('주소', f.url), field('입장권 가격(P)', f.price)),
      actions: [
        h('button', { class: 'btn btn--secondary grow', onclick: () => m.close() }, '취소'),
        h('button', { class: 'btn grow', onclick: async () => {
          const body = { name: f.name.value, description: f.description.value, url: f.url.value, price: Number(f.price.value) };
          try {
            if (site) await api.patch(`/admin/shop/sites/${site.id}`, body); else await api.post('/admin/shop/sites', body);
            toast('저장했어요', 'ok'); m.close(); load();
          } catch (e) { toastError(e); }
        } }, '저장'),
      ],
    });
  }

  function card(s) {
    const keyEl = h('div', { class: 'key', hidden: true }, s.siteKey);
    return h('li', { class: 'card site-card' },
      h('div', { class: 'top' },
        h('div', { class: 'grow' }, h('h2', {}, s.name), h('p', { class: 'muted' }, s.description || '설명 없음'),
          h('p', { class: 'small muted ellipsis' }, s.url)),
        h('div', { class: 'price' }, `${fmtNum(s.price)}P`)),
      s.active ? null : h('span', { class: 'pill' }, '숨김'),
      keyEl,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn--small btn--secondary', onclick: () => { keyEl.hidden = !keyEl.hidden; } }, '사이트 키'),
        h('button', { class: 'btn btn--small btn--secondary', onclick: () => openForm(s) }, '수정'),
        s.active
          ? h('button', { class: 'btn btn--small btn--danger', onclick: async () => {
            if (!(await confirmModal({ title: '목록에서 숨길까요?', message: '이미 산 사람의 기록은 남아요.', confirmLabel: '숨기기', danger: true }))) return;
            try { await api.del(`/admin/shop/sites/${s.id}`); load(); } catch (e) { toastError(e); }
          } }, '숨기기')
          : h('button', { class: 'btn btn--small btn--ok', onclick: async () => {
            try { await api.patch(`/admin/shop/sites/${s.id}`, { active: true }); load(); } catch (e) { toastError(e); }
          } }, '다시 보이기')));
  }

  async function load() {
    try {
      const { items } = await api.get('/admin/shop/sites');
      clear(results).append(items.length
        ? h('ul', { class: 'list' }, items.map(card))
        : emptyState('등록된 사이트가 없어요', '‘사이트 추가’로 입장권을 팔 사이트를 등록해 보세요'));
    } catch (e) { toastError(e); }
  }
  await load();
}
