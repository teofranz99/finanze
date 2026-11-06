// Impostazioni: barra delle sezioni, sicurezza, backup e sincronizzazione, aspetto.

import { html, setHtml, formatDateTime, formatDate, formatShort, relativeTime } from '../util.js';
import { icon } from '../ui/icons.js';
import { page, enhancePage } from '../ui/page.js';
import { group, navRow, buttonRow, infoRow, toggleRow, selectRow, segmented, wireSegmented, rowIcon } from '../ui/list.js';
import { openSheet, confirmDialog, alertDialog, promptSecret, toast } from '../ui/sheet.js';
import { newPasswordFields, wireNewPassword, showRecoveryKeySheet } from '../ui/password.js';
import { getSettings, updateSettings, DEFAULT_SETTINGS, PHONE_TABS, WIDE_TABS_MIN, WIDE_TABS_MAX } from '../settings.js';
import { sectionById } from '../sections.js';
import { biometricName } from '../platform.js';
import { applyAppearance, currentPalette } from '../theme.js';
import { PALETTES, getPalette } from '../palettes.js';
import { accountsPage, categoriesPage, areasPage, rulesPage } from './data-settings.js';
import * as M from '../data/model.js';
import { lockNow } from '../autolock.js';
import { APP_VERSION } from '../version.js';
import * as V from '../vault.js';
import * as P from '../passkey.js';
import * as B from '../backup.js';
import * as DB from '../db.js';

export function settingsView(el, rest) {
  switch (rest[0]) {
    case 'barra': return tabbarPage(el);
    case 'sicurezza': return securityPage(el);
    case 'backup': return backupPage(el);
    case 'palette': return palettePage(el);
    case 'conti': return accountsPage(el);
    case 'categorie': return categoriesPage(el);
    case 'aree': return areasPage(el);
    case 'regole': return rulesPage(el);
    default: return rootPage(el);
  }
}

const BACK = { href: 'impostazioni', label: 'Impostazioni' };

// ---------------------------------------------------------------- Principale
function rootPage(el) {
  let off = null;
  const draw = async () => {
    const [theme, lastBackup] = await Promise.all([DB.metaGet('theme'), DB.metaGet('lastBackupAt')]);
    const h = V.getHeader();
    off?.();
    setHtml(el, page({
      title: 'Impostazioni',
      back: { href: 'altro', label: 'Altro' },
      body: html`
        ${group({
          rows: [
            navRow({ href: '#/impostazioni/barra', icon: 'tabbar', color: 'var(--s1)', label: 'Barra delle sezioni' }),
            navRow({ href: '#/impostazioni/sicurezza', icon: 'lock', color: 'var(--s2)', label: 'Sicurezza e sblocco' }),
            navRow({ href: '#/impostazioni/backup', icon: 'cloud-up', color: 'var(--s5)', label: 'Backup e sincronizzazione', detail: lastBackup ? relativeTime(lastBackup) : 'Mai' }),
          ],
        })}
        ${group({
          title: 'Dati',
          rows: [
            navRow({ href: '#/impostazioni/conti', icon: 'bank', color: 'var(--s5)', label: 'Conti', detail: String(M.accounts().length) }),
            navRow({ href: '#/impostazioni/categorie', icon: 'tag', color: 'var(--s9)', label: 'Categorie' }),
            navRow({ href: '#/impostazioni/aree', icon: 'house', color: 'var(--s1)', label: 'Aree' }),
            navRow({ href: '#/impostazioni/regole', icon: 'sparkles', color: 'var(--s4)', label: 'Regole automatiche', detail: String(M.rules().length) }),
          ],
        })}
        ${group({
          title: 'Aspetto',
          rows: [
            navRow({ href: '#/impostazioni/palette', icon: 'palette', color: 'var(--s7)', label: 'Palette', detail: getPalette(currentPalette()).name }),
            html`<div class="row static">${rowIcon('contrast', 'var(--s3)')}<span class="row-label">Tema</span>${segmented('theme', [['auto', 'Auto'], ['light', 'Chiaro'], ['dark', 'Scuro']], theme || 'auto')}</div>`,
          ],
          footer: 'Auto segue l\'impostazione chiaro/scuro del dispositivo.',
        })}
        ${group({
          title: 'Informazioni',
          rows: [
            infoRow({ icon: 'info', color: 'var(--s10)', label: 'Versione', detail: APP_VERSION }),
            infoRow({ icon: 'shield', color: 'var(--s10)', label: 'Archivio creato il', detail: h ? formatDate(h.createdAt) : '—' }),
          ],
          footer: 'I dati restano solo sui tuoi dispositivi, cifrati con AES-256. Nessun server, nessun account.',
        })}
        ${group({
          rows: buttonRow({ action: 'wipe', label: 'Cancella tutti i dati da questo dispositivo', destructive: true }),
        })}`,
    }));
    off = enhancePage(el);
    wireSegmented(el, 'theme', async (v) => {
      await DB.metaSet('theme', v === 'auto' ? null : v);
      applyAppearance({ theme: v });
    });
    el.querySelector('[data-action=wipe]').onclick = wipeAll;
  };
  draw();
  return () => off?.();
}

