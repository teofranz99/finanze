// Avvisi: creazione dei promemoria con Comandi Rapidi, «Ricordamelo più tardi»,
// impostazioni (modalità predefinita, ora, nome del Comando Rapido) e guida passo passo.

import { html, setHtml } from '../util.js';
import { icon } from '../ui/icons.js';
import { page, enhancePage } from '../ui/page.js';
import { group, buttonRow, navRow, toggleRow, selectRow, segmented, wireSegmented } from '../ui/list.js';
import { openSheet, alertDialog, toast } from '../ui/sheet.js';
import * as R from '../reminders.js';
import * as S from '../store.js';
import { IMPORT_FREQS } from '../data/deadlines.js';
import { today, addDays, addMonths, fmtLong } from '../dates.js';

const isLocalDev = () => ['localhost', '127.0.0.1'].includes(location.hostname);
const hasShortcuts = () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

// Crea l'avviso con Comandi Rapidi oppure con un file calendario (.ics), secondo le impostazioni.
// `repeat` vale solo per il file calendario (l'evento si ripete da solo).
// Restituisce false se non è partito, altrimenti { recurring }.
export async function schedule({ title, date, mode, repeat = null }) {
  const when = date < today() ? today() : date;
  if (R.alertSettings().via === 'ics') {
    const text = R.buildIcs({ title, date: when, repeat });
    if (isLocalDev() && !hasShortcuts()) window.__lastIcs = text;
    else R.openIcs(text);
    toast(repeat ? `Evento dal ${fmtLong(when)}, si ripete da solo` : `Evento per il ${fmtLong(when)}`);
    return { recurring: !!repeat };
  }
  if (!hasShortcuts() && !isLocalDev()) {
    await alertDialog({
      title: 'Serve iPhone, iPad o Mac',
      message: 'I promemoria si creano con l\'app Comandi Rapidi di Apple. Da qui puoi comunque vedere tutte le scadenze nell\'app.',
    });
    return false;
  }
  // In prova sul computer (localhost) il link non viene aperto: si scrive solo nella console.
  const url = isLocalDev() && !hasShortcuts() ? R.shortcutUrl({ title, date: when, mode }) : R.runShortcut({ title, date: when, mode });
  if (isLocalDev()) {
    window.__lastShortcut = { url, payload: R.payload({ title, date: when, mode }) };
    console.info('Comando Rapido:', url);
  }
  toast(`Apro Comandi Rapidi · ${fmtLong(when)}`);
  return { recurring: false };
}

export const usesIcs = () => R.alertSettings().via === 'ics';

// Scelta della modalità per un singolo avviso: '' = quella predefinita.
export function modeOptions() {
  const def = R.modeById(R.alertSettings().mode);
  return [['', `Predefinita (${def.label})`], ...R.MODES.map((m) => [m.id, m.label])];
}

// «Ricordamelo più tardi»: domani, tra una settimana, il mese prossimo o una data.
export function laterPicker({ title = 'Ricordamelo più tardi' } = {}) {
  const t = today();
  const opts = [
    ['d', 'Domani', addDays(t, 1)],
    ['w', 'Tra una settimana', addDays(t, 7)],
    ['m', 'Il mese prossimo', addMonths(t, 1)],
  ];
  const s = openSheet(html`
    <div class="dialog picker">
      <h2>${title}</h2>
      <div class="list">
        ${opts.map(([k, l, d]) => html`<button type="button" class="row" data-d="${d}"><span class="row-label">${l}<small>${fmtLong(d)}</small></span></button>`)}
        <label class="row"><span class="row-label">Una data precisa</span><input class="text date-inline" type="date" min="${addDays(t, 1)}" data-date></label>
      </div>
      <div class="dialog-actions"><button type="button" class="btn" data-ok disabled>Conferma la data</button></div>
    </div>`);
  const dateIn = s.el.querySelector('[data-date]');
  const ok = s.el.querySelector('[data-ok]');
  dateIn.addEventListener('input', () => { ok.disabled = !dateIn.value; });
  ok.onclick = () => s.close(dateIn.value || null);
  s.el.addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) s.close(b.dataset.d); });
  return s.closed;
}

// ---------------------------------------------------------------- Impostazioni
const BACK = { href: 'impostazioni', label: 'Impostazioni' };

