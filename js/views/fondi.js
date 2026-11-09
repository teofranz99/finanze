// Fondi e spese condivise: fondi vincolati e casse comuni (soldi sul conto che non sono miei),
// saldo reale dei conti, spese divise con altre persone e «chi deve cosa a chi».
// Da qui partono anche le azioni sui movimenti: «Paga con il fondo», «Dividi con altre persone»,
// «È un rimborso», ricevute allegate.

import { html, setHtml } from '../util.js';
import { icon } from '../ui/icons.js';
import { page, enhancePage } from '../ui/page.js';
import { openSheet, confirmDialog, toast } from '../ui/sheet.js';
import { formatCents, parseEuro, euroValue } from '../money.js';
import * as M from '../data/model.js';
import * as F from '../data/funds.js';
import * as Sh from '../data/shares.js';
import * as Files from '../data/files.js';
import * as S from '../store.js';
import { today, fmtShort, fmtLong } from '../dates.js';
import { txIcon, openTxDetail } from './tx-ui.js';

const fundIcon = (f, big = false) => html`<span class="tx-icon ${big ? 'big' : ''}" style="background:${f.status === 'chiuso' ? 'var(--s10)' : f.kind === 'cassa' ? 'var(--s7)' : 'var(--s5)'}">${icon(f.kind === 'cassa' ? 'users' : 'briefcase')}</span>`;
const personIcon = (name) => html`<span class="tx-icon avatar">${(name || '?').trim().charAt(0).toUpperCase()}</span>`;
const dmy = (iso) => iso.split('-').reverse().join('/');

