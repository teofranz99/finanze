// Avvio: tema, poi configurazione guidata (primo avvio) oppure schermata di sblocco.

import * as DB from './db.js';
import * as V from './vault.js';
import * as S from './store.js';
import { html, setHtml } from './util.js';
import { applyTheme } from './theme.js';
import { showLock } from './views/lock.js';
import { showSetup } from './views/setup.js';
import { mountApp } from './app.js';
import { startAutoLock } from './autolock.js';
import { getSettings } from './settings.js';

const root = document.getElementById('app');

function hideSplash() {
  const s = document.getElementById('splash');
  if (!s) return;
  s.classList.add('hide');
  setTimeout(() => s.remove(), 600);
}

async function onUnlocked() {
  await S.loadAll();
  mountApp(root);
  startAutoLock(() => getSettings().autoLockMinutes);
  // Chiede al browser di non cancellare i dati quando lo spazio scarseggia.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker non registrato', e));
}

async function boot() {
  try {
    applyTheme(await DB.metaGet('theme'));
    await V.loadHeader();
    if (V.hasVault()) await showLock(root, onUnlocked);
    else showSetup(root, onUnlocked);
  } catch (e) {
    console.error(e);
    setHtml(root, html`
      <div class="fatal">
        <h1>Impossibile avviare l'app</h1>
        <p>${e.message}</p>
        <p class="muted">Se stai usando la navigazione privata, aprila in una finestra normale: serve la memoria del browser.</p>
      </div>`);
  }
  hideSplash();
  registerServiceWorker();
}

boot();
