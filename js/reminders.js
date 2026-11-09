// Avvisi nel Calendario di iPhone con un file calendario (.ics).
// Senza server l'app non può mandare notifiche: ogni avviso è un evento con notifica che
// il Calendario aggiunge con un tocco, e che può ripetersi da solo (es. ogni mese).
// I titoli sono minimi e senza importi.

import * as S from './store.js';

export const DEFAULT_ALERTS = {
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

// ---------------------------------------------------------------- File calendario (.ics)
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