// ---------------------------------------------------------------- Pagina
export function fondiView(el) {
  let off = null;
  let showClosed = false;

  function draw() {
    off?.();
    const open = F.open().map((f) => ({ f, b: F.balance(f) }));
    const closed = F.closed();
    const real = F.realBalances();
    const people = Sh.people();
    const sum = Sh.summary();
    const restricted = F.totalRestricted();
    const empty = !open.length && !closed.length && !people.length;

    setHtml(el, page({
      title: 'Fondi',
      right: html`<button type="button" class="nav-icon-btn" data-add aria-label="Aggiungi">${icon('plus')}</button>`,
      body: empty ? html`
        <div class="empty">
          <div class="empty-icon" style="--c:var(--s5)">${icon('users')}</div>
          <h2>Soldi non tuoi e spese divise</h2>
          <p>Un <b>fondo vincolato</b> tiene da parte i soldi che stanno sul tuo conto ma non sono tuoi, per esempio un anticipo dell'azienda per le trasferte: le spese pagate con il fondo non contano tra le tue.</p>
          <p>Una <b>spesa divisa</b> conta solo per la tua quota, e qui vedi chi ti deve ancora dei soldi.</p>
          <div class="empty-actions">
            <button type="button" class="btn" data-new-fund>${icon('briefcase')}<span>Nuovo fondo vincolato</span></button>
            <button type="button" class="btn secondary" data-share-tx>${icon('users')}<span>Dividi una spesa</span></button>
            <button type="button" class="btn secondary" data-new-debt>${icon('swap')}<span>Segna un credito o un debito</span></button>
          </div>
        </div>` : html`
        <div class="home-grid">
          <section class="card sub-hero">
            <div><span>Non tuoi</span><b>${formatCents(restricted)}</b></div>
            <div><span>${sum.iOwe && !sum.owedToMe ? 'Devi tu' : 'Ti devono'}</span><b>${formatCents(sum.iOwe && !sum.owedToMe ? sum.iOwe : sum.owedToMe)}</b></div>
            <p class="muted small">${open.length} ${open.length === 1 ? 'fondo aperto' : 'fondi aperti'}${sum.iOwe && sum.owedToMe ? ` · tu devi ${formatCents(sum.iOwe)}` : ''}</p>
          </section>

          ${real.length ? html`
            <section class="card list-card">
              <div class="card-head"><h2 class="card-title">Saldo reale</h2></div>
              <div class="list flush">${real.map((x) => html`
                <a class="tx-mini wrap" href="#/conto/${x.account.id}">
                  <span class="tx-icon" style="background:${M.accountColor(x.account)}">${icon('bank')}</span>
                  <span class="tx-text"><b>${x.account.name}</b><span>Saldo ${formatCents(x.balance)} · non tuoi ${formatCents(x.restricted)}</span></span>
                  <span class="tx-amount ${x.mine < 0 ? 'negative' : ''}">${formatCents(x.mine)}<small>tuoi</small></span>
                </a>`)}</div>
              ${real.some((x) => x.mine < 0) ? html`<p class="warn-note">${icon('info')}Su un conto stai usando soldi non tuoi per spese tue.</p>` : ''}
            </section>` : ''}

          ${open.length ? html`
            <section class="card list-card">
              <div class="card-head"><h2 class="card-title">Fondi</h2></div>
              <div class="list flush">${open.map(({ f, b }) => html`
                <button type="button" class="tx-mini fund-row" data-fund="${f.id}">
                  ${fundIcon(f)}
                  <span class="tx-text"><b>${f.name}</b><span>${f.owner ? `${f.owner} · ` : ''}${b.inCents ? `${formatCents(b.inCents)} in tutto` : 'nessun versamento'}</span>
                    <span class="cb-bar"><i style="width:${Math.max(2, b.pct * 100)}%;background:${b.pct < 0.1 ? 'var(--orange)' : 'var(--s5)'}"></i></span></span>
                  <span class="tx-amount ${b.remaining < 0 ? 'negative' : ''}">${formatCents(b.remaining)}<small>restano</small></span>
                </button>`)}</div>
            </section>` : ''}

          ${people.length ? html`
            <section class="card list-card">
              <div class="card-head"><h2 class="card-title">Chi deve cosa</h2></div>
              <div class="list flush">${people.map((p) => html`
                <button type="button" class="tx-mini" data-person="${p.key}">
                  ${personIcon(p.name)}
                  <span class="tx-text"><b>${p.name}</b><span>${p.open.length ? `${p.open.length} ${p.open.length === 1 ? 'voce aperta' : 'voci aperte'}` : 'Tutto saldato'}</span></span>
                  <span class="tx-amount ${p.net > 0 ? 'positive' : p.net < 0 ? 'negative' : 'neutral'}">${p.net ? formatCents(Math.abs(p.net)) : '—'}<small>${p.net > 0 ? 'ti deve' : p.net < 0 ? 'gli devi' : ''}</small></span>
                </button>`)}</div>
            </section>` : ''}

          ${closed.length ? html`
            <section class="card list-card">
              <button type="button" class="card-head link-head" data-toggle-closed><h2 class="card-title">Fondi chiusi (${closed.length})</h2><span class="chev ${showClosed ? 'open' : ''}">${icon('chevron-right')}</span></button>
              ${showClosed ? html`<div class="list flush">${closed.map((f) => html`
                <button type="button" class="tx-mini" data-fund="${f.id}">${fundIcon(f)}<span class="tx-text"><b>${f.name}</b><span>Chiuso il ${fmtShort(f.closedAt || today())}</span></span><span class="tx-amount neutral">${formatCents(F.balance(f).spent)}<small>spesi</small></span></button>`)}</div>` : ''}
            </section>` : ''}
        </div>`,
    }));
    off = enhancePage(el);
    el.querySelectorAll('[data-add]').forEach((b) => { b.onclick = addMenu; });
    el.querySelectorAll('[data-new-fund]').forEach((b) => { b.onclick = () => openFundForm({}); });
    el.querySelectorAll('[data-new-debt]').forEach((b) => { b.onclick = () => openDebtForm({}); });
    el.querySelectorAll('[data-share-tx]').forEach((b) => { b.onclick = shareFromList; });
    el.querySelectorAll('[data-fund]').forEach((b) => { b.onclick = () => openFundDetail(b.dataset.fund); });
    el.querySelectorAll('[data-person]').forEach((b) => { b.onclick = () => openPerson(b.dataset.person); });
    const tc = el.querySelector('[data-toggle-closed]');
    if (tc) tc.onclick = () => { showClosed = !showClosed; draw(); };
  }

  draw();
  const unsub = S.subscribe((col) => {
    if (['funds', 'debts', 'tx', 'accounts', '*'].includes(col)) {
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
        <button type="button" class="row" data-a="fund"><span class="row-icon" style="background:var(--s5)">${icon('briefcase')}</span><span class="row-label">Fondo vincolato<small>Soldi sul tuo conto che non sono tuoi</small></span></button>
        <button type="button" class="row" data-a="cassa"><span class="row-icon" style="background:var(--s7)">${icon('users')}</span><span class="row-label">Cassa comune<small>Per un viaggio o un regalo di gruppo</small></span></button>
        <button type="button" class="row" data-a="share"><span class="row-icon" style="background:var(--s2)">${icon('split')}</span><span class="row-label">Dividi una spesa<small>Scegli un movimento e dividilo con altre persone</small></span></button>
        <button type="button" class="row" data-a="debt"><span class="row-icon" style="background:var(--s9)">${icon('swap')}</span><span class="row-label">Credito o debito<small>«Mi deve 20 €», «Gli devo il cinema»</small></span></button>
      </div>
    </div>`);
  s.el.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) s.close(b.dataset.a); });
  const a = await s.closed;
  if (a === 'fund') openFundForm({});
  if (a === 'cassa') openFundForm({ kind: 'cassa' });
  if (a === 'share') shareFromList();
  if (a === 'debt') openDebtForm({});
}

async function shareFromList() {
  const id = await pickTx({ title: 'Quale spesa vuoi dividere?', list: M.txs().filter((t) => t.cents < 0 && !t.fundId && M.kindOf(t) !== 'giroconto').sort((a, b) => b.date.localeCompare(a.date)) });
  if (id) openShareSheet(id);
}

// ---------------------------------------------------------------- Scelta di un movimento
export function pickTx({ title, hint = '', list }) {
  let q = '';
  const s = openSheet(html`<div class="dialog picker tx-pick"></div>`, { className: 'tall' });
  const root = s.el.querySelector('.tx-pick');
  function draw() {
    const needle = q.trim().toLowerCase();
    const shown = list.filter((t) => !needle || `${M.displayName(t)} ${t.merchant} ${t.note || ''} ${formatCents(Math.abs(t.cents))}`.toLowerCase().includes(needle)).slice(0, 60);
    root.querySelector('[data-items]').innerHTML = String(shown.length ? shown.map((t) => html`
      <button type="button" class="tx-mini" data-id="${t.id}">
        ${txIcon(t)}
        <span class="tx-text"><b>${M.displayName(t)}</b><span>${dmy(t.date)} · ${M.account(t.accountId)?.name || ''}</span></span>
        <span class="tx-amount ${t.cents > 0 ? 'positive' : ''}">${formatCents(t.cents, { sign: true })}</span>
      </button>`) : html`<p class="empty-note">Nessun movimento${needle ? ' con questa ricerca' : ''}.</p>`);
  }
  root.innerHTML = String(html`
    <h2>${title}</h2>
    ${hint ? html`<p>${hint}</p>` : ''}
    <div class="search-bar">${icon('search')}<input type="search" placeholder="Cerca nome o importo" data-q enterkeyhint="search"></div>
    <div class="list flush-sheet" data-items></div>`);
  root.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value; draw(); });
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) s.close(b.dataset.id); });
  draw();
  return s.closed;
}

// Importo, data e nota (per ricariche, restituzioni e crediti senza movimento).
function amountDialog({ title, message, confirmLabel = 'Salva', cents = 0, note = '', date = today(), notePlaceholder = 'Nota (facoltativa)' }) {
  const s = openSheet(html`
    <form class="dialog" novalidate>
      <h2>${title}</h2>
      ${message ? html`<p>${message}</p>` : ''}
      <label class="field money big"><span>€</span><input class="text" name="amount" inputmode="decimal" placeholder="0,00" value="${euroValue(cents)}"></label>
      <div class="field-group">
        <label class="field"><input class="text" name="note" value="${note}" placeholder="${notePlaceholder}"></label>
        <label class="field field-row"><span>Data</span><input class="text" type="date" name="date" value="${date}"></label>
      </div>
      <p class="form-error" hidden></p>
      <div class="dialog-actions">
        <button type="submit" class="btn">${confirmLabel}</button>
        <button type="button" class="btn secondary" data-cancel>Annulla</button>
      </div>
    </form>`);
  const form = s.el.querySelector('form');
  setTimeout(() => form.elements.amount.focus(), 350);
  form.querySelector('[data-cancel]').onclick = () => s.close(null);
  form.onsubmit = (e) => {
    e.preventDefault();
    const c = parseEuro(form.elements.amount.value);
    if (!c) { const err = form.querySelector('.form-error'); err.textContent = 'Scrivi un importo.'; err.hidden = false; return; }
    s.close({ cents: c, note: form.elements.note.value.trim(), date: form.elements.date.value || today() });
  };
  return s.closed;
}

// ---------------------------------------------------------------- Fondo: modulo
// `init`: valori proposti (kind, fromTxId); `existing`: fondo da modificare.
export function openFundForm(init = {}, existing = null) {
  const base = existing || init;
  let kind = base.kind || 'fondo';
  const fromTx = init.fromTxId ? M.tx(init.fromTxId) : null;
  const sh = openSheet(html`
    <form class="dialog" novalidate>
      <h2>${existing ? 'Modifica fondo' : kind === 'cassa' ? 'Nuova cassa comune' : 'Nuovo fondo vincolato'}</h2>
      ${fromTx ? html`<p>Il versamento di ${formatCents(fromTx.cents)} del ${fmtShort(fromTx.date)} sarà il primo movimento del fondo.</p>` : ''}
      <div class="segmented wide" data-seg="kind">
        <button type="button" class="${kind === 'fondo' ? 'on' : ''}" data-value="fondo">Fondo vincolato</button>
        <button type="button" class="${kind === 'cassa' ? 'on' : ''}" data-value="cassa">Cassa comune</button>
      </div>
      <div class="field-group">
        <label class="field"><input class="text" name="name" value="${base.name || ''}" placeholder="Nome (per esempio Anticipo trasferte)" autocapitalize="sentences" required></label>
        <label class="field"><input class="text" name="owner" value="${base.owner || ''}" placeholder="Di chi sono i soldi (per esempio Azienda)" autocapitalize="sentences"></label>
        <label class="field field-row"><span>Conto</span><select name="account"><option value="">Non indicato</option>${M.accounts().map((a) => html`<option value="${a.id}" ${a.id === (base.accountId || fromTx?.accountId) ? 'selected' : ''}>${a.name}</option>`)}</select></label>
      </div>
      ${fromTx ? '' : html`
        <label class="field money"><span>€</span><input class="text" name="opening" inputmode="decimal" placeholder="Importo iniziale (facoltativo)" value="${euroValue(base.openingCents)}"></label>
        <p class="group-footer">${existing ? 'L\'importo scritto a mano, oltre ai versamenti collegati.' : 'Se il bonifico in entrata è già tra i movimenti, lascia vuoto: lo colleghi dopo dalla scheda del fondo.'}</p>`}
      <label class="field"><textarea class="text" name="note" rows="2" placeholder="Note">${base.note || ''}</textarea></label>
      <p class="form-error" hidden></p>
      <div class="dialog-actions">
        <button type="submit" class="btn">${existing ? 'Salva' : 'Crea'}</button>
        <button type="button" class="btn secondary" data-cancel>Annulla</button>
      </div>
    </form>`, { className: 'tall' });
  const form = sh.el.querySelector('form');
  form.querySelector('[data-cancel]').onclick = () => sh.close();
  form.querySelector('[data-seg=kind]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (!b) return;
    kind = b.dataset.value;
    form.querySelectorAll('[data-seg=kind] button').forEach((x) => x.classList.toggle('on', x === b));
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) { const err = form.querySelector('.form-error'); err.textContent = 'Scrivi il nome.'; err.hidden = false; return; }
    const patch = {
      name,
      kind,
      owner: form.elements.owner.value.trim(),
      accountId: form.elements.account.value || null,
      note: form.elements.note.value.trim(),
    };
    if (form.elements.opening) patch.openingCents = parseEuro(form.elements.opening.value) || 0;
    if (existing) {
      await F.save({ ...F.fund(existing.id), ...patch });
      toast('Fondo salvato');
      sh.close();
      return;
    }
    const f = F.newFund(patch);
    await F.save(f);
    if (fromTx) await F.linkTx(fromTx.id, f.id);
    sh.close();
    toast(`${name} creato`);
    openFundDetail(f.id);
  };
}

// ---------------------------------------------------------------- Fondo: scheda
export function openFundDetail(id) {
  const sh = openSheet(html`<div class="tx-detail fund-detail"></div>`, { className: 'tall' });
  const root = sh.el.querySelector('.fund-detail');
  const off = S.subscribe((col) => { if (['funds', 'tx', 'files', '*'].includes(col)) draw(); });
  sh.closed.then(off);

  function draw() {
    const f = F.fund(id);
    if (!f) { sh.close(); return; }
    const b = F.balance(f);
    const rows = F.ledger(f);
    const acc = M.account(f.accountId);
    const isOpen = f.status !== 'chiuso';
    root.innerHTML = String(html`
      <div class="txd-head">
        ${fundIcon(f, true)}
        <div class="txd-amount ${b.remaining < 0 ? 'negative' : ''}">${formatCents(b.remaining)}</div>
        <div class="txd-meta">${b.remaining < 0 ? 'Hai speso più di quanto c\'era nel fondo' : 'restano nel fondo'}</div>
        <button type="button" class="txd-merchant" data-edit>${f.name} ${icon('pencil')}</button>
        <div class="txd-meta">${[f.kind === 'cassa' ? 'Cassa comune' : 'Fondo vincolato', f.owner || '', acc ? `su ${acc.name}` : ''].filter(Boolean).join(' · ')}</div>
        ${isOpen ? '' : html`<span class="badge">Chiuso il ${fmtShort(f.closedAt || today())}</span>`}
      </div>

      <div class="stat-grid three">
        <div><span>Entrati</span><b>${formatCents(b.inCents)}</b></div>
        <div><span>Spesi</span><b>${formatCents(b.spent)}</b></div>
        <div><span>Restituiti</span><b>${formatCents(b.returned)}</b></div>
      </div>
      ${b.inCents ? html`<span class="cb-bar big"><i style="width:${Math.max(1, b.pct * 100)}%;background:${b.pct < 0.1 ? 'var(--orange)' : 'var(--s5)'}"></i></span>` : ''}

      ${isOpen ? html`
        <div class="list">
          <button type="button" class="row" data-act="spend"><span class="row-icon" style="background:var(--s2)">${icon('cart')}</span><span class="row-label">Paga una spesa con il fondo<small>Scegli il movimento: non conterà tra le tue spese</small></span></button>
          <button type="button" class="row" data-act="deposit"><span class="row-icon" style="background:var(--s5)">${icon('plus')}</span><span class="row-label">Collega un versamento<small>Il bonifico in entrata: non conterà come tua entrata</small></span></button>
          <button type="button" class="row" data-act="topup"><span class="row-icon" style="background:var(--s4)">${icon('cash')}</span><span class="row-label">Aggiungi soldi a mano</span></button>
          <button type="button" class="row" data-act="return"><span class="row-icon" style="background:var(--s9)">${icon('undo')}</span><span class="row-label">Segna una restituzione<small>Soldi ridati a chi li aveva messi</small></span></button>
        </div>` : ''}

      <h3 class="group-title">Movimenti del fondo${rows.length ? ` (${rows.length})` : ''}</h3>
      ${rows.length ? html`<div class="list">${rows.map((r) => html`
        <button type="button" class="row ledger-row" data-row="${r.key}">
          <span class="row-label">${r.label}<small>${fmtShort(r.date)} · ${F.typeLabel(r.type)}${r.receiptId ? ' · ricevuta' : ''}</small></span>
          ${r.receiptId ? html`<span class="clip">${icon('doc')}</span>` : ''}
          <span class="row-detail ${r.cents > 0 ? 'ok' : ''}">${formatCents(r.cents, { sign: true })}</span>
        </button>`)}</div>`
        : html`<p class="group-footer">Ancora nessun movimento. Collega il versamento in entrata oppure scrivi l'importo iniziale con «Modifica».</p>`}

      <h3 class="group-title">Rendiconto</h3>
      <div class="list">
        <button type="button" class="row" data-act="pdf"><span class="row-icon" style="background:var(--s1)">${icon('printer')}</span><span class="row-label">Stampa o salva in PDF<small>Con le foto delle ricevute</small></span></button>
        <button type="button" class="row" data-act="csv"><span class="row-icon" style="background:var(--s2)">${icon('doc')}</span><span class="row-label">Esporta per Excel (CSV)</span></button>
      </div>
      ${f.note ? html`<p class="group-footer">${f.note}</p>` : ''}

      <div class="list danger-list">
        ${isOpen
          ? html`<button type="button" class="row" data-act="close"><span class="row-label">Chiudi il fondo</span></button>`
          : html`<button type="button" class="row" data-act="reopen"><span class="row-label">Riapri il fondo</span></button>`}
        <button type="button" class="row destructive" data-act="delete"><span class="row-label">Elimina fondo</span></button>
      </div>`);
    wire(f, rows);
  }

  function wire(f, rows) {
    root.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => openFundForm({}, F.fund(id)); });
    const act = (name, fn) => { const b = root.querySelector(`[data-act=${name}]`); if (b) b.onclick = fn; };
    act('spend', async () => {
      const t = await pickTx({ title: 'Quale spesa hai pagato con il fondo?', list: F.candidates(-1).filter((x) => !x.share) });
      if (t) { await F.linkTx(t, id); toast('Spesa pagata con il fondo'); }
    });
    act('deposit', async () => {
      const t = await pickTx({ title: 'Quale versamento è del fondo?', list: F.candidates(1) });
      if (t) { await F.linkTx(t, id); toast('Versamento collegato'); }
    });
    act('topup', async () => {
      const v = await amountDialog({ title: 'Aggiungi soldi', message: 'Per soldi arrivati senza un movimento della banca (per esempio in contanti).', notePlaceholder: 'Nota (per esempio Ricarica di marzo)' });
      if (v) await F.addEntry(id, { type: 'ricarica', cents: v.cents, note: v.note, date: v.date });
    });
    act('return', async () => {
      const how = await choose('Come hai restituito i soldi?', [
        ['tx', 'Con un movimento del conto', 'Per esempio un bonifico'],
        ['manual', 'A mano', 'Contanti o altro'],
      ]);
      if (how === 'tx') {
        const t = await pickTx({ title: 'Quale movimento è la restituzione?', list: F.candidates(-1) });
        if (t) { await F.linkTx(t, id, { asReturn: true }); toast('Restituzione collegata'); }
      } else if (how === 'manual') {
        const v = await amountDialog({ title: 'Restituzione', notePlaceholder: 'Nota (facoltativa)' });
        if (v) await F.addEntry(id, { type: 'restituzione', cents: -v.cents, note: v.note, date: v.date });
      }
    });
    act('csv', () => exportCsv(F.fund(id)));
    act('pdf', () => printReport(F.fund(id)));
    act('close', async () => {
      const b = F.balance(F.fund(id));
      const ok = await confirmDialog({
        title: 'Chiudere il fondo?',
        message: b.remaining > 0 ? `Restano ${formatCents(b.remaining)}: se li hai restituiti, segnalo prima con «Segna una restituzione». Chiuso, il fondo non toglie più soldi dallo spendibile.` : 'Il fondo resta nell\'elenco dei chiusi, con il suo rendiconto.',
        confirmLabel: 'Chiudi',
      });
      if (ok) await F.save({ ...F.fund(id), status: 'chiuso', closedAt: today() });
    });
    act('reopen', async () => { await F.save({ ...F.fund(id), status: 'aperto', closedAt: null }); });
    act('delete', async () => {
      const ok = await confirmDialog({ title: `Eliminare ${f.name}?`, message: 'I movimenti collegati restano, ma torneranno a contare come tue entrate e uscite.', confirmLabel: 'Elimina', destructive: true });
      if (!ok) return;
      for (const e of f.entries || []) if (e.receiptId) await Files.removeFile(e.receiptId);
      await F.remove(id);
      sh.close();
      toast('Fondo eliminato');
    });
    root.querySelectorAll('[data-row]').forEach((b) => {
      b.onclick = () => rowActions(F.fund(id), rows.find((r) => r.key === b.dataset.row));
    });
  }

  draw();
}

function choose(title, options) {
  const s = openSheet(html`
    <div class="dialog picker">
      <h2>${title}</h2>
      <div class="list">${options.map(([v, l, d]) => html`<button type="button" class="row" data-v="${v}"><span class="row-label">${l}${d ? html`<small>${d}</small>` : ''}</span><span class="chev">${icon('chevron-right')}</span></button>`)}</div>
    </div>`);
  s.el.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) s.close(b.dataset.v); });
  return s.closed;
}

async function rowActions(f, r) {
  if (!r) return;
  if (r.key === 'opening') { openFundForm({}, f); return; }
  const opts = [];
  if (r.txId) opts.push(['open', 'Apri il movimento']);
  opts.push(r.receiptId ? ['receipt', 'Vedi la ricevuta'] : ['attach', 'Allega la ricevuta', 'Foto, screenshot o PDF']);
  if (r.receiptId) opts.push(['detach', 'Togli la ricevuta']);
  if (r.txId) opts.push(['unlink', 'Scollega dal fondo', 'Tornerà a contare tra i tuoi movimenti']);
  if (r.entryId) opts.push(['delete', 'Elimina']);
  const a = await choose(r.label, opts);
  if (a === 'open') openTxDetail(r.txId);
  if (a === 'receipt') Files.openFile(Files.getFile(r.receiptId));
  if (a === 'attach') await attachReceipt({ txId: r.txId, fundId: f.id, entryId: r.entryId });
  if (a === 'detach') {
    await Files.removeFile(r.receiptId);
    if (r.txId) await S.put('tx', r.txId, { ...M.tx(r.txId), receiptId: null });
    else await F.updateEntry(f.id, r.entryId, { receiptId: null });
  }
  if (a === 'unlink') { await F.unlinkTx(r.txId); toast('Scollegato dal fondo'); }
  if (a === 'delete') await F.removeEntry(f.id, r.entryId);
}

// Ricevuta su un movimento della banca (txId) o su una voce scritta a mano (fundId + entryId).
export async function attachReceipt({ txId, fundId, entryId }) {
  const file = await Files.pickFile();
  if (!file) return;
  try {
    const fid = await Files.saveFile(file);
    if (txId) {
      const t = M.tx(txId);
      if (t.receiptId) await Files.removeFile(t.receiptId);
      await S.put('tx', txId, { ...M.tx(txId), receiptId: fid });
    } else await F.updateEntry(fundId, entryId, { receiptId: fid });
    toast('Ricevuta allegata');
  } catch (e) {
    toast(e.message, { type: 'error' });
  }
}

// ---------------------------------------------------------------- Rendiconto
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const plainAmount = (c) => (c / 100).toFixed(2).replace('.', ',');
const safeName = (s) => String(s).replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '-') || 'fondo';

function reportRows(f) {
  return F.ledger(f).slice().reverse();
}

async function exportCsv(f) {
  const rows = reportRows(f);
  const b = F.balance(f);
  const lines = [
    ['Data', 'Descrizione', 'Tipo', 'Importo', 'Ricevuta'].join(';'),
    ...rows.map((r) => [dmy(r.date), r.label, F.typeLabel(r.type), plainAmount(r.cents), r.receiptId ? (Files.getFile(r.receiptId)?.name || 'sì') : ''].map(csvCell).join(';')),
    '',
    ['', 'Entrati', '', plainAmount(b.inCents), ''].join(';'),
    ['', 'Spesi', '', plainAmount(-b.spent), ''].join(';'),
    ['', 'Restituiti', '', plainAmount(-b.returned), ''].join(';'),
    ['', 'Restano', '', plainAmount(b.remaining), ''].join(';'),
  ];
  // BOM: così Excel legge bene le lettere accentate.
  const file = new File([`﻿${lines.join('\r\n')}\r\n`], `Rendiconto-${safeName(f.name)}.csv`, { type: 'text/csv' });
  await Files.exportFile(file);
}

function printReport(f) {
  const rows = reportRows(f);
  const b = F.balance(f);
  const receipts = rows.filter((r) => r.receiptId).map((r) => ({ r, file: Files.getFile(r.receiptId) })).filter((x) => x.file);
  const urls = [];
  const el = document.createElement('div');
  el.className = 'print-root report';
  el.innerHTML = String(html`
    <h1>Rendiconto – ${f.name}</h1>
    <p>${[f.owner ? `Proprietario: ${f.owner}` : '', M.account(f.accountId)?.name || '', `Stampato il ${fmtLong(today())}`].filter(Boolean).join(' · ')}</p>
    <table>
      <thead><tr><th>Data</th><th>Descrizione</th><th>Tipo</th><th class="num">Importo</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr><td>${dmy(r.date)}</td><td>${r.label}${r.receiptId ? ' *' : ''}</td><td>${F.typeLabel(r.type)}</td><td class="num">${formatCents(r.cents, { sign: true })}</td></tr>`)}</tbody>
      <tfoot>
        <tr><td colspan="3">Entrati</td><td class="num">${formatCents(b.inCents)}</td></tr>
        <tr><td colspan="3">Spesi</td><td class="num">${formatCents(-b.spent)}</td></tr>
        ${b.returned ? html`<tr><td colspan="3">Restituiti</td><td class="num">${formatCents(-b.returned)}</td></tr>` : ''}
        <tr class="total"><td colspan="3">Restano</td><td class="num">${formatCents(b.remaining)}</td></tr>
      </tfoot>
    </table>
    ${receipts.length ? html`<p class="small">* ricevuta allegata, nelle pagine seguenti.</p>` : ''}
    ${receipts.map(({ r, file }) => {
      if (file.type === 'application/pdf') return html`<div class="receipt"><h2>${dmy(r.date)} · ${r.label} · ${formatCents(r.cents)}</h2><p>Ricevuta in PDF: «${file.name}» (allegala a parte).</p></div>`;
      const url = URL.createObjectURL(Files.fileBlob(file));
      urls.push(url);
      return html`<div class="receipt"><h2>${dmy(r.date)} · ${r.label} · ${formatCents(r.cents)}</h2><img src="${url}" alt="Ricevuta"></div>`;
    })}`);
  document.body.appendChild(el);
  document.body.classList.add('printing');
  const cleanup = () => {
    el.remove();
    document.body.classList.remove('printing');
    urls.forEach((u) => URL.revokeObjectURL(u));
  };
  addEventListener('afterprint', cleanup, { once: true });
  // Le foto devono essere caricate prima di aprire la stampa.
  Promise.all([...el.querySelectorAll('img')].map((img) => img.decode().catch(() => {}))).then(() => window.print());
}

// ---------------------------------------------------------------- Spesa divisa
export function openShareSheet(txId) {
  const t0 = M.tx(txId);
  if (!t0) return;
  const total = Math.abs(t0.cents);
  const names = Sh.knownNames();
  let mode = t0.share?.mode || 'uguali';
  let people = (t0.share?.people || []).map((p) => ({ ...p }));
  if (!people.length) people = [{ id: crypto.randomUUID(), name: '', cents: 0 }];
  let mine = t0.share?.mine ?? 0;

  const sh = openSheet(html`<div class="dialog share-sheet"></div>`, { className: 'tall' });
  const root = sh.el.querySelector('.share-sheet');

  function recompute() {
    if (mode === 'uguali') {
      const eq = Sh.equalSplit(total, people.length);
      mine = eq.mine;
      people.forEach((p, i) => { p.cents = eq.others[i]; });
    } else {
      mine = total - people.reduce((a, p) => a + (p.cents || 0), 0);
    }
  }

  function draw() {
    recompute();
    const ok = mine >= 0 && people.every((p) => p.name.trim()) && people.every((p) => p.cents > 0);
    root.innerHTML = String(html`
      <h2>Dividi ${formatCents(total)}</h2>
      <p>${M.displayName(t0)} · ${fmtShort(t0.date)}. Nei tuoi totali conterà solo la tua quota.</p>
      <div class="segmented wide" data-seg="mode">
        <button type="button" class="${mode === 'uguali' ? 'on' : ''}" data-value="uguali">Parti uguali</button>
        <button type="button" class="${mode === 'importi' ? 'on' : ''}" data-value="importi">Importi diversi</button>
      </div>
      <datalist id="share-names">${names.map((n) => html`<option value="${n}"></option>`)}</datalist>
      <div class="split-parts">
        ${people.map((p, i) => html`
          <div class="split-part share-person" data-i="${i}">
            <div class="split-top">
              <label class="field"><input class="text" data-f="name" list="share-names" value="${p.name}" placeholder="Nome" autocapitalize="words"></label>
              ${mode === 'importi'
                ? html`<label class="field money"><span>€</span><input class="text" inputmode="decimal" data-f="amount" value="${euroValue(p.cents)}" placeholder="0,00"></label>`
                : html`<b class="share-amount">${formatCents(p.cents)}</b>`}
              ${people.length > 1 ? html`<button type="button" class="icon-btn" data-remove="${i}" aria-label="Rimuovi">${icon('close')}</button>` : ''}
            </div>
            ${p.settledAt || p.settledTxId ? html`<small class="ok-note">${icon('check')}Ha già pagato</small>` : ''}
          </div>`)}
      </div>
      <button type="button" class="btn plain" data-add>${icon('plus')}<span>Aggiungi una persona</span></button>
      <p class="split-left ${mine >= 0 ? 'ok' : 'ko'}">${mine >= 0 ? `La tua quota: ${formatCents(mine)}` : `Hai superato il totale di ${formatCents(-mine)}`}</p>
      <div class="dialog-actions">
        <button type="button" class="btn" data-save ${ok ? '' : 'disabled'}>Salva</button>
        ${t0.share ? html`<button type="button" class="btn secondary destructive-text" data-clear>Non è più divisa</button>` : ''}
      </div>`);
    wire();
  }

  function wire() {
    root.querySelector('[data-seg=mode]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-value]');
      if (b && b.dataset.value !== mode) { mode = b.dataset.value; draw(); }
    });
    root.querySelectorAll('.share-person').forEach((row) => {
      const i = Number(row.dataset.i);
      row.querySelector('[data-f=name]').addEventListener('input', (e) => {
        people[i].name = e.target.value;
        const save = root.querySelector('[data-save]');
        save.disabled = !(mine >= 0 && people.every((p) => p.name.trim()) && people.every((p) => p.cents > 0));
      });
      const am = row.querySelector('[data-f=amount]');
      if (am) am.addEventListener('change', (e) => { people[i].cents = parseEuro(e.target.value) || 0; draw(); });
    });
    root.querySelectorAll('[data-remove]').forEach((b) => { b.onclick = () => { people.splice(Number(b.dataset.remove), 1); draw(); }; });
    root.querySelector('[data-add]').onclick = () => {
      people.push({ id: crypto.randomUUID(), name: '', cents: mode === 'importi' ? Math.max(0, mine) : 0 });
      draw();
      const inputs = root.querySelectorAll('[data-f=name]');
      inputs[inputs.length - 1]?.focus();
    };
    root.querySelector('[data-save]').onclick = async () => {
      recompute();
      await Sh.setShare(txId, {
        mode,
        mine,
        people: people.map((p) => ({ id: p.id, name: p.name.trim(), cents: p.cents, settledAt: p.settledAt || null, settledTxId: p.settledTxId || null })),
      });
      sh.close();
      toast(`Divisa · la tua quota è ${formatCents(mine)}`);
    };
    const clr = root.querySelector('[data-clear]');
    if (clr) clr.onclick = async () => { await Sh.clearShare(txId); sh.close(); toast('Divisione tolta'); };
  }

  draw();
}