export function alertsSettingsPage(el, rest) {
  if (rest[1] === 'guida') return guidePage(el);
  let off = null;
  const draw = () => {
    off?.();
    const st = R.alertSettings();
    setHtml(el, page({
      title: 'Avvisi e promemoria',
      back: BACK,
      large: false,
      body: html`
        <p class="page-intro">L'app non ha un server e non può mandare notifiche da sola: gli avvisi diventano eventi nel Calendario o promemoria nei Promemoria di iPhone. Nei titoli non ci sono mai importi.</p>
        <section class="group">
          <h3 class="group-title">Come creo gli avvisi</h3>
          <div class="seg-wrap">${segmented('via', [['shortcuts', 'Comandi Rapidi'], ['ics', 'File calendario']], st.via)}</div>
          <p class="group-footer">${st.via === 'ics'
            ? 'Ogni avviso è un file .ics: toccalo e scegli «Aggiungi al calendario». Non serve preparare niente e gli avvisi che si ripetono (rinnovi, bollo, estratti conto) si creano una volta sola. Vanno solo nel Calendario, con notifica, non nei Promemoria. Se disdici un abbonamento, cancella l\'evento dal Calendario.'
            : 'Un Comando Rapido crea l\'evento e/o il promemoria, con le quattro modalità qui sotto. Va preparato una volta sola (circa 10 minuti).'}</p>
        </section>
        ${group({
          rows: [
            st.via === 'ics' ? '' : navRow({ href: '#/impostazioni/avvisi/guida', icon: 'sparkles', color: 'var(--s4)', label: 'Come creare il Comando Rapido' }),
            buttonRow({ action: 'test', icon: 'check', color: 'var(--s2)', label: 'Prova adesso', detail: 'domani' }),
          ],
          footer: st.via === 'ics' ? 'La prova crea l\'evento «Prova Finanze» per domani.' : 'La prova crea «Prova Finanze» per domani: se lo trovi nel Calendario o nei Promemoria, funziona.',
        })}
        ${st.via === 'ics' ? '' : html`<section class="group">
          <h3 class="group-title">Modalità predefinita</h3>
          <div class="list">${R.MODES.map((m) => html`
            <button type="button" class="row" data-mode="${m.id}">
              <span class="row-label">${m.label}<small>${m.desc}</small></span>
              ${m.id === st.mode ? html`<span class="row-check">${icon('check')}</span>` : ''}
            </button>`)}</div>
          <p class="group-footer">Ogni abbonamento o scadenza può usarne un'altra.</p>
        </section>`}
        ${group({
          title: 'Dettagli',
          rows: [
            html`<label class="row"><span class="row-label">Ora degli avvisi</span><input class="text time-inline" type="time" value="${st.hour}" data-hour></label>`,
            st.via === 'ics' ? '' : html`<label class="row"><span class="row-label">Nome del Comando Rapido</span><input class="text name-inline" value="${st.shortcut}" data-shortcut autocapitalize="words"></label>`,
            toggleRow({ name: 'names', label: 'Nome del servizio nel titolo', checked: st.namesInTitle }),
          ],
          footer: `Spento: «Rinnovo abbonamento». Acceso: «Rinnovo abbonamento: Spotify».${st.via === 'ics' ? '' : ' Il nome del Comando Rapido deve essere identico a quello in Comandi Rapidi.'}`,
        })}
        ${group({
          title: 'Estratti conto',
          rows: selectRow({ name: 'importEvery', label: 'Ricordami di caricarli', value: st.importEvery, options: IMPORT_FREQS.filter(([v]) => v !== 'custom') }),
          footer: 'Vale per i conti senza una frequenza propria. La puoi cambiare per ogni banca in Scadenze.',
        })}`,
    }));
    off = enhancePage(el);
    el.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => R.updateAlertSettings({ mode: b.dataset.mode }); });
    el.querySelector('[data-hour]').addEventListener('change', (e) => { if (e.target.value) R.updateAlertSettings({ hour: e.target.value }); });
    el.querySelector('[data-shortcut]')?.addEventListener('change', (e) => R.updateAlertSettings({ shortcut: e.target.value.trim() || R.DEFAULT_ALERTS.shortcut }));
    wireSegmented(el, 'via', (v) => R.updateAlertSettings({ via: v }));
    el.querySelector('[data-toggle=names]').addEventListener('change', (e) => R.updateAlertSettings({ namesInTitle: e.target.checked }));
    el.querySelector('[data-select=importEvery]').addEventListener('change', (e) => R.updateAlertSettings({ importEvery: e.target.value }));
    el.querySelector('[data-action=test]').onclick = () => schedule({ title: 'Prova Finanze', date: addDays(today(), 1) });
  };
  draw();
  const unsub = S.subscribe((c) => { if (c === 'settings' || c === '*') draw(); });
  return () => { off?.(); unsub(); };
}

