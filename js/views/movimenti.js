// Movimenti: elenco con ricerca e filtri, totali del periodo, swipe per cambiare
// categoria (verso sinistra) o area (verso destra), selezione multipla.

import { html, setHtml } from '../util.js';
import { icon } from '../ui/icons.js';
import { page, enhancePage } from '../ui/page.js';
import { openSheet, toast } from '../ui/sheet.js';
import { formatCents, isoToday } from '../money.js';
import * as M from '../data/model.js';
import * as S from '../store.js';
import {
  txIcon, amountClass, dayLabel, subtitle, pickCategory, pickArea, setCategory, setArea,
  openTxDetail, openManualAdd, openImport,
} from './tx-ui.js';

const PERIODS = [
  ['month', 'Questo mese'],
  ['prev', 'Mese scorso'],
  ['3m', 'Ultimi 3 mesi'],
  ['year', 'Quest\'anno'],
  ['all', 'Sempre'],
];

// I filtri restano quando si cambia sezione.
const filters = { period: '3m', accountId: '', categoryId: '', areaId: '', q: '' };
const PAGE = 150;

// Apre i Movimenti filtrati su una categoria del mese in corso (dalla Home).
export function showCategoryThisMonth(categoryId) {
  Object.assign(filters, { period: 'month', accountId: '', categoryId, areaId: '', q: '' });
  location.hash = '#/movimenti';
}

// Apre i Movimenti di un solo conto, su tutto il periodo.
export function showAccount(accountId) {
  Object.assign(filters, { period: 'all', accountId, categoryId: '', areaId: '', q: '' });
  location.hash = '#/movimenti';
}

function range(period) {
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  switch (period) {
    case 'month': return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), isoToday()];
    case 'prev': return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))];
    case '3m': return [iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), isoToday()];
    case 'year': return [`${now.getFullYear()}-01-01`, isoToday()];
    default: return ['0000-01-01', '9999-12-31'];
  }
}

