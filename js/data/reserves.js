// Accantonamenti per le spese grosse (bollo, assicurazione, regali di Natale, vacanze):
// ogni mese una quota viene messa da parte e tolta dallo spendibile, così quando arriva
// la spesa i soldi ci sono già.
//
// Record nella collezione 'reserves':
// { id, name, cents, due, repeatMonths, startedAt, icon, color, subId, deadlineId, createdAt }
// - due: data della prossima spesa; repeatMonths: 12 = ogni anno, 0 = una volta sola.
// - startedAt: da quando si comincia a mettere da parte (la creazione, o l'ultima scadenza).

import * as S from '../store.js';
import * as Sub from './subs.js';
import * as D from './deadlines.js';
import { uid } from '../util.js';
import { today, addMonths, monthsBetween } from '../dates.js';

export const all = () => S.list('reserves').sort((a, b) => (a.due || '').localeCompare(b.due || ''));
export const reserve = (id) => S.get('reserves', id);

// Periodo in corso: da quando a quando si mette da parte, quota mensile, quanto è già da parte.
export function period(r, at = today()) {
  let start = r.startedAt || at;
  let due = r.due;
  if (!due) return null;
  if (due < at) {
    if (!r.repeatMonths) return { start, due, months: 0, quota: 0, reserved: 0, done: true };
    while (due < at) { start = due; due = addMonths(due, r.repeatMonths); }
  }
  const months = Math.max(1, monthsBetween(start, due));
  const quota = Math.ceil(r.cents / months);
  // Il mese in corso conta già: la prima quota si mette da parte subito.
  const elapsed = Math.max(0, Math.min(months, monthsBetween(start, at) + 1));
  const reserved = Math.min(r.cents, quota * elapsed);
  return { start, due, months, quota, reserved, done: false, full: reserved >= r.cents };
}

export function totals() {
  let reserved = 0;
  let monthly = 0;
  for (const r of all()) {
    const p = period(r);
    if (!p || p.done) continue;
    reserved += p.reserved;
    if (!p.full) monthly += p.quota;
  }
  return { reserved, monthly };
}

// Spese grosse che conviene accantonare: abbonamenti annuali o semestrali e scadenze
// (bollo, assicurazione, revisione) non ancora accantonate.
export function suggestions() {
  const list = all();
  const out = [];
  for (const s of Sub.active()) {
    if (!['annuale', 'semestrale', 'trimestrale'].includes(s.freq) || list.some((r) => r.subId === s.id)) continue;
    const next = Sub.nextRenewal(s);
    if (!next) continue;
    const months = Sub.FREQS.find((f) => f.id === s.freq)?.months || 12;
    out.push({ name: s.name, cents: s.amountCents, due: next, repeatMonths: months, subId: s.id, icon: 'repeat', color: 'var(--s3)' });
  }
  for (const d of D.open()) {
    if (!['bollo', 'assicurazione', 'revisione'].includes(d.kind) || list.some((r) => r.deadlineId === d.id)) continue;
    const m = D.meta(d);
    out.push({ name: D.titleOf(d), cents: 0, due: d.date, repeatMonths: d.repeatMonths || 0, deadlineId: d.id, icon: m.icon, color: m.color });
  }
  return out;
}

export function newReserve(p) {
  return {
    id: uid(),
    name: p.name,
    cents: p.cents,
    due: p.due,
    repeatMonths: p.repeatMonths || 0,
    startedAt: p.startedAt || today(),
    icon: p.icon || 'sparkles',
    color: p.color || 'var(--s7)',
    subId: p.subId || null,
    deadlineId: p.deadlineId || null,
    createdAt: Date.now(),
  };
}
export const save = (r) => S.put('reserves', r.id, r);
export const remove = (id) => S.remove('reserves', id);

export const ICONS = ['sparkles', 'car', 'shield', 'gift', 'plane', 'house', 'heart', 'book', 'paw', 'repeat', 'bolt', 'pulse'];
