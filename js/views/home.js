// Home: spendibile, patrimonio totale (ciambella per conto), il mese in corso.

import { html, setHtml, animateNumber, relativeTime } from '../util.js';
import { icon } from '../ui/icons.js';
import { page, enhancePage } from '../ui/page.js';
import { formatCents, isoToday } from '../money.js';
import * as M from '../data/model.js';
import * as S from '../store.js';
import * as DB from '../db.js';
import { openImport } from './tx-ui.js';
import { showCategoryThisMonth } from './movimenti.js';
import { todoItems } from '../data/todo.js';
import * as P from '../data/plan.js';
import * as F from '../data/funds.js';
import * as B from '../data/budgets.js';
import { openSheet } from '../ui/sheet.js';
import { budgetBar } from './budget.js';
import { fmtShort } from '../dates.js';

const FUNDS_COLOR = 'var(--label3)';

function donut(slices) {
  const total = slices.reduce((s, x) => s + x.cents, 0);
  if (total <= 0) {
    return html`<svg class="donut" viewBox="0 0 120 120" aria-hidden="true">
      <circle class="donut-track" cx="60" cy="60" r="48"></circle>
      <circle class="donut-skeleton" cx="60" cy="60" r="48" pathLength="100"></circle></svg>`;
  }
  // Ogni conto ha almeno una fetta visibile, anche se piccolissimo (es. 1,25 €):
  // le fette sotto la soglia vengono allargate un po' e le altre ristrette in proporzione.
  const MIN = 1.6;
  const raw = slices.map((x) => (x.cents / total) * 100);
  const small = raw.filter((v) => v < MIN);
  const bigSum = raw.filter((v) => v >= MIN).reduce((s, v) => s + v, 0);
  const room = 100 - small.length * MIN;
  const lens = raw.map((v) => (v < MIN ? MIN : (v / bigSum) * room));
  // Spazio tra le fette: mostra lo sfondo della scheda (niente anello grigio sotto).
  const gap = slices.length > 1 ? 0.7 : 0;
  let acc = 0;
  return html`<svg class="donut" viewBox="0 0 120 120" aria-hidden="true">
    ${slices.map((x, i) => {
      const len = Math.max(0.5, lens[i] - gap);
      const seg = html`<circle class="donut-slice" cx="60" cy="60" r="48" pathLength="100"
        style="stroke:${x.color};stroke-dasharray:${len} ${100 - len};stroke-dashoffset:${-acc};animation-delay:${i * 0.08}s"></circle>`;
      acc += lens[i];
      return seg;
    })}
  </svg>`;
}

