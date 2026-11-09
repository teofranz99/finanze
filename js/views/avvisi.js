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
            : 'Un Comando Rapido crea l\'evento e/o il promemoria. Va preparato una volta sola, in circa 5 minuti: la guida qui sotto ti dice cosa toccare.'}</p>
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
              <span class="row-label">${m.label}<small>${m.desc} Comando Rapido: «${m.shortcut}».</small></span>
              ${m.id === st.mode ? html`<span class="row-check">${icon('check')}</span>` : ''}
            </button>`)}</div>
          <p class="group-footer">Ogni abbonamento o scadenza può usarne un'altra, ma per ogni modalità che usi serve il suo Comando Rapido.</p>
        </section>`}
        ${group({
          title: 'Dettagli',
          rows: [
            html`<label class="row"><span class="row-label">Ora degli avvisi</span><input class="text time-inline" type="time" value="${st.hour}" data-hour></label>`,
            toggleRow({ name: 'names', label: 'Nome del servizio nel titolo', checked: st.namesInTitle }),
          ],
          footer: 'Spento: «Rinnovo abbonamento». Acceso: «Rinnovo abbonamento: Spotify».',
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
    wireSegmented(el, 'via', (v) => R.updateAlertSettings({ via: v }));
    el.querySelector('[data-toggle=names]').addEventListener('change', (e) => R.updateAlertSettings({ namesInTitle: e.target.checked }));
    el.querySelector('[data-select=importEvery]').addEventListener('change', (e) => R.updateAlertSettings({ importEvery: e.target.value }));
    el.querySelector('[data-action=test]').onclick = () => schedule({ title: 'Prova Finanze', date: addDays(today(), 1) });
  };
  draw();
  const unsub = S.subscribe((c) => { if (c === 'settings' || c === '*') draw(); });
  return () => { off?.(); unsub(); };
}

// Guida per creare il Comando Rapido della modalità scelta: solo i passi che servono,
// un tocco per riga.
function guidePage(el) {
  let modeId = R.alertSettings().mode;
  let off = null;
  const b = (t) => html`<b>${t}</b>`;
  const k = (t) => html`<code>${t}</code>`;

  // Passi per un'azione «Aggiungi nuovo evento» o «Aggiungi nuovo promemoria».
  function actionSteps(kind, alert) {
    if (kind === 'evento') {
      return [
        html`Tocca di nuovo la barra ${b('Cerca azioni')}, scrivi ${k('evento')} e tocca ${b('Aggiungi nuovo evento')}.`,
        html`Nel nuovo riquadro tocca la parola blu del titolo (per esempio «Evento»). Sopra la tastiera compaiono dei pulsanti: tocca ${b('Input comando rapido')}.`,
        html`Tocca la data di ${b('Inizio')} e scegli ${b('Date')} (è il risultato della prima azione). Se non la vedi: tieni premuto sul campo › ${b('Seleziona variabile')} › tocca il riquadro «Ottieni date» più in alto.`,
        html`Fai lo stesso per la data di ${b('Fine')}.`,
        html`Tocca la freccia ${b('⌄')} del riquadro per vedere tutte le opzioni, poi ${b('Avviso')} › ${alert ? b("All'ora dell'evento") : b('Nessuno')}.`,
      ];
    }
    return [
      html`Tocca di nuovo la barra ${b('Cerca azioni')}, scrivi ${k('promemoria')} e tocca ${b('Aggiungi nuovo promemoria')}.`,
      html`Nel nuovo riquadro tocca la parola blu del titolo (per esempio «Promemoria») e, sopra la tastiera, tocca ${b('Input comando rapido')}.`,
      alert
        ? html`Tocca la freccia ${b('⌄')} del riquadro, attiva ${b('Avviso')} (su alcune versioni si chiama «Ricordamelo»), tocca la data e scegli ${b('Date')}.`
        : html`Lascia l'avviso spento: sarà un promemoria scritto, senza notifica.`,
    ];
  }

  function draw() {
    off?.();
    const m = R.modeById(modeId);
    const steps = [
      html`Apri l'app ${b('Comandi Rapidi')} (icona con due quadrati colorati). Se non c'è, è gratis nell'App Store.`,
      html`In basso tocca ${b('Comandi Rapidi')}, poi ${b('+')} in alto a destra. Si apre un comando vuoto.`,
      html`Tocca il nome in alto («Nuovo comando rapido») › ${b('Rinomina')} › scrivi esattamente ${k(m.shortcut)} › ${b('Fine')}.`,
      html`In basso tocca la barra ${b('Cerca azioni')} e scrivi ${k('date')}. Tocca l'azione che inizia con ${b('Ottieni date')} (per esempio «Ottieni date da input»).`,
      html`Nel riquadro tocca la parola blu (di solito «Input») e scegli ${b('Input comando rapido')}. Se in cima compare una riga «Ricevi … input da …», lasciala com'è.`,
      ...m.steps.flatMap(([kind, alert]) => actionSteps(kind, alert)),
      html`Tocca ${b('Fine')} (o ✓) in alto a destra. Il comando è pronto.`,
    ];
    setHtml(el, page({
      title: 'Comando Rapido',
      back: { href: 'impostazioni/avvisi', label: 'Avvisi' },
      large: false,
      body: html`
        <p class="page-intro">Finanze manda al Comando Rapido un testo come «Rinnovo abbonamento – 01/12/2026 09:00». Il comando ne ricava la data e crea l'avviso. Va fatto una volta sola, in circa 5 minuti, sull'iPhone.</p>

        <section class="group">
          <h3 class="group-title">Per quale modalità?</h3>
          <div class="list">${R.MODES.map((x) => html`
            <button type="button" class="row" data-guide-mode="${x.id}">
              <span class="row-label">${x.label}<small>Comando: «${x.shortcut}»</small></span>
              ${x.id === modeId ? html`<span class="row-check">${icon('check')}</span>` : ''}
            </button>`)}</div>
          <p class="group-footer">È già scelta quella che usi. Se un giorno ne userai un'altra, crea anche il suo comando.</p>
        </section>

        <section class="group">
          <h3 class="group-title">Passi · ${m.label}</h3>
          <div class="list"><div class="row prose"><ol class="guide-steps">${steps.map((x) => html`<li>${x}</li>`)}</ol></div></div>
          <p class="group-footer">I nomi delle azioni possono cambiare un poco tra le versioni di iOS: se non trovi un'azione, cerca la parola indicata.</p>
        </section>

        <section class="group">
          <h3 class="group-title">Prova</h3>
          <div class="list"><div class="row prose"><ol>
            <li>Torna in Finanze › Impostazioni › Avvisi e promemoria e tocca ${b('Prova adesso')}.</li>
            <li>La prima volta iPhone chiede il permesso di usare Calendario o Promemoria: tocca ${b('Consenti')} (o «Consenti sempre»).</li>
            <li>Controlla che domani ci sia «Prova Finanze – …» all'ora scelta. Poi puoi cancellarlo.</li>
          </ol></div></div>
        </section>

        <section class="group">
          <h3 class="group-title">Quando arriva l'avviso</h3>
          <div class="list"><div class="row prose">
            <p>Apri Finanze dalla schermata Home: in Abbonamenti (e in Home) trovi «Da decidere» con ${b('Proseguo')}, ${b('Ricordamelo più tardi')} e ${b('Ho già disdetto')}; in Scadenze le scadenze vicine e gli estratti conto da caricare.</p>
          </div></div>
        </section>`,
    }));
    off = enhancePage(el);
    el.querySelectorAll('[data-guide-mode]').forEach((x) => { x.onclick = () => { modeId = x.dataset.guideMode; draw(); }; });
  }
  draw();
  return () => off?.();
}