// ---------------------------------------------------------------- Persona
export function openPerson(key) {
  const sh = openSheet(html`<div class="tx-detail person-detail"></div>`, { className: 'tall' });
  const root = sh.el.querySelector('.person-detail');
  const off = S.subscribe((col) => { if (['tx', 'debts', '*'].includes(col)) draw(); });
  sh.closed.then(off);
  let showDone = false;

  const itemRow = (it, open) => html`
    <div class="row static owe-row">
      <span class="row-label">${it.label}<small>${fmtShort(it.date)} · ${it.kind === 'quota' ? 'quota di una spesa divisa' : it.cents > 0 ? 'ti deve' : 'gli devi'}${it.settledTxId ? ' · rimborso collegato' : ''}</small></span>
      <span class="row-detail ${it.cents > 0 ? 'ok' : 'ko'}">${formatCents(Math.abs(it.cents))}</span>
      <span class="owe-actions">
        ${open ? html`
          ${it.cents > 0 ? html`<button type="button" class="btn small secondary" data-link="${it.txId || ''}" data-person="${it.personId || ''}" data-debt="${it.debtId || ''}">Collega rimborso</button>` : ''}
          <button type="button" class="btn small" data-settle="${it.txId || ''}" data-person="${it.personId || ''}" data-debt="${it.debtId || ''}">${it.cents > 0 ? 'Mi ha pagato' : 'Ho pagato'}</button>`
        : html`<button type="button" class="btn small secondary" data-unsettle="${it.txId || ''}" data-person="${it.personId || ''}" data-debt="${it.debtId || ''}">Annulla</button>`}
        ${it.kind === 'quota' ? html`<button type="button" class="btn small secondary" data-tx="${it.txId}">Spesa</button>` : html`<button type="button" class="btn small secondary destructive-text" data-del="${it.debtId}">Elimina</button>`}
      </span>
    </div>`;

  function draw() {
    const p = Sh.person(key);
    if (!p) { sh.close(); return; }
    root.innerHTML = String(html`
      <div class="txd-head">
        <span class="tx-icon avatar big">${p.name.charAt(0).toUpperCase()}</span>
        <div class="txd-amount ${p.net > 0 ? 'positive' : p.net < 0 ? 'negative' : ''}">${formatCents(Math.abs(p.net))}</div>
        <div class="txd-meta">${p.net > 0 ? `${p.name} ti deve` : p.net < 0 ? `Devi a ${p.name}` : 'Siete pari'}</div>
        <div class="txd-merchant static">${p.name}</div>
      </div>
      ${p.open.length ? html`<h3 class="group-title">Da saldare</h3><div class="list">${p.open.map((it) => itemRow(it, true))}</div>` : html`<p class="group-footer">Niente da saldare.</p>`}
      <div class="list"><button type="button" class="row" data-new-debt><span class="row-icon" style="background:var(--s9)">${icon('plus')}</span><span class="row-label">Aggiungi un credito o un debito</span></button></div>
      ${p.done.length ? html`
        <button type="button" class="group-title link-title" data-toggle-done>Già saldati (${p.done.length}) ${icon('chevron-right', showDone ? 'open' : '')}</button>
        ${showDone ? html`<div class="list">${p.done.map((it) => itemRow(it, false))}</div>` : ''}` : ''}`);
    wire(p);
  }

  function wire(p) {
    root.querySelector('[data-new-debt]').onclick = () => openDebtForm({ name: p.name });
    const td = root.querySelector('[data-toggle-done]');
    if (td) td.onclick = () => { showDone = !showDone; draw(); };
    root.querySelectorAll('[data-settle]').forEach((b) => {
      b.onclick = async () => {
        if (b.dataset.debt) await Sh.settleDebt(b.dataset.debt);
        else await Sh.settleQuota(b.dataset.settle, b.dataset.person);
        toast('Segnato come saldato');
      };
    });
    root.querySelectorAll('[data-link]').forEach((b) => {
      b.onclick = async () => {
        const r = await pickTx({ title: 'Quale entrata è il rimborso?', hint: 'Non conterà come tua entrata: la spesa conta già solo per la tua quota.', list: Sh.repayCandidates() });
        if (!r) return;
        if (b.dataset.debt) await Sh.settleDebt(b.dataset.debt, r);
        else await Sh.settleQuota(b.dataset.link, b.dataset.person, r);
        toast('Rimborso collegato');
      };
    });
    root.querySelectorAll('[data-unsettle]').forEach((b) => {
      b.onclick = async () => {
        if (b.dataset.debt) await Sh.unsettleDebt(b.dataset.debt);
        else await Sh.unsettleQuota(b.dataset.unsettle, b.dataset.person);
      };
    });
    root.querySelectorAll('[data-tx]').forEach((b) => { b.onclick = () => openTxDetail(b.dataset.tx); });
    root.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        const ok = await confirmDialog({ title: 'Eliminare questa voce?', confirmLabel: 'Elimina', destructive: true });
        if (ok) await Sh.removeDebt(b.dataset.del);
      };
    });
  }

  draw();
}

