// Scadenze: scadenzario (bollo, assicurazione, revisione, garanzie, bollette…), documenti
// personali e promemoria per caricare gli estratti conto.
//
// Record nella collezione 'deadlines':
// { id, kind, doc, title, date, leadDays, repeatMonths, note, doneAt, reminder: { scheduledFor }, snooze, createdAt }
// Dei documenti si salva solo la data di scadenza: mai numeri o altri dati.

import * as S from '../store.js';
import * as M from './model.js';
import { uid } from '../util.js';
import { today, addDays, addMonths, maxIso, toIso } from '../dates.js';

export const KINDS = [
  { id: 'bollo', label: 'Bollo auto', icon: 'car', color: 'var(--s10)', lead: 21, repeat: 12, cal: 'Scadenza bollo' },
  { id: 'assicurazione', label: 'Assicurazione', icon: 'shield', color: 'var(--s5)', lead: 30, repeat: 12, cal: 'Scadenza assicurazione' },
  { id: 'revisione', label: 'Revisione', icon: 'car', color: 'var(--s1)', lead: 30, repeat: 24, cal: 'Revisione auto' },
  { id: 'garanzia', label: 'Garanzia', icon: 'shield', color: 'var(--s4)', lead: 30, repeat: 0, cal: 'Scadenza garanzia' },
  { id: 'bolletta', label: 'Bolletta', icon: 'bolt', color: 'var(--s4)', lead: 7, repeat: 0, cal: 'Scadenza bolletta' },
  { id: 'altro', label: 'Altro', icon: 'calendar', color: 'var(--s8)', lead: 14, repeat: 0, cal: 'Scadenza' },
];
export const DOCS = [
  { id: 'cie', label: 'Carta d\'identità', icon: 'users', color: 'var(--s2)', lead: 120 },
  { id: 'patente', label: 'Patente', icon: 'car', color: 'var(--s5)', lead: 90 },
  { id: 'tessera', label: 'Tessera sanitaria', icon: 'pulse', color: 'var(--s8)', lead: 60 },
  { id: 'passaporto', label: 'Passaporto', icon: 'plane', color: 'var(--s7)', lead: 120 },
];
export const kindById = (id) => KINDS.find((k) => k.id === id) || KINDS[KINDS.length - 1];
export const docById = (id) => DOCS.find((d) => d.id === id);

export function meta(d) {
  if (d.kind === 'documento') {
    const doc = docById(d.doc) || DOCS[0];
    return { ...doc, cal: 'Rinnovo documento' };
  }
  return kindById(d.kind);
}
export const titleOf = (d) => d.title || meta(d).label;

export const REPEATS = [[0, 'Una volta'], [12, 'Ogni anno'], [24, 'Ogni 2 anni'], [6, 'Ogni 6 mesi'], [1, 'Ogni mese']];

export const all = () => S.list('deadlines');
export const get = (id) => S.get('deadlines', id);
export const docDeadline = (docId) => all().find((d) => d.kind === 'documento' && d.doc === docId) || null;
export const open = () => all().filter((d) => !d.doneAt && d.date).sort((a, b) => a.date.localeCompare(b.date));
export const done = () => all().filter((d) => d.doneAt).sort((a, b) => b.date.localeCompare(a.date));

export function newDeadline(p) {
  const m = p.kind === 'documento' ? docById(p.doc) : kindById(p.kind);
  return {
    id: uid(),
    kind: p.kind,
    doc: p.doc || null,
    title: p.title || '',
    date: p.date || null,
    leadDays: p.leadDays ?? m.lead,
    repeatMonths: p.repeatMonths ?? (m.repeat || 0),
    note: p.note || '',
    doneAt: null,
    reminder: { scheduledFor: null },
    snooze: null,
    createdAt: Date.now(),
  };
}

export const save = (d) => S.put('deadlines', d.id, d);
export const remove = (id) => S.remove('deadlines', id);

// Quando avvisare: qualche settimana (o mese, per i documenti) prima.
export const remindDate = (d) => maxIso(addDays(d.date, -(d.leadDays || 0)), today());

