// Schermata di sblocco: Face ID parte subito; dopo 3 tentativi falliti si sceglie
// tra "Riprova con Face ID" e "Usa la password". Se Safari richiede un tocco per
// avviare Face ID, compare solo un pulsante minimo di sblocco.

import { html, setHtml } from '../util.js';
import { icon } from '../ui/icons.js';
import * as V from '../vault.js';
import * as P from '../passkey.js';
import { biometricName } from '../platform.js';
import { forceNewPassword } from '../ui/password.js';

const MAX_BIO_FAILURES = 3;

export async function showLock(root, onUnlocked) {
  const pk = await V.getPasskey();
  const bio = biometricName();
  let mode = pk && P.supported() ? 'bio' : 'password';
  let failures = 0;
  let busy = false;
  let needsTap = false;
  let error = '';

  function subtitle() {
    if (mode === 'bio') {
      if (busy) return `Sblocco con ${bio}…`;
      if (needsTap) return 'Tocca per sbloccare';
      if (failures) return `${bio} non riuscito`;
      return 'Bloccata';
    }
    if (mode === 'recovery') return 'Inserisci la chiave di recupero';
    return 'Inserisci la password principale';
  }

  function panel() {
    if (mode === 'bio') {
      if (failures >= MAX_BIO_FAILURES && !busy) {
        return html`
          <button type="button" class="btn" data-bio>${icon('faceid')}<span>Riprova con ${bio}</span></button>
          <button type="button" class="btn secondary" data-use-password>Usa la password</button>`;
      }
      if (busy) return html`<div class="bio-glyph pulsing">${icon('faceid')}</div>`;
      return html`<button type="button" class="btn ${needsTap ? 'unlock-min' : ''}" data-bio>${icon('faceid')}<span>${failures ? 'Riprova' : 'Sblocca'}</span></button>`;
    }
    if (mode === 'recovery') {
      return html`
        <form class="lock-form" novalidate>
          <label class="field"><input class="text mono" name="secret" type="text" placeholder="XXXX-XXXX-XXXX-…" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label>
          ${error ? html`<p class="form-error">${error}</p>` : ''}
          <button type="submit" class="btn" ${busy ? 'disabled' : ''}>${busy ? 'Verifica…' : 'Sblocca'}</button>
        </form>
        <button type="button" class="link-btn" data-use-password>Torna alla password</button>`;
    }
    return html`
      <form class="lock-form" novalidate>
        <input type="text" name="username" value="Finanze" autocomplete="username" hidden>
        <label class="field"><input class="text" name="secret" type="password" placeholder="Password" autocomplete="current-password" required></label>
        ${error ? html`<p class="form-error">${error}</p>` : ''}
        <button type="submit" class="btn">Sblocca</button>
      </form>
      <div class="lock-links">
        ${pk && P.supported() ? html`<button type="button" class="link-btn" data-bio>Usa ${bio}</button>` : ''}
        <button type="button" class="link-btn" data-use-recovery>Password dimenticata?</button>
      </div>`;
  }

  function draw() {
    setHtml(root, html`
      <div class="lock">
        <div class="lock-hero">
          <img class="app-icon" src="icons/icon-192.png" alt="" width="84" height="84">
          <h1>Finanze</h1>
          <p class="lock-sub">${subtitle()}</p>
        </div>
        <div class="lock-panel">${panel()}</div>
      </div>`);
    wire();
  }

  function wire() {
    root.querySelectorAll('[data-bio]').forEach((b) => { b.onclick = () => { if (mode !== 'bio') { mode = 'bio'; error = ''; } tryBio(true); }; });
    root.querySelectorAll('[data-use-password]').forEach((b) => { b.onclick = () => { mode = 'password'; error = ''; draw(); focusInput(); }; });
    const rec = root.querySelector('[data-use-recovery]');
    if (rec) rec.onclick = () => { mode = 'recovery'; error = ''; draw(); focusInput(); };
    const form = root.querySelector('.lock-form');
    if (form) form.onsubmit = (e) => { e.preventDefault(); submitSecret(form.elements.secret.value); };
  }

  function focusInput() {
    const input = root.querySelector('.lock-form input[name=secret]');
    if (input) setTimeout(() => input.focus(), 50);
  }

  function shake() {
    const form = root.querySelector('.lock-form');
    if (form) form.classList.add('shake');
  }

  async function finish() {
    const lock = root.querySelector('.lock');
    if (lock) lock.classList.add('unlocked');
    await onUnlocked();
  }

  async function tryBio(userInitiated) {
    if (busy) return;
    busy = true;
    needsTap = false;
    error = '';
    draw();
    const t0 = performance.now();
    try {
      const out = await P.authenticate(pk);
      await V.unlockWithPasskeyOutput(out);
      await finish();
    } catch (e) {
      busy = false;
      if (e instanceof P.PrfUnsupportedError) {
        mode = 'password';
        error = `${bio} non è disponibile in questo browser: usa la password.`;
      } else if (!userInitiated && e && e.name === 'NotAllowedError' && performance.now() - t0 < 1200) {
        // Il browser ha rifiutato subito: serve un tocco dell'utente.
        needsTap = true;
      } else if (e && (e.name === 'SecurityError' || e.name === 'InvalidStateError')) {
        mode = 'password';
        error = `${bio} non è disponibile qui: usa la password.`;
      } else {
        failures++;
      }
      draw();
      if (mode !== 'bio') focusInput();
    }
  }

  async function submitSecret(value) {
    if (!value || busy) return;
    busy = true;
    const btn = root.querySelector('.lock-form [type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Verifica…'; }
    try {
      if (mode === 'recovery') {
        await V.unlockWithRecovery(value);
        await forceNewPassword();
      } else {
        await V.unlockWithPassword(value);
      }
      await finish();
    } catch (e) {
      busy = false;
      if (e instanceof V.WrongSecretError) {
        error = mode === 'recovery' ? 'Chiave di recupero non valida.' : 'Password errata.';
      } else {
        console.error(e);
        error = `Errore: ${e.message}`;
      }
      draw();
      shake();
      focusInput();
    }
  }

  draw();
  if (mode === 'bio') tryBio(false);
  else focusInput();
}