// ---------------------------------------------------------------- Palette
function palettePage(el) {
  const cur = currentPalette();
  setHtml(el, page({
    title: 'Palette',
    back: BACK,
    large: false,
    body: html`
      <p class="page-intro">Scegli i colori dell'app. Ogni palette ha una versione chiara e una scura, che segue il tema.</p>
      <div class="palette-grid">
        ${PALETTES.map((p) => html`
          <button type="button" class="palette-card ${p.id === cur ? 'selected' : ''}" data-palette="${p.id}" aria-pressed="${p.id === cur ? 'true' : 'false'}">
            <span class="pal-hero" style="background:linear-gradient(135deg, ${p.hero[0]}, ${p.hero[1]} 55%, ${p.hero[2]})">
              <span class="pal-check">${icon('check')}</span>
              <span class="pal-modes" title="Chiaro e scuro">
                <i style="background:${p.light.bg};border-color:${p.light.tint}"></i>
                <i style="background:${p.dark.bg};border-color:${p.dark.tint}"></i>
              </span>
            </span>
            <span class="pal-dots">${p.sec.slice(0, 7).map((c) => html`<i style="background:${c}"></i>`)}</span>
            <span class="pal-name">${p.name}</span>
            <span class="pal-desc">${p.desc}</span>
          </button>`)}
      </div>`,
  }));
  const off = enhancePage(el);
  el.querySelector('.palette-grid').addEventListener('click', async (e) => {
    const card = e.target.closest('[data-palette]');
    if (!card) return;
    const id = card.dataset.palette;
    for (const c of el.querySelectorAll('.palette-card')) {
      const on = c === card;
      c.classList.toggle('selected', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    applyAppearance({ palette: id });
    await DB.metaSet('palette', id);
  });
  return off;
}

async function wipeAll() {
  const ok = await confirmDialog({
    title: 'Cancellare tutti i dati?',
    message: 'Saldi, movimenti, documenti e impostazioni verranno eliminati da questo dispositivo. Potrai recuperarli solo da un backup.',
    confirmLabel: 'Continua',
    destructive: true,
  });
  if (!ok) return;
  const typed = await promptSecret({
    title: 'Conferma la cancellazione',
    message: 'Scrivi CANCELLA per confermare.',
    placeholder: 'CANCELLA',
    type: 'text',
    autocomplete: 'off',
    submitLabel: 'Cancella tutto',
    validate: async (v) => (v.trim().toUpperCase() === 'CANCELLA' ? null : 'Scrivi CANCELLA per confermare.'),
  });
  if (typed == null) return;
  V.lock();
  await DB.wipe();
  location.replace(location.pathname);
}

// ---------------------------------------------------------------- Barra
function tabbarPage(el) {
  let off = null;

  const draw = () => {
    const s = getSettings();
    off?.();
    setHtml(el, page({
      title: 'Barra delle sezioni',
      back: BACK,
      large: false,
      body: html`
        <p class="page-intro">Trascina ${icon('grip', 'inline-icon')} per scegliere quali sezioni tenere nella barra e in che ordine. Quelle nell'ultimo gruppo restano in «Altro».</p>
        <div class="drag-list" role="list">
          ${s.tabOrder.map((id) => {
            const sec = sectionById(id);
            return html`<div class="drag-row" role="listitem" data-id="${id}">${rowIcon(sec.icon, sec.color)}<span class="row-label">${sec.title}</span><span class="drag-handle" aria-label="Trascina ${sec.title}">${icon('grip')}</span></div>`;
          })}
        </div>
        ${group({
          title: 'iPad e computer',
          rows: [
            html`<div class="row static"><span class="row-label">Sezioni nella barra</span>
              <div class="stepper">
                <button type="button" data-step="-1" aria-label="Meno" ${s.wideTabCount <= WIDE_TABS_MIN ? 'disabled' : ''}>−</button>
                <span>${s.wideTabCount}</span>
                <button type="button" data-step="1" aria-label="Più" ${s.wideTabCount >= WIDE_TABS_MAX ? 'disabled' : ''}>+</button>
              </div></div>`,
            html`<div class="row static"><span class="row-label">Posizione</span>${segmented('pos', [['bottom', 'In basso'], ['top', 'In alto']], s.widePosition)}</div>`,
          ],
          footer: `Su iPhone la barra mostra sempre ${PHONE_TABS} sezioni, in basso.`,
        })}
        ${group({ rows: buttonRow({ action: 'reset', label: 'Ripristina l\'ordine predefinito', tint: true }) })}`,
    }));
    off = enhancePage(el);

    const list = el.querySelector('.drag-list');
    markCuts(list, s.wideTabCount);
    wireDrag(list, () => markCuts(list, s.wideTabCount), async (order) => {
      await updateSettings({ tabOrder: order });
    });

    el.querySelectorAll('[data-step]').forEach((b) => {
      b.onclick = async () => {
        await updateSettings({ wideTabCount: s.wideTabCount + Number(b.dataset.step) });
        draw();
      };
    });
    wireSegmented(el, 'pos', (v) => updateSettings({ widePosition: v }));
    el.querySelector('[data-action=reset]').onclick = async () => {
      await updateSettings({ tabOrder: DEFAULT_SETTINGS.tabOrder, wideTabCount: DEFAULT_SETTINGS.wideTabCount });
      draw();
      toast('Ordine predefinito ripristinato');
    };
  };

  draw();
  return () => off?.();
}

// Divide visivamente l'elenco: barra su iPhone / in più su iPad e computer / in «Altro».
function markCuts(list, wideCount) {
  const rows = [...list.children];
  const ends = new Map();
  ends.set(PHONE_TABS - 1, wideCount > PHONE_TABS ? '↑ Barra su iPhone' : '↑ Barra su iPhone, iPad e computer');
  if (wideCount > PHONE_TABS) ends.set(wideCount - 1, '↑ In più su iPad e computer');
  rows.forEach((r, i) => {
    const label = ends.get(i);
    if (label && i < rows.length - 1) r.dataset.cut = label; else delete r.dataset.cut;
    r.classList.toggle('group-start', i === 0 || ends.has(i - 1));
    r.classList.toggle('group-end', i === rows.length - 1 || ends.has(i));
  });
}

// Riordino trascinando la maniglia (funziona con dito, mouse e penna).
function wireDrag(list, onMove, onDrop) {
  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    e.preventDefault();
    const row = handle.closest('.drag-row');
    const before = [...list.children].map((r) => r.dataset.id).join();
    const grab = e.clientY - row.getBoundingClientRect().top;
    handle.setPointerCapture(e.pointerId);
    row.classList.add('dragging');
    list.classList.add('is-dragging');

    const move = (ev) => {
      row.style.transform = '';
      let moved = true;
      while (moved) {
        moved = false;
        const next = row.nextElementSibling;
        const prev = row.previousElementSibling;
        if (next) {
          const r = next.getBoundingClientRect();
          if (ev.clientY > r.top + r.height / 2) { next.after(row); moved = true; continue; }
        }
        if (prev) {
          const r = prev.getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) { prev.before(row); moved = true; }
        }
      }
      onMove();
      const natural = row.getBoundingClientRect().top;
      row.style.transform = `translateY(${ev.clientY - grab - natural}px) scale(1.02)`;
    };

    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      row.style.transform = '';
      row.classList.remove('dragging');
      list.classList.remove('is-dragging');
      const order = [...list.children].map((r) => r.dataset.id);
      if (order.join() !== before) onDrop(order);
    };

    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
}

