// Configurazione guidata al primo avvio: password, chiave di recupero, Face ID.
// In alternativa: ripristino da un backup (per esempio su un secondo dispositivo).

import { html, setHtml, formatDateTime } from '../util.js';
import { icon } from '../ui/icons.js';
import * as V from '../vault.js';
import * as P from '../passkey.js';
import * as B from '../backup.js';
import { biometricName } from '../platform.js';
import { newPasswordFields, wireNewPassword, recoveryKeyBlock, wireRecoveryKeyBlock, forceNewPassword } from '../ui/password.js';
import { toast } from '../ui/sheet.js';

export function showSetup(root, onDone) {
  const bio = biometricName();
  let step = 'welcome';
  let recoveryText = '';
  let backup = null;
  let restoreKind = 'password';
  let canBio = false;

  P.platformAvailable().then((v) => { canBio = v; });

  const go = (s) => { step = s; draw(); };

  const views = {
    welcome: () => html`
      <img class="app-icon big" src="icons/icon-192.png" alt="" width="96" height="96">
      <h1>Benvenuto in Finanze</h1>
      <p class="lead">Le tue finanze in un unico posto, cifrate e salvate solo sui tuoi dispositivi.</p>
      <ul class="welcome-list">
        <li>${icon('lock')}<div><b>Cifratura sul dispositivo</b><span>AES-256 con una password che conosci solo tu.</span></div></li>
        <li>${icon('faceid')}<div><b>Sblocco con ${bio}</b><span>Niente password da digitare ogni volta.</span></div></li>
        <li>${icon('cloud-up')}<div><b>Backup cifrato</b><span>Da salvare in iCloud Drive per usare l'app su più dispositivi.</span></div></li>
      </ul>
      <div class="setup-actions">
        <button type="button" class="btn" data-next="password">Crea un nuovo archivio</button>
        <button type="button" class="btn secondary" data-next="restore">Ripristina da un backup</button>
      </div>`,

    password: () => html`
      <div class="setup-icon" style="--c:var(--s1)">${icon('key')}</div>
      <h1>Crea la password principale</h1>
      <p class="lead">Protegge tutti i tuoi dati. Nessuno può recuperarla: per questo tra poco riceverai una chiave di recupero.</p>
      <form class="setup-form" novalidate>
        <input type="text" name="username" value="Finanze" autocomplete="username" hidden>
        ${newPasswordFields()}
        <div class="setup-actions">
          <button type="submit" class="btn" disabled>Continua</button>
          <button type="button" class="btn plain" data-next="welcome">Indietro</button>
        </div>
      </form>`,

    recovery: () => html`
      <div class="setup-icon" style="--c:var(--s4)">${icon('shield')}</div>
      <h1>La tua chiave di recupero</h1>
      <p class="lead">Se dimentichi la password è l'unico modo per riaprire i dati. Stampala o scrivila e conservala lontano dal telefono.</p>
      ${recoveryKeyBlock(recoveryText)}
      <label class="check-line"><input type="checkbox" data-confirm><span>L'ho conservata in un posto sicuro</span></label>
      <div class="setup-actions"><button type="button" class="btn" data-continue disabled>Continua</button></div>`,

    passkey: () => html`
      <div class="setup-icon" style="--c:var(--s2)">${icon('faceid')}</div>
      <h1>Attiva ${bio}</h1>
      <p class="lead">Sblocca l'app con un'occhiata. La password principale resta l'alternativa.</p>
      <div class="setup-actions">
        <button type="button" class="btn" data-enable>Attiva ${bio}</button>
        <button type="button" class="btn plain" data-next="done">Non ora</button>
      </div>`,

    done: () => html`
      <div class="done-check">${icon('check')}</div>
      <h1>Tutto pronto</h1>
      <p class="lead">Ricordati di salvare ogni tanto un backup da Impostazioni › Backup.</p>
      <div class="setup-actions"><button type="button" class="btn" data-finish>Inizia</button></div>`,

    restore: () => html`
      <div class="setup-icon" style="--c:var(--s5)">${icon('cloud-down')}</div>
      <h1>Ripristina da un backup</h1>
      ${backup
        ? html`
          <p class="lead">Backup del ${formatDateTime(backup.createdAt)}.</p>
          <form class="setup-form" novalidate>
            ${restoreKind === 'password'
              ? html`<label class="field"><input class="text" name="secret" type="password" placeholder="Password del backup" autocomplete="current-password" required></label>`
              : html`<label class="field"><input class="text mono" name="secret" type="text" placeholder="Chiave di recupero" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label>`}
            <p class="form-error" hidden></p>
            <div class="setup-actions">
              <button type="submit" class="btn">Ripristina</button>
              <button type="button" class="btn plain" data-toggle-kind>${restoreKind === 'password' ? 'Usa la chiave di recupero' : 'Usa la password'}</button>
            </div>
          </form>`
        : html`
          <p class="lead">Scegli il file di backup, per esempio da iCloud Drive.</p>
          <input type="file" accept="application/json,.json" data-file hidden>
          <div class="setup-actions">
            <button type="button" class="btn" data-pick>Scegli il file</button>
            <button type="button" class="btn plain" data-next="welcome">Indietro</button>
          </div>`}`,
  };

  function draw() {
    setHtml(root, html`<div class="setup"><div class="setup-card" data-step="${step}">${views[step]()}</div></div>`);
    wire();
  }

  function wire() {
    root.querySelectorAll('[data-next]').forEach((b) => { b.onclick = () => go(b.dataset.next); });
    const w = wiring[step];
    if (w) w(root.querySelector('.setup-card'));
  }

  const wiring = {
    password(card) {
      const form = card.querySelector('form');
      const btn = form.querySelector('[type=submit]');
      const getPw = wireNewPassword(form, (ok) => { btn.disabled = !ok; });
      setTimeout(() => form.elements.pw1.focus(), 100);
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = 'Creazione dell\'archivio…';
        try {
          recoveryText = await V.createVault(getPw());
          go('recovery');
        } catch (ex) {
          console.error(ex);
          toast(`Errore: ${ex.message}`, { type: 'error' });
          btn.disabled = false;
          btn.textContent = 'Continua';
        }
      };
    },

    recovery(card) {
      wireRecoveryKeyBlock(card, recoveryText);
      const cb = card.querySelector('[data-confirm]');
      const btn = card.querySelector('[data-continue]');
      cb.onchange = () => { btn.disabled = !cb.checked; };
      btn.onclick = () => go(canBio ? 'passkey' : 'done');
    },

    passkey(card) {
      const btn = card.querySelector('[data-enable]');
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          await V.savePasskey(await P.register());
          toast(`${bio} attivato`);
          go('done');
        } catch (e) {
          btn.disabled = false;
          if (e instanceof P.PrfUnsupportedError) {
            toast(`Questo browser non permette lo sblocco con ${bio}. Su iPhone serve iOS 18 o successivo.`, { type: 'error', duration: 5000 });
          } else if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') {
            toast(`Attivazione non riuscita: ${e.message}`, { type: 'error' });
          }
        }
      };
    },

    done(card) {
      const btn = card.querySelector('[data-finish]');
      btn.onclick = async () => {
        btn.disabled = true;
        await onDone();
      };
    },

    restore(card) {
      if (!backup) {
        const input = card.querySelector('[data-file]');
        card.querySelector('[data-pick]').onclick = () => input.click();
        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;
          try {
            backup = await B.readBackup(file);
            draw();
          } catch (e) {
            toast(e.message, { type: 'error' });
          }
        };
        return;
      }
      card.querySelector('[data-toggle-kind]').onclick = () => {
        restoreKind = restoreKind === 'password' ? 'recovery' : 'password';
        draw();
      };
      const form = card.querySelector('form');
      const err = form.querySelector('.form-error');
      const btn = form.querySelector('[type=submit]');
      setTimeout(() => form.elements.secret.focus(), 100);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const secret = form.elements.secret.value;
        if (!secret) return;
        btn.disabled = true;
        btn.textContent = 'Ripristino…';
        try {
          await B.restoreBackup(backup, secret, restoreKind);
          if (restoreKind === 'recovery') await forceNewPassword();
          go(canBio ? 'passkey' : 'done');
        } catch (ex) {
          btn.disabled = false;
          btn.textContent = 'Ripristina';
          err.textContent = ex instanceof V.WrongSecretError
            ? (restoreKind === 'password' ? 'Password errata.' : 'Chiave di recupero non valida.')
            : ex.message;
          err.hidden = false;
          form.classList.remove('shake');
          void form.offsetWidth;
          form.classList.add('shake');
        }
      };
    },
  };

  draw();
}