// Guida per creare il Comando Rapido «Finanze Promemoria».
function guidePage(el) {
  const name = R.alertSettings().shortcut;
  const k = (s) => html`<code>${s}</code>`;
  setHtml(el, page({
    title: 'Comando Rapido',
    back: { href: 'impostazioni/avvisi', label: 'Avvisi' },
    large: false,
    body: html`
      <p class="page-intro">Si crea una volta sola, in circa 10 minuti, nell'app <b>Comandi Rapidi</b> di iPhone. Finanze gli passa titolo, data e dove creare l'avviso; il Comando Rapido crea l'evento e/o il promemoria. I nomi delle azioni possono cambiare un poco tra le versioni di iOS: se non ne trovi una, cerca la parola indicata.</p>

      <section class="group"><h3 class="group-title">1 · Crea il comando</h3><div class="list"><div class="row prose"><ol>
        <li>Apri <b>Comandi Rapidi</b> e tocca <b>+</b> in alto a destra.</li>
        <li>Tocca il nome in alto › <b>Rinomina</b> e scrivi esattamente ${k(name)}.</li>
      </ol></div></div></section>

      <section class="group"><h3 class="group-title">2 · Leggi i dati che manda Finanze</h3><div class="list"><div class="row prose"><ol>
        <li>Cerca «dizionario» e aggiungi <b>Ottieni dizionario da</b>. Tocca il campo blu e scegli <b>Input comando rapido</b>. Se in cima compare «Ricevi … input da», lascialo com'è.</li>
        <li>Aggiungi <b>Ottieni valore dizionario</b>: «Ottieni <b>Valore</b> per ${k('titolo')} in <b>Dizionario</b>». Subito dopo aggiungi <b>Imposta variabile</b> e chiamala ${k('Titolo')}.</li>
        <li>Ripeti con la chiave ${k('data')}; poi aggiungi <b>Ottieni date da</b> (cerca «date») sul Valore appena letto e <b>Imposta variabile</b> ${k('Quando')}.</li>
        <li>Ripeti con la chiave ${k('note')} → variabile ${k('Nota')}.</li>
        <li>Ripeti con la chiave ${k('calendario')} → variabile ${k('Calendario')}, e con ${k('promemoria')} → variabile ${k('Promemoria')}.</li>
      </ol><p class="muted small">Ogni volta che aggiungi «Ottieni valore dizionario», controlla che l'ultimo campo sia la variabile <b>Dizionario</b> del primo passo.</p></div></div></section>

      <section class="group"><h3 class="group-title">3 · Evento nel Calendario</h3><div class="list"><div class="row prose"><ol>
        <li>Aggiungi <b>Se</b>: «Se <b>Calendario</b> <b>è</b> ${k('notifica')}».</li>
        <li>Dentro il «Se» aggiungi <b>Aggiungi nuovo evento</b>: titolo <b>Titolo</b>, inizio <b>Quando</b>, fine <b>Quando</b>. Tocca la freccia per vedere tutti i campi: <b>Avviso</b> = «All'ora dell'evento», <b>Note</b> = <b>Nota</b>.</li>
        <li>Aggiungi un altro <b>Se</b>: «Se <b>Calendario</b> <b>è</b> ${k('silenzioso')}» con dentro un altro <b>Aggiungi nuovo evento</b> uguale, ma <b>Avviso</b> = «Nessuno».</li>
      </ol></div></div></section>

      <section class="group"><h3 class="group-title">4 · Promemoria</h3><div class="list"><div class="row prose"><ol>
        <li>Aggiungi <b>Se</b>: «Se <b>Promemoria</b> <b>è</b> ${k('notifica')}» con dentro <b>Aggiungi nuovo promemoria</b>: titolo <b>Titolo</b>, attiva l'avviso (<b>Ricordamelo</b> / «Avviso») alla data <b>Quando</b>, note <b>Nota</b>.</li>
        <li>Aggiungi un altro <b>Se</b>: «Se <b>Promemoria</b> <b>è</b> ${k('silenzioso')}» con dentro <b>Aggiungi nuovo promemoria</b> con solo titolo e note, senza avviso.</li>
        <li>Tocca <b>Fine</b>.</li>
      </ol><p class="muted small">Se userai sempre una sola modalità bastano i «Se» che servono, ma conviene farli tutti e quattro: così puoi cambiare modalità quando vuoi.</p></div></div></section>

      <section class="group"><h3 class="group-title">5 · Prova</h3><div class="list"><div class="row prose"><ol>
        <li>Torna in Finanze › Impostazioni › Avvisi e promemoria › <b>Prova adesso</b>.</li>
        <li>La prima volta iPhone chiede il permesso di aprire Comandi Rapidi e di usare Calendario e Promemoria: tocca <b>Consenti</b> (se chiede «Consenti sempre», scegli quello).</li>
        <li>Controlla che «Prova Finanze» sia nel Calendario o nei Promemoria di domani, all'ora scelta. Poi puoi cancellarlo.</li>
      </ol></div></div></section>

      <section class="group"><h3 class="group-title">Quando arriva l'avviso</h3><div class="list"><div class="row prose">
        <p>Apri Finanze: in Abbonamenti (e in Home) trovi «Da decidere» con <b>Proseguo</b>, <b>Ricordamelo più tardi</b> e <b>Ho già disdetto</b>; in Scadenze trovi le scadenze vicine e gli estratti conto da caricare. Il link nell'evento non può aprire direttamente l'app installata sulla schermata Home, per questo la nota dice solo di aprire Finanze.</p>
      </div></div></section>`,
  }));
  return enhancePage(el);
}
