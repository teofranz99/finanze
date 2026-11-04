// Guscio dell'app: barra delle sezioni personalizzabile e navigazione tra le pagine.

import { html, setHtml, $ } from './util.js';
import { icon } from './ui/icons.js';
import { sectionById } from './sections.js';
import { getSettings, visibleTabIds } from './settings.js';
import { wideMQ } from './platform.js';
import * as S from './store.js';
import { homeView } from './views/home.js';
import { altroView } from './views/altro.js';
import { placeholderView } from './views/placeholder.js';
import { settingsView } from './views/settings.js';

const VIEWS = {
  home: homeView,
  altro: altroView,
  impostazioni: settingsView,
};

let shell;
let viewEl;
let tabbarEl;
let cleanup = null;
let currentKey = '';

function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { section: parts[0] || 'home', rest: parts.slice(1) };
}

function resolveView(section) {
  if (VIEWS[section]) return VIEWS[section];
  const sec = sectionById(section);
  if (sec) return (el) => placeholderView(el, sec);
  return homeView;
}

function route() {
  const { section, rest } = parse();
  const key = `${section}/${rest.join('/')}`;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;
  viewEl.replaceChildren();
  const res = resolveView(section)(viewEl, rest);
  cleanup = typeof res === 'function' ? res : null;
  if (key !== currentKey) window.scrollTo(0, 0);
  currentKey = key;
  markActive(section);
}

function renderTabbar() {
  const s = getSettings();
  const wide = wideMQ.matches;
  shell.dataset.tabpos = wide ? s.widePosition : 'bottom';
  shell.dataset.wide = wide ? 'true' : 'false';
  const ids = visibleTabIds(wide);
  setHtml(tabbarEl, html`
    <div class="tabbar-inner">
      ${ids.map((id) => {
        const sec = sectionById(id);
        return html`<a class="tab" href="#/${id}" data-tab="${id}">${icon(sec.icon)}<span>${sec.short || sec.title}</span></a>`;
      })}
      <a class="tab" href="#/altro" data-tab="altro">${icon('ellipsis', 'icon-dots')}<span>Altro</span></a>
    </div>`);
  markActive(parse().section);
}

function markActive(section) {
  const vis = visibleTabIds();
  const active = vis.includes(section) ? section : 'altro';
  for (const a of tabbarEl.querySelectorAll('.tab')) {
    const on = a.dataset.tab === active;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

export function mountApp(root) {
  setHtml(root, html`
    <div class="shell">
      <main class="view" id="view"></main>
      <nav class="tabbar" aria-label="Sezioni"></nav>
    </div>`);
  shell = root.firstElementChild;
  viewEl = $('#view', shell);
  tabbarEl = $('.tabbar', shell);

  // Toccare la sezione già aperta riporta in cima, come su iOS.
  tabbarEl.addEventListener('click', (e) => {
    const a = e.target.closest('.tab');
    if (a && a.getAttribute('href') === `#/${parse().section}` && !parse().rest.length) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  renderTabbar();
  route();
  addEventListener('hashchange', route);
  wideMQ.addEventListener('change', () => { renderTabbar(); route(); });
  S.subscribe((col) => { if (col === 'settings' || col === '*') renderTabbar(); });
}
