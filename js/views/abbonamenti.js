// Abbonamenti: totali al mese e all'anno, «Da decidere» (avvisi), proposti da confermare,
// rinnovi dei prossimi 30 giorni, elenco attivi e chiusi. Scheda di ogni abbonamento con
// avvisi, storico dei pagamenti e variazioni di prezzo.

import { html, setHtml } from '../util.js';
import { icon } from '../ui/icons.js';
import { page, enhancePage } from '../ui/page.js';
import { openSheet, confirmDialog, toast } from '../ui/sheet.js';
import { formatCents } from '../money.js';
import * as M from '../data/model.js';
import * as Sub from '../data/subs.js';
import * as S from '../store.js';
import * as R from '../reminders.js';
import { today, addDays, relDays, fmtShort, fmtLong } from '../dates.js';
import { schedule, laterPicker, modeOptions, usesIcs } from './avvisi.js';

const REASON = { noto: 'servizio noto', ricorrente: 'pagamento ricorrente', categoria: 'categoria Abbonamenti' };

function subIcon(s, big = false) {
  const a = M.area(s.areaId);
  const color = s.status === 'chiuso' ? 'var(--s10)' : (a && a.id !== 'abbonamenti' ? a.color : 'var(--s3)');
  const ic = a && a.id !== 'abbonamenti' ? a.icon : 'repeat';
  return html`<span class="tx-icon ${big ? 'big' : ''}" style="background:${color}">${icon(ic)}</span>`;
}

function parseEuro(v) {
  const t = String(v).trim().replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}
const euroInput = (c) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