export function homeView(el) {
  let off = null;

  function draw() {
    off?.();
    const today = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    const w = M.wealth();
    const sp = P.spendable();
    const ps = P.planSettings();
    // Ogni conto senza i soldi non miei; i fondi vincolati in una fetta a parte (se scelto).
    const byAcc = F.restrictedByAccount();
    const accs = w.list.filter((x) => (x.account.role || 'spendibile') !== 'vincolato')
      .map((x) => ({ ...x, cents: x.cents - (byAcc.get(x.account.id) || 0) }));
    const slices = accs.filter((x) => x.cents > 0).map((x) => ({ ...x, color: M.accountColor(x.account) }));
    if (ps.fundsInTotal && sp.restrictedFunds > 0) slices.push({ funds: true, cents: sp.restrictedFunds, color: FUNDS_COLOR });
    const total = slices.reduce((a, x) => a + x.cents, 0);
    const hasData = M.accounts().length > 0;
    const fc = hasData ? P.forecast() : null;
    const budgets = B.status().slice(0, 4);

    const monthStart = `${isoToday().slice(0, 7)}-01`;
    const monthTx = M.txs().filter((t) => t.date >= monthStart);
    const tot = M.totals(monthTx);
    const topCats = M.byCategory(monthTx).slice(0, 5);
    const maxCat = topCats[0]?.cents || 1;
    const monthName = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(new Date());
    const lastImport = M.accounts().map((a) => a.lastImportAt || 0).sort((a, b) => b - a)[0];
    const todo = todoItems();

    setHtml(el, page({
      title: 'Home',
      eyebrow: today,
      right: html`<a class="nav-icon-btn" href="#/impostazioni" aria-label="Impostazioni">${icon('sliders')}</a>`,
      body: html`
        <div class="home-grid">
          <button type="button" class="card hero-card" data-spendable>
            <div class="hero-label">Spendibile ${icon('info', 'hero-info')}</div>
            <div class="hero-amount" data-amount>${formatCents(0)}</div>
            <div class="hero-sub">${hasData ? heroSub(sp) : 'Soldi tuoi disponibili, al netto dei fondi vincolati'}</div>
          </button>

          <section class="card donut-card">
            <h2 class="card-title">Patrimonio totale</h2>
            <div class="donut-wrap">
              ${donut(slices)}
              <div class="donut-center">
                <div class="donut-value" data-total>${formatCents(0)}</div>
                <div class="donut-caption">Totale</div>
              </div>
            </div>
            ${slices.length ? html`<ul class="legend">${slices.map((x) => html`
              <li><a href="${x.funds ? '#/fondi' : `#/conto/${x.account.id}`}"><i style="background:${x.color}"></i><span>${x.funds ? 'Fondi vincolati (non tuoi)' : x.account.name}</span><b>${formatCents(x.cents)}</b><em>${Math.round((x.cents / total) * 100)}%</em></a></li>`)}</ul>
              ${w.savings ? html`<p class="muted small center">Spendibile ${formatCents(sp.value)} · Risparmi ${formatCents(sp.savings)}</p>` : ''}
              ${sp.restrictedFunds ? html`<label class="inline-toggle"><span>Mostra i fondi vincolati</span><input type="checkbox" class="switch" data-funds-toggle ${ps.fundsInTotal ? 'checked' : ''}></label>` : ''}`
              : html`<p class="muted center">I conti compariranno qui dopo il primo import.</p>`}
          </section>

          <section class="card month-card">
            <h2 class="card-title">${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</h2>
            <div class="month-totals">
              <div><span>Entrate</span><b class="positive">${formatCents(tot.income)}</b></div>
              <div><span>Uscite</span><b>${formatCents(tot.expense)}</b></div>
            </div>
            ${tot.extraordinary ? html`<p class="extra-note">${icon('sparkles')}Spese straordinarie a parte: <b>${formatCents(tot.extraordinary)}</b></p>` : ''}
            ${topCats.length ? html`<ul class="cat-bars">${topCats.map((c) => {
              const cat = M.category(c.id);
              return html`<li>
                <a href="#/movimenti" data-cat="${c.id}">
                  <span class="cb-icon" style="background:${cat.color}">${icon(cat.icon)}</span>
                  <span class="cb-body"><span class="cb-top"><span>${cat.name}</span><b>${formatCents(c.cents)}</b></span>
                  <span class="cb-bar"><i style="width:${Math.max(4, (c.cents / maxCat) * 100)}%;background:${cat.color}"></i></span></span>
                </a></li>`;
            })}</ul>` : html`<p class="muted">Ancora nessuna spesa questo mese.</p>`}
          </section>

          ${todo.length ? html`
            <section class="card list-card todo-card">
              <div class="card-head"><h2 class="card-title">Da fare</h2><span class="pill warn">${todo.length}</span></div>
              <div class="list flush">${todo.slice(0, 6).map((x) => html`
                <a class="tx-mini" href="${x.href}">
                  <span class="tx-icon" style="background:${x.color}">${icon(x.icon)}</span>
                  <span class="tx-text"><b>${x.label}</b><span>${x.detail}</span></span>
                  <span class="chev">${icon('chevron-right')}</span>
                </a>`)}</div>
            </section>` : ''}

          ${fc ? forecastCard(fc) : ''}

          ${budgets.length ? html`
            <a class="card list-card budget-card" href="#/movimenti/budget">
              <div class="card-head"><h2 class="card-title">Budget</h2><span class="chev">${icon('chevron-right')}</span></div>
              <ul class="budget-mini">${budgets.map((x) => html`
                <li><span class="bm-top"><span>${x.t.name}</span><b class="${x.over ? 'negative' : ''}">${formatCents(x.spent)} <small>di ${formatCents(x.b.cents)}</small></b></span>${budgetBar(x)}</li>`)}</ul>
            </a>` : ''}

          <button type="button" class="card next-card" data-import>
            <span class="next-icon">${icon('upload')}</span>
            <span class="next-text"><b>${hasData ? 'Importa movimenti' : 'Prossimo passo'}</b><span>${hasData && lastImport ? `Ultimo import ${relativeTime(lastImport)}` : 'Importa il primo estratto conto'}</span></span>
            <span class="chev">${icon('chevron-right')}</span>
          </button>
        </div>
        <a class="sync-line" href="#/impostazioni/backup">${icon('cloud-up')}<span data-sync>&nbsp;</span></a>`,
    }));

    animateNumber(el.querySelector('[data-amount]'), sp.value / 100);
    animateNumber(el.querySelector('[data-total]'), total / 100);
    el.querySelector('[data-spendable]').onclick = () => { if (hasData) openSpendable(); };
    const ft = el.querySelector('[data-funds-toggle]');
    if (ft) ft.onchange = () => P.updatePlanSettings({ fundsInTotal: ft.checked });
    el.querySelector('[data-import]').onclick = openImport;
    el.querySelectorAll('[data-cat]').forEach((a) => {
      a.onclick = (e) => { e.preventDefault(); showCategoryThisMonth(a.dataset.cat); };
    });
    DB.metaGet('lastBackupAt').then((ts) => {
      const span = el.querySelector('[data-sync]');
      if (span) span.textContent = ts ? `Ultimo backup ${relativeTime(ts)}` : 'Nessun backup salvato';
    });
    off = enhancePage(el);
  }

  draw();
  const unsub = S.subscribe((col) => { if (['tx', 'accounts', 'categories', 'subs', 'deadlines', 'settings', 'funds', 'debts', 'budgets', 'reserves', '*'].includes(col)) draw(); });
  return () => { off?.(); unsub(); };
}

function heroSub(sp) {
  const minus = [];
  if (sp.funds) minus.push('fondi vincolati');
  if (sp.reserves) minus.push('accantonamenti');
  if (sp.fixed) minus.push('uscite fisse del mese');
  if (!minus.length) return 'Saldo dei conti correnti e delle carte';
  return `Saldo dei conti meno ${minus.join(', ').replace(/, ([^,]*)$/, ' e $1')}`;
}

// Come è calcolato lo spendibile, con l'opzione delle uscite fisse.
function openSpendable() {
  const s = openSheet(html`<div class="dialog spendable-sheet"></div>`);
  const root = s.el.querySelector('.spendable-sheet');
  const draw = () => {
    const sp = P.spendable();
    const ps = P.planSettings();
    const fixed = P.fixedLeft();
    root.innerHTML = String(html`
      <h2>Spendibile</h2>
      <p>I soldi tuoi che puoi usare adesso.</p>
      <div class="calc">
        <div><span>Saldo dei conti spendibili</span><b>${formatCents(sp.accounts)}</b></div>
        ${sp.funds ? html`<div><span>Fondi vincolati (non tuoi)</span><b>−${formatCents(sp.funds)}</b></div>` : ''}
        ${sp.reserves ? html`<div><span>Accantonamenti</span><b>−${formatCents(sp.reserves)}</b></div>` : ''}
        ${ps.subtractFixed ? html`<div><span>Uscite fisse da pagare nel mese</span><b>−${formatCents(sp.fixed)}</b></div>` : ''}
        <div class="total"><span>Spendibile</span><b>${formatCents(sp.value)}</b></div>
      </div>
      <div class="list">
        <label class="row"><span class="row-label">Togli le uscite fisse del mese<small>${fixed.items.length ? `${fixed.items.length} ancora da pagare: ${formatCents(fixed.total)}` : 'Nessuna ancora da pagare'}</small></span><input type="checkbox" class="switch" data-fixed ${ps.subtractFixed ? 'checked' : ''}></label>
      </div>
      <div class="dialog-actions">
        <a class="btn secondary" href="#/movimenti/budget" data-go>Budget e accantonamenti</a>
        <a class="btn secondary" href="#/fondi" data-go>Fondi vincolati</a>
      </div>`);
    root.querySelector('[data-fixed]').onchange = async (e) => { await P.updatePlanSettings({ subtractFixed: e.target.checked }); draw(); };
    root.querySelectorAll('[data-go]').forEach((a) => { a.onclick = () => s.close(); });
  };
  draw();
}

function forecastCard(fc) {
  const fixedNames = fc.fixed.items.slice(0, 3).map((x) => x.name).join(', ');
  const stale = fc.asOf && Date.now() - fc.asOf > 3 * 86400000;
  return html`
    <section class="card forecast-card">
      <h2 class="card-title">Previsione di fine mese</h2>
      <div class="fc-amount ${fc.endCents < 0 ? 'negative' : ''}">${formatCents(fc.endCents)}</div>
      <p class="muted small">Quanto ti resterà il ${fmtShort(fc.end)}, se continui a spendere così.</p>
      <div class="calc small">
        <div><span>Spendibile oggi</span><b>${formatCents(fc.start)}</b></div>
        <div><span>Spese di tutti i giorni<small>circa ${formatCents(fc.dailyRate)} al giorno per ${fc.daysLeft} ${fc.daysLeft === 1 ? 'giorno' : 'giorni'}</small></span><b>−${formatCents(fc.variable)}</b></div>
        ${fc.fixed.total ? html`<div><span>Uscite fisse da pagare<small>${fixedNames}${fc.fixed.items.length > 3 ? ` e altre ${fc.fixed.items.length - 3}` : ''}</small></span><b>−${formatCents(fc.fixed.total)}</b></div>` : ''}
        ${fc.income.total ? html`<div><span>Stipendio atteso<small>come il mese scorso</small></span><b class="positive">+${formatCents(fc.income.total)}</b></div>` : ''}
      </div>
      ${stale ? html`<p class="muted small">Saldi aggiornati all'ultimo import: ${new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' }).format(fc.asOf)}.</p>` : ''}
    </section>`;
}
