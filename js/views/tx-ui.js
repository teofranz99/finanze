// Componenti condivisi per i movimenti: icone, scelta categoria/area, dettaglio,
// divisione, inserimento manuale e procedura di import.

import { html, uid } from '../util.js';
import { icon } from '../ui/icons.js';
import { openSheet, confirmDialog, toast } from '../ui/sheet.js';
import { formatCents, isoToday } from '../money.js';
import * as M from '../data/model.js';
import * as S from '../store.js';
import { readStatement, plan as planImport, commit as commitImport, saveTemplateAndApply } from '../import/importer.js';
import { applyTemplate, validateMapping } from '../import/template.js';
import { subForTx } from '../data/subs.js';
import { fund } from '../data/funds.js';

// ---------------------------------------------------------------- Formattazione
export function txIcon(t, big = false) {
  const c = t.splits?.length ? null : M.category(t.categoryId);
  const name = c ? c.icon : 'split';
  const color = c ? c.color : 'var(--s10)';
  return html`<span class="tx-icon ${big ? 'big' : ''}" style="background:${color}">${icon(name)}</span>`;
}

export function amountClass(t) {
  if (t.fundId || t.repays?.length) return 'neutral';
  const k = M.kindOf(t);
  if (k === 'giroconto' || k === 'investimento') return 'neutral';
  return t.cents > 0 ? 'positive' : '';
}

const dayFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const dayFmtY = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export function dayLabel(iso) {
  const today = isoToday();
  const y = new Date(Date.now() - 86400000);
  const p = (n) => String(n).padStart(2, '0');
  const yesterday = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}`;
  if (iso === today) return 'Oggi';
  if (iso === yesterday) return 'Ieri';
  const d = new Date(`${iso}T12:00:00`);
  const s = (d.getFullYear() === new Date().getFullYear() ? dayFmt : dayFmtY).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Fondo, spesa divisa o rimborso: si vede nella lista dei movimenti.
function linkNote(t) {
  if (t.fundId) return `Fondo ${fund(t.fundId)?.name || ''}`.trim();
  if (t.share?.people?.length) return `Divisa · tua quota ${formatCents(t.share.mine)}`;
  if (t.repays?.length) return 'Rimborso di una spesa divisa';
  return '';
}

export function subtitle(t) {
  const note = linkNote(t);
  const base = baseSubtitle(t);
  return note ? `${note} · ${base}` : base;
}

function baseSubtitle(t) {
  if (t.splits?.length) return `Diviso in ${t.splits.length} parti`;
  if (t.transferAccountId && M.account(t.transferAccountId)) {
    return `Giroconto ${t.cents < 0 ? 'verso' : 'da'} ${M.account(t.transferAccountId).name}`;
  }
  const c = M.category(t.categoryId);
  const a = M.area(t.areaId);
  return [c?.name, a?.name].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- Scelta categoria
const KIND_GROUPS = [
  ['spesa', 'Uscite'],
  ['entrata', 'Entrate'],
  ['altro', 'Altro'],
];

// Griglia di icone con il nome sotto. groups: [{ label, items: [{ id, name, icon, color }] }].
// Restituisce l'id scelto, oppure null se il foglio viene chiuso.
export function gridPicker({ title, groups, current }) {
  const s = openSheet(html`
    <div class="dialog picker">
      <h2>${title}</h2>
      ${groups.filter((g) => g.items.length).map((g) => html`
        ${g.label ? html`<h3 class="picker-title">${g.label}</h3>` : ''}
        <div class="cat-grid">${g.items.map((it) => html`
          <button type="button" class="cat-chip ${it.id === current ? 'on' : ''}" data-id="${it.id}">
            <span class="tx-icon" style="background:${it.color}">${icon(it.icon)}</span>
            <span>${it.name}</span>
          </button>`)}</div>`)}
    </div>`);
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) s.close(b.dataset.id);
  });
  return s.closed;
}

// Categorie raggruppate per tipo (Uscite, Entrate, Altro), pronte per la griglia.
export function categoryGroups() {
  const cats = M.categories();
  const groupOf = (c) => (c.kind === 'spesa' ? 'spesa' : c.kind === 'entrata' ? 'entrata' : 'altro');
  return KIND_GROUPS.map(([g, label]) => ({ label, items: cats.filter((c) => groupOf(c) === g) }));
}

export const areaItems = () => M.areas().map((a) => ({ id: a.id, name: a.name, icon: a.icon, color: a.color }));
export const NO_AREA = { name: 'Nessuna area', icon: 'close', color: 'var(--s10)' };

export function pickCategory(currentId) {
  return gridPicker({ title: 'Categoria', groups: categoryGroups(), current: currentId });
}

// Restituisce l'id dell'area, '' per "nessuna area", null se annullato.
export function pickArea(currentId) {
  return gridPicker({
    title: 'Area',
    groups: [{ items: [...areaItems(), { id: '', ...NO_AREA }] }],
    current: currentId || '',
  });
}

// Cambia categoria a un movimento e propone di farne una regola per quell'esercente.
export async function setCategory(t, categoryId, { ask = true } = {}) {
  if (!categoryId || categoryId === t.categoryId) return;
  await S.put('tx', t.id, M.withCategory(t, categoryId));
  if (categoryId === 'contanti') await M.ensureCashAccount();
  if (!ask || !t.merchant || categoryId === 'nc' || t.splits?.length) return;
  const cur = M.tx(t.id);
  // Se il movimento ha già un nome scelto (es. PayPal → Spotify), la regola porta anche quello.
  const patch = { categoryId, ...(cur.alias && cur.manual?.alias ? { alias: cur.alias } : {}) };
  await askRule(cur, patch);
}

// Chi riconoscere: «i movimenti di X» oppure, per gli intermediari, «i pagamenti PayPal di 11,99 €».
function ruleSubject(t) {
  const s = M.ruleScope(t);
  return s.amountCents != null ? `I pagamenti ${t.merchant} di ${formatCents(s.amountCents)}` : `I movimenti di «${t.merchant}»`;
}

async function askRule(t, patch) {
  const n = M.similarCount(t, patch);
  const parts = [];
  if (patch.alias) parts.push(`si chiameranno «${patch.alias}»`);
  if (patch.categoryId) parts.push(`andranno in ${M.category(patch.categoryId).name}`);
  const yes = await confirmDialog({
    title: 'Riconoscerli in automatico?',
    message: `${ruleSubject(t)} ${parts.join(' e ')}.${n ? ` Vale anche per ${n} ${n === 1 ? 'movimento già importato' : 'movimenti già importati'}.` : ''}`,
    confirmLabel: 'Sì, sempre',
    cancelLabel: 'Solo questo',
  });
  if (yes) {
    const changed = await M.saveRule(t, patch);
    toast(changed ? `Regola creata · ${changed} movimenti aggiornati` : 'Regola creata');
  }
}

// Dare un nome a un movimento (es. PayPal → Spotify). Vuoto = torna il nome della banca.
export async function renameTx(id) {
  const t = M.tx(id);
  const s = openSheet(html`
    <form class="dialog" novalidate>
      <h2>Nome del movimento</h2>
      <p>Dalla banca: «${t.merchant}». Scrivi come vuoi vederlo, per esempio «Spotify».</p>
      <label class="field"><input class="text" name="alias" value="${t.alias || ''}" placeholder="${t.merchant}" autocapitalize="words"></label>
      <div class="dialog-actions">
        <button type="submit" class="btn">Salva</button>
        ${t.alias ? html`<button type="button" class="btn secondary" data-reset>Usa il nome della banca</button>` : ''}
      </div>
    </form>`);
  const form = s.el.querySelector('form');
  setTimeout(() => form.elements.alias.focus(), 350);
  const reset = form.querySelector('[data-reset]');
  if (reset) reset.onclick = () => s.close('');
  form.onsubmit = (e) => { e.preventDefault(); s.close(form.elements.alias.value.trim()); };
  const value = await s.closed;
  if (value == null) return;
  const cur = M.tx(id);
  if (!value) {
    await S.put('tx', id, M.autoClassify({ ...cur, alias: null, manual: { ...(cur.manual || {}), alias: false } }));
    return;
  }
  if (value === cur.alias) return;
  await S.put('tx', id, { ...cur, alias: value, manual: { ...(cur.manual || {}), alias: true } });
  const next = M.tx(id);
  const patch = { alias: value, ...(next.categoryId !== 'nc' ? { categoryId: next.categoryId } : {}) };
  await askRule(next, patch);
}

export async function setArea(t, areaId) {
  await S.put('tx', t.id, M.withArea(t, areaId || null));
}

// ---------------------------------------------------------------- Dettaglio
export function openTxDetail(id) {
  const s = openSheet(html`<div class="tx-detail"></div>`, { className: 'tall' });
  const root = s.el.querySelector('.tx-detail');
  const off = S.subscribe((col) => { if (['tx', 'subs', 'funds', '*'].includes(col)) draw(); });
  s.closed.then(off);

  // Le righe di fondi e spese divise arrivano da fondi.js, caricato al primo uso.
  let F = null;
  import('./fondi.js').then((m) => { F = m; draw(); });

  function draw() {
    const t = M.tx(id);
    if (!t) { s.close(); return; }
    const acc = M.account(t.accountId);
    const extraRows = F ? F.txRows(t) : '';
    const d = new Date(`${t.date}T12:00:00`);
    root.innerHTML = String(html`
      <div class="txd-head">
        ${txIcon(t, true)}
        <div class="txd-amount ${amountClass(t)}">${formatCents(t.cents, { sign: true })}</div>
        ${t.origCurrency ? html`<div class="txd-orig">${(t.origCents / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 })} ${t.origCurrency}</div>` : ''}
        <button type="button" class="txd-merchant" data-act="rename">${M.displayName(t)} ${icon('pencil')}</button>
        ${t.alias ? html`<div class="txd-meta">Dalla banca: ${t.merchant}</div>` : ''}
        <div class="txd-meta">${new Intl.DateTimeFormat('it-IT', { dateStyle: 'full' }).format(d)}${acc ? ` · ${acc.name}` : ''}</div>
        ${t.pending ? html`<span class="badge">Non ancora consolidato</span>` : ''}
      </div>

      <div class="list">
        <button type="button" class="row" data-act="cat" ${t.splits?.length ? 'disabled' : ''}>
          <span class="row-label">Categoria</span>
          <span class="row-detail">${t.splits?.length ? 'Divisa' : M.category(t.categoryId).name}</span>
          <span class="chev">${icon('chevron-right')}</span>
        </button>
        <button type="button" class="row" data-act="area" ${t.splits?.length ? 'disabled' : ''}>
          <span class="row-label">Area</span>
          <span class="row-detail">${t.splits?.length ? 'Divisa' : (M.area(t.areaId)?.name || 'Nessuna')}</span>
          <span class="chev">${icon('chevron-right')}</span>
        </button>
        <button type="button" class="row" data-act="split">
          <span class="row-label">${t.splits?.length ? 'Modifica la divisione' : 'Dividi tra aree o categorie'}</span>
          <span class="chev">${icon('chevron-right')}</span>
        </button>
        ${t.cents < 0 && !t.fundId ? subRow(t) : ''}
        ${extraRows}
      </div>
      ${t.splits?.length ? html`<div class="split-summary">${t.splits.map((p) => html`
        <div><span>${M.category(p.categoryId).name}${p.areaId ? ` · ${M.area(p.areaId)?.name || ''}` : ''}</span><b>${formatCents(p.cents)}</b></div>`)}</div>` : ''}

      <h3 class="group-title">Tag</h3>
      <div class="list"><div class="row static tag-row">
        ${(t.tags || []).map((g) => html`<button type="button" class="tag-chip" data-tag="${g}">#${g} ${icon('close')}</button>`)}
        <input class="tag-input" placeholder="${t.tags?.length ? 'Aggiungi…' : 'Per esempio vacanza2027'}" enterkeyhint="done" autocapitalize="off">
      </div></div>

      <h3 class="group-title">Nota</h3>
      <div class="list"><textarea class="note-input" rows="2" placeholder="Aggiungi una nota">${t.note || ''}</textarea></div>

      <details class="txd-raw">
        <summary>Dettagli dalla banca</summary>
        <dl>
          <dt>Data contabile</dt><dd>${t.date}</dd>
          ${t.valueDate ? html`<dt>Valuta</dt><dd>${t.valueDate}</dd>` : ''}
          ${t.opDate ? html`<dt>Operazione</dt><dd>${t.opDate} ${t.opTime || ''}</dd>` : ''}
          ${t.causale ? html`<dt>Causale</dt><dd>${t.causale}</dd>` : ''}
          ${t.description ? html`<dt>Descrizione</dt><dd>${t.description}</dd>` : ''}
        </dl>
      </details>

      <div class="list danger-list"><button type="button" class="row destructive" data-act="delete"><span class="row-label">Elimina movimento</span></button></div>`);
    wire(t);
  }

  function wire(t) {
    root.querySelector('[data-act=rename]').onclick = () => renameTx(id);
    root.querySelectorAll('[data-fx]').forEach((b) => { b.onclick = () => F?.txAction(M.tx(id), b.dataset.fx); });
    const sb = root.querySelector('[data-act=sub]');
    // Import al momento del tocco: abbonamenti.js usa a sua volta questo file.
    if (sb) sb.onclick = async () => { const A = await import('./abbonamenti.js'); A.markTxAsSub(M.tx(id)); };
    root.querySelector('[data-act=cat]').onclick = async () => {
      const c = await pickCategory(t.categoryId);
      if (c) await setCategory(M.tx(id), c);
    };
    root.querySelector('[data-act=area]').onclick = async () => {
      const a = await pickArea(t.areaId);
      if (a !== null) await setArea(M.tx(id), a);
    };
    root.querySelector('[data-act=split]').onclick = () => openSplit(M.tx(id));
    root.querySelector('[data-act=delete]').onclick = async () => {
      const ok = await confirmDialog({
        title: 'Eliminare il movimento?',
        message: t.source === 'import' ? 'Se reimporti lo stesso estratto conto, tornerà.' : 'Non si può annullare.',
        confirmLabel: 'Elimina',
        destructive: true,
      });
      if (ok) { await S.remove('tx', id); s.close(); toast('Movimento eliminato'); }
    };
    const tagInput = root.querySelector('.tag-input');
    const addTag = async () => {
      const v = tagInput.value.trim().replace(/^#/, '').replace(/\s+/g, '');
      if (!v) return;
      const cur = M.tx(id);
      if (!(cur.tags || []).includes(v)) await S.put('tx', id, { ...cur, tags: [...(cur.tags || []), v] });
      else tagInput.value = '';
    };
    tagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); addTag(); } });
    tagInput.addEventListener('blur', addTag);
    root.querySelectorAll('[data-tag]').forEach((b) => {
      b.onclick = async () => {
        const cur = M.tx(id);
        await S.put('tx', id, { ...cur, tags: (cur.tags || []).filter((g) => g !== b.dataset.tag) });
      };
    });
    const note = root.querySelector('.note-input');
    note.addEventListener('change', async () => {
      const cur = M.tx(id);
      if ((cur.note || '') !== note.value) await S.put('tx', id, { ...cur, note: note.value });
    });
  }

  draw();
}

// Riga «Abbonamento»: porta alla scheda se il movimento è già di un abbonamento,
// altrimenti permette di crearne uno.
function subRow(t) {
  const s = subForTx(t);
  const known = s && s.status !== 'scartato';
  return html`<button type="button" class="row" data-act="sub">
    <span class="row-label">${known ? 'Abbonamento' : 'Questo è un abbonamento'}</span>
    ${known ? html`<span class="row-detail">${s.name}${s.status === 'chiuso' ? ' (disdetto)' : ''}</span>` : ''}
    <span class="chev">${icon('chevron-right')}</span>
  </button>`;
}

// ---------------------------------------------------------------- Divisione
function parseEuroInput(v) {
  const t = String(v).trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
const euroInput = (cents) => (Math.abs(cents) / 100).toFixed(2).replace('.', ',');

export function openSplit(t) {
  const sign = t.cents < 0 ? -1 : 1;
  const total = Math.abs(t.cents);
  let parts = (t.splits?.length ? t.splits : [
    { cents: t.cents, categoryId: t.categoryId, areaId: t.areaId },
    { cents: 0, categoryId: t.categoryId, areaId: null },
  ]).map((p) => ({ ...p, abs: Math.abs(p.cents) }));

  const s = openSheet(html`<div class="dialog split-sheet"></div>`, { className: 'tall' });
  const root = s.el.querySelector('.split-sheet');
  const cats = M.categories();
  const areas = M.areas();

  function draw() {
    const used = parts.reduce((a, p) => a + (p.abs || 0), 0);
    const left = total - used;
    root.innerHTML = String(html`
      <h2>Dividi ${formatCents(total)}</h2>
      <p>Per esempio un ordine Amazon in parte per casa e in parte per lavoro.</p>
      <div class="split-parts">
        ${parts.map((p, i) => html`
          <div class="split-part" data-i="${i}">
            <div class="split-top">
              <label class="field money"><span>€</span><input class="text" inputmode="decimal" data-f="amount" value="${euroInput(p.abs)}"></label>
              ${parts.length > 2 ? html`<button type="button" class="icon-btn" data-remove="${i}" aria-label="Rimuovi">${icon('close')}</button>` : ''}
            </div>
            <div class="split-selects">
              <select data-f="cat">${cats.map((c) => html`<option value="${c.id}" ${c.id === p.categoryId ? 'selected' : ''}>${c.name}</option>`)}</select>
              <select data-f="area"><option value="">Nessuna area</option>${areas.map((a) => html`<option value="${a.id}" ${a.id === p.areaId ? 'selected' : ''}>${a.name}</option>`)}</select>
            </div>
          </div>`)}
      </div>
      <button type="button" class="btn plain" data-add>${icon('plus')}<span>Aggiungi una parte</span></button>
      <p class="split-left ${left === 0 ? 'ok' : 'ko'}">${left === 0 ? 'Le parti tornano con il totale' : left > 0 ? `Mancano ${formatCents(left)}` : `Hai superato il totale di ${formatCents(-left)}`}</p>
      <div class="dialog-actions">
        <button type="button" class="btn" data-save ${left !== 0 ? 'disabled' : ''}>Salva divisione</button>
        ${t.splits?.length ? html`<button type="button" class="btn secondary" data-unsplit>Togli la divisione</button>` : ''}
      </div>`);
    wire();
  }

  function wire() {
    root.querySelectorAll('.split-part').forEach((el) => {
      const i = Number(el.dataset.i);
      el.querySelector('[data-f=amount]').addEventListener('change', (e) => {
        const v = parseEuroInput(e.target.value);
        parts[i].abs = v == null ? 0 : Math.abs(v);
        // Con due parti, la seconda si adegua da sola.
        if (parts.length === 2) parts[1 - i].abs = Math.max(0, total - parts[i].abs);
        draw();
      });
      el.querySelector('[data-f=cat]').onchange = (e) => {
        parts[i].categoryId = e.target.value;
        if (!parts[i].areaId) parts[i].areaId = M.category(e.target.value)?.areaId ?? null;
        draw();
      };
      el.querySelector('[data-f=area]').onchange = (e) => { parts[i].areaId = e.target.value || null; };
    });
    root.querySelectorAll('[data-remove]').forEach((b) => { b.onclick = () => { parts.splice(Number(b.dataset.remove), 1); draw(); }; });
    root.querySelector('[data-add]').onclick = () => {
      const used = parts.reduce((a, p) => a + p.abs, 0);
      parts.push({ abs: Math.max(0, total - used), categoryId: t.categoryId, areaId: null });
      draw();
    };
    root.querySelector('[data-save]').onclick = async () => {
      const splits = parts.filter((p) => p.abs > 0).map((p) => ({ cents: sign * p.abs, categoryId: p.categoryId, areaId: p.areaId || null }));
      await S.put('tx', t.id, { ...M.tx(t.id), splits: splits.length > 1 ? splits : null });
      s.close();
      toast('Divisione salvata');
    };
    const un = root.querySelector('[data-unsplit]');
    if (un) un.onclick = async () => { await S.put('tx', t.id, { ...M.tx(t.id), splits: null }); s.close(); };
  }

  draw();
}

// ---------------------------------------------------------------- Inserimento manuale
export function openManualAdd() {
  const accs = M.accounts();
  let sign = -1;
  let categoryId = 'nc';
  const s = openSheet(html`
    <form class="dialog manual-add" novalidate>
      <h2>Nuovo movimento</h2>
      <div class="segmented wide" data-seg="sign">
        <button type="button" class="on" data-value="-1">Uscita</button>
        <button type="button" data-value="1">Entrata</button>
      </div>
      <label class="field money big"><span>€</span><input class="text" name="amount" inputmode="decimal" placeholder="0,00" required></label>
      <div class="field-group">
        <label class="field"><input class="text" name="merchant" placeholder="Descrizione (per esempio Bar)" autocapitalize="sentences"></label>
        <label class="field field-row"><span>Data</span><input class="text" type="date" name="date" value="${isoToday()}"></label>
        <label class="field field-row"><span>Conto</span>
          <select name="account">
            ${accs.map((a) => html`<option value="${a.id}" ${a.type === 'contanti' ? 'selected' : ''}>${a.name}</option>`)}
            ${accs.some((a) => a.type === 'contanti') ? '' : html`<option value="__cash" selected>Contanti</option>`}
          </select>
        </label>
        <button type="button" class="field field-row picker-field" data-cat><span>Categoria</span><b>${M.category('nc').name}</b></button>
      </div>
      <p class="form-error" hidden></p>
      <div class="dialog-actions">
        <button type="submit" class="btn">Aggiungi</button>
        <button type="button" class="btn secondary" data-cancel>Annulla</button>
      </div>
    </form>`);
  const form = s.el.querySelector('form');
  setTimeout(() => form.elements.amount.focus(), 350);
  form.querySelector('[data-cancel]').onclick = () => s.close();
  form.querySelector('[data-seg=sign]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (!b) return;
    sign = Number(b.dataset.value);
    form.querySelectorAll('[data-seg=sign] button').forEach((x) => x.classList.toggle('on', x === b));
  });
  form.querySelector('[data-cat]').onclick = async () => {
    const c = await pickCategory(categoryId);
    if (c) { categoryId = c; form.querySelector('[data-cat] b').textContent = M.category(c).name; }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const cents = parseEuroInput(form.elements.amount.value);
    const err = form.querySelector('.form-error');
    if (!cents) { err.textContent = 'Scrivi un importo.'; err.hidden = false; return; }
    let accountId = form.elements.account.value;
    if (accountId === '__cash') accountId = (await M.ensureCashAccount()).id;
    const merchant = form.elements.merchant.value.trim() || (sign < 0 ? 'Spesa' : 'Entrata');
    const now = Date.now();
    let t = {
      id: uid(), accountId, date: form.elements.date.value || isoToday(), cents: sign * Math.abs(cents), currency: 'EUR',
      causale: '', description: '', merchant, tags: [], note: '', splits: null, manual: {}, source: 'manual', seq: now, createdAt: now,
    };
    t = categoryId === 'nc' ? M.autoClassify(t) : M.withCategory(t, categoryId);
    await S.put('tx', t.id, t);
    s.close();
    toast('Movimento aggiunto');
  };
}

// ---------------------------------------------------------------- Import
export function openImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf,text/csv,.csv,text/plain,.txt';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const s = openSheet(html`<div class="dialog import-sheet"><div class="import-loading"><span class="spinner"></span><p>Lettura di «${file.name}»…</p></div></div>`, { className: 'tall' });
    const root = s.el.querySelector('.import-sheet');
    try {
      const r = await readStatement(file);
      if (r.mapping) showMapping(s, root, r.mapping);
      else showPlan(s, root, planImport(r.st));
    } catch (e) {
      console.error(e);
      root.innerHTML = String(html`
        <div class="import-error">${icon('doc')}<h2>File non importato</h2><p>${e.message}</p></div>
        <div class="dialog-actions"><button type="button" class="btn" data-ok>OK</button></div>`);
      root.querySelector('[data-ok]').onclick = () => s.close();
    }
  });
  input.click();
}

// Procedura guidata per un CSV mai visto: abbinamento delle colonne, salvato come modello.
const DATE_FORMATS = [['dmy', 'gg/mm/aaaa'], ['ymd', 'aaaa-mm-gg'], ['dmy2', 'gg/mm/aa'], ['mdy', 'mm/gg/aaaa']];
const DECIMALS = [[',', '1.234,56'], ['.', '1,234.56']];

function showMapping(s, root, m) {
  const st = {
    mapping: { ...m.guess },
    mode: m.guess.amount == null && (m.guess.income != null || m.guess.expense != null) ? 'split' : 'single',
    dateFormat: m.formats.dateFormat,
    decimal: m.formats.decimal,
    name: '',
    accountId: '',
  };
  const fields = () => [
    ['date', 'Data'],
    ['description', 'Descrizione'],
    ...(st.mode === 'single' ? [['amount', 'Importo']] : [['income', 'Entrate'], ['expense', 'Uscite']]),
    ['causale', 'Tipo operazione (facoltativo)'],
    ['balance', 'Saldo (facoltativo)'],
    ['valueDate', 'Data valuta (facoltativa)'],
  ];
  const colSelect = (field) => html`<select data-map="${field}">
      <option value="">—</option>
      ${m.header.map((h, i) => html`<option value="${i}" ${st.mapping[field] === i ? 'selected' : ''}>${h || `Colonna ${i + 1}`}</option>`)}
    </select>`;

  function draw() {
    const map = { ...st.mapping };
    if (st.mode === 'single') { delete map.income; delete map.expense; } else delete map.amount;
    const err = validateMapping(map);
    let preview = null;
    if (!err) {
      try { preview = applyTemplate(m.rows, { id: 'tmp', name: st.name || 'Banca', headerRow: m.headerRow, mapping: map, dateFormat: st.dateFormat, decimal: st.decimal }); } catch { preview = null; }
    }
    root.innerHTML = String(html`
      <h2>Formato nuovo</h2>
      <p>È la prima volta che importo un file così. Ho proposto io le colonne: controllale. Dalla prossima volta lo riconoscerò da solo.</p>
      <div class="csv-preview"><table>
        <tr>${m.header.map((h) => html`<th>${h}</th>`)}</tr>
        ${m.body.slice(0, 3).map((r) => html`<tr>${m.header.map((_, i) => html`<td>${(r[i] || '').slice(0, 40)}</td>`)}</tr>`)}
      </table></div>
      <label class="field"><input class="text" name="bank" value="${st.name}" placeholder="Nome della banca (es. Intesa Sanpaolo)"></label>
      <div class="segmented wide" data-seg="mode">
        <button type="button" class="${st.mode === 'single' ? 'on' : ''}" data-value="single">Importo con segno</button>
        <button type="button" class="${st.mode === 'split' ? 'on' : ''}" data-value="split">Entrate e uscite</button>
      </div>
      <div class="field-group map-fields">
        ${fields().map(([f, label]) => html`<label class="field field-row"><span>${label}</span>${colSelect(f)}</label>`)}
        <label class="field field-row"><span>Formato data</span><select data-fmt="date">${DATE_FORMATS.map(([v, l]) => html`<option value="${v}" ${st.dateFormat === v ? 'selected' : ''}>${l}</option>`)}</select></label>
        <label class="field field-row"><span>Importi</span><select data-fmt="decimal">${DECIMALS.map(([v, l]) => html`<option value="${v}" ${st.decimal === v ? 'selected' : ''}>${l}</option>`)}</select></label>
        <label class="field field-row"><span>Conto</span><select data-acc><option value="">Nuovo conto</option>${M.accounts().filter((a) => a.type !== 'contanti').map((a) => html`<option value="${a.id}" ${st.accountId === a.id ? 'selected' : ''}>${a.name}</option>`)}</select></label>
      </div>
      ${err ? html`<p class="form-error">${err}</p>` : preview && preview.rows.length ? html`
        <h3 class="group-title">Così verranno letti (${preview.rows.length} movimenti)</h3>
        <div class="list">${preview.rows.slice(0, 3).map((r) => html`<div class="row static"><span class="row-label">${r.description || '—'}<small>${r.date}</small></span><span class="row-detail">${formatCents(r.cents, { sign: true })}</span></div>`)}</div>`
        : html`<p class="form-error">Con queste colonne non trovo movimenti: controlla data, importi e formati.</p>`}
      <div class="dialog-actions">
        <button type="button" class="btn" data-go ${err || !preview?.rows.length ? 'disabled' : ''}>Continua</button>
        <button type="button" class="btn secondary" data-cancel>Annulla</button>
      </div>`);

    root.querySelector('[name=bank]').addEventListener('input', (e) => { st.name = e.target.value; });
    root.querySelector('[data-seg=mode]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-value]');
      if (b && b.dataset.value !== st.mode) { st.mode = b.dataset.value; draw(); }
    });
    root.querySelectorAll('[data-map]').forEach((sel) => {
      sel.onchange = () => {
        const v = sel.value === '' ? undefined : Number(sel.value);
        if (v === undefined) delete st.mapping[sel.dataset.map]; else st.mapping[sel.dataset.map] = v;
        draw();
      };
    });
    root.querySelector('[data-fmt=date]').onchange = (e) => { st.dateFormat = e.target.value; draw(); };
    root.querySelector('[data-fmt=decimal]').onchange = (e) => { st.decimal = e.target.value; draw(); };
    root.querySelector('[data-acc]').onchange = (e) => { st.accountId = e.target.value; };
    root.querySelector('[data-cancel]').onclick = () => s.close();
    root.querySelector('[data-go]').onclick = async (e) => {
      const name = st.name.trim() || (st.accountId ? M.account(st.accountId).name : '');
      if (!name) { toast('Scrivi il nome della banca', { type: 'error' }); root.querySelector('[name=bank]').focus(); return; }
      e.currentTarget.disabled = true;
      try {
        const res = await saveTemplateAndApply(m, { name, mapping: map, dateFormat: st.dateFormat, decimal: st.decimal, accountId: st.accountId || null });
        showPlan(s, root, planImport(res));
      } catch (ex) {
        toast(ex.message, { type: 'error' });
        e.currentTarget.disabled = false;
      }
    };
  }
  draw();
}

function showPlan(s, root, p) {
  const fmtD = (iso) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T12:00:00`));
  const n = p.added.length;
  const preview = p.added.slice(0, 6);
  const accLabel = (g) => g.account ? g.account.name : (g.def.name || `${p.st.bankName}${g.def.accountNumber ? ` ····${g.def.accountNumber.slice(-4)}` : ''}`);
  root.innerHTML = String(html`
    <h2>${p.st.bankName}</h2>
    <p>${p.st.kind} · dal ${fmtD(p.from)} al ${fmtD(p.to)}</p>
    <div class="import-stats">
      <div><b>${n}</b><span>nuovi</span></div>
      <div><b>${p.updated.length}</b><span>aggiornati</span></div>
      <div><b>${p.duplicates}</b><span>già presenti</span></div>
    </div>
    <div class="list">
      ${p.groups.map((g) => html`<div class="row static"><span class="row-label">${accLabel(g)}${g.account ? '' : ' (nuovo)'}<small>${g.added.length} nuovi${g.updated.length ? ` · ${g.updated.length} aggiornati` : ''}</small></span><span class="row-detail">${g.def.balance != null ? formatCents(g.def.balance) : '—'}</span></div>`)}
      <div class="row static"><span class="row-label">Controllo dei saldi</span><span class="row-detail ${p.balanceOk ? 'ok' : 'ko'}">${p.balanceOk ? 'Tutto torna' : 'Alcune righe da verificare'}</span></div>
    </div>
    ${preview.length ? html`
      <h3 class="group-title">Anteprima</h3>
      <div class="list">${preview.map(({ row, info }) => html`
        <div class="row static"><span class="row-label">${info.merchant}</span><span class="row-detail">${formatCents(row.cents, { sign: true })}</span></div>`)}
      </div>
      ${n > preview.length ? html`<p class="group-footer">e altri ${n - preview.length}.</p>` : ''}` : ''}
    <div class="dialog-actions">
      <button type="button" class="btn" data-go ${n + p.updated.length === 0 ? 'disabled' : ''}>${n ? `Importa ${n} movimenti` : p.updated.length ? 'Aggiorna i movimenti' : 'Niente di nuovo'}</button>
      <button type="button" class="btn secondary" data-cancel>Annulla</button>
    </div>`);
  root.querySelector('[data-cancel]').onclick = () => s.close();
  root.querySelector('[data-go]').onclick = async (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = 'Importazione…';
    try {
      const r = await commitImport(p);
      s.close();
      const ids = new Set(r.accounts.map((a) => a.id));
      const nc = M.txs().filter((t) => ids.has(t.accountId) && t.categoryId === 'nc').length;
      toast(`${r.added} movimenti importati${nc ? ` · ${nc} da classificare` : ''}`, { duration: 3500 });
      location.hash = '#/movimenti';
    } catch (err) {
      console.error(err);
      toast(`Import non riuscito: ${err.message}`, { type: 'error' });
      s.close();
    }
  };
}