export function filtered() {
  const [from, to] = range(filters.period);
  const q = filters.q.trim().toLowerCase();
  return M.txs().filter((t) => {
    if (t.date < from || t.date > to) return false;
    if (filters.accountId && t.accountId !== filters.accountId) return false;
    if (filters.categoryId && !M.parts(t).some((p) => p.categoryId === filters.categoryId)) return false;
    if (filters.areaId && !M.parts(t).some((p) => (p.areaId || '') === (filters.areaId === '-' ? '' : filters.areaId))) return false;
    if (q) {
      const hay = `${t.merchant} ${t.description || ''} ${t.note || ''} ${(t.tags || []).map((g) => `#${g}`).join(' ')} ${M.category(t.categoryId).name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (b.date.localeCompare(a.date)) || ((b.seq || 0) - (a.seq || 0)));
}

export function movimentiView(el) {
  let selectMode = false;
  const selected = new Set();
  let limit = PAGE;
  let off = null;

  const hasAccounts = () => M.accounts().length > 0;

  function chip(key, label, active) {
    return html`<button type="button" class="chip ${active ? 'on' : ''}" data-chip="${key}">${label}${icon('chevron-right', 'chip-chev')}</button>`;
  }

  function draw() {
    off?.();
    if (!hasAccounts()) {
      setHtml(el, page({
        title: 'Movimenti',
        body: html`
          <div class="empty">
            <div class="empty-icon" style="--c:var(--s2)">${icon('arrows')}</div>
            <h2>Nessun movimento</h2>
            <p>Importa la «Lista movimenti» in PDF scaricata dal sito della banca, oppure aggiungi una spesa a mano.</p>
            <div class="empty-actions">
              <button type="button" class="btn" data-import>${icon('upload')}<span>Importa estratto conto</span></button>
              <button type="button" class="btn secondary" data-add>${icon('plus')}<span>Aggiungi a mano</span></button>
            </div>
          </div>`,
      }));
      off = enhancePage(el);
      el.querySelector('[data-import]').onclick = openImport;
      el.querySelector('[data-add]').onclick = openManualAdd;
      return;
    }

    const list = filtered();
    const tot = M.totals(list);
    const shown = list.slice(0, limit);
    const groups = [];
    for (const t of shown) {
      const g = groups[groups.length - 1];
      if (g && g.date === t.date) g.items.push(t); else groups.push({ date: t.date, items: [t] });
    }
    const accName = filters.accountId ? M.account(filters.accountId)?.name : 'Tutti i conti';
    const catName = filters.categoryId ? M.category(filters.categoryId).name : 'Categoria';
    const areaName = filters.areaId ? (filters.areaId === '-' ? 'Senza area' : M.area(filters.areaId)?.name) : 'Area';
    const ncCount = list.filter((t) => t.categoryId === 'nc' && !t.splits?.length).length;

    setHtml(el, page({
      title: 'Movimenti',
      right: selectMode
        ? html`<button type="button" class="nav-text-btn" data-done>Fine</button>`
        : html`<button type="button" class="nav-text-btn" data-select>Seleziona</button><button type="button" class="nav-icon-btn" data-plus aria-label="Aggiungi">${icon('plus')}</button>`,
      body: html`
        <div class="search-bar">${icon('search')}<input type="search" placeholder="Cerca esercente, nota, #tag" value="${filters.q}" data-search enterkeyhint="search"></div>
        <div class="chips">
          ${chip('period', PERIODS.find((p) => p[0] === filters.period)[1], filters.period !== 'all')}
          ${chip('account', accName, !!filters.accountId)}
          ${chip('category', catName, !!filters.categoryId)}
          ${chip('area', areaName, !!filters.areaId)}
          ${filters.accountId || filters.categoryId || filters.areaId || filters.q ? html`<button type="button" class="chip clear" data-clear>Azzera</button>` : ''}
        </div>

        <div class="totals-card card">
          <div><span>Entrate</span><b class="positive">${formatCents(tot.income)}</b></div>
          <div><span>Uscite</span><b>${formatCents(tot.expense)}</b></div>
          <div><span>Differenza</span><b class="${tot.net >= 0 ? 'positive' : 'negative'}">${formatCents(tot.net, { sign: true })}</b></div>
          ${tot.extraordinary ? html`<p class="extra-note">${icon('sparkles')}Spese straordinarie a parte: <b>${formatCents(tot.extraordinary)}</b></p>` : ''}
        </div>

        ${ncCount ? html`<button type="button" class="nc-banner" data-nc>${icon('question')}<span><b>${ncCount} da classificare</b> · scorri un movimento verso sinistra per scegliere la categoria</span></button>` : ''}

        ${list.length ? html`
          <div class="tx-list ${selectMode ? 'selecting' : ''}">
            ${groups.map((g) => html`
              <h3 class="day-title">${dayLabel(g.date)}</h3>
              <div class="list">${g.items.map((t) => txRow(t))}</div>`)}
          </div>
          ${list.length > limit ? html`<button type="button" class="btn plain" data-more>Mostra altri ${Math.min(PAGE, list.length - limit)}</button>` : ''}
          <p class="list-foot">${list.length} movimenti</p>`
          : html`<p class="empty-note">Nessun movimento con questi filtri.</p>`}
        ${selectMode ? html`
          <div class="select-bar lg">
            <span>${selected.size} selezionati</span>
            <button type="button" data-bulk="cat" ${selected.size ? '' : 'disabled'}>Categoria</button>
            <button type="button" data-bulk="area" ${selected.size ? '' : 'disabled'}>Area</button>
          </div>` : ''}`,
    }));
    off = enhancePage(el);
    wire();
  }

  function txRow(t) {
    const on = selected.has(t.id);
    return html`
      <div class="tx-row ${on ? 'selected' : ''}" data-id="${t.id}">
        <div class="tx-actions"><span class="act-area">${icon('tag')}<span>Area</span></span><span class="act-cat">${icon('pencil')}<span>Categoria</span></span></div>
        <div class="tx-main">
          ${selectMode ? html`<span class="tx-check">${on ? icon('check') : ''}</span>` : ''}
          ${txIcon(t)}
          <span class="tx-text">
            <b>${t.merchant}${t.pending ? html` <i class="dot-pending" title="Non ancora consolidato"></i>` : ''}</b>
            <span>${subtitle(t)}${t.tags?.length ? ` · ${t.tags.map((g) => `#${g}`).join(' ')}` : ''}</span>
          </span>
          <span class="tx-amount ${amountClass(t)}">${formatCents(t.cents, { sign: true })}</span>
        </div>
      </div>`;
  }

  async function chooseFilter(key) {
    let options;
    let current;
    if (key === 'period') { options = PERIODS; current = filters.period; }
    if (key === 'account') { options = [['', 'Tutti i conti'], ...M.accounts().map((a) => [a.id, a.name])]; current = filters.accountId; }
    if (key === 'category') { options = [['', 'Tutte le categorie'], ...M.categories().map((c) => [c.id, c.name])]; current = filters.categoryId; }
    if (key === 'area') { options = [['', 'Tutte le aree'], ...M.areas().map((a) => [a.id, a.name]), ['-', 'Senza area']]; current = filters.areaId; }
    const s = openSheet(html`
      <div class="dialog picker">
        <div class="list">${options.map(([v, l]) => html`
          <button type="button" class="row" data-v="${v}"><span class="row-label">${l}</span>${v === current ? html`<span class="row-check">${icon('check')}</span>` : ''}</button>`)}
        </div>
      </div>`);
    s.el.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) s.close(b.dataset.v); });
    const v = await s.closed;
    if (v == null) return;
    if (key === 'period') filters.period = v;
    if (key === 'account') filters.accountId = v;
    if (key === 'category') filters.categoryId = v;
    if (key === 'area') filters.areaId = v;
    limit = PAGE;
    draw();
  }

  function wire() {
    const search = el.querySelector('[data-search]');
    let timer = 0;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        filters.q = search.value;
        const pos = search.selectionStart;
        draw();
        const s2 = el.querySelector('[data-search]');
        s2.focus();
        s2.setSelectionRange(pos, pos);
      }, 250);
    });
    el.querySelectorAll('[data-chip]').forEach((b) => { b.onclick = () => chooseFilter(b.dataset.chip); });
    const clear = el.querySelector('[data-clear]');
    if (clear) clear.onclick = () => { Object.assign(filters, { accountId: '', categoryId: '', areaId: '', q: '' }); draw(); };
    const more = el.querySelector('[data-more]');
    if (more) more.onclick = () => { limit += PAGE; draw(); };
    const nc = el.querySelector('[data-nc]');
    if (nc) nc.onclick = () => { filters.categoryId = 'nc'; draw(); };
    const sel = el.querySelector('[data-select]');
    if (sel) sel.onclick = () => { selectMode = true; selected.clear(); draw(); };
    const done = el.querySelector('[data-done]');
    if (done) done.onclick = () => { selectMode = false; selected.clear(); draw(); };
    const plus = el.querySelector('[data-plus]');
    if (plus) plus.onclick = addMenu;
    el.querySelectorAll('[data-bulk]').forEach((b) => {
      b.onclick = async () => {
        const items = [...selected].map((id) => M.tx(id)).filter(Boolean);
        if (b.dataset.bulk === 'cat') {
          const c = await pickCategory(null);
          if (!c) return;
          await S.putMany('tx', items.map((t) => M.withCategory(t, c)));
          if (c === 'contanti') await M.ensureCashAccount();
          toast(`Categoria cambiata a ${items.length} movimenti`);
        } else {
          const a = await pickArea(null);
          if (a === null) return;
          await S.putMany('tx', items.map((t) => M.withArea(t, a || null)));
          toast(`Area cambiata a ${items.length} movimenti`);
        }
        selectMode = false;
        selected.clear();
        draw();
      };
    });
    const listEl = el.querySelector('.tx-list');
    if (listEl) wireRows(listEl);
  }

  async function addMenu() {
    const s = openSheet(html`
      <div class="dialog picker">
        <div class="list">
          <button type="button" class="row" data-a="import"><span class="row-icon" style="background:var(--s1)">${icon('upload')}</span><span class="row-label">Importa estratto conto</span></button>
          <button type="button" class="row" data-a="add"><span class="row-icon" style="background:var(--s2)">${icon('plus')}</span><span class="row-label">Aggiungi un movimento a mano</span></button>
        </div>
      </div>`);
    s.el.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) s.close(b.dataset.a); });
    const a = await s.closed;
    if (a === 'import') openImport();
    if (a === 'add') openManualAdd();
  }

  // Tocco: apre il dettaglio (o seleziona). Swipe: cambia categoria o area.
  function wireRows(listEl) {
    let start = null;
    listEl.addEventListener('pointerdown', (e) => {
      const main = e.target.closest('.tx-main');
      if (!main || e.button > 0) return;
      start = { x: e.clientX, y: e.clientY, main, row: main.closest('.tx-row'), swiping: false, dx: 0, id: e.pointerId };
    });
    listEl.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id || selectMode) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!start.swiping) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          start.swiping = true;
          start.main.setPointerCapture(e.pointerId);
          start.row.classList.add('swiping');
        } else if (Math.abs(dy) > 10) { start = null; return; } else return;
      }
      start.dx = Math.max(-130, Math.min(130, dx));
      start.main.style.transform = `translateX(${start.dx}px)`;
      start.row.classList.toggle('reveal-cat', start.dx < -70);
      start.row.classList.toggle('reveal-area', start.dx > 70);
    });
    const end = async (e) => {
      if (!start || e.pointerId !== start.id) return;
      const s = start;
      start = null;
      if (!s.swiping) return;
      s.row.classList.remove('swiping', 'reveal-cat', 'reveal-area');
      s.main.style.transform = '';
      s.row.dataset.justSwiped = '1';
      setTimeout(() => { delete s.row.dataset.justSwiped; }, 350);
      const t = M.tx(s.row.dataset.id);
      if (!t || t.splits?.length) return;
      if (s.dx < -70) {
        const c = await pickCategory(t.categoryId);
        if (c) await setCategory(M.tx(t.id), c);
      } else if (s.dx > 70) {
        const a = await pickArea(t.areaId);
        if (a !== null) await setArea(M.tx(t.id), a);
      }
    };
    listEl.addEventListener('pointerup', end);
    listEl.addEventListener('pointercancel', end);
    listEl.addEventListener('click', (e) => {
      const row = e.target.closest('.tx-row');
      if (!row || row.dataset.justSwiped) return;
      if (selectMode) {
        const id = row.dataset.id;
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        const y = window.scrollY;
        draw();
        window.scrollTo(0, y);
        return;
      }
      openTxDetail(row.dataset.id);
    });
  }

  draw();
  const unsub = S.subscribe((col) => {
    if (['tx', 'accounts', 'categories', 'areas', 'rules', '*'].includes(col)) {
      const y = window.scrollY;
      draw();
      window.scrollTo(0, y);
    }
  });
  return () => { off?.(); unsub(); };
}