// ---------------------------------------------------------------- Credito o debito
export function openDebtForm(init = {}) {
  let dir = init.cents < 0 ? -1 : 1;
  const names = Sh.knownNames();
  const sh = openSheet(html`
    <form class="dialog" novalidate>
      <h2>Credito o debito</h2>
      <div class="segmented wide" data-seg="dir">
        <button type="button" class="${dir > 0 ? 'on' : ''}" data-value="1">Mi deve</button>
        <button type="button" class="${dir < 0 ? 'on' : ''}" data-value="-1">Gli devo</button>
      </div>
      <datalist id="debt-names">${names.map((n) => html`<option value="${n}"></option>`)}</datalist>
      <label class="field money big"><span>€</span><input class="text" name="amount" inputmode="decimal" placeholder="0,00" value="${euroValue(init.cents)}"></label>
      <div class="field-group">
        <label class="field"><input class="text" name="name" list="debt-names" value="${init.name || ''}" placeholder="Chi (per esempio Marco)" autocapitalize="words"></label>
        <label class="field"><input class="text" name="note" value="${init.note || ''}" placeholder="Per cosa (per esempio Biglietti concerto)"></label>
        <label class="field field-row"><span>Data</span><input class="text" type="date" name="date" value="${init.date || today()}"></label>
      </div>
      <p class="form-error" hidden></p>
      <div class="dialog-actions">
        <button type="submit" class="btn">Salva</button>
        <button type="button" class="btn secondary" data-cancel>Annulla</button>
      </div>
    </form>`);
  const form = sh.el.querySelector('form');
  form.querySelector('[data-cancel]').onclick = () => sh.close();
  form.querySelector('[data-seg=dir]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (!b) return;
    dir = Number(b.dataset.value);
    form.querySelectorAll('[data-seg=dir] button').forEach((x) => x.classList.toggle('on', x === b));
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error');
    const c = parseEuro(form.elements.amount.value);
    const name = form.elements.name.value.trim();
    if (!c) { err.textContent = 'Scrivi un importo.'; err.hidden = false; return; }
    if (!name) { err.textContent = 'Scrivi il nome.'; err.hidden = false; return; }
    await Sh.saveDebt(Sh.newDebt({ name, cents: dir * c, note: form.elements.note.value.trim(), date: form.elements.date.value || today() }));
    sh.close();
    toast('Salvato');
  };
}