// ---------------------------------------------------------------- Pagina
export function abbonamentiView(el) {
  let off = null;
  let showClosed = false;

  function draw() {
    off?.();
    const tot = Sub.totals();
    const props = Sub.proposals();
    const pend = Sub.pendingAlerts();
    const alarms = Sub.closureAlarms();
    const act = Sub.active().map((s) => ({ s, next: Sub.nextRenewal(s) }))
      .sort((a, b) => (a.next || '9').localeCompare(b.next || '9'));
    const cls = Sub.closed();
    const empty = !act.length && !props.length && !cls.length;

    setHtml(el, page({
      title: 'Abbonamenti',
      right: html`<button type="button" class="nav-icon-btn" data-add aria-label="Aggiungi">${icon('plus')}</button>`,
      body: empty ? html`
        <div class="empty">
          <div class="empty-icon" style="--c:var(--s3)">${icon('repeat')}</div>
          <h2>Nessun abbonamento</h2>
          <p>${M.txs().length ? 'Non ho trovato pagamenti ricorrenti nei movimenti importati. Puoi aggiungerli a mano, oppure aprire un movimento e scegliere «Questo è un abbonamento».' : 'Dopo il primo import li riconosco da solo: servizi noti (Netflix, Spotify…) e pagamenti uguali a intervalli regolari.'}</p>
          <div class="empty-actions"><button type="button" class="btn" data-add>${icon('plus')}<span>Aggiungi un abbonamento</span></button></div>
        </div>` : html`
        <div class="home-grid">
          <section class="card sub-hero">
            <div><span>Al mese</span><b>${formatCents(tot.monthly)}</b></div>
            <div><span>All'anno</span><b>${formatCents(tot.yearly)}</b></div>
            <p class="muted small">${tot.count} ${tot.count === 1 ? 'abbonamento attivo' : 'abbonamenti attivi'} · trimestrali e annuali riportati al mese</p>
          </section>

          ${pend.length ? html`
            <section class="card decide-card">
              <h2 class="card-title">${icon('calendar')} Da decidere</h2>
              ${pend.map(({ s, st }) => html`
                <div class="decide" data-id="${s.id}">
                  <button type="button" class="decide-head" data-open="${s.id}">${subIcon(s)}<span class="tx-text"><b>${s.name}</b><span>${s.trial ? 'La prova finisce' : 'Si rinnova'} ${relDays(st.next)} · ${fmtShort(st.next)}</span></span><span class="tx-amount">${formatCents(s.amountCents)}</span></button>
                  <div class="decide-actions">
                    <button type="button" class="btn small" data-go="${s.id}">Proseguo</button>
                    <button type="button" class="btn small secondary" data-later="${s.id}">Più tardi</button>
                    <button type="button" class="btn small secondary destructive-text" data-stop="${s.id}">Ho già disdetto</button>
                  </div>
                </div>`)}
            </section>` : ''}

          ${alarms.length ? html`
            <section class="card decide-card alarm">
              <h2 class="card-title">${icon('info')} Addebito dopo la disdetta</h2>
              ${alarms.map(({ s, txs }) => html`
                <div class="decide">
                  <button type="button" class="decide-head" data-open="${s.id}">${subIcon(s)}<span class="tx-text"><b>${s.name}</b><span>Disdetto il ${fmtShort(s.closedAt)} · ${txs.length === 1 ? `addebito del ${fmtShort(txs[0].date)}` : `${txs.length} addebiti`}</span></span><span class="tx-amount negative">${formatCents(txs.reduce((a, t) => a + t.cents, 0))}</span></button>
                  <div class="decide-actions">
                    <button type="button" class="btn small secondary" data-ack="${s.id}">Ho controllato</button>
                    <button type="button" class="btn small secondary" data-reopen="${s.id}">È ancora attivo</button>
                  </div>
                </div>`)}
            </section>` : ''}

          ${props.length ? html`
            <section class="card list-card">
              <div class="card-head"><h2 class="card-title">Proposti</h2><span class="muted small">confermali o scartali</span></div>
              <div class="list flush">${props.map((p, i) => html`
                <div class="tx-mini static prop-row">
                  <span class="tx-icon" style="background:var(--s3)">${icon('repeat')}</span>
                  <span class="tx-text"><b>${p.name}</b><span>${Sub.freqLabel(p)} · ${formatCents(p.amountCents)} · ${p.count} ${p.count === 1 ? 'pagamento' : 'pagamenti'} · ${REASON[p.reason]}</span></span>
                  <span class="prop-actions">
                    <button type="button" class="round-btn no" data-dismiss="${i}" aria-label="Scarta">${icon('close')}</button>
                    <button type="button" class="round-btn yes" data-confirm="${i}" aria-label="Conferma">${icon('check')}</button>
                  </span>
                </div>`)}</div>
            </section>` : ''}

          ${tot.upcoming.length ? html`
            <section class="card list-card">
              <div class="card-head"><h2 class="card-title">Prossimi 30 giorni</h2><b class="tabular">${formatCents(tot.upcomingCents)}</b></div>
              <div class="list flush">${tot.upcoming.map(({ s, next }) => html`
                <button type="button" class="tx-mini" data-open="${s.id}">
                  <span class="date-badge"><b>${Number(next.slice(8))}</b><span>${new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(new Date(`${next}T12:00:00`))}</span></span>
                  <span class="tx-text"><b>${s.name}</b><span>${relDays(next)}${s.alert?.on ? ' · avviso attivo' : ''}</span></span>
                  <span class="tx-amount">${formatCents(s.amountCents)}</span>
                </button>`)}</div>
            </section>` : ''}

          ${act.length ? html`
            <section class="card list-card">
              <div class="card-head"><h2 class="card-title">Attivi</h2></div>
              <div class="list flush">${act.map(({ s, next }) => html`
                <button type="button" class="tx-mini" data-open="${s.id}">
                  ${subIcon(s)}
                  <span class="tx-text"><b>${s.name}${s.alert?.on ? html` <i class="bell">${icon('calendar')}</i>` : ''}</b><span>${s.trial ? 'Prova gratuita · ' : ''}${Sub.freqLabel(s)}${next ? ` · ${fmtShort(next)}` : ''}</span></span>
                  <span class="tx-amount">${formatCents(s.amountCents)}<small>${s.freq === 'mensile' ? '' : `${formatCents(Sub.monthlyCents(s))}/mese`}</small></span>
                </button>`)}</div>
            </section>` : ''}

          ${cls.length ? html`
            <section class="card list-card">
              <button type="button" class="card-head link-head" data-toggle-closed><h2 class="card-title">Chiusi (${cls.length})</h2><span class="chev ${showClosed ? 'open' : ''}">${icon('chevron-right')}</span></button>
              ${showClosed ? html`<div class="list flush">${cls.map((s) => html`
                <button type="button" class="tx-mini" data-open="${s.id}">${subIcon(s)}<span class="tx-text"><b>${s.name}</b><span>Disdetto il ${fmtShort(s.closedAt || today())}</span></span><span class="tx-amount neutral">${formatCents(s.amountCents)}</span></button>`)}</div>` : ''}
            </section>` : ''}
        </div>`,
    }));
    off = enhancePage(el);
    el.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => openSubForm({}); });
    el.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => openSubDetail(b.dataset.open); });
    el.querySelectorAll('[data-confirm]').forEach((b) => {
      b.onclick = async () => {
        const p = props[Number(b.dataset.confirm)];
        await Sub.confirmProposal(p);
        toast(`${p.name} aggiunto agli abbonamenti`);
      };
    });
    el.querySelectorAll('[data-dismiss]').forEach((b) => {
      b.onclick = async () => {
        const p = props[Number(b.dataset.dismiss)];
        await Sub.dismissProposal(p);
        toast(`${p.name} scartato`);
      };
    });
    el.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => proceed(Sub.sub(b.dataset.go)); });
    el.querySelectorAll('[data-later]').forEach((b) => { b.onclick = () => later(Sub.sub(b.dataset.later)); });
    el.querySelectorAll('[data-stop]').forEach((b) => { b.onclick = () => cancelSub(Sub.sub(b.dataset.stop)); });
    el.querySelectorAll('[data-ack]').forEach((b) => {
      b.onclick = async () => {
        const s = Sub.sub(b.dataset.ack);
        await Sub.save({ ...s, ackTxIds: [...(s.ackTxIds || []), ...Sub.chargesAfterClosure(s).map((t) => t.id)] });
      };
    });
    el.querySelectorAll('[data-reopen]').forEach((b) => { b.onclick = () => reopen(Sub.sub(b.dataset.reopen)); });
    const tc = el.querySelector('[data-toggle-closed]');
    if (tc) tc.onclick = () => { showClosed = !showClosed; draw(); };
  }

  draw();
  const unsub = S.subscribe((col) => {
    if (['subs', 'tx', 'accounts', 'areas', 'settings', '*'].includes(col)) {
      const y = window.scrollY;
      draw();
      window.scrollTo(0, y);
    }
  });
  return () => { off?.(); unsub(); };
}

