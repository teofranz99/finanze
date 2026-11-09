// Scadenze: cose da fare adesso, scadenzario (bollo, assicurazione, revisione, garanzie,
// bollette e rinnovi degli abbonamenti), documenti personali, estratti conto da caricare.

import { html, setHtml } from '../util.js';
import { icon } from '../ui/icons.js';
import { page, enhancePage } from '../ui/page.js';
import { openSheet, confirmDialog, toast } from '../ui/sheet.js';
import { formatCents } from '../money.js';
import * as M from '../data/model.js';
import * as D from '../data/deadlines.js';
import * as Sub from '../data/subs.js';
import * as S from '../store.js';
import * as R from '../reminders.js';
import { today, addDays, relDays, fmtShort, fmtLong, fmtMonth, toIso } from '../dates.js';
import { schedule, laterPicker } from './avvisi.js';
import { gridPicker, openImport } from './tx-ui.js';
import { openSubDetail } from './abbonamenti.js';

const chip = (ic, color) => html`<span class="tx-icon" style="background:${color}">${icon(ic)}</span>`;

function whenText(d) {
  const n = d.date;
  if (n < today()) return `Scaduta ${relDays(n)}`;
  return `Scade ${relDays(n)} · ${fmtShort(n)}`;
}

const monthFmt = new Intl.DateTimeFormat('it-IT', { month: 'short' });
const monthAbbr = (iso) => monthFmt.format(new Date(`${iso}T12:00:00`));
const importEvery = () => R.alertSettings().importEvery;
const lastImportIso = (a) => (a.lastImportAt ? toIso(new Date(a.lastImportAt)) : null);

