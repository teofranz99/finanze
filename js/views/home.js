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
    const accs = w.list.filter((x) => (x.account.role || 'spendibile') !== 'vincolato');
    const slices = accs.filter((x) => x.cents > 0).map((x) => ({ ...x, color: M.accountColor(x.account) }));
    const hasData = M.accounts().length > 0;

    const monthStart = `${isoToday().slice(0, 7)}-01`;
    const monthTx = M.txs().filter((t) => t.date >= monthStart);
    const tot = M.totals(monthTx);
    const topCats = M.byCategory(monthTx).slice(0, 5);
    const maxCat = topCats[0]?.cents || 1;
    const monthName = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(new Date());
    const lastImport = M.accounts().map((a) => a.lastImportAt || 0).sort((a, b) => b - a)[0];

    setHtml(el, page({
      title: 'Home',
      eyebrow: today,
      right: html`<a class="nav-icon-btn" href="#/impostazioni" aria-label="Impostazioni">${icon('sliders')}</a>`,
      body: html`
        <div class="home-grid">
          <section class="card hero-card">
            <div class="hero-label">Spendibile</div>
            <div class="hero-amount" data-amount>${formatCents(0)}</div>
            <div class="hero-sub">${hasData ? `Saldo dei conti correnti${w.restricted ? ', esclusi i fondi vincolati' : ''}` : 'Soldi tuoi disponibili, al netto dei fondi vincolati'}</div>
          </section>

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
              <li><a href="#/conto/${x.account.id}"><i style="background:${x.color}"></i><span>${x.account.name}</span><b>${formatCents(x.cents)}</b><em>${Math.round((x.cents / w.total) * 100)}%</em></a></li>`)}</ul>
              ${w.savings ? html`<p class="muted small center">Spendibile ${formatCents(w.spendable)} · Risparmi ${formatCents(w.savings)}</p>` : ''}`
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

          <section class="card">
            <h2 class="card-title">Previsione di fine mese</h2>
            <p class="muted">Arriva con la fase 5, insieme a budget e uscite fisse.</p>
          </section>

          <button type="button" class="card next-card" data-import>
            <span class="next-icon">${icon('upload')}</span>
            <span class="next-text"><b>${hasData ? 'Importa movimenti' : 'Prossimo passo'}</b><span>${hasData && lastImport ? `Ultimo import ${relativeTime(lastImport)}` : 'Importa il primo estratto conto'}</span></span>
            <span class="chev">${icon('chevron-right')}</span>
          </button>
        </div>
        <a class="sync-line" href="#/impostazioni/backup">${icon('cloud-up')}<span data-sync>&nbsp;</span></a>`,
    }));

    animateNumber(el.querySelector('[data-amount]'), w.spendable / 100);
    animateNumber(el.querySelector('[data-total]'), w.total / 100);
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
  const unsub = S.subscribe((col) => { if (['tx', 'accounts', 'categories', '*'].includes(col)) draw(); });
  return () => { off?.(); unsub(); };
}
