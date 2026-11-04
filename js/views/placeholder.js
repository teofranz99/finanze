// Sezioni non ancora costruite: mostrano cosa conterranno e in quale fase arrivano.
import { setHtml, html } from '../util.js';
import { icon } from '../ui/icons.js';
import { page, enhancePage } from '../ui/page.js';

export function placeholderView(el, sec) {
  setHtml(el, page({
    title: sec.title,
    body: html`
      <div class="empty">
        <div class="empty-icon" style="--c:${sec.color}">${icon(sec.icon)}</div>
        <h2>In arrivo</h2>
        <p>Questa sezione verrà costruita nella fase ${sec.phase}.</p>
        <ul class="feature-list">
          ${sec.features.map((f) => html`<li>${icon('check')}<span>${f}</span></li>`)}
        </ul>
      </div>`,
  }));
  return enhancePage(el);
}