export function scadenzeView(el) {
  let off = null;
  let showDone = false;

  function draw() {
    off?.();
    const open = D.open().filter((d) => d.kind !== 'documento');
    const dueDl = D.open().filter((d) => D.state(d)?.due);
    const accs = D.importAccounts();
    const lateImports = accs.map((a) => ({ a, st: D.importState(a, importEvery()) })).filter((x) => x.st.late);
    const limit = addDays(today(), 60);
    const renewals = Sub.active().map((s) => ({ s, next: Sub.nextRenewal(s) })).filter((x) => x.next && x.next <= limit);
    const timeline = [
      ...open.map((d) => ({ date: d.date, d })),
      ...renewals.map((r) => ({ date: r.next, r })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const months = [];
    for (const it of timeline) {
      const k = it.date.slice(0, 7);
      const g = months[months.length - 1];
      if (g && g.k === k) g.items.push(it); else months.push({ k, items: [it] });
    }
    const done = D.done();

    setHtml(el, page({
      title: 'Scadenze',
      right: html`<button type="button" class="nav-icon-btn" data-add aria-label="Aggiungi">${icon('plus')}</button>`,
      body: html`
        <div class="home-grid">
          ${dueDl.length || lateImports.length ? html`
            <section class="card decide-card">
              <h2 class="card-title">${icon('calendar')} Da fare</h2>
              ${dueDl.map((d) => {
                const m = D.meta(d);
                const st = D.state(d);
                return html`<div class="decide">
                  <button type="button" class="decide-head" data-dl="${d.id}">${chip(m.icon, m.color)}<span class="tx-text"><b>${D.titleOf(d)}</b><span class="${st.expired ? 'negative' : ''}">${whenText(d)}</span></span></button>
                  <div class="decide-actions">
                    <button type="button" class="btn small" data-done="${d.id}">${d.kind === 'documento' ? 'Rinnovato' : d.repeatMonths ? 'Pagato' : 'Fatto'}</button>
                    <button type="button" class="btn small secondary" data-dl-later="${d.id}">Più tardi</button>
                  </div>
                </div>`;
              })}
              ${lateImports.map(({ a, st }) => html`<div class="decide">
                  <button type="button" class="decide-head" data-acc="${a.id}">${chip('upload', M.accountColor(a))}<span class="tx-text"><b>Carica i movimenti di ${a.name}</b><span>${a.lastImportAt ? `Ultimo caricamento ${relDays(lastImportIso(a))}` : 'Mai caricati'}</span></span></button>
                  <div class="decide-actions">
                    <button type="button" class="btn small" data-import>Carica ora</button>
                    <button type="button" class="btn small secondary" data-acc-later="${a.id}">Più tardi</button>
                  </div>
                </div>`)}
            </section>` : ''}

          <section class="card list-card">
            <div class="card-head"><h2 class="card-title">Scadenzario</h2></div>
            ${months.length ? months.map((g) => html`
              <h3 class="month-head">${fmtMonth(`${g.k}-01`)}</h3>
              <div class="list flush">${g.items.map((it) => {
                if (it.d) {
                  const m = D.meta(it.d);
                  const st = D.state(it.d);
                  return html`<button type="button" class="tx-mini" data-dl="${it.d.id}">
                    <span class="date-badge ${st.expired ? 'late' : st.due ? 'soon' : ''}"><b>${Number(it.date.slice(8))}</b><span>${monthAbbr(it.date)}</span></span>
                    <span class="tx-text"><b>${D.titleOf(it.d)}</b><span>${relDays(it.date)}${st.scheduled ? ' · avviso creato' : ''}${it.d.repeatMonths ? ` · ${D.REPEATS.find((r) => r[0] === it.d.repeatMonths)?.[1].toLowerCase() || ''}` : ''}</span></span>
                    <span class="chev">${icon('chevron-right')}</span>
                  </button>`;
                }
                const { s } = it.r;
                return html`<button type="button" class="tx-mini" data-sub="${s.id}">
                  <span class="date-badge"><b>${Number(it.date.slice(8))}</b><span>${monthAbbr(it.date)}</span></span>
                  <span class="tx-text"><b>Rinnovo ${s.name}</b><span>${relDays(it.date)}</span></span>
                  <span class="tx-amount">${formatCents(s.amountCents)}</span>
                </button>`;
              })}</div>`)
              : html`<p class="muted">Nessuna scadenza. Aggiungi bollo, assicurazione, revisione, garanzie o bollette con il +. Qui compaiono anche i rinnovi degli abbonamenti dei prossimi 60 giorni.</p>`}
          </section>

          <section class="card list-card">
            <div class="card-head"><h2 class="card-title">Documenti personali</h2></div>
            <div class="list flush">${D.DOCS.map((doc) => {
              const d = D.docDeadline(doc.id);
              const st = d && D.state(d);
              return html`<button type="button" class="tx-mini" data-doc="${doc.id}">
                ${chip(doc.icon, doc.color)}
                <span class="tx-text"><b>${doc.label}</b><span class="${st?.expired ? 'negative' : ''}">${d?.date ? (d.doneAt ? 'Rinnovato' : whenText(d)) : 'Aggiungi la scadenza'}</span></span>
                <span class="chev">${icon('chevron-right')}</span>
              </button>`;
            })}</div>
            <p class="muted small">Salvo solo la data di scadenza, nessun numero di documento. L'avviso arriva qualche mese prima.</p>
          </section>

          <section class="card list-card">
            <div class="card-head"><h2 class="card-title">Estratti conto</h2></div>
            ${accs.length ? html`<div class="list flush">${accs.map((a) => {
              const st = D.importState(a, importEvery());
              const last = lastImportIso(a);
              return html`<button type="button" class="tx-mini" data-acc="${a.id}">
                ${chip('bank', M.accountColor(a))}
                <span class="tx-text"><b>${a.name}</b><span>${last ? `Caricato ${relDays(last)}` : 'Mai caricato'} · ${D.IMPORT_FREQS.find((f) => f[0] === st.plan.every)?.[1].toLowerCase()}</span></span>
                ${st.late ? html`<span class="pill warn">da caricare</span>` : st.due ? html`<span class="muted small">${fmtShort(st.due)}</span>` : ''}
                <span class="chev">${icon('chevron-right')}</span>
              </button>`;
            })}</div>` : html`<p class="muted">I conti compariranno qui dopo il primo import.</p>`}
          </section>

          ${done.length ? html`
            <section class="card list-card">
              <button type="button" class="card-head link-head" data-toggle-done><h2 class="card-title">Passate (${done.length})</h2><span class="chev ${showDone ? 'open' : ''}">${icon('chevron-right')}</span></button>
              ${showDone ? html`<div class="list flush">${done.map((d) => {
                const m = D.meta(d);
                return html`<button type="button" class="tx-mini" data-dl="${d.id}">${chip(m.icon, 'var(--s10)')}<span class="tx-text"><b>${D.titleOf(d)}</b><span>${fmtLong(d.date)}</span></span></button>`;
              })}</div>` : ''}
            </section>` : ''}
        </div>`,
    }));
    off = enhancePage(el);
    el.querySelector('[data-add]').onclick = addDeadline;
    el.querySelectorAll('[data-dl]').forEach((b) => { b.onclick = () => openDeadline(D.get(b.dataset.dl)); });
    el.querySelectorAll('[data-sub]').forEach((b) => { b.onclick = () => openSubDetail(b.dataset.sub); });
    el.querySelectorAll('[data-doc]').forEach((b) => {
      b.onclick = () => {
        const d = D.docDeadline(b.dataset.doc);
        openDeadline(d || D.newDeadline({ kind: 'documento', doc: b.dataset.doc }), !d);
      };
    });
    el.querySelectorAll('[data-acc]').forEach((b) => { b.onclick = () => openImportPlan(M.account(b.dataset.acc)); });
    el.querySelectorAll('[data-import]').forEach((b) => { b.onclick = openImport; });
    el.querySelectorAll('[data-done]').forEach((b) => { b.onclick = () => markDone(D.get(b.dataset.done)); });
    el.querySelectorAll('[data-dl-later]').forEach((b) => { b.onclick = () => deadlineLater(D.get(b.dataset.dlLater)); });
    el.querySelectorAll('[data-acc-later]').forEach((b) => { b.onclick = () => importLater(M.account(b.dataset.accLater)); });
    const td = el.querySelector('[data-toggle-done]');
    if (td) td.onclick = () => { showDone = !showDone; draw(); };
  }

  draw();
  const unsub = S.subscribe((col) => {
    if (['deadlines', 'subs', 'tx', 'accounts', 'settings', '*'].includes(col)) {
      const y = window.scrollY;
      draw();
      window.scrollTo(0, y);
    }
  });
  return () => { off?.(); unsub(); };
}

// ---------------------------------------------------------------- Azioni
async function markDone(d) {
  if (d.kind === 'documento') {
    toast('Inserisci la nuova data di scadenza');
    openDeadline(d);
    return;
  }
  await D.markDone(d);
  toast(d.repeatMonths ? `Prossima scadenza: ${fmtLong(D.get(d.id).date)}` : 'Segnata come fatta');
}

const dlTitle = (d) => R.titleFor(D.meta(d).cal, d.kind === 'documento' ? D.meta(d).label : d.title);

// Con il file calendario una scadenza che si ripete (es. il bollo ogni anno) diventa un evento ricorrente.
async function scheduleDeadline(d, date = null) {
  const repeat = date ? null : R.repeatFromMonths(d.repeatMonths);
  const res = await schedule({ title: dlTitle(d), date: date || D.remindDate(d), repeat });
  if (res && !date) await D.save({ ...D.get(d.id), reminder: { scheduledFor: d.date, recurring: res.recurring } });
  return res;
}

async function deadlineLater(d) {
  const until = await laterPicker();
  if (!until) return;
  await D.save({ ...D.get(d.id), snooze: { for: d.date, until } });
  await scheduleDeadline(d, until);
}

const importTitle = (a) => R.titleFor('Carica gli estratti conto', a.name);
const importRepeat = (plan) => ({ giorno: { freq: 'DAILY', interval: 1 }, settimana: { freq: 'WEEKLY', interval: 1 }, mese: { freq: 'MONTHLY', interval: 1 }, trimestre: { freq: 'MONTHLY', interval: 3 }, custom: R.repeatFromDays(plan.days) }[plan.every] || null);

async function importLater(a) {
  const st = D.importState(a, importEvery());
  const until = await laterPicker();
  if (!until) return;
  await D.updateImportPlan(a, { snooze: { for: st.due, until } });
  await schedule({ title: importTitle(a), date: until });
}

// ---------------------------------------------------------------- Aggiunta
async function addDeadline() {
  const id = await gridPicker({
    title: 'Nuova scadenza',
    groups: [
      { items: D.KINDS.map((k) => ({ id: k.id, name: k.label, icon: k.icon, color: k.color })) },
      { label: 'Documenti personali', items: D.DOCS.map((k) => ({ id: `doc:${k.id}`, name: k.label, icon: k.icon, color: k.color })) },
    ],
  });
  if (!id) return;
  if (id.startsWith('doc:')) {
    const doc = id.slice(4);
    const ex = D.docDeadline(doc);
    openDeadline(ex || D.newDeadline({ kind: 'documento', doc }), !ex);
    return;
  }
  openDeadline(D.newDeadline({ kind: id }), true);
}

const LEADS = [[3, '3 giorni prima'], [7, '1 settimana prima'], [14, '2 settimane prima'], [21, '3 settimane prima'], [30, '1 mese prima'], [60, '2 mesi prima'], [90, '3 mesi prima'], [120, '4 mesi prima'], [180, '6 mesi prima']];

// Scheda di una scadenza: nuova (isNew) o esistente.
function openDeadline(d, isNew = false) {
  const m = D.meta(d);
  const isDoc = d.kind === 'documento';
  const leads = LEADS.some((l) => l[0] === d.leadDays) ? LEADS : [...LEADS, [d.leadDays, `${d.leadDays} giorni prima`]].sort((a, b) => a[0] - b[0]);
  const st = !isNew && D.state(d);
  const sh = openSheet(html`
    <form class="dialog" novalidate>
      <div class="dl-head">${chip(m.icon, m.color)}<h2>${isDoc ? m.label : isNew ? m.label : D.titleOf(d)}</h2></div>
      ${isDoc ? html`<p>Solo la data di scadenza: nessun numero o altro dato del documento.</p>` : html`
        <label class="field"><input class="text" name="title" value="${d.title}" placeholder="${d.kind === 'garanzia' ? 'Prodotto (per esempio Lavatrice)' : d.kind === 'bolletta' ? 'Fornitore (per esempio Luce)' : m.label}" autocapitalize="sentences"></label>`}
      <div class="field-group">
        <label class="field field-row"><span>Scadenza</span><input class="text" type="date" name="date" value="${d.date || ''}" required></label>
        <label class="field field-row"><span>Avvisami</span><select name="lead">${leads.map(([v, l]) => html`<option value="${v}" ${v === d.leadDays ? 'selected' : ''}>${l}</option>`)}</select></label>
        ${isDoc ? '' : html`<label class="field field-row"><span>Si ripete</span><select name="repeat">${D.REPEATS.map(([v, l]) => html`<option value="${v}" ${v === d.repeatMonths ? 'selected' : ''}>${l}</option>`)}</select></label>`}
      </div>
      ${isDoc ? '' : html`<label class="field"><textarea class="text note-text" name="note" rows="2" placeholder="Nota (facoltativa)">${d.note || ''}</textarea></label>`}
      ${st ? html`<div class="list"><button type="button" class="row tinted" data-schedule>
        <span class="row-label">${st.scheduled ? 'Aggiungi di nuovo l\'avviso' : 'Aggiungi l\'avviso al Calendario'}<small>Avviso il ${fmtShort(D.remindDate(d))}${st.scheduled ? ' · già creato' : ' · non ancora creato'}</small></span>
        <span class="row-detail ${st.scheduled ? 'ok' : 'ko'}">${st.scheduled ? icon('check') : icon('calendar')}</span></button></div>` : ''}
      <p class="form-error" hidden></p>
      <div class="dialog-actions">
        <button type="submit" class="btn">${isNew ? 'Aggiungi e crea l\'avviso' : 'Salva'}</button>
        ${isNew ? html`<button type="button" class="btn secondary" data-save-only>Aggiungi senza avviso</button>` : ''}
        ${!isNew && !d.doneAt && !isDoc ? html`<button type="button" class="btn secondary" data-mark>${d.repeatMonths ? 'Pagato: passa alla prossima' : 'Segna come fatta'}</button>` : ''}
        ${!isNew ? html`<button type="button" class="btn secondary destructive-text" data-delete>Elimina</button>` : ''}
      </div>
    </form>`);
  const form = sh.el.querySelector('form');
  const read = () => {
    const date = form.elements.date.value;
    if (!date) {
      const err = form.querySelector('.form-error');
      err.textContent = 'Scegli la data di scadenza.';
      err.hidden = false;
      return null;
    }
    const cur = isNew ? d : D.get(d.id);
    const next = {
      ...cur,
      title: isDoc ? '' : form.elements.title.value.trim(),
      date,
      leadDays: Number(form.elements.lead.value),
      repeatMonths: isDoc ? 0 : Number(form.elements.repeat.value),
      note: isDoc ? '' : form.elements.note.value,
    };
    if (cur.date !== date || cur.repeatMonths !== next.repeatMonths || cur.leadDays !== next.leadDays) { next.reminder = { scheduledFor: null }; next.snooze = null; next.doneAt = null; }
    return next;
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const next = read();
    if (!next) return;
    await D.save(next);
    sh.close();
    if (isNew) await scheduleDeadline(next);
    else toast('Scadenza salvata');
  };
  const so = form.querySelector('[data-save-only]');
  if (so) so.onclick = async () => { const next = read(); if (next) { await D.save(next); sh.close(); toast('Scadenza aggiunta'); } };
  const sc = form.querySelector('[data-schedule]');
  if (sc) sc.onclick = async () => { const next = read(); if (next) { await D.save(next); sh.close(); await scheduleDeadline(next); } };
  const mk = form.querySelector('[data-mark]');
  if (mk) mk.onclick = async () => { sh.close(); await markDone(D.get(d.id)); };
  const del = form.querySelector('[data-delete]');
  if (del) {
    del.onclick = async () => {
      const ok = await confirmDialog({ title: 'Eliminare la scadenza?', message: 'L\'eventuale evento nel Calendario resta: cancellalo da lì.', confirmLabel: 'Elimina', destructive: true });
      if (ok) { await D.remove(d.id); sh.close(); }
    };
  }
}

// ---------------------------------------------------------------- Estratti conto
function openImportPlan(a) {
  let plan = D.importPlan(a, importEvery());
  const sh = openSheet(html`<div class="dialog import-plan"></div>`);
  const root = sh.el.querySelector('.import-plan');
  const off = S.subscribe((c) => { if (c === 'accounts' || c === 'settings') draw(); });
  sh.closed.then(off);

  function draw() {
    const acc = M.account(a.id);
    if (!acc) { sh.close(); return; }
    plan = D.importPlan(acc, importEvery());
    const st = D.importState(acc, importEvery());
    const last = lastImportIso(acc);
    const dayOpts = plan.every === 'settimana'
      ? [['', 'Dall\'ultimo caricamento'], ...D.WEEKDAYS.map((w, i) => [String(i), `Di ${w}`])]
      : [['', 'Dall\'ultimo caricamento'], ...Array.from({ length: 28 }, (_, i) => [String(i + 1), `Il giorno ${i + 1}`])];
    root.innerHTML = String(html`
      <h2>${acc.name}</h2>
      <p>${last ? `Ultimo caricamento ${relDays(last)} (${fmtLong(last)}).` : 'Non hai ancora caricato file per questo conto.'}${st.due ? ` Prossimo: ${fmtLong(st.due)}.` : ''}</p>
      <div class="field-group">
        <label class="field field-row"><span>Ricordamelo</span><select data-f="every">${D.IMPORT_FREQS.map(([v, l]) => html`<option value="${v}" ${v === plan.every ? 'selected' : ''}>${l}</option>`)}</select></label>
        ${plan.every === 'custom' ? html`<label class="field field-row"><span>Ogni quanti giorni</span><input class="text" data-f="days" inputmode="numeric" value="${plan.days}"></label>` : ''}
        ${['settimana', 'mese', 'trimestre'].includes(plan.every) ? html`<label class="field field-row"><span>Quando</span><select data-f="day">${dayOpts.map(([v, l]) => html`<option value="${v}" ${String(plan.day ?? '') === v ? 'selected' : ''}>${l}</option>`)}</select></label>` : ''}
      </div>
      <p class="group-footer">L'ora è quella scelta in Impostazioni › Avvisi (${R.alertSettings().hour}).</p>
      <div class="dialog-actions">
        <button type="button" class="btn" data-now>${icon('upload')}<span>Carica ora</span></button>
        ${st.due ? html`<button type="button" class="btn secondary" data-sched>${st.scheduled ? 'Crea di nuovo l\'avviso' : 'Crea l\'avviso'} per il ${fmtShort(st.due < today() ? today() : st.due)}</button>
        <button type="button" class="btn secondary" data-later>Ricordamelo più tardi</button>` : ''}
      </div>`);
    root.querySelector('[data-f=every]').onchange = (e) => D.updateImportPlan(acc, { every: e.target.value, day: null, scheduledFor: null, recurring: false });
    const dd = root.querySelector('[data-f=days]');
    if (dd) dd.onchange = () => D.updateImportPlan(acc, { days: Math.max(1, parseInt(dd.value, 10) || 30), scheduledFor: null, recurring: false });
    const dy = root.querySelector('[data-f=day]');
    if (dy) dy.onchange = () => D.updateImportPlan(acc, { day: dy.value === '' ? null : Number(dy.value), scheduledFor: null, recurring: false });
    root.querySelector('[data-now]').onclick = () => { sh.close(); openImport(); };
    const sc = root.querySelector('[data-sched]');
    if (sc) {
      sc.onclick = async () => {
        const res = await schedule({ title: importTitle(acc), date: st.due, repeat: importRepeat(plan) });
        if (res) await D.updateImportPlan(acc, { scheduledFor: st.due, recurring: res.recurring });
      };
    }
    const lt = root.querySelector('[data-later]');
    if (lt) lt.onclick = () => importLater(acc);
  }
  draw();
}
