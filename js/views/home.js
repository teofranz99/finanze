// Home: spendibile, patrimonio totale (ciambella) e previsione di fine mese.
// Per ora non ci sono conti: i numeri arriveranno con l'import dei movimenti (fase 2).

import { html, setHtml, formatEuro, animateNumber, relativeTime } from '../util.js';
import { icon } from '../ui/icons.js';
import { page, enhancePage } from '../ui/page.js';
import * as DB from '../db.js';

function donutEmpty() {
  return html`
    <svg class="donut" viewBox="0 0 120 120" aria-hidden="true">
      <circle class="donut-track" cx="60" cy="60" r="48"></circle>
      <circle class="donut-skeleton" cx="60" cy="60" r="48" pathLength="100"></circle>
    </svg>`;
}

export function homeView(el) {
  const today = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  setHtml(el, page({
    title: 'Home',
    eyebrow: today,
    right: html`<a class="nav-icon-btn" href="#/impostazioni" aria-label="Impostazioni">${icon('sliders')}</a>`,
    body: html`
      <div class="home-grid">
        <section class="card hero-card">
          <div class="hero-label">Spendibile</div>
          <div class="hero-amount" data-amount>${formatEuro(0)}</div>
          <div class="hero-sub">Soldi tuoi disponibili, al netto dei fondi vincolati</div>
        </section>

        <section class="card donut-card">
          <h2 class="card-title">Patrimonio totale</h2>
          <div class="donut-wrap">
            ${donutEmpty()}
            <div class="donut-center">
              <div class="donut-value" data-total>${formatEuro(0)}</div>
              <div class="donut-caption">Totale</div>
            </div>
          </div>
          <p class="muted center">I conti compariranno qui dopo il primo import.</p>
        </section>

        <section class="card">
          <h2 class="card-title">Previsione di fine mese</h2>
          <p class="muted">Sarà calcolata da come stai spendendo e dalle uscite fisse ancora da pagare.</p>
        </section>

        <a class="card next-card" href="#/movimenti">
          <span class="next-icon">${icon('upload')}</span>
          <span class="next-text"><b>Prossimo passo</b><span>Importa il primo estratto conto</span></span>
          <span class="chev">${icon('chevron-right')}</span>
        </a>
      </div>
      <a class="sync-line" href="#/impostazioni/backup">${icon('cloud-up')}<span data-sync>&nbsp;</span></a>`,
  }));

  animateNumber(el.querySelector('[data-amount]'), 0);
  animateNumber(el.querySelector('[data-total]'), 0);

  DB.metaGet('lastBackupAt').then((ts) => {
    const span = el.querySelector('[data-sync]');
    if (span) span.textContent = ts ? `Ultimo backup ${relativeTime(ts)}` : 'Nessun backup salvato';
  });

  return enhancePage(el);
}