// Stato: da fare (siamo nel periodo di preavviso o oltre), scaduta, promemoria creato.
export function state(d) {
  if (!d.date || d.doneAt) return null;
  const t = today();
  const notice = addDays(d.date, -(d.leadDays || 0));
  const snoozed = d.snooze && d.snooze.for === d.date && d.snooze.until > t ? d.snooze.until : null;
  return {
    notice,
    expired: d.date < t,
    due: !snoozed && t >= notice,
    snoozed,
    scheduled: d.reminder?.scheduledFor === d.date || (!!d.reminder?.recurring && !!d.repeatMonths),
  };
}

// «Fatto»: se si ripete passa alla prossima scadenza, altrimenti va tra le passate.
export async function markDone(d) {
  if (d.repeatMonths) {
    await save({ ...d, date: addMonths(d.date, d.repeatMonths), reminder: { scheduledFor: null, recurring: !!d.reminder?.recurring }, snooze: null });
  } else {
    await save({ ...d, doneAt: Date.now() });
  }
}

// ---------------------------------------------------------------- Estratti conto
export const IMPORT_FREQS = [
  ['off', 'Mai'],
  ['giorno', 'Ogni giorno'],
  ['settimana', 'Ogni settimana'],
  ['mese', 'Ogni mese'],
  ['trimestre', 'Ogni 3 mesi'],
  ['custom', 'Personalizzata'],
];
export const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

// Impostazioni del promemoria di un conto (quelle predefinite se non scelte).
export function importPlan(a, defaultEvery = 'mese') {
  const r = a.importReminder || {};
  return { every: r.every || defaultEvery, days: r.days || 30, day: r.day ?? null, snooze: r.snooze || null, scheduledFor: r.scheduledFor || null, recurring: !!r.recurring };
}

// Prossima data in cui caricare i file: dopo l'ultimo caricamento, seguendo la frequenza
// (e il giorno scelto, se c'è).
export function importDue(a, plan) {
  if (plan.every === 'off') return null;
  const last = a.lastImportAt ? toIso(new Date(a.lastImportAt)) : null;
  if (!last) return today();
  if (plan.day == null || plan.every === 'giorno' || plan.every === 'custom') {
    const step = { giorno: 1, settimana: 7, custom: plan.days }[plan.every];
    if (step) return addDays(last, step);
    return addMonths(last, plan.every === 'trimestre' ? 3 : 1);
  }
  if (plan.every === 'settimana') {
    let d = addDays(last, 1);
    for (let i = 0; i < 7 && new Date(`${d}T12:00:00`).getDay() !== Number(plan.day); i++) d = addDays(d, 1);
    return d;
  }
  // Mensile o trimestrale in un giorno fisso del mese: il primo giorno scelto dopo
  // l'ultimo caricamento (per i 3 mesi, dopo almeno due mesi).
  const months = plan.every === 'trimestre' ? 3 : 1;
  const from = addMonths(last, months - 1);
  for (let k = 0; k <= 2; k++) {
    const first = addMonths(`${from.slice(0, 7)}-01`, k);
    const lastDay = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0).getDate();
    const d = `${first.slice(0, 8)}${String(Math.min(Number(plan.day), lastDay)).padStart(2, '0')}`;
    if (d > from) return d;
  }
  return addMonths(last, months);
}

export function importState(a, defaultEvery) {
  const plan = importPlan(a, defaultEvery);
  const due = importDue(a, plan);
  if (!due) return { plan, due: null, late: false };
  const t = today();
  const snoozed = plan.snooze && plan.snooze.for === due && plan.snooze.until > t ? plan.snooze.until : null;
  return { plan, due, late: !snoozed && t >= due, snoozed, scheduled: plan.scheduledFor === due || !!plan.recurring };
}

export const importAccounts = () => M.accounts().filter((a) => a.type !== 'contanti');

export async function updateImportPlan(a, patch) {
  const cur = M.account(a.id);
  await S.put('accounts', a.id, { ...cur, importReminder: { ...(cur.importReminder || {}), ...patch } });
}