// ---------------------------------------------------------------- Azioni degli avvisi
function alertTitle(s) {
  return R.titleFor(s.trial ? 'Fine prova gratuita' : 'Rinnovo abbonamento', s.name);
}

// Ripetizione dell'evento nel file calendario: come la frequenza dell'abbonamento.
function subRepeat(s) {
  if (s.trial) return null;
  const f = Sub.FREQS.find((x) => x.id === s.freq);
  if (f?.months) return R.repeatFromMonths(f.months);
  return R.repeatFromDays(s.freq === 'settimanale' ? 7 : Number(s.customDays) || 30);
}

// Crea l'avviso per il prossimo rinnovo (o per la data scelta con «più tardi»).
export async function scheduleAlert(s) {
  const st = Sub.alertState(s);
  if (!st) return;
  const date = st.snoozed || st.alertDate;
  const res = await schedule({ title: alertTitle(s), date, mode: s.alert.mode, repeat: st.snoozed ? null : subRepeat(s) });
  if (!res) return;
  const cur = Sub.sub(s.id);
  await Sub.save({ ...cur, alert: { ...cur.alert, scheduledFor: st.snoozed ? `${st.next}@${st.snoozed}` : st.next, recurring: cur.alert.recurring || res.recurring } });
}

// Proseguo: l'abbonamento resta; se lo voglio, l'avviso si ripete al rinnovo successivo.
export async function proceed(s) {
  const st = Sub.alertState(s) || { next: Sub.nextRenewal(s) };
  const following = Sub.addPeriods(st.next, s, 1);
  const again = await confirmDialog({
    title: s.trial ? `Tieni ${s.name}` : `Prosegui con ${s.name}`,
    message: `Vuoi un avviso anche al rinnovo successivo, il ${fmtLong(following)}?`,
    confirmLabel: 'Sì, avvisami',
    cancelLabel: 'No, basta avvisi',
  });
  const cur = Sub.sub(s.id);
  const alert = { ...cur.alert, handledFor: st.next, snooze: null, on: again };
  await Sub.save({ ...cur, trial: false, alert });
  // Con il file calendario l'evento si ripete già da solo.
  if (again && alert.recurring) { toast('L\'evento nel Calendario si ripete già da solo'); return; }
  if (again) {
    const date = addDays(following, -(alert.daysBefore ?? 3));
    const res = await schedule({ title: R.titleFor('Rinnovo abbonamento', s.name), date, mode: alert.mode, repeat: subRepeat({ ...s, trial: false }) });
    if (res) await Sub.save({ ...Sub.sub(s.id), alert: { ...alert, scheduledFor: following, recurring: res.recurring } });
  } else toast('Avvisi spenti per questo abbonamento');
}

