// Impostazioni dei dati: conti, categorie, aree, regole.

import { html, setHtml, uid, formatShort } from '../util.js';
import { icon } from '../ui/icons.js';
import { page, enhancePage } from '../ui/page.js';
import { group, rowIcon } from '../ui/list.js';
import { openSheet, confirmDialog, toast } from '../ui/sheet.js';
import { formatCents } from '../money.js';
import { PICKABLE_ICONS, PICKABLE_COLORS } from '../data/defaults.js';
import * as M from '../data/model.js';
import * as S from '../store.js';

const BACK = { href: 'impostazioni', label: 'Impostazioni' };
const ROLES = [['spendibile', 'Spendibile'], ['risparmio', 'Risparmio'], ['vincolato', 'Vincolato']];
const KINDS = [['spesa', 'Uscita'], ['entrata', 'Entrata']];

function live(el, draw, cols) {
  draw();
  const unsub = S.subscribe((c) => { if (cols.includes(c) || c === '*') draw(); });
  return unsub;
}

// ---------------------------------------------------------------- Conti
export function accountsPage(el) {
  let off = null;
  const draw = () => {
    off?.();
    const list = M.accounts();
    setHtml(el, page({
      title: 'Conti',
      back: BACK,
      large: false,
      body: html`
        ${list.length ? group({
          rows: list.map((a) => html`
            <button type="button" class="row" data-id="${a.id}">
              ${rowIcon(a.type === 'contanti' ? 'cash' : 'bank', 'var(--s5)')}
              <span class="row-label">${a.name}<small>${ROLES.find((r) => r[0] === (a.role || 'spendibile'))[1]}${a.balance?.asOf ? ` · saldo al ${formatShort(a.balance.asOf)}` : ''}</small></span>
              <span class="row-detail">${formatCents(M.accountBalance(a))}</span>
              <span class="chev">${icon('chevron-right')}</span>
            </button>`),
          footer: 'Il ruolo decide dove conta il saldo: «Spendibile» va nello spendibile, «Risparmio» solo nel patrimonio, «Vincolato» è tenuto a parte.',
        }) : html`<p class="page-intro">Nessun conto. I conti si creano da soli al primo import di un estratto conto.</p>`}`,
    }));
    off = enhancePage(el);
    el.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => editAccount(M.account(b.dataset.id)); });
  };
  const unsub = live(el, draw, ['accounts', 'tx']);
  return () => { off?.(); unsub(); };
}

function editAccount(a) {
  const s = openSheet(html`
    <form class="dialog" novalidate>
      <h2>${a.name}</h2>
      <label class="field"><input class="text" name="name" value="${a.name}" placeholder="Nome del conto"></label>
      ${a.type === 'contanti' ? html`
        <label class="field field-row"><span>In tasca adesso</span><input class="text" name="cash" inputmode="decimal" value="${(M.accountBalance(a) / 100).toFixed(2).replace('.', ',')}"></label>
        <p class="group-footer">I prelievi al bancomat aumentano i contanti, le spese che segni sul conto «Contanti» li diminuiscono. Se il totale non torna, correggilo qui.</p>` : ''}
      <h3 class="picker-title">Ruolo</h3>
      <div class="segmented wide" data-seg="role">${ROLES.map(([v, l]) => html`<button type="button" class="${(a.role || 'spendibile') === v ? 'on' : ''}" data-value="${v}">${l}</button>`)}</div>
      <div class="dialog-actions">
        <button type="submit" class="btn">Salva</button>
        <button type="button" class="btn secondary destructive-text" data-delete>Elimina conto e movimenti</button>
      </div>
    </form>`);
  const form = s.el.querySelector('form');
  let role = a.role || 'spendibile';
  form.querySelector('[data-seg=role]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (!b) return;
    role = b.dataset.value;
    form.querySelectorAll('[data-seg=role] button').forEach((x) => x.classList.toggle('on', x === b));
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const next = { ...a, name: form.elements.name.value.trim() || a.name, role };
    if (a.type === 'contanti' && form.elements.cash) {
      const n = Number(form.elements.cash.value.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
      if (Number.isFinite(n)) next.openingCents = Math.round(n * 100) - M.accountMovementsCents(a);
    }
    await S.put('accounts', a.id, next);
    s.close();
  };
  form.querySelector('[data-delete]').onclick = async () => {
    const n = M.txs().filter((t) => t.accountId === a.id).length;
    const ok = await confirmDialog({
      title: `Eliminare «${a.name}»?`,
      message: `Verranno eliminati anche ${n} movimenti. Puoi recuperarli reimportando gli estratti conto.`,
      confirmLabel: 'Elimina',
      destructive: true,
    });
    if (!ok) return;
    await S.removeMany('tx', M.txs().filter((t) => t.accountId === a.id).map((t) => t.id));
    await S.remove('accounts', a.id);
    s.close();
    toast('Conto eliminato');
  };
}

// ---------------------------------------------------------------- Categorie
export function categoriesPage(el) {
  let off = null;
  const draw = () => {
    off?.();
    const cats = M.categories();
    const counts = new Map();
    for (const t of M.txs()) counts.set(t.categoryId, (counts.get(t.categoryId) || 0) + 1);
    const row = (c) => html`
      <button type="button" class="row" data-id="${c.id}">
        ${rowIcon(c.icon, c.color)}
        <span class="row-label">${c.name}<small>${M.area(c.areaId)?.name || 'Nessuna area'}${counts.get(c.id) ? ` · ${counts.get(c.id)} movimenti` : ''}</small></span>
        <span class="chev">${icon('chevron-right')}</span>
      </button>`;
    setHtml(el, page({
      title: 'Categorie',
      back: BACK,
      large: false,
      right: html`<button type="button" class="nav-icon-btn" data-new aria-label="Nuova categoria">${icon('plus')}</button>`,
      body: html`
        ${group({ title: 'Uscite', rows: cats.filter((c) => c.kind === 'spesa').map(row) })}
        ${group({ title: 'Entrate', rows: cats.filter((c) => c.kind === 'entrata').map(row) })}
        ${group({ title: 'Altro', rows: cats.filter((c) => !['spesa', 'entrata'].includes(c.kind)).map(row), footer: 'Giroconti e investimenti non contano né come entrate né come uscite.' })}`,
    }));
    off = enhancePage(el);
    el.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => editCategory(M.category(b.dataset.id)); });
    el.querySelector('[data-new]').onclick = () => editCategory(null);
  };
  const unsub = live(el, draw, ['categories', 'tx', 'areas']);
  return () => { off?.(); unsub(); };
}

