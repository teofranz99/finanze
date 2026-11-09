// Promemoria nel Calendario e nei Promemoria di iPhone, creati da un Comando Rapido.
// Senza server l'app non può mandare notifiche: apre Comandi Rapidi con un link
// shortcuts://run-shortcut e gli passa un testo semplice, per esempio
// «Rinnovo abbonamento – 01/12/2026 09:00». Il Comando Rapido ricava la data dal testo
// (azione «Ottieni date») e usa il testo come titolo. I titoli sono minimi e senza importi.
// C'è un Comando Rapido per ogni modalità, così ognuno ha solo 2 o 3 azioni.

import * as S from './store.js';
import { fromIso } from './dates.js';

// Le quattro modalità del brief: dove va la notifica e dove resta solo il promemoria scritto.
export const MODES = [
  { id: 'cal', label: 'Solo Calendario', desc: 'Un evento nel Calendario, con notifica.', shortcut: 'Finanze Calendario', steps: [['evento', true]] },
  { id: 'rem', label: 'Solo Promemoria', desc: 'Un promemoria, con notifica.', shortcut: 'Finanze Promemoria', steps: [['promemoria', true]] },
  { id: 'cal+rem', label: 'Calendario + notifica dai Promemoria', desc: 'Evento nel Calendario senza notifica; la notifica arriva dai Promemoria.', shortcut: 'Finanze Calendario e Promemoria', steps: [['evento', false], ['promemoria', true]] },
  { id: 'rem+cal', label: 'Promemoria + notifica dal Calendario', desc: "Promemoria scritto senza notifica; la notifica arriva dall'evento del Calendario.", shortcut: 'Finanze Promemoria e Calendario', steps: [['promemoria', false], ['evento', true]] },
];
export const modeById = (id) => MODES.find((m) => m.id === id) || MODES[0];

export const DEFAULT_ALERTS = {
  via: 'shortcuts',   // 'shortcuts' (Comandi Rapidi) oppure 'ics' (file calendario)
  mode: 'cal',
  hour: '09:00',
  namesInTitle: false,
  importEvery: 'mese',
};

export function alertSettings() {
  return { ...DEFAULT_ALERTS, ...(S.get('settings', 'alerts') || {}) };
}

export async function updateAlertSettings(patch) {
  await S.put('settings', 'alerts', { ...(S.get('settings', 'alerts') || {}), ...patch });
}

// Testo passato al Comando Rapido: titolo e data nel formato italiano "gg/mm/aaaa hh:mm".
export function payload({ title, date }) {
  const st = alertSettings();
  const d = fromIso(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${title} – ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${st.hour || '09:00'}`;
}

export function shortcutUrl(opts) {
  const m = modeById(opts.mode || alertSettings().mode);
  return `shortcuts://run-shortcut?name=${encodeURIComponent(m.shortcut)}&input=text&text=${encodeURIComponent(payload(opts))}`;
}

// Apre Comandi Rapidi. Restituisce il link (utile per le prove sul computer).
export function runShortcut(opts) {
  const url = shortcutUrl(opts);
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return url;
}

// ---------------------------------------------------------------- File calendario (.ics)
// Alternativa senza Comandi Rapidi: un evento con notifica che il Calendario importa con un tocco.
// Può ripetersi da solo (es. ogni mese), ma non crea promemoria nell'app Promemoria.
// `repeat`: { freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY', interval } oppure null.

const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function buildIcs({ title, date, repeat = null }) {
  const st = alertSettings();
  const [hh, mm] = (st.hour || '09:00').split(':');
  const day = date.replace(/-/g, '');
  const start = `${day}T${hh}${mm}00`;
  const endMin = Number(hh) * 60 + Number(mm) + 30;
  const end = `${day}T${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}${String(endMin % 60).padStart(2, '0')}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Finanze//Avvisi//IT',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@finanze`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icsText(title)}`,
    `DESCRIPTION:${icsText('Apri Finanze per decidere cosa fare.')}`,
  ];
  if (repeat) lines.push(`RRULE:FREQ=${repeat.freq}${repeat.interval > 1 ? `;INTERVAL=${repeat.interval}` : ''}`);
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, 'TRIGGER:PT0S', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

// Apre il file: su iPhone Safari mostra l'anteprima con «Aggiungi al calendario»,
// sul computer lo scarica.
export function openIcs(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'finanze-avviso.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Ripetizione da una frequenza in mesi o giorni.
export function repeatFromMonths(months) {
  if (!months) return null;
  return months % 12 === 0 ? { freq: 'YEARLY', interval: months / 12 } : { freq: 'MONTHLY', interval: months };
}
export function repeatFromDays(days) {
  if (!days) return null;
  return days % 7 === 0 ? { freq: 'WEEKLY', interval: days / 7 } : { freq: 'DAILY', interval: days };
}

// Titolo minimo: generico, oppure con il nome se l'utente lo preferisce. Mai importi.
export function titleFor(generic, name) {
  return alertSettings().namesInTitle && name ? `${generic}: ${name}` : generic;
}
