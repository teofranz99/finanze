// Abbonamenti: riconoscimento automatico (servizi noti e pagamenti ricorrenti), rinnovi,
// costi mensili e annuali, avvisi e controllo degli addebiti dopo la disdetta.
//
// Record nella collezione 'subs':
// { id, name, key, amountCents, freq, customDays, anchorDate, accountId, areaId,
//   status: 'attivo' | 'chiuso' | 'scartato', trial, closedAt, ackTxIds,
//   alert: { on, daysBefore, mode, scheduledFor, handledFor, snooze: { for, until } },
//   source: 'auto' | 'manuale', createdAt }
// `key` lega l'abbonamento ai movimenti: il nome scelto (alias) o il servizio noto,
// altrimenti l'esercente (più l'importo, per PayPal e simili).

import * as S from '../store.js';
import * as M from './model.js';
import { normalizeKey } from '../import/analyze.js';
import { uid } from '../util.js';
import { today, addDays, addMonths, daysBetween, maxIso } from '../dates.js';

export const FREQS = [
  { id: 'settimanale', label: 'Settimanale', days: 7 },
  { id: 'mensile', label: 'Mensile', months: 1 },
  { id: 'bimestrale', label: 'Bimestrale', months: 2 },
  { id: 'trimestrale', label: 'Trimestrale', months: 3 },
  { id: 'semestrale', label: 'Semestrale', months: 6 },
  { id: 'annuale', label: 'Annuale', months: 12 },
  { id: 'personalizzata', label: 'Personalizzata' },
];
const freqById = (id) => FREQS.find((f) => f.id === id) || FREQS[1];

export function freqLabel(s) {
  if (s.freq === 'personalizzata') return `Ogni ${s.customDays || 30} giorni`;
  return freqById(s.freq).label;
}

// Intervalli (in giorni) accettati per ogni frequenza.
const RANGES = [
  ['settimanale', 5, 9],
  ['mensile', 25, 36],
  ['bimestrale', 54, 68],
  ['trimestrale', 83, 99],
  ['semestrale', 168, 196],
  ['annuale', 345, 385],
];
function freqFromDays(d) {
  const r = RANGES.find(([, lo, hi]) => d >= lo && d <= hi);
  return r ? r[0] : null;
}
const inRange = (freq, d) => { const r = RANGES.find((x) => x[0] === freq); return r && d >= r[1] && d <= r[2]; };

export function periodDays(s) {
  const f = freqById(s.freq);
  if (s.freq === 'personalizzata') return Math.max(1, Number(s.customDays) || 30);
  return f.days || f.months * 30.44;
}

export function addPeriods(iso, s, k) {
  const f = freqById(s.freq);
  if (f.months) return addMonths(iso, f.months * k);
  return addDays(iso, Math.round(periodDays(s)) * k);
}

// Costo riportato al mese e all'anno.
export function monthlyCents(s) {
  const f = freqById(s.freq);
  if (f.months) return Math.round(s.amountCents / f.months);
  return Math.round((s.amountCents * 365.25) / 12 / periodDays(s));
}
export function yearlyCents(s) {
  const f = freqById(s.freq);
  if (f.months) return Math.round((s.amountCents * 12) / f.months);
  return Math.round((s.amountCents * 365.25) / periodDays(s));
}