function iconColorPicker(curIcon, curColor) {
  return html`
    <h3 class="picker-title">Colore</h3>
    <div class="swatches">${PICKABLE_COLORS.map((c) => html`<button type="button" class="swatch ${c === curColor ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Colore"></button>`)}</div>
    <h3 class="picker-title">Icona</h3>
    <div class="icon-grid">${PICKABLE_ICONS.map((n) => html`<button type="button" class="icon-pick ${n === curIcon ? 'on' : ''}" data-icon="${n}">${icon(n)}</button>`)}</div>`;
}

function wireIconColor(root, state) {
  root.querySelectorAll('[data-color]').forEach((b) => {
    b.onclick = () => { state.color = b.dataset.color; root.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b)); };
  });
  root.querySelectorAll('[data-icon]').forEach((b) => {
    b.onclick = () => { state.icon = b.dataset.icon; root.querySelectorAll('[data-icon]').forEach((x) => x.classList.toggle('on', x === b)); };
  });
}

function editCategory(c) {
  const isNew = !c;
  const fixed = c && ['nc', 'giroconto'].includes(c.id);
  const state = { icon: c?.icon || 'tag', color: c?.color || 'var(--s1)', kind: c?.kind || 'spesa' };
  const s = openSheet(html`
    <form class="dialog" novalidate>
      <h2>${isNew ? 'Nuova categoria' : c.name}</h2>
      <label class="field"><input class="text" name="name" value="${c?.name || ''}" placeholder="Nome" required></label>
      ${isNew ? html`<div class="segmented wide" data-seg="kind">${KINDS.map(([v, l]) => html`<button type="button" class="${state.kind === v ? 'on' : ''}" data-value="${v}">${l}</button>`)}</div>` : ''}
      <label class="field field-row"><span>Area predefinita</span>
        <select name="area"><option value="">Nessuna</option>${M.areas().map((a) => html`<option value="${a.id}" ${a.id === c?.areaId ? 'selected' : ''}>${a.name}</option>`)}</select>
      </label>
      ${iconColorPicker(state.icon, state.color)}
      <div class="dialog-actions">
        <button type="submit" class="btn">${isNew ? 'Crea' : 'Salva'}</button>
        ${!isNew && !fixed ? html`<button type="button" class="btn secondary destructive-text" data-delete>Elimina categoria</button>` : ''}
      </div>
    </form>`, { className: 'tall' });
  const form = s.el.querySelector('form');
  wireIconColor(form, state);
  const seg = form.querySelector('[data-seg=kind]');
  if (seg) {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-value]');
      if (!b) return;
      state.kind = b.dataset.value;
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    });
  }
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) return;
    const areaId = form.elements.area.value || null;
    const next = isNew
      ? { id: uid(), name, kind: state.kind, icon: state.icon, color: state.color, areaId, order: 50 }
      : { ...c, name, icon: state.icon, color: state.color, areaId };
    await S.put('categories', next.id, next);
    // Se cambia l'area predefinita, i movimenti senza area scelta a mano la seguono.
    if (!isNew && c.areaId !== areaId) {
      await S.putMany('tx', M.txs().filter((t) => t.categoryId === c.id && !t.manual?.area).map((t) => ({ ...t, areaId })));
    }
    s.close();
  };
  const del = form.querySelector('[data-delete]');
  if (del) {
    del.onclick = async () => {
      const affected = M.txs().filter((t) => t.categoryId === c.id);
      const ok = await confirmDialog({
        title: `Eliminare «${c.name}»?`,
        message: affected.length ? `${affected.length} movimenti torneranno «Da classificare».` : 'Nessun movimento usa questa categoria.',
        confirmLabel: 'Elimina',
        destructive: true,
      });
      if (!ok) return;
      await S.putMany('tx', affected.map((t) => ({ ...t, categoryId: 'nc', manual: { ...(t.manual || {}), category: false } })));
      await S.removeMany('rules', M.rules().filter((r) => r.categoryId === c.id).map((r) => r.id));
      await S.remove('categories', c.id);
      await M.reclassifyAll();
      s.close();
    };
  }
}

