// Budget e accantonamenti: limiti mensili per area o categoria (con avviso all'80%),
// quote messe da parte ogni mese per le spese grosse, opzioni dello spendibile.

import { html, setHtml } from '../util.js';
import { icon } from '../ui/icons.js';
import { page, enhancePage } from '../ui/page.js';
import { openSheet, confirmDialog, toast } from '../ui/sheet.js';
import { group, toggleRow, selectRow } from '../ui/list.js';
import { formatCents, parseEuro, euroValue } from '../money.js';
import * as B from '../data/budgets.js';
import * as Res from '../data/reserves.js';
import * as S from '../store.js';
import { planSettings, updatePlanSettings } from '../data/plan-settings.js';
import { today, addMonths, fmtShort, relDays } from '../dates.js';
import { gridPicker, categoryGroups, areaItems } from './tx-ui.js';

const REPEATS = [[12, 'Ogni anno'], [6, 'Ogni 6 mesi'], [3, 'Ogni 3 mesi'], [0, 'Una volta']];
const repeatLabel = (m) => (REPEATS.find((r) => r[0] === m) || [0, `Ogni ${m} mesi`])[1];

export function budgetBar(x) {
  const color = x.over ? 'var(--red)' : x.warn ? 'var(--orange)' : 'var(--green)';
  return html`<span class="cb-bar"><i style="width:${Math.max(2, Math.min(100, x.pct * 100))}%;background:${color}"></i></span>`;
}

