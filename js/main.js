// Avvio: tema, poi configurazione guidata (primo avvio) oppure schermata di sblocco.

import * as DB from './db.js';
import * as V from './vault.js';
import * as S from './store.js';
import { html, setHtml } from './util.js';
import { applyAppearance } from './theme.js';
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
  // C'era già una versione: quando arriva quella nuova, se l'app è ancora bloccata
  // ricarica subito; altrimenti la nuova versione partirà alla prossima apertura.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !V.isUnlocked()) location.reload();
  });
  navigator.serviceWorker.register('sw.js')
    .then((reg) => reg.update())
    .catch((e) => console.warn('Service worker non registrato', e));
}

async function boot() {
  try {
    const [theme, palette] = await Promise.all([DB.metaGet('theme'), DB.metaGet('palette')]);
    applyAppearance({ theme, palette });
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