export async function later(s) {
  const st = Sub.alertState(s);
  if (!st) return;
  const until = await laterPicker();
  if (!until) return;
  const cur = Sub.sub(s.id);
  await Sub.save({ ...cur, alert: { ...cur.alert, snooze: { for: st.next, until } } });
  const ok = await schedule({ title: alertTitle(s), date: until, mode: cur.alert.mode });
  if (ok) {
    const c2 = Sub.sub(s.id);
    await Sub.save({ ...c2, alert: { ...c2.alert, scheduledFor: `${st.next}@${until}` } });
  }
}

export async function cancelSub(s) {
  const ok = await confirmDialog({
    title: `Hai disdetto ${s.name}?`,
    message: 'Lo segno come chiuso e controllo che non arrivino altri addebiti: se ne arriva uno, te lo dico qui.',
    confirmLabel: 'Sì, l\'ho disdetto',
  });
  if (!ok) return;
  const cur = Sub.sub(s.id);
  await Sub.save({ ...cur, status: 'chiuso', closedAt: today(), ackTxIds: [], alert: { ...cur.alert, on: false } });
  toast(`${s.name} segnato come chiuso`);
}

async function reopen(s) {
  await Sub.save({ ...Sub.sub(s.id), status: 'attivo', closedAt: null, ackTxIds: [] });
  toast(`${s.name} di nuovo attivo`);
}

