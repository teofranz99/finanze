// Pagina di un conto: saldo, interessi (lordi, ritenuta, netti) e rendimento per i depositi,
// ultimi movimenti.

import { html, setHtml, formatShort } from '../util.js';
import { icon } from '../ui/icons.js';
import { page, enhancePage } from '../ui/page.js';
import { formatCents } from '../money.js';
import * as M from '../data/model.js';
import * as S from '../store.js';
import { txIcon, amountClass, subtitle, openTxDetail } from './tx-ui.js';
import { editAccount } from './data-settings.js';
import { showAccount } from './movimenti.js';

const ROLE = { spendibile: 'Spendibile', risparmio: 'Risparmio', vincolato: 'Vincolato' };
const TYPE = { corrente: 'Conto corrente', carta: 'Carta', deposito: 'Conto deposito', contanti: 'Contanti', altro: 'Conto' };

function interestStats(list, balance) {
  const it = list.filter((t) => t.categoryId === 'interessi' || t.hint === 'interessi');
  if (!it.length) return null;
  const net = it.reduce((s, t) => s + t.cents, 0);
  const gross = it.reduce((s, t) => s + (t.grossCents ?? t.cents), 0);
  const tax = it.reduce((s, t) => s + (t.taxCents ?? 0), 0);
  const byMonth = new Map();
  for (const t of it) byMonth.set(t.date.slice(0, 7), (byMonth.get(t.date.slice(0, 7)) || 0) + t.cents);
  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  // Rendimento annuo stimato sugli ultimi 30 giorni di interessi netti.
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const last30 = it.filter((t) => t.date >= since).reduce((s, t) => s + t.cents, 0);
  const lastGross30 = it.filter((t) => t.date >= since).reduce((s, t) => s + (t.grossCents ?? t.cents), 0);
  const rate = balance > 0 && last30 > 0 ? (last30 / balance) * (365 / 30) * 100 : null;
  const rateGross = balance > 0 && lastGross30 > 0 ? (lastGross30 / balance) * (365 / 30) * 100 : null;
  return { net, gross, tax, months, rate, rateGross, count: it.length };
}

export function contoView(el, rest) {
  let off = null;
  const id = rest[0];

  function draw() {
    off?.();
    const a = M.account(id);
    if (!a) { location.hash = '#/home'; return; }
    const balance = M.accountBalance(a);
    const list = M.txs().filter((t) => t.accountId === a.id).sort((x, y) => y.date.localeCompare(x.date) || (y.seq || 0) - (x.seq || 0));
    const stats = interestStats(list, balance);
    const transfersIn = list.filter((t) => M.kindOf(t) === 'giroconto').reduce((s, t) => s + t.cents, 0);
    const maxMonth = stats ? Math.max(...stats.months.map((m) => m[1]), 1) : 1;
    const monthName = (k) => new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(new Date(`${k}-15T12:00:00`));

    setHtml(el, page({
      title: a.name,
      back: { href: 'home', label: 'Home' },
      right: html`<button type="button" class="nav-text-btn" data-edit>Modifica</button>`,
      body: html`
        <div class="home-grid">
          <section class="card account-hero">
            <div class="acc-type">${TYPE[a.type] || 'Conto'} · ${ROLE[a.role || 'spendibile']}</div>
            <div class="acc-balance">${formatCents(balance)}</div>
            <div class="muted">${a.balance?.asOf ? `Saldo al ${formatShort(a.balance.asOf)}` : a.type === 'contanti' ? 'Prelievi meno spese in contanti' : ''}</div>
          </section>

          ${stats ? html`
            <section class="card">
              <h2 class="card-title">Interessi</h2>
              <div class="stat-grid">
                <div><span>Lordi</span><b>${formatCents(stats.gross)}</b></div>
                <div><span>Ritenuta</span><b>${formatCents(-stats.tax)}</b></div>
                <div><span>Netti</span><b class="positive">${formatCents(stats.net)}</b></div>
                <div><span>Rendimento stimato</span><b>${stats.rate != null ? `${stats.rate.toFixed(2).replace('.', ',')}% netto` : '—'}</b>${stats.rateGross != null ? html`<small>${stats.rateGross.toFixed(2).replace('.', ',')}% lordo</small>` : ''}</div>
              </div>
              <ul class="month-bars">${stats.months.map(([k, v]) => html`
                <li><span>${monthName(k)}</span><span class="cb-bar"><i style="width:${Math.max(3, (v / maxMonth) * 100)}%;background:var(--s4)"></i></span><b>${formatCents(v)}</b></li>`)}
              </ul>
              ${a.type === 'deposito' ? html`<p class="muted small">${transfersIn >= 0 ? `Versato nel periodo importato: ${formatCents(transfersIn)}` : `Prelevato nel periodo importato: ${formatCents(-transfersIn)}`}. Il rendimento è stimato sugli interessi degli ultimi 30 giorni.</p>` : ''}
            </section>` : ''}

          <section class="card list-card">
            <div class="card-head"><h2 class="card-title">Ultimi movimenti</h2>${list.length ? html`<button type="button" class="link-btn" data-all>Vedi tutti (${list.length})</button>` : ''}</div>
            ${list.length ? html`<div class="list flush">${list.slice(0, 8).map((t) => html`
              <button type="button" class="tx-mini" data-id="${t.id}">
                ${txIcon(t)}
                <span class="tx-text"><b>${M.displayName(t)}</b><span>${t.date.split('-').reverse().join('/')} · ${subtitle(t)}</span></span>
                <span class="tx-amount ${amountClass(t)}">${formatCents(t.cents, { sign: true })}</span>
              </button>`)}</div>` : html`<p class="muted">Nessun movimento.</p>`}
          </section>
        </div>`,
    }));
    off = enhancePage(el);
    el.querySelector('[data-edit]').onclick = () => editAccount(a);
    const all = el.querySelector('[data-all]');
    if (all) all.onclick = () => showAccount(a.id);
    el.querySelectorAll('.tx-mini').forEach((b) => { b.onclick = () => openTxDetail(b.dataset.id); });
  }

  draw();
  const unsub = S.subscribe((c) => { if (['tx', 'accounts', 'categories', '*'].includes(c)) draw(); });
  return () => { off?.(); unsub(); };
}