// ---------------------------------------------------------------- Dal dettaglio di un movimento
// Righe per il dettaglio: fondo, divisione con altre persone, rimborso, ricevuta.
export function txRows(t) {
  const out = [];
  const f = F.fund(t.fundId);
  if (t.cents < 0) {
    out.push(html`<button type="button" class="row" data-fx="fund">
      <span class="row-label">${f ? (t.fundReturn ? 'Restituzione del fondo' : 'Pagata con il fondo') : 'Paga con un fondo'}</span>
      ${f ? html`<span class="row-detail">${f.name}</span>` : ''}<span class="chev">${icon('chevron-right')}</span></button>`);
    if (!f) {
      out.push(html`<button type="button" class="row" data-fx="share">
        <span class="row-label">${t.share ? 'Divisa con altre persone' : 'Dividi con altre persone'}</span>
        ${t.share ? html`<span class="row-detail">la tua quota ${formatCents(t.share.mine)}</span>` : ''}<span class="chev">${icon('chevron-right')}</span></button>`);
    }
  } else if (t.cents > 0 && M.kindOf(t) !== 'giroconto' && !['stipendio', 'interessi'].includes(t.categoryId)) {
    if (!t.repays?.length) {
      out.push(html`<button type="button" class="row" data-fx="fund">
        <span class="row-label">${f ? 'Versamento nel fondo' : 'Soldi non tuoi (fondo)'}</span>
        ${f ? html`<span class="row-detail">${f.name}</span>` : ''}<span class="chev">${icon('chevron-right')}</span></button>`);
    }
    if (!f) {
      const names = (t.repays || []).map((r) => M.tx(r.txId)?.share?.people.find((p) => p.id === r.personId)?.name).filter(Boolean);
      out.push(html`<button type="button" class="row" data-fx="repay">
        <span class="row-label">${t.repays?.length ? 'Rimborso di una spesa divisa' : 'È un rimborso di una spesa divisa'}</span>
        ${names.length ? html`<span class="row-detail">${names.join(', ')}</span>` : ''}<span class="chev">${icon('chevron-right')}</span></button>`);
    }
  }
  if (t.fundId || t.share || t.receiptId) {
    out.push(html`<button type="button" class="row" data-fx="receipt">
      <span class="row-label">Ricevuta</span><span class="row-detail">${t.receiptId ? 'Allegata' : 'Allega'}</span><span class="chev">${icon('chevron-right')}</span></button>`);
  }
  return out;
}