// ---------------------------------------------------------------- Scheda
export function openSubDetail(id) {
  const sh = openSheet(html`<div class="tx-detail sub-detail"></div>`, { className: 'tall' });
  const root = sh.el.querySelector('.sub-detail');
  const off = S.subscribe((col) => { if (['subs', 'tx', 'settings', '*'].includes(col)) draw(); });
  sh.closed.then(off);

  function draw() {
    const s = Sub.sub(id);
    if (!s) { sh.close(); return; }
    const pays = Sub.payments(s);
    const changes = Sub.priceChanges(pays);
    const next = Sub.nextRenewal(s, pays);
    const st = Sub.alertState(s);
    const acc = M.account(s.accountId);
    const a = s.alert || {};
    root.innerHTML = String(html`
      <div class="txd-head">
        ${subIcon(s, true)}
        <div class="txd-amount">${formatCents(s.amountCents)}</div>
        <div class="txd-meta">${Sub.freqLabel(s)}${s.freq !== 'mensile' ? ` · ${formatCents(Sub.monthlyCents(s))} al mese` : ` · ${formatCents(Sub.yearlyCents(s))} all'anno`}</div>
        <button type="button" class="txd-merchant" data-edit>${s.name} ${icon('pencil')}</button>
        ${s.status === 'chiuso' ? html`<span class="badge">Disdetto il ${fmtShort(s.closedAt || today())}</span>` : s.trial ? html`<span class="badge">Prova gratuita</span>` : ''}
      </div>

      <div class="list">
        <button type="button" class="row" data-edit><span class="row-label">${s.trial ? 'Fine della prova' : 'Prossimo rinnovo'}</span><span class="row-detail">${next ? `${fmtShort(next)} · ${relDays(next)}` : '—'}</span><span class="chev">${icon('chevron-right')}</span></button>
        <button type="button" class="row" data-edit><span class="row-label">Conto o carta</span><span class="row-detail">${acc ? acc.name : 'Non indicato'}</span><span class="chev">${icon('chevron-right')}</span></button>
        <button type="button" class="row" data-edit><span class="row-label">Area</span><span class="row-detail">${M.area(s.areaId)?.name || 'Nessuna'}</span><span class="chev">${icon('chevron-right')}</span></button>
      </div>

      ${s.status === 'attivo' ? html`
        <h3 class="group-title">Avvisi</h3>
        <div class="list">
          <label class="row"><span class="row-label">Avvisami prima del rinnovo</span><input type="checkbox" class="switch" data-alert ${a.on ? 'checked' : ''}></label>
          ${a.on ? html`
            <div class="row static"><span class="row-label">Giorni di anticipo</span>
              <span class="stepper"><button type="button" data-days="-1" ${a.daysBefore <= 0 ? 'disabled' : ''}>−</button><span>${a.daysBefore ?? 3}</span><button type="button" data-days="1">+</button></span></div>
            ${usesIcs() ? '' : html`<label class="row"><span class="row-label">Dove</span><span class="select-wrap"><select data-mode>${modeOptions().map(([v, l]) => html`<option value="${v}" ${(a.mode || '') === v ? 'selected' : ''}>${l}</option>`)}</select>${icon('chevron-right', 'select-chev')}</span></label>`}
            ${st ? html`<button type="button" class="row tinted" data-schedule>
              <span class="row-label">${st.scheduled ? 'Crea di nuovo l\'avviso' : usesIcs() ? 'Aggiungi l\'avviso al Calendario' : 'Crea l\'avviso con Comandi Rapidi'}<small>${st.snoozed ? `Rimandato al ${fmtShort(st.snoozed)}` : `Avviso il ${fmtShort(st.alertDate < today() ? today() : st.alertDate)}`}${st.scheduled ? (s.alert.recurring ? ' · si ripete nel Calendario' : ' · già creato') : ' · non ancora creato'}</small></span>
              <span class="row-detail ${st.scheduled ? 'ok' : 'ko'}">${st.scheduled ? icon('check') : icon('calendar')}</span>
            </button>` : ''}` : ''}
        </div>
        ${a.on ? html`<p class="group-footer">Quando arriva l'avviso, apri Finanze: in alto trovi Proseguo, Ricordamelo più tardi e Ho già disdetto.</p>` : ''}` : ''}

      <h3 class="group-title">Pagamenti${pays.length ? ` (${pays.length})` : ''}</h3>
      ${changes.length ? html`<div class="price-changes">${changes.map((c) => html`
        <div class="${c.diff > 0 ? 'up' : 'down'}">${icon(c.diff > 0 ? 'chart' : 'undo')}<span>${c.diff > 0 ? 'Aumento' : 'Riduzione'} il ${fmtShort(c.date)}: da ${formatCents(c.from)} a ${formatCents(c.to)}</span><b>${c.diff > 0 ? '+' : ''}${formatCents(c.diff)}</b></div>`)}</div>` : ''}
      ${pays.length ? html`<div class="list">${pays.slice(0, 24).map((t) => html`
        <div class="row static"><span class="row-label">${fmtLong(t.date)}<small>${M.account(t.accountId)?.name || ''}${t.alias ? ` · ${t.merchant}` : ''}</small></span><span class="row-detail">${formatCents(t.cents)}</span></div>`)}</div>
        ${pays.length > 24 ? html`<p class="group-footer">e altri ${pays.length - 24}.</p>` : ''}`
        : html`<p class="group-footer">Nessun pagamento trovato nei movimenti. Quando importi un addebito con lo stesso nome e un importo simile, comparirà qui.</p>`}

      <div class="list danger-list">
        ${s.status === 'attivo'
          ? html`<button type="button" class="row" data-stop><span class="row-label">Ho disdetto questo abbonamento</span></button>`
          : html`<button type="button" class="row" data-reopen><span class="row-label">Segna di nuovo come attivo</span></button>`}
        <button type="button" class="row destructive" data-delete><span class="row-label">Elimina abbonamento</span></button>
      </div>`);
    wire(s);
  }

  function wire(s) {
    root.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => openSubForm({}, Sub.sub(id)); });
    const al = root.querySelector('[data-alert]');
    if (al) {
      al.onchange = async () => {
        const cur = Sub.sub(id);
        await Sub.save({ ...cur, alert: { ...cur.alert, on: al.checked, handledFor: null, snooze: null, recurring: false, scheduledFor: null } });
      };
    }
    root.querySelectorAll('[data-days]').forEach((b) => {
      b.onclick = async () => {
        const cur = Sub.sub(id);
        const d = Math.max(0, Math.min(60, (cur.alert.daysBefore ?? 3) + Number(b.dataset.days)));
        await Sub.save({ ...cur, alert: { ...cur.alert, daysBefore: d, scheduledFor: null, recurring: false } });
      };
    });
    const md = root.querySelector('[data-mode]');
    if (md) md.onchange = async () => { const cur = Sub.sub(id); await Sub.save({ ...cur, alert: { ...cur.alert, mode: md.value || null } }); };
    const sc = root.querySelector('[data-schedule]');
    if (sc) sc.onclick = () => scheduleAlert(Sub.sub(id));
    const stop = root.querySelector('[data-stop]');
    if (stop) stop.onclick = () => cancelSub(Sub.sub(id));
    const re = root.querySelector('[data-reopen]');
    if (re) re.onclick = () => reopen(Sub.sub(id));
    root.querySelector('[data-delete]').onclick = async () => {
      const ok = await confirmDialog({
        title: `Eliminare ${s.name}?`,
        message: 'I movimenti restano. Se è un pagamento ricorrente, potrebbe tornare tra i proposti: in quel caso scartalo.',
        confirmLabel: 'Elimina',
        destructive: true,
      });
      if (ok) { await Sub.remove(id); sh.close(); toast('Abbonamento eliminato'); }
    };
  }

  draw();
}

// ---------------------------------------------------------------- Modulo (nuovo o modifica)
// `init`: valori proposti (es. da un movimento); `existing`: abbonamento da modificare.
export function openSubForm(init = {}, existing = null) {
  const base = existing || init;
  const startNext = existing ? Sub.nextRenewal(existing) : (init.lastDate ? Sub.nextRenewal({ ...init, anchorDate: null }, [{ date: init.lastDate }]) : today());
  let freq = base.freq || 'mensile';
  const sh = openSheet(html`
    <form class="dialog" novalidate>
      <h2>${existing ? 'Modifica abbonamento' : 'Nuovo abbonamento'}</h2>
      ${init.fromTx ? html`<p>Ho provato a indovinare frequenza e prossimo rinnovo dai pagamenti simili: controlla.</p>` : ''}
      <label class="field"><input class="text" name="name" value="${base.name || ''}" placeholder="Nome (per esempio Spotify)" autocapitalize="words" required></label>
      <label class="field money big"><span>€</span><input class="text" name="amount" inputmode="decimal" placeholder="0,00" value="${euroInput(base.amountCents)}"></label>
      <div class="field-group">
        <label class="field field-row"><span>Frequenza</span><select name="freq">${Sub.FREQS.map((f) => html`<option value="${f.id}" ${f.id === freq ? 'selected' : ''}>${f.label}</option>`)}</select></label>
        <label class="field field-row" data-custom ${freq === 'personalizzata' ? '' : 'hidden'}><span>Ogni quanti giorni</span><input class="text" name="days" inputmode="numeric" value="${base.customDays || 30}"></label>
        <label class="field field-row"><span data-next-label>${base.trial ? 'Fine della prova' : 'Prossimo rinnovo'}</span><input class="text" type="date" name="next" value="${startNext || today()}"></label>
        <label class="field field-row"><span>Conto o carta</span><select name="account"><option value="">Non indicato</option>${M.accounts().map((a) => html`<option value="${a.id}" ${a.id === base.accountId ? 'selected' : ''}>${a.name}</option>`)}</select></label>
        <label class="field field-row"><span>Area</span><select name="area"><option value="">Nessuna</option>${M.areas().map((a) => html`<option value="${a.id}" ${a.id === (base.areaId ?? 'abbonamenti') ? 'selected' : ''}>${a.name}</option>`)}</select></label>
        <label class="field field-row"><span>Prova gratuita</span><input type="checkbox" class="switch" name="trial" ${base.trial ? 'checked' : ''}></label>
      </div>
      <p class="group-footer">Per una prova gratuita indica come importo il prezzo dopo la prova e come data il giorno in cui finisce.</p>
      <p class="form-error" hidden></p>
      <div class="dialog-actions">
        <button type="submit" class="btn">${existing ? 'Salva' : 'Aggiungi'}</button>
        <button type="button" class="btn secondary" data-cancel>Annulla</button>
      </div>
    </form>`);
  const form = sh.el.querySelector('form');
  form.querySelector('[data-cancel]').onclick = () => sh.close();
  form.elements.freq.onchange = () => {
    freq = form.elements.freq.value;
    form.querySelector('[data-custom]').hidden = freq !== 'personalizzata';
  };
  form.elements.trial.onchange = () => {
    form.querySelector('[data-next-label]').textContent = form.elements.trial.checked ? 'Fine della prova' : 'Prossimo rinnovo';
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error');
    const name = form.elements.name.value.trim();
    const amountCents = parseEuro(form.elements.amount.value);
    if (!name) { err.textContent = 'Scrivi il nome.'; err.hidden = false; return; }
    if (!amountCents) { err.textContent = 'Scrivi l\'importo.'; err.hidden = false; return; }
    const patch = {
      name,
      amountCents,
      freq,
      customDays: freq === 'personalizzata' ? Math.max(1, parseInt(form.elements.days.value, 10) || 30) : null,
      anchorDate: form.elements.next.value || today(),
      accountId: form.elements.account.value || null,
      areaId: form.elements.area.value || null,
      trial: form.elements.trial.checked,
    };
    if (existing) {
      const cur = Sub.sub(existing.id);
      const same = cur.anchorDate === patch.anchorDate && cur.freq === patch.freq;
      await Sub.save({ ...cur, ...patch, alert: { ...cur.alert, scheduledFor: same ? cur.alert.scheduledFor : null, recurring: same ? cur.alert.recurring : false } });
      toast('Abbonamento salvato');
    } else {
      const s = Sub.newSub({ ...patch, key: init.key || null, source: init.fromTx ? 'movimento' : 'manuale' });
      await Sub.save(s);
      toast(`${name} aggiunto`);
    }
    sh.close();
  };
}

// «Questo è un abbonamento» dal dettaglio di un movimento.
export function markTxAsSub(t) {
  const existing = Sub.subForTx(t);
  if (existing && existing.status !== 'scartato') { openSubDetail(existing.id); return; }
  const g = Sub.guessFromTx(t);
  if (existing) {
    // Era stato scartato: lo riprendo con i dati del movimento.
    Sub.remove(existing.id);
  }
  openSubForm({ ...g, fromTx: true });
}
