// Elenchi raggruppati in stile Impostazioni di iOS.
import { html, raw } from '../util.js';
import { icon } from './icons.js';

export const group = ({ title, footer, rows, cls = '' }) => html`
  <section class="group ${cls}">
    ${title ? html`<h3 class="group-title">${title}</h3>` : ''}
    <div class="list">${rows}</div>
    ${footer ? html`<p class="group-footer">${footer}</p>` : ''}
  </section>`;

export const rowIcon = (name, color) => html`<span class="row-icon" style="background:${color}">${icon(name)}</span>`;

export const navRow = ({ href, icon: ic, color, label, detail }) => html`
  <a class="row" href="${href}">
    ${ic ? rowIcon(ic, color) : ''}
    <span class="row-label">${label}</span>
    ${detail ? html`<span class="row-detail">${detail}</span>` : ''}
    <span class="chev">${icon('chevron-right')}</span>
  </a>`;

export const buttonRow = ({ action, icon: ic, color, label, detail, destructive = false, tint = false }) => html`
  <button type="button" class="row ${destructive ? 'destructive' : ''} ${tint ? 'tinted' : ''}" data-action="${action}">
    ${ic ? rowIcon(ic, color) : ''}
    <span class="row-label">${label}</span>
    ${detail ? html`<span class="row-detail">${detail}</span>` : ''}
  </button>`;

export const infoRow = ({ icon: ic, color, label, detail }) => html`
  <div class="row static">
    ${ic ? rowIcon(ic, color) : ''}
    <span class="row-label">${label}</span>
    ${detail != null ? html`<span class="row-detail">${detail}</span>` : ''}
  </div>`;

export const toggleRow = ({ name, icon: ic, color, label, checked, disabled = false }) => html`
  <label class="row ${disabled ? 'disabled' : ''}">
    ${ic ? rowIcon(ic, color) : ''}
    <span class="row-label">${label}</span>
    <input type="checkbox" class="switch" data-toggle="${name}" ${checked ? raw('checked') : ''} ${disabled ? raw('disabled') : ''}>
  </label>`;

export const selectRow = ({ name, icon: ic, color, label, value, options }) => html`
  <label class="row">
    ${ic ? rowIcon(ic, color) : ''}
    <span class="row-label">${label}</span>
    <span class="select-wrap">
      <select data-select="${name}">
        ${options.map(([v, l]) => html`<option value="${v}" ${String(v) === String(value) ? raw('selected') : ''}>${l}</option>`)}
      </select>
      ${icon('chevron-right', 'select-chev')}
    </span>
  </label>`;

export const segmented = (name, options, value) => html`
  <div class="segmented" role="radiogroup" data-seg="${name}">
    ${options.map(([v, l]) => html`<button type="button" role="radio" aria-checked="${v === value ? 'true' : 'false'}" class="${v === value ? 'on' : ''}" data-value="${v}">${l}</button>`)}
  </div>`;

export function wireSegmented(root, name, onChange) {
  const seg = root.querySelector(`[data-seg="${name}"]`);
  if (!seg) return;
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (!b || b.classList.contains('on')) return;
    for (const x of seg.children) {
      const on = x === b;
      x.classList.toggle('on', on);
      x.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    onChange(b.dataset.value);
  });
}
