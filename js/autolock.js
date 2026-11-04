// Blocco automatico dopo inattività e al ritorno nell'app dopo qualche minuto.
// Bloccare = dimenticare la chiave e ricaricare la pagina, così in memoria non resta nulla.

import * as V from './vault.js';

let last = Date.now();
let hiddenAt = 0;
let started = false;

export function lockNow() {
  V.lock();
  location.reload();
}

export function startAutoLock(getMinutes) {
  if (started) return;
  started = true;
  const limit = () => Math.max(1, Number(getMinutes()) || 3) * 60000;
  const bump = () => { last = Date.now(); };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) {
    addEventListener(ev, bump, { passive: true, capture: true });
  }
  document.addEventListener('visibilitychange', () => {
    const root = document.documentElement;
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      root.classList.add('app-hidden'); // copre i dati nell'anteprima del multitasking
    } else {
      root.classList.remove('app-hidden');
      if (hiddenAt && Date.now() - hiddenAt >= limit()) lockNow();
      hiddenAt = 0;
      bump();
    }
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - last >= limit()) lockNow();
  }, 15000);
}