// ---------------------------------------------------------------- Aree
export function areasPage(el) {
  let off = null;
  const draw = () => {
    off?.();
    const list = M.areas();
    setHtml(el, page({
      title: 'Aree',
      back: BACK,
      large: false,
      right: html`<button type="button" class="nav-icon-btn" data-new aria-label="Nuova area">${icon('plus')}</button>`,
      body: html`
        <p class="page-intro">Le aree raccolgono le spese per parte della tua vita (casa, macchina, lavoro…), indipendentemente dalla categoria.</p>
        ${group({
          rows: list.map((a) => html`
            <button type="button" class="row" data-id="${a.id}">
              ${rowIcon(a.icon, a.color)}<span class="row-label">${a.name}</span><span class="chev">${icon('chevron-right')}</span>
            </button>`),
        })}`,
    }));
    off = enhancePage(el);
    el.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => editArea(M.area(b.dataset.id)); });
    el.querySelector('[data-new]').onclick = () => editArea(null);
  };
  const unsub = live(el, draw, ['areas']);
  return () => { off?.(); unsub(); };
}

function editArea(a) {
  const isNew = !a;
  const state = { icon: a?.icon || 'tag', color: a?.color || 'var(--s1)' };
  const s = openSheet(html`
    <form class="dialog" novalidate>
      <h2>${isNew ? 'Nuova area' : a.name}</h2>
      <label class="field"><input class="text" name="name" value="${a?.name || ''}" placeholder="Nome (per esempio Vacanze)" required></label>
      ${iconColorPicker(state.icon, state.color)}
      <div class="dialog-actions">
        <button type="submit" class="btn">${isNew ? 'Crea' : 'Salva'}</button>
        ${!isNew ? html`<button type="button" class="btn secondary destructive-text" data-delete>Elimina area</button>` : ''}
      </div>
    </form>`, { className: 'tall' });
  const form = s.el.querySelector('form');
  wireIconColor(form, state);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) return;
    const next = isNew ? { id: uid(), name, icon: state.icon, color: state.color, order: 50 } : { ...a, name, icon: state.icon, color: state.color };
    await S.put('areas', next.id, next);
    s.close();
  };
  const del = form.querySelector('[data-delete]');
  if (del) {
    del.onclick = async () => {
      const ok = await confirmDialog({ title: `Eliminare «${a.name}»?`, message: 'I movimenti di quest\'area resteranno senza area.', confirmLabel: 'Elimina', destructive: true });
      if (!ok) return;
      await S.putMany('tx', M.txs().filter((t) => t.areaId === a.id).map((t) => ({ ...t, areaId: null })));
      await S.putMany('categories', M.categories().filter((c) => c.areaId === a.id).map((c) => ({ ...c, areaId: null })));
      await S.remove('areas', a.id);
      s.close();
    };
  }
}

// ---------------------------------------------------------------- Regole
export function rulesPage(el) {
  let off = null;
  const draw = () => {
    off?.();
    const list = M.rules();
    setHtml(el, page({
      title: 'Regole',
      back: BACK,
      large: false,
      body: html`
        ${list.length ? group({
          title: 'Le tue regole',
          rows: list.map((r) => {
            const c = M.category(r.categoryId);
            return html`<div class="row static">
              ${rowIcon(c.icon, c.color)}
              <span class="row-label">${r.label || r.pattern}<small>→ ${c.name}</small></span>
              <button type="button" class="icon-btn" data-del="${r.id}" aria-label="Elimina regola">${icon('trash')}</button>
            </div>`;
          }),
          footer: 'Le regole nascono quando cambi la categoria di un movimento e scegli «Sì, sempre». Valgono prima di quelle predefinite.',
        }) : html`<p class="page-intro">Non hai ancora regole. Quando cambi la categoria di un movimento, l'app ti chiede se applicarla sempre a quell'esercente.</p>`}
        ${group({ title: 'Regole predefinite', rows: html`<div class="row static prose">L'app riconosce già stipendio, rate del PAC, commissioni, prelievi, bonifici tra i tuoi conti e molte catene comuni (supermercati, carburante, Amazon, abbonamenti, utenze…).</div>` })}`,
    }));
    off = enhancePage(el);
    el.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        await S.remove('rules', b.dataset.del);
        const n = await M.reclassifyAll();
        toast(n ? `Regola eliminata · ${n} movimenti riclassificati` : 'Regola eliminata');
      };
    });
  };
  const unsub = live(el, draw, ['rules', 'categories']);
  return () => { off?.(); unsub(); };
}