export async function txAction(t, what) {
  if (what === 'fund') {
    if (t.fundId) {
      const a = await choose(F.fund(t.fundId)?.name || 'Fondo', [['open', 'Apri il fondo'], ['unlink', 'Scollega dal fondo', 'Tornerà a contare tra i tuoi movimenti']]);
      if (a === 'open') openFundDetail(t.fundId);
      if (a === 'unlink') { await F.unlinkTx(t.id); toast('Scollegato dal fondo'); }
      return;
    }
    const funds = F.open();
    const opts = funds.map((f) => [f.id, f.name, `restano ${formatCents(F.balance(f).remaining)}`]);
    opts.push(['__new', t.cents > 0 ? 'Crea un fondo con questi soldi' : 'Nuovo fondo']);
    const v = await choose(t.cents > 0 ? 'Di quale fondo sono questi soldi?' : 'Con quale fondo l\'hai pagata?', opts);
    if (!v) return;
    if (v === '__new') { openFundForm(t.cents > 0 ? { fromTxId: t.id } : {}); return; }
    if (t.share) await Sh.clearShare(t.id);
    await F.linkTx(t.id, v);
    toast(t.cents > 0 ? 'Collegato al fondo: non conta come tua entrata' : 'Pagata con il fondo: non conta tra le tue spese');
    return;
  }
  if (what === 'share') { openShareSheet(t.id); return; }
  if (what === 'repay') {
    if (t.repays?.length) {
      const a = await choose('Rimborso', [['unlink', 'Non è un rimborso', 'Tornerà a contare come tua entrata']]);
      if (a === 'unlink') for (const r of [...t.repays]) await Sh.unsettleQuota(r.txId, r.personId);
      return;
    }
    const open = Sh.openQuotas();
    if (!open.length) { toast('Non ci sono spese divise da rimborsare'); return; }
    const v = await choose('Di quale spesa è il rimborso?', open.map((it, i) => [String(i), `${it.name} · ${formatCents(it.cents)}`, `${it.label} · ${fmtShort(it.date)}`]));
    if (v == null) return;
    const it = open[Number(v)];
    await Sh.settleQuota(it.txId, it.personId, t.id);
    toast(`${it.name} ha pagato la sua quota`);
    return;
  }
  if (what === 'receipt') {
    if (!t.receiptId) { await attachReceipt({ txId: t.id }); return; }
    const a = await choose('Ricevuta', [['view', 'Vedi la ricevuta'], ['replace', 'Sostituisci'], ['remove', 'Togli la ricevuta']]);
    if (a === 'view') Files.openFile(Files.getFile(t.receiptId));
    if (a === 'replace') await attachReceipt({ txId: t.id });
    if (a === 'remove') { await Files.removeFile(t.receiptId); await S.put('tx', t.id, { ...M.tx(t.id), receiptId: null }); }
  }
}