export function budgetView(el) {
  let off = null;

  function draw() {
    off?.();
    const st = B.status();
    const res = Res.all().map((r) => ({ r, p: Res.period(r) })).filter((x) => x.p);
    const rt = Res.totals();
    const sugg = Res.suggestions();
    const ps = planSettings();
    const monthName = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(new Date());

    setHtml(el, page({
      title: 'Budget',
      back: { href: 'movimenti', label: 'Movimenti' },
      right: html`<button type="button" class="nav-icon-btn" data-add aria-label="Aggiungi">${icon('plus')}</button>`,
      body: html`
        <div class="home-grid">
          <section class="card list-card">
            <div class="card-head"><h2 class="card-title">Budget di ${monthName}</h2>${st.length ? html`<span class="muted small">${st.filter((x) => !x.over).length} su ${st.length} nei limiti</span>` : ''}</div>
            ${st.length ? html`<div class="list flush">${st.map((x) => html`
              <button type="button" class="tx-mini budget-row" data-budget="${x.b.id}">
                <span class="tx-icon" style="background:${x.t.color}">${icon(x.t.icon)}</span>
                <span class="tx-text"><b>${x.t.name}</b><span>${formatCents(x.spent)} di ${formatCents(x.b.cents)}${x.b.scope === 'area' ? ' · area' : ''}</span>${budgetBar(x)}</span>
                <span class="tx-amount ${x.over ? 'negative' : ''}">${formatCents(Math.abs(x.left))}<small>${x.over ? 'oltre' : 'restano'}</small></span>
              </button>`)}</div>`
              : html`<p class="muted">Scegli un'area (per esempio Svago) o una categoria (per esempio Ristoranti) e quanto vuoi spendere al mese: ti avviso quando arrivi al ${ps.warnPct}%.</p>`}
            <button type="button" class="btn plain" data-new-budget>${icon('plus')}<span>Aggiungi un budget</span></button>
          </section>

          <section class="card list-card">
            <div class="card-head"><h2 class="card-title">Accantonamenti</h2>${rt.reserved ? html`<b class="tabular">${formatCents(rt.reserved)}</b>` : ''}</div>
            <p class="muted small">Per le spese grosse dell'anno: ogni mese metto da parte una quota e la tolgo dallo spendibile${rt.monthly ? ` (in tutto ${formatCents(rt.monthly)} al mese)` : ''}.</p>
            ${res.length ? html`<div class="list flush">${res.map(({ r, p }) => html`
              <button type="button" class="tx-mini" data-reserve="${r.id}">
                <span class="tx-icon" style="background:${p.done ? 'var(--s10)' : r.color}">${icon(r.icon)}</span>
                <span class="tx-text"><b>${r.name}</b><span>${p.done ? `Scaduto il ${fmtShort(p.due)}` : `${formatCents(p.quota)} al mese · ${fmtShort(p.due)}, ${relDays(p.due)}`}</span>
                  ${p.done ? '' : html`<span class="cb-bar"><i style="width:${Math.max(2, (p.reserved / Math.max(1, r.cents)) * 100)}%;background:${r.color}"></i></span>`}</span>
                <span class="tx-amount">${formatCents(p.reserved)}<small>di ${formatCents(r.cents)}</small></span>
              </button>`)}</div>` : ''}
            ${sugg.length ? html`
              <h3 class="mini-title">Da accantonare?</h3>
              <div class="list flush">${sugg.map((x, i) => html`
                <button type="button" class="tx-mini" data-sugg="${i}">
                  <span class="tx-icon" style="background:${x.color}">${icon(x.icon)}</span>
                  <span class="tx-text"><b>${x.name}</b><span>${x.cents ? `${formatCents(x.cents)} · ` : ''}${fmtShort(x.due)}${x.repeatMonths ? ` · ${repeatLabel(x.repeatMonths).toLowerCase()}` : ''}</span></span>
                  <span class="chev">${icon('plus')}</span>
                </button>`)}</div>` : ''}
            <button type="button" class="btn plain" data-new-reserve>${icon('plus')}<span>Aggiungi un accantonamento</span></button>
          </section>
        </div>

        ${group({
          title: 'Spendibile',
          rows: [
            toggleRow({ name: 'fixed', label: 'Togli le uscite fisse del mese', checked: ps.subtractFixed }),
            selectRow({ name: 'warn', label: 'Avviso budget al', value: ps.warnPct, options: [[70, '70%'], [80, '80%'], [90, '90%'], [100, '100%']] }),
          ],
          footer: 'Con la prima opzione, lo spendibile in Home tiene già conto di abbonamenti, mutuo e bollette che devono ancora arrivare questo mese.',
        })}`,
    }));
    off = enhancePage(el);
    el.querySelector('[data-add]').onclick = addMenu;
    el.querySelector('[data-new-budget]').onclick = newBudget;
    el.querySelector('[data-new-reserve]').onclick = () => openReserveForm({});
    el.querySelectorAll('[data-budget]').forEach((b) => { b.onclick = () => editBudget(B.budget(b.dataset.budget)); });
    el.querySelectorAll('[data-reserve]').forEach((b) => { b.onclick = () => openReserveForm({}, Res.reserve(b.dataset.reserve)); });
    el.querySelectorAll('[data-sugg]').forEach((b) => { b.onclick = () => openReserveForm(sugg[Number(b.dataset.sugg)]); });
    el.querySelector('[data-toggle=fixed]').addEventListener('change', (e) => updatePlanSettings({ subtractFixed: e.target.checked }));
    el.querySelector('[data-select=warn]').addEventListener('change', (e) => updatePlanSettings({ warnPct: Number(e.target.value) }));
  }

  draw();
  const unsub = S.subscribe((col) => {
    if (['budgets', 'reserves', 'tx', 'categories', 'areas', 'settings', 'subs', 'deadlines', '*'].includes(col)) {
      const y = window.scrollY;
      draw();
      window.scrollTo(0, y);
    }
  });
  return () => { off?.(); unsub(); };
}

async function addMenu() {
  const s = openSheet(html`
    <div class="dialog picker">
      <div class="list">
        <button type="button" class="row" data-a="budget"><span class="row-icon" style="background:var(--s2)">${icon('chart')}</span><span class="row-label">Budget mensile<small>Per un'area o una categoria</small></span></button>
        <button type="button" class="row" data-a="reserve"><span class="row-icon" style="background:var(--s7)">${icon('sparkles')}</span><span class="row-label">Accantonamento<small>Bollo, assicurazione, regali, vacanze…</small></span></button>
      </div>
    </div>`);
  s.el.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) s.close(b.dataset.a); });
  const a = await s.closed;
  if (a === 'budget') newBudget();
  if (a === 'reserve') openReserveForm({});
}

// ---------------------------------------------------------------- Budget
async function newBudget() {
  const used = new Set(B.all().map((b) => `${b.scope}:${b.refId}`));
  const v = await gridPicker({
    title: 'Budget per…',
    groups: [
      { label: 'Aree', items: areaItems().filter((a) => !used.has(`area:${a.id}`)).map((a) => ({ ...a, id: `area:${a.id}` })) },
      { label: 'Categorie di spesa', items: categoryGroups()[0].items.filter((c) => !used.has(`categoria:${c.id}`)).map((c) => ({ ...c, id: `categoria:${c.id}` })) },
    ],
  });
  if (!v) return;
  const [scope, refId] = v.split(':');
  editBudget(null, { scope, refId });
}

async function editBudget(existing, init = {}) {
  const b = existing || init;
  const t = B.target(b);
  if (!t) return;
  const avg = B.averageMonthly(b.scope, b.refId);
  const s = openSheet(html`
    <form class="dialog" novalidate>
      <h2>${t.name}</h2>
      <p>Quanto vuoi spendere al mese${b.scope === 'area' ? ' in quest\'area' : ' in questa categoria'}?${avg ? ` Negli ultimi mesi in media ${formatCents(avg)}.` : ''}</p>
      <label class="field money big"><span>€</span><input class="text" name="amount" inputmode="decimal" placeholder="0,00" value="${euroValue(existing?.cents || (avg ? Math.ceil(avg / 1000) * 1000 : 0))}"></label>
      <p class="form-error" hidden></p>
      <div class="dialog-actions">
        <button type="submit" class="btn">Salva</button>
        ${existing ? html`<button type="button" class="btn secondary destructive-text" data-delete>Togli il budget</button>` : html`<button type="button" class="btn secondary" data-cancel>Annulla</button>`}
      </div>
    </form>`);
  const form = s.el.querySelector('form');
  setTimeout(() => form.elements.amount.select(), 350);
  const cancel = form.querySelector('[data-cancel]');
  if (cancel) cancel.onclick = () => s.close();
  const del = form.querySelector('[data-delete]');
  if (del) del.onclick = async () => { await B.remove(existing.id); s.close(); toast('Budget tolto'); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const cents = parseEuro(form.elements.amount.value);
    if (!cents) { const err = form.querySelector('.form-error'); err.textContent = 'Scrivi un importo.'; err.hidden = false; return; }
    await B.save(existing ? { ...existing, cents } : B.newBudget({ ...init, cents }));
    s.close();
    toast('Budget salvato');
  };
}

// ---------------------------------------------------------------- Accantonamenti
export function openReserveForm(init = {}, existing = null) {
  const r = existing || init;
  const s = openSheet(html`
    <form class="dialog" novalidate>
      <h2>${existing ? existing.name : init.name ? `Accantona per ${init.name}` : 'Nuovo accantonamento'}</h2>
      <p>Scrivi quanto costa e quando va pagata: calcolo io la quota da mettere da parte ogni mese.</p>
      <div class="field-group">
        <label class="field"><input class="text" name="name" value="${r.name || ''}" placeholder="Per cosa (per esempio Regali di Natale)" autocapitalize="sentences"></label>
        <label class="field money"><span>€</span><input class="text" name="amount" inputmode="decimal" placeholder="Quanto costa" value="${euroValue(r.cents)}"></label>
        <label class="field field-row"><span>Da pagare il</span><input class="text" type="date" name="due" value="${r.due || addMonths(today(), 6)}"></label>
        <label class="field field-row"><span>Si ripete</span><select name="repeat">${REPEATS.map(([v, l]) => html`<option value="${v}" ${v === (r.repeatMonths ?? 12) ? 'selected' : ''}>${l}</option>`)}</select></label>
      </div>
      <p class="group-footer" data-preview></p>
      <p class="form-error" hidden></p>
      <div class="dialog-actions">
        <button type="submit" class="btn">${existing ? 'Salva' : 'Aggiungi'}</button>
        ${existing ? html`<button type="button" class="btn secondary destructive-text" data-delete>Elimina</button>` : html`<button type="button" class="btn secondary" data-cancel>Annulla</button>`}
      </div>
    </form>`);
  const form = s.el.querySelector('form');
  const preview = () => {
    const cents = parseEuro(form.elements.amount.value);
    const due = form.elements.due.value;
    const out = form.querySelector('[data-preview]');
    if (!cents || !due) { out.textContent = ''; return; }
    const p = Res.period({ cents, due, repeatMonths: Number(form.elements.repeat.value), startedAt: existing?.startedAt || today() });
    out.textContent = p.done ? 'La data è già passata.' : `${formatCents(p.quota)} al mese per ${p.months} ${p.months === 1 ? 'mese' : 'mesi'}. Già da parte: ${formatCents(p.reserved)}.`;
  };
  ['input', 'change'].forEach((ev) => form.addEventListener(ev, preview));
  preview();
  const cancel = form.querySelector('[data-cancel]');
  if (cancel) cancel.onclick = () => s.close();
  const del = form.querySelector('[data-delete]');
  if (del) {
    del.onclick = async () => {
      const ok = await confirmDialog({ title: `Eliminare «${existing.name}»?`, message: 'La quota non verrà più tolta dallo spendibile.', confirmLabel: 'Elimina', destructive: true });
      if (ok) { await Res.remove(existing.id); s.close(); }
    };
  }
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error');
    const name = form.elements.name.value.trim();
    const cents = parseEuro(form.elements.amount.value);
    const due = form.elements.due.value;
    if (!name) { err.textContent = 'Scrivi per cosa.'; err.hidden = false; return; }
    if (!cents) { err.textContent = 'Scrivi quanto costa.'; err.hidden = false; return; }
    if (!due) { err.textContent = 'Scegli la data.'; err.hidden = false; return; }
    const patch = { name, cents, due, repeatMonths: Number(form.elements.repeat.value) };
    if (existing) await Res.save({ ...Res.reserve(existing.id), ...patch });
    else await Res.save(Res.newReserve({ ...init, ...patch }));
    s.close();
    toast('Accantonamento salvato');
  };
}
