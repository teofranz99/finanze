// Campi per scegliere una nuova password, misuratore di robustezza e chiave di recupero.
import { html } from '../util.js';
import * as V from '../vault.js';
import { openSheet, toast } from './sheet.js';
import { icon } from './icons.js';

export const MIN_LEN = 10;
const LABELS = ['Troppo debole', 'Debole', 'Discreta', 'Buona', 'Ottima'];

export function strength(pw) {
  let score = 0;
  if (pw.length >= MIN_LEN) score++;
  if (pw.length >= 14) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}

export function newPasswordFields() {
  return html`
    <div class="field-group">
      <label class="field"><input class="text" type="password" name="pw1" autocomplete="new-password" placeholder="Nuova password" required></label>
      <label class="field"><input class="text" type="password" name="pw2" autocomplete="new-password" placeholder="Ripeti la password" required></label>
    </div>
    <div class="strength" data-strength="0">
      <div class="strength-bar"><i></i><i></i><i></i><i></i></div>
      <span class="strength-label">Almeno ${MIN_LEN} caratteri</span>
    </div>`;
}

// Collega i campi; `onChange(ok)` dice se la password è valida e confermata.
export function wireNewPassword(form, onChange) {
  const pw1 = form.elements.pw1;
  const pw2 = form.elements.pw2;
  const meter = form.querySelector('.strength');
  const label = form.querySelector('.strength-label');
  const update = () => {
    const v = pw1.value;
    const s = strength(v);
    meter.dataset.strength = v ? String(Math.max(1, s)) : '0';
    if (v.length < MIN_LEN) label.textContent = `Almeno ${MIN_LEN} caratteri (${v.length}/${MIN_LEN})`;
    else if (pw2.value && pw2.value !== v) label.textContent = 'Le due password non coincidono';
    else label.textContent = LABELS[s];
    onChange(v.length >= MIN_LEN && v === pw2.value);
  };
  pw1.addEventListener('input', update);
  pw2.addEventListener('input', update);
  update();
  return () => pw1.value;
}

// Dopo lo sblocco con la chiave di recupero: obbliga a scegliere una nuova password.
export function forceNewPassword() {
  const s = openSheet(html`
    <form class="dialog" novalidate>
      <h2>Scegli una nuova password</h2>
      <p>Hai aperto l'archivio con la chiave di recupero. Imposta ora una nuova password principale.</p>
      ${newPasswordFields()}
      <div class="dialog-actions"><button type="submit" class="btn" disabled>Salva password</button></div>
    </form>`, { dismissible: false });
  const form = s.el.querySelector('form');
  const btn = form.querySelector('[type=submit]');
  const getPw = wireNewPassword(form, (ok) => { btn.disabled = !ok; });
  form.onsubmit = async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Salvataggio…';
    await V.changePassword(getPw());
    s.close(true);
  };
  return s.closed;
}

export function recoveryKeyBlock(text) {
  return html`
    <div class="rk" aria-label="Chiave di recupero">${text.split('-').map((g) => html`<span>${g}</span>`)}</div>
    <div class="rk-actions">
      <button type="button" class="btn secondary small" data-copy>${icon('copy')}<span>Copia</span></button>
      <button type="button" class="btn secondary small" data-print>${icon('printer')}<span>Stampa</span></button>
    </div>`;
}

export function wireRecoveryKeyBlock(root, text) {
  root.querySelector('[data-copy]').onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Chiave copiata. Incollala in un posto sicuro, poi svuota gli appunti.');
    } catch {
      toast('Copia non riuscita: trascrivila a mano.', { type: 'error' });
    }
  };
  root.querySelector('[data-print]').onclick = () => printRecoveryKey(text);
}

export function printRecoveryKey(text) {
  const el = document.createElement('div');
  el.className = 'print-root';
  el.innerHTML = String(html`
    <h1>Finanze – chiave di recupero</h1>
    <p>Creata il ${new Intl.DateTimeFormat('it-IT', { dateStyle: 'long' }).format(new Date())}</p>
    <p class="print-key">${text}</p>
    <p>Serve per riaprire i tuoi dati se dimentichi la password principale.</p>
    <p>Conserva questo foglio in un luogo sicuro, lontano dal telefono. Chi possiede questa chiave e un tuo backup può leggere i tuoi dati.</p>`);
  document.body.appendChild(el);
  document.body.classList.add('printing');
  const cleanup = () => {
    el.remove();
    document.body.classList.remove('printing');
  };
  addEventListener('afterprint', cleanup, { once: true });
  window.print();
}

// Mostra una nuova chiave di recupero e attende la conferma.
export function showRecoveryKeySheet(text) {
  const s = openSheet(html`
    <div class="dialog">
      <h2>Nuova chiave di recupero</h2>
      <p>La chiave precedente non apre più questo archivio. I backup già salvati restano apribili con la vecchia chiave.</p>
      ${recoveryKeyBlock(text)}
      <div class="dialog-actions"><button type="button" class="btn" data-ok>L'ho conservata</button></div>
    </div>`, { dismissible: false });
  wireRecoveryKeyBlock(s.el, text);
  s.el.querySelector('[data-ok]').onclick = () => s.close(true);
  return s.closed;
}
