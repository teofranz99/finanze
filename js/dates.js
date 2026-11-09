// Date in formato "aaaa-mm-gg" (senza fuso orario): somme di giorni e mesi, distanze, etichette.

const p = (n) => String(n).padStart(2, '0');

export const toIso = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
export function fromIso(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export const today = () => toIso(new Date());

export function addDays(iso, n) {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

// Somma mesi restando sull'ultimo giorno se il mese è più corto (31 gen + 1 mese = 28 feb).
export function addMonths(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1, 12);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d, last));
  return toIso(t);
}

// Mesi di calendario tra due date (gen → mar = 2), senza guardare il giorno.
export function monthsBetween(a, b) {
  const [ya, ma] = String(a).split('-').map(Number);
  const [yb, mb] = String(b).split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
export const monthEnd = (iso) => addDays(addMonths(`${String(iso).slice(0, 7)}-01`, 1), -1);

export const daysBetween = (a, b) => Math.round((fromIso(b) - fromIso(a)) / 86400000);
export const maxIso = (...xs) => xs.filter(Boolean).sort().pop() || null;

// "oggi", "domani", "tra 5 giorni", "3 giorni fa"…
export function relDays(iso) {
  const n = daysBetween(today(), iso);
  if (n === 0) return 'oggi';
  if (n === 1) return 'domani';
  if (n === -1) return 'ieri';
  if (n > 0) {
    if (n < 60) return `tra ${n} giorni`;
    const m = Math.round(n / 30.44);
    return m < 24 ? `tra ${m} mesi` : `tra ${Math.round(n / 365)} anni`;
  }
  if (n > -60) return `${-n} giorni fa`;
  const m = Math.round(-n / 30.44);
  return m < 24 ? `${m} mesi fa` : `${Math.round(-n / 365)} anni fa`;
}

const short = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
const shortY = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const long = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const monthY = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });

export const fmtShort = (iso) => (iso.slice(0, 4) === today().slice(0, 4) ? short : shortY).format(fromIso(iso));
export const fmtLong = (iso) => long.format(fromIso(iso));
export function fmtMonth(iso) {
  const s = monthY.format(fromIso(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