// ---------------------------------------------------------------- Servizi noti
// Parola cercata (maiuscola, parola intera) → nome da mostrare.
const KNOWN = [
  ['NETFLIX', 'Netflix'], ['SPOTIFY', 'Spotify'], ['DISNEY', 'Disney+'], ['DISNEYPLUS', 'Disney+'],
  ['AMAZON PRIME', 'Amazon Prime'], ['PRIME VIDEO', 'Amazon Prime'], ['AMZN PRIME', 'Amazon Prime'], ['PRIMEVIDEO', 'Amazon Prime'],
  ['ICLOUD', 'iCloud'], ['APPLE.COM/BILL', 'Apple'], ['APPLE COM BILL', 'Apple'], ['APPLE MUSIC', 'Apple Music'], ['APPLE TV', 'Apple TV+'],
  ['YOUTUBE', 'YouTube Premium'], ['DAZN', 'DAZN'], ['NOW TV', 'NOW'], ['NOWTV', 'NOW'], ['SKY', 'Sky'],
  ['CHATGPT', 'ChatGPT'], ['OPENAI', 'ChatGPT'], ['ANTHROPIC', 'Claude'], ['CLAUDE.AI', 'Claude'],
  ['AUDIBLE', 'Audible'], ['KINDLE UNLIMITED', 'Kindle Unlimited'], ['STORYTEL', 'Storytel'],
  ['GOOGLE ONE', 'Google One'], ['GOOGLE STORAGE', 'Google One'], ['MICROSOFT 365', 'Microsoft 365'], ['MICROSOFT*365', 'Microsoft 365'],
  ['ADOBE', 'Adobe'], ['PATREON', 'Patreon'], ['TIDAL', 'Tidal'], ['DEEZER', 'Deezer'], ['PARAMOUNT', 'Paramount+'],
  ['CRUNCHYROLL', 'Crunchyroll'], ['PLAYSTATION PLUS', 'PlayStation Plus'], ['XBOX GAME PASS', 'Xbox Game Pass'],
  ['DROPBOX', 'Dropbox'], ['NORDVPN', 'NordVPN'], ['DUOLINGO', 'Duolingo'], ['LINKEDIN', 'LinkedIn'],
  ['ILIAD', 'Iliad'], ['TIM', 'TIM'], ['VODAFONE', 'Vodafone'], ['WINDTRE', 'WindTre'], ['WIND TRE', 'WindTre'],
  ['FASTWEB', 'Fastweb'], ['HO MOBILE', 'ho. Mobile'], ['VERY MOBILE', 'Very Mobile'], ['KENA', 'Kena Mobile'],
  ['POSTEMOBILE', 'PosteMobile'], ['COOPVOCE', 'CoopVoce'], ['LYCAMOBILE', 'Lycamobile'],
  ['MCFIT', 'McFit'], ['VIRGIN ACTIVE', 'Virgin Active'], ['ANYTIME FITNESS', 'Anytime Fitness'], ['PALESTRA', 'Palestra'], ['FITNESS', 'Palestra'],
];
const rxCache = new Map();
function hasWord(text, word) {
  if (!rxCache.has(word)) {
    const esc = normalizeKey(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rxCache.set(word, new RegExp(`(^|[^A-Z0-9])${esc}([^A-Z0-9]|$)`));
  }
  return rxCache.get(word).test(text);
}

export function knownService(t) {
  const text = t.alias ? normalizeKey(t.alias) : `${normalizeKey(t.merchant)} ${normalizeKey(t.description)}`;
  const hit = KNOWN.find(([w]) => hasWord(text, w));
  return hit ? hit[1] : null;
}

// Chiave che raggruppa i pagamenti dello stesso abbonamento.
// I movimenti salvati sono oggetti nuovi a ogni modifica: la chiave si può ricordare per oggetto.
const keyMemo = new WeakMap();
export function groupKey(t) {
  if (keyMemo.has(t)) return keyMemo.get(t);
  const name = t.alias || knownService(t);
  let k;
  if (name) k = `N:${normalizeKey(name)}`;
  else {
    const mk = M.merchantKey(t.merchant);
    k = M.isIntermediary(t.merchant) ? `M:${mk}#${Math.abs(t.cents)}` : `M:${mk}`;
  }
  keyMemo.set(t, k);
  return k;
}
export const keyForName = (name) => `N:${normalizeKey(name)}`;

// ---------------------------------------------------------------- Lettura
export const all = () => S.list('subs');
export const sub = (id) => S.get('subs', id);
export const active = () => all().filter((s) => s.status === 'attivo');
export const closed = () => all().filter((s) => s.status === 'chiuso');

const near = (a, b, tol = 0.35) => Math.abs(a - b) <= Math.max(a, b) * tol;

// Spese che possono essere abbonamenti (niente giroconti, investimenti, mutuo, banca).
const EXCLUDED_CATS = new Set(['mutuo', 'banca', 'contanti', 'giroconto', 'investimenti', 'finanziamenti', 'straordinarie']);
function candidateTx(t) {
  return t.cents < 0 && !t.splits?.length && !EXCLUDED_CATS.has(t.categoryId) && M.kindOf(t) === 'spesa';
}

// L'abbonamento a cui appartiene un movimento (tra quelli con la stessa chiave, l'importo più vicino).
export function subForTx(t, list = all()) {
  if (t.cents >= 0) return null;
  const k = groupKey(t);
  const abs = Math.abs(t.cents);
  let best = null;
  for (const s of list) {
    if (s.status === 'scartato' || s.key !== k || !near(abs, s.amountCents)) continue;
    if (!best || Math.abs(s.amountCents - abs) < Math.abs(best.amountCents - abs)) best = s;
  }
  return best;
}

// Pagamenti di un abbonamento, dal più recente.
export function payments(s) {
  const list = all();
  return M.txs().filter((t) => t.cents < 0 && groupKey(t) === s.key && subForTx(t, list)?.id === s.id)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// Variazioni di prezzo: ogni pagamento diverso dal precedente.
export function priceChanges(list) {
  const asc = [...list].reverse();
  const out = [];
  for (let i = 1; i < asc.length; i++) {
    const d = Math.abs(asc[i].cents) - Math.abs(asc[i - 1].cents);
    if (d) out.push({ date: asc[i].date, from: Math.abs(asc[i - 1].cents), to: Math.abs(asc[i].cents), diff: d });
  }
  return out;
}

// Prossimo rinnovo: dall'ultimo pagamento (o dalla data impostata a mano) in avanti.
export function nextRenewal(s, pays = null) {
  const last = (pays || payments(s))[0]?.date;
  const base = maxIso(s.anchorDate, last);
  if (!base) return null;
  const t = today();
  // Una data scelta a mano può essere oggi; un pagamento di oggi invece vuol dire «già rinnovato».
  const fromPayment = last && (!s.anchorDate || last >= s.anchorDate);
  if (fromPayment ? base > t : base >= t) return base;
  let k = 1;
  let d = addPeriods(base, s, k);
  while (d < t && k < 2000) d = addPeriods(base, s, ++k);
  return d;
}

// ---------------------------------------------------------------- Totali
export function totals() {
  const list = active();
  const t = today();
  const limit = addDays(t, 30);
  const upcoming = list.map((s) => ({ s, next: nextRenewal(s) }))
    .filter((x) => x.next && x.next <= limit)
    .sort((a, b) => a.next.localeCompare(b.next));
  return {
    count: list.length,
    monthly: list.reduce((a, s) => a + monthlyCents(s), 0),
    yearly: list.reduce((a, s) => a + yearlyCents(s), 0),
    upcoming,
    upcomingCents: upcoming.reduce((a, x) => a + x.s.amountCents, 0),
  };
}

// ---------------------------------------------------------------- Riconoscimento
function clusterByAmount(items) {
  const sorted = [...items].sort((a, b) => Math.abs(a.cents) - Math.abs(b.cents));
  const out = [];
  for (const t of sorted) {
    const c = out[out.length - 1];
    if (c && Math.abs(t.cents) <= Math.abs(c[0].cents) * 1.15) c.push(t); else out.push([t]);
  }
  return out;
}

const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s.-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).trim();

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

// Valuta un gruppo di pagamenti: restituisce una proposta, oppure null.
export function evaluate(key, items) {
  const byDate = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const days = [...new Set(byDate.map((t) => t.date))];
  const intervals = days.slice(1).map((d, i) => daysBetween(days[i], d));
  const med = median(intervals);
  let freq = intervals.length ? freqFromDays(med) : null;
  const regular = freq && intervals.filter((d) => inRange(freq, d)).length >= Math.ceil(intervals.length * 0.7);
  const last = byDate[byDate.length - 1];
  const known = knownService(last);
  const inCat = items.some((t) => t.categoryId === 'abbonamenti');
  const sameAmount = items.every((t) => t.cents === last.cents);
  let reason = null;
  if (days.length >= 3 && regular) reason = 'ricorrente';
  // Con due soli pagamenti serve lo stesso importo e un intervallo di almeno un mese
  // (due spese uguali a una settimana di distanza sono spesso un caso).
  else if (days.length === 2 && regular && sameAmount && freq !== 'settimanale') reason = 'ricorrente';
  else if (known) reason = 'noto';
  else if (inCat) reason = 'categoria';
  if (!reason) return null;
  if (!regular) freq = days.length >= 2 && freq ? freq : 'mensile';
  // Pagamenti fermi da più di due periodi più qualche giorno: probabilmente è finito.
  const tmp = { freq, amountCents: Math.abs(last.cents) };
  if (daysBetween(last.date, today()) > periodDays(tmp) * 2 + 10) return null;
  const cat = M.category(last.categoryId);
  return {
    key,
    name: last.alias || known || titleCase(last.merchant),
    amountCents: Math.abs(last.cents),
    freq,
    lastDate: last.date,
    count: days.length,
    accountId: last.accountId,
    areaId: last.areaId || cat?.areaId || 'abbonamenti',
    reason,
  };
}

// Proposte: gruppi riconosciuti che non sono già abbonamenti (confermati o scartati).
export function proposals() {
  const subs = all();
  const groups = new Map();
  for (const t of M.txs()) {
    if (!candidateTx(t)) continue;
    const k = groupKey(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const out = [];
  for (const [key, items] of groups) {
    for (const cluster of clusterByAmount(items)) {
      const amt = Math.abs(cluster[cluster.length - 1].cents);
      if (subs.some((s) => s.key === key && near(s.amountCents, amt))) continue;
      const p = evaluate(key, cluster);
      if (p) out.push(p);
    }
  }
  const rank = { noto: 0, ricorrente: 1, categoria: 2 };
  return out.sort((a, b) => rank[a.reason] - rank[b.reason] || b.amountCents - a.amountCents);
}

// Proposta per un singolo movimento («Questo è un abbonamento»).
export function guessFromTx(t) {
  const key = groupKey(t);
  const abs = Math.abs(t.cents);
  const same = M.txs().filter((x) => x.cents < 0 && groupKey(x) === key && near(Math.abs(x.cents), abs, 0.15));
  const p = evaluate(key, same.length ? same : [t]);
  const cat = M.category(t.categoryId);
  return {
    key,
    name: t.alias || knownService(t) || titleCase(t.merchant),
    amountCents: abs,
    freq: p?.freq || 'mensile',
    lastDate: maxIso(...same.map((x) => x.date), t.date),
    accountId: t.accountId,
    areaId: t.areaId || cat?.areaId || 'abbonamenti',
  };
}

// ---------------------------------------------------------------- Scrittura
export function newSub(p) {
  return {
    id: uid(),
    name: p.name,
    key: p.key || keyForName(p.name),
    amountCents: p.amountCents,
    freq: p.freq || 'mensile',
    customDays: p.customDays || null,
    anchorDate: p.anchorDate || p.lastDate || null,
    accountId: p.accountId || null,
    areaId: p.areaId ?? 'abbonamenti',
    status: p.status || 'attivo',
    trial: !!p.trial,
    closedAt: null,
    ackTxIds: [],
    alert: { on: false, daysBefore: 3, scheduledFor: null, handledFor: null, snooze: null },
    source: p.source || 'manuale',
    createdAt: Date.now(),
  };
}

export const save = (s) => S.put('subs', s.id, s);
export const remove = (id) => S.remove('subs', id);

export async function confirmProposal(p) {
  const s = newSub({ ...p, source: 'auto' });
  await save(s);
  return s;
}

export async function dismissProposal(p) {
  await save(newSub({ ...p, status: 'scartato', source: 'auto' }));
}

// ---------------------------------------------------------------- Avvisi
// Stato dell'avviso per il prossimo rinnovo: quando scatta, se è da decidere, se è nel Calendario.
export function alertState(s) {
  if (s.status !== 'attivo' || !s.alert?.on) return null;
  const next = nextRenewal(s);
  if (!next) return null;
  const a = s.alert;
  const alertDate = addDays(next, -(a.daysBefore ?? 3));
  const snoozed = a.snooze && a.snooze.for === next ? a.snooze.until : null;
  const due = snoozed || alertDate;
  const handled = a.handledFor === next;
  return {
    next,
    alertDate,
    due,
    snoozed,
    handled,
    pending: !handled && today() >= due,
    // Con il file calendario l'evento si ripete da solo: vale per tutti i rinnovi.
    scheduled: (a.recurring && !snoozed) || a.scheduledFor === next || a.scheduledFor === `${next}@${snoozed}`,
  };
}

export const pendingAlerts = () => active().map((s) => ({ s, st: alertState(s) })).filter((x) => x.st?.pending);

// Addebiti arrivati dopo la disdetta e non ancora visti.
export function chargesAfterClosure(s) {
  if (s.status !== 'chiuso' || !s.closedAt) return [];
  return payments(s).filter((t) => t.date > s.closedAt && !(s.ackTxIds || []).includes(t.id));
}
export const closureAlarms = () => closed().map((s) => ({ s, txs: chargesAfterClosure(s) })).filter((x) => x.txs.length);
