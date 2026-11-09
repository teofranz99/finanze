// Avvisi: creazione degli eventi nel Calendario (file .ics), «Ricordamelo più tardi»
// e impostazioni (ora degli avvisi, nome nel titolo, estratti conto).

import { html, setHtml } from '../util.js';
import { page, enhancePage } from '../ui/page.js';
import { group, buttonRow, toggleRow, selectRow } from '../ui/list.js';
import { openSheet, toast } from '../ui/sheet.js';
import * as R from '../reminders.js';
import * as S from '../store.js';
import { IMPORT_FREQS } from '../data/deadlines.js';
import { today, addDays, addMonths, fmtLong } from '../dates.js';

// In prova sul computer (localhost) il file non viene aperto: resta in window.__lastIcs.
const isLocalDev = () => ['localhost', '127.0.0.1'].includes(location.hostname)
  && !/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

// Crea l'evento nel Calendario. Con `repeat` l'evento si ripete da solo.
// Restituisce { recurring }.
export async function schedule({ title, date, repeat = null }) {
  const when = date < today() ? today() : date;
  const text = R.buildIcs({ title, date: when, repeat });
  if (isLocalDev()) window.__lastIcs = text;
  else R.openIcs(text);
  toast(repeat ? `Evento dal ${fmtLong(when)}, si ripete da solo` : `Evento per il ${fmtLong(when)}`);
  return { recurring: !!repeat };
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

export function alertsSettingsPage(el) {
  let off = null;
  const draw = () => {
    off?.();
    const st = R.alertSettings();
    setHtml(el, page({
      title: 'Avvisi',
      back: BACK,
      large: false,
      body: html`
        <p class="page-intro">L'app non ha un server e non può mandare notifiche da sola: ogni avviso diventa un evento nel Calendario, con notifica. Quando lo crei si apre un'anteprima: tocca «Aggiungi al calendario». Gli avvisi che si ripetono (rinnovi, bollo, estratti conto) si aggiungono una volta sola. Nei titoli non ci sono mai importi.</p>
        ${group({
          rows: buttonRow({ action: 'test', icon: 'check', color: 'var(--s2)', label: 'Prova adesso', detail: 'domani' }),
          footer: 'La prova crea l\'evento «Prova Finanze» per domani. Se disdici un abbonamento, cancella il suo evento dal Calendario.',
        })}
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
    el.querySelector('[data-hour]').addEventListener('change', (e) => { if (e.target.value) R.updateAlertSettings({ hour: e.target.value }); });
    el.querySelector('[data-toggle=names]').addEventListener('change', (e) => R.updateAlertSettings({ namesInTitle: e.target.checked }));
    el.querySelector('[data-select=importEvery]').addEventListener('change', (e) => R.updateAlertSettings({ importEvery: e.target.value }));
    el.querySelector('[data-action=test]').onclick = () => schedule({ title: 'Prova Finanze', date: addDays(today(), 1) });
  };
  draw();
  const unsub = S.subscribe((c) => { if (c === 'settings' || c === '*') draw(); });
  return () => { off?.(); unsub(); };
}