// ---------------------------------------------------------------- Sicurezza
function securityPage(el) {
  const bio = biometricName();
  let off = null;

  const draw = async () => {
    const [pk, canBio] = await Promise.all([V.getPasskey(), P.platformAvailable()]);
    const s = getSettings();
    off?.();
    setHtml(el, page({
      title: 'Sicurezza e sblocco',
      back: BACK,
      large: false,
      body: html`
        ${group({
          title: 'Sblocco',
          rows: [
            toggleRow({ name: 'bio', icon: 'faceid', color: 'var(--s2)', label: `Sblocca con ${bio}`, checked: !!pk, disabled: !canBio && !pk }),
            selectRow({
              name: 'autolock', icon: 'timer', color: 'var(--s4)', label: 'Blocco automatico', value: s.autoLockMinutes,
              options: [[1, 'Dopo 1 minuto'], [2, 'Dopo 2 minuti'], [3, 'Dopo 3 minuti'], [5, 'Dopo 5 minuti'], [10, 'Dopo 10 minuti'], [15, 'Dopo 15 minuti']],
            }),
            buttonRow({ action: 'lock', icon: 'lock', color: 'var(--s10)', label: 'Blocca ora' }),
          ],
          footer: canBio || pk
            ? `${bio[0].toUpperCase()}${bio.slice(1)} usa una passkey di questo dispositivo per aprire la chiave di cifratura. L'app si blocca anche quando ci torni dopo il tempo scelto.`
            : `${bio} non è disponibile in questo browser. Su iPhone serve iOS 18 o successivo e l'app aperta da Safari o dalla schermata Home.`,
        })}
        ${group({
          title: 'Password e recupero',
          rows: [
            buttonRow({ action: 'password', icon: 'key', color: 'var(--s1)', label: 'Cambia la password principale' }),
            buttonRow({ action: 'recovery', icon: 'shield', color: 'var(--s4)', label: 'Genera una nuova chiave di recupero' }),
          ],
          footer: 'La chiave di cifratura è protetta dalla password (PBKDF2, 600.000 iterazioni) e dalla chiave di recupero. Senza una delle due i dati non si possono leggere.',
        })}`,
    }));
    off = enhancePage(el);

    const bioToggle = el.querySelector('[data-toggle=bio]');
    bioToggle.onchange = async () => {
      if (bioToggle.checked) {
        bioToggle.disabled = true;
        try {
          await V.savePasskey(await P.register());
          toast(`${bio} attivato`);
        } catch (e) {
          if (e instanceof P.PrfUnsupportedError) {
            toast(`Questo browser non permette lo sblocco con ${bio}.`, { type: 'error', duration: 4500 });
          } else if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') {
            toast(`Attivazione non riuscita: ${e.message}`, { type: 'error' });
          }
        }
        draw();
      } else {
        const ok = await confirmDialog({
          title: `Disattivare ${bio}?`,
          message: 'Per sbloccare servirà la password principale. Puoi eliminare la passkey «Finanze» anche dalle password del dispositivo.',
          confirmLabel: 'Disattiva',
          destructive: true,
        });
        if (ok) { await V.removePasskey(); toast(`${bio} disattivato`); }
        draw();
      }
    };

    el.querySelector('[data-select=autolock]').onchange = (e) => updateSettings({ autoLockMinutes: Number(e.target.value) });
    el.querySelector('[data-action=lock]').onclick = lockNow;
    el.querySelector('[data-action=password]').onclick = changePasswordSheet;
    el.querySelector('[data-action=recovery]').onclick = async () => {
      const pw = await promptSecret({
        title: 'Nuova chiave di recupero',
        message: 'Inserisci la password principale per continuare.',
        validate: async (v) => ((await V.verifyPassword(v)) ? null : 'Password errata.'),
      });
      if (pw == null) return;
      const text = await V.newRecoveryKey();
      await showRecoveryKeySheet(text);
      toast('Ricordati di salvare un nuovo backup');
    };
  };

  draw();
  return () => off?.();
}

function changePasswordSheet() {
  const s = openSheet(html`
    <form class="dialog" novalidate>
      <h2>Cambia la password</h2>
      <input type="text" name="username" value="Finanze" autocomplete="username" hidden>
      <label class="field"><input class="text" type="password" name="current" placeholder="Password attuale" autocomplete="current-password" required></label>
      ${newPasswordFields()}
      <p class="form-error" hidden></p>
      <div class="dialog-actions">
        <button type="submit" class="btn" disabled>Cambia password</button>
        <button type="button" class="btn secondary" data-cancel>Annulla</button>
      </div>
    </form>`);
  const form = s.el.querySelector('form');
  const btn = form.querySelector('[type=submit]');
  const err = form.querySelector('.form-error');
  const getPw = wireNewPassword(form, (ok) => { btn.disabled = !ok; });
  form.querySelector('[data-cancel]').onclick = () => s.close(null);
  form.onsubmit = async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Verifica…';
    if (!(await V.verifyPassword(form.elements.current.value))) {
      err.textContent = 'La password attuale è errata.';
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Cambia password';
      form.classList.remove('shake');
      void form.offsetWidth;
      form.classList.add('shake');
      return;
    }
    await V.changePassword(getPw());
    s.close(true);
    toast('Password cambiata. Salva un nuovo backup per portarla sugli altri dispositivi.', { duration: 4500 });
  };
}

// ---------------------------------------------------------------- Backup
function backupPage(el) {
  let off = null;

  const draw = async () => {
    const [lastBackup, lastImport] = await Promise.all([DB.metaGet('lastBackupAt'), DB.metaGet('lastImportAt')]);
    off?.();
    setHtml(el, page({
      title: 'Backup',
      back: BACK,
      large: false,
      body: html`
        <div class="backup-actions">
          <button type="button" class="action-tile" data-action="save">
            <span class="tile-icon" style="--c:var(--s1)">${icon('cloud-up')}</span>
            <b>Salva backup</b><span>Esporta tutto in un file cifrato</span>
          </button>
          <button type="button" class="action-tile" data-action="load">
            <span class="tile-icon" style="--c:var(--s2)">${icon('cloud-down')}</span>
            <b>Aggiorna file</b><span>Unisci il backup più recente</span>
          </button>
        </div>
        <input type="file" accept="application/json,.json" data-file hidden>
        ${group({
          title: 'Stato',
          rows: [
            infoRow({ label: 'Backup salvato', detail: lastBackup ? formatShort(lastBackup) : 'Mai' }),
            infoRow({ label: 'Aggiornato da file', detail: lastImport ? formatShort(lastImport) : 'Mai' }),
          ],
        })}
        ${group({
          title: 'Come sincronizzare i dispositivi',
          rows: html`<div class="row static prose">
            <ol>
              <li>Sul dispositivo dove hai fatto le modifiche tocca <b>Salva backup</b> e scegli <b>Salva in File › iCloud Drive</b> (per esempio in una cartella «Finanze»).</li>
              <li>Sull'altro dispositivo tocca <b>Aggiorna file</b> e scegli il backup più recente.</li>
              <li>Se lo stesso dato è stato cambiato su entrambi, vince la modifica più recente.</li>
            </ol>
          </div>`,
          footer: 'Il file è cifrato: né Apple né altri possono leggerlo senza la tua password o la chiave di recupero. Su un nuovo dispositivo, al primo avvio scegli «Ripristina da un backup».',
        })}`,
    }));
    off = enhancePage(el);

    const input = el.querySelector('[data-file]');
    el.querySelector('[data-action=save]').onclick = (e) => doSave(e.currentTarget, draw);
    el.querySelector('[data-action=load]').onclick = () => input.click();
    input.onchange = async () => {
      const file = input.files[0];
      input.value = '';
      if (file) await doImport(file);
      draw();
    };
  };

  draw();
  return () => off?.();
}

async function doSave(btn, redraw) {
  btn.disabled = true;
  try {
    const r = await B.saveBackup();
    if (r.saved) toast(r.downloaded ? 'Backup scaricato' : 'Backup salvato');
    else if (r.needsTap) offerShare(r.file, redraw);
  } catch (e) {
    console.error(e);
    toast(`Backup non riuscito: ${e.message}`, { type: 'error' });
  } finally {
    btn.disabled = false;
    redraw();
  }
}

function offerShare(file, redraw) {
  const s = openSheet(html`
    <div class="dialog">
      <h2>Backup pronto</h2>
      <p>Tocca il pulsante, scegli «Salva in File» e poi iCloud Drive.</p>
      <div class="dialog-actions">
        <button type="button" class="btn" data-share>Salva in File</button>
        <button type="button" class="btn secondary" data-cancel>Annulla</button>
      </div>
    </div>`);
  s.el.querySelector('[data-cancel]').onclick = () => s.close(null);
  s.el.querySelector('[data-share]').onclick = async () => {
    try {
      await B.shareFile(file);
      s.close(true);
      toast('Backup salvato');
      redraw();
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message, { type: 'error' });
    }
  };
}

async function doImport(file) {
  try {
    const obj = await B.readBackup(file);
    let res = await B.importBackup(obj);
    if (res.needsPassword) {
      const pw = await promptSecret({
        title: 'Backup di un altro archivio',
        message: 'Questo file è stato creato con un archivio diverso. Inserisci la sua password per unire i dati.',
        validate: async (v) => {
          try {
            res = await B.importBackup(obj, v);
            return null;
          } catch (e) {
            return e instanceof V.WrongSecretError ? 'Password errata.' : e.message;
          }
        },
      });
      if (pw == null) return;
    }
    const nothing = !res.added && !res.updated && !res.keysUpdated;
    await alertDialog({
      title: nothing ? 'Già aggiornato' : 'File aggiornato',
      message: `Backup del ${formatDateTime(res.backupDate)}.`,
      body: nothing ? html`<p>Questo dispositivo aveva già tutti i dati del backup.</p>` : html`
        <ul class="result-list">
          <li><b>${res.added}</b> elementi nuovi</li>
          <li><b>${res.updated}</b> elementi aggiornati</li>
          ${res.conflicts ? html`<li><b>${res.conflicts}</b> modificati su entrambi i dispositivi: tenuta la versione più recente</li>` : ''}
          ${res.keysUpdated ? html`<li>Password e chiave di recupero aggiornate da quelle dell'altro dispositivo</li>` : ''}
        </ul>`,
    });
  } catch (e) {
    console.error(e);
    toast(e.message, { type: 'error', duration: 4000 });
  }
}
