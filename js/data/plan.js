// Spendibile e previsione di fine mese.
//
// Spendibile = saldi dei conti «spendibili» − fondi vincolati su quei conti − accantonamenti
//              (− uscite fisse ancora da pagare nel mese, se l'opzione è attiva).
// Previsione = spendibile senza uscite fisse − spese variabili previste fino a fine mese
//              − uscite fisse ancora da pagare + stipendio atteso.

import * as M from './model.js';
import * as F from './funds.js';
import * as Sub from './subs.js';
import * as Res from './reserves.js';
import { planSettings } from './plan-settings.js';
import { today, addDays, daysBetween, monthEnd, monthsBetween, fromIso } from '../dates.js';

export { planSettings, updatePlanSettings } from './plan-settings.js';

// Uscite fisse riconosciute senza essere abbonamenti (mutuo, bollette, assicurazioni).
const FIXED_CATS = new Set(['mutuo', 'bollette', 'assicurazioni', 'abbonamenti']);

export function spendable() {
  const w = M.wealth();
  const byAcc = F.restrictedByAccount();
  let fundsSpendable = 0;
  let fundsSavings = 0;
  for (const [accId, cents] of byAcc) {
    const role = accId ? (M.account(accId)?.role || 'spendibile') : 'spendibile';
    if (role === 'risparmio') fundsSavings += cents;
    else if (role === 'spendibile') fundsSpendable += cents;
  }
  const reserves = Res.totals().reserved;
  const settings = planSettings();
  const fixed = settings.subtractFixed ? fixedLeft().total : 0;
  const base = w.spendable - fundsSpendable - reserves;
  return {
    accounts: w.spendable,
    funds: fundsSpendable,
    reserves,
    fixed,
    base,
    value: base - fixed,
    savings: w.savings - fundsSavings,
    restrictedFunds: fundsSpendable + fundsSavings,
  };
}

// ---------------------------------------------------------------- Uscite fisse del mese
function paidThisMonth(key, from) {
  return M.txs().some((t) => t.date >= from && t.cents < 0 && Sub.groupKey(t) === key);
}

// Uscite fisse ancora da pagare entro fine mese: abbonamenti che si rinnovano (non accantonati)
// e addebiti mensili ricorrenti di mutuo, bollette e assicurazioni non ancora arrivati.
export function fixedLeft(at = today()) {
  const end = monthEnd(at);
  const from = `${at.slice(0, 7)}-01`;
  const reservedSubs = new Set(Res.all().map((r) => r.subId).filter(Boolean));
  const items = [];
  const subKeys = new Set();
  for (const s of Sub.active()) {
    subKeys.add(s.key);
    if (reservedSubs.has(s.id) || s.trial) continue;
    const next = Sub.nextRenewal(s);
    if (next && next >= at && next <= end) items.push({ name: s.name, cents: s.amountCents, date: next, kind: 'abbonamento' });
  }
  // Addebiti mensili: pagati in almeno 2 dei 3 mesi precedenti e non ancora in questo mese.
  const since = `${addDays(from, -95).slice(0, 7)}-01`;
  const groups = new Map();
  for (const t of M.txs()) {
    if (t.date < since || t.date >= from || t.cents >= 0 || t.splits?.length || t.fundId) continue;
    if (!FIXED_CATS.has(t.categoryId)) continue;
    const k = Sub.groupKey(t);
    if (subKeys.has(k)) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  for (const [k, list] of groups) {
    const months = new Set(list.map((t) => t.date.slice(0, 7)));
    const last = list.sort((a, b) => b.date.localeCompare(a.date))[0];
    if (months.size < 2 || monthsBetween(last.date, at) > 1 || paidThisMonth(k, from)) continue;
    const day = Math.min(Number(last.date.slice(8)), Number(end.slice(8)));
    const date = `${at.slice(0, 7)}-${String(day).padStart(2, '0')}`;
    items.push({ name: M.displayName(last), cents: -last.cents, date: date < at ? at : date, kind: 'ricorrente' });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  return { items, total: items.reduce((a, x) => a + x.cents, 0) };
}

// ---------------------------------------------------------------- Spese variabili
function isFixed(t, subList) {
  if (FIXED_CATS.has(t.categoryId)) return true;
  return !!Sub.subForTx(t, subList);
}

// Spesa variabile al giorno: media degli ultimi 90 giorni (o dei giorni disponibili);
// senza storico, il ritmo del mese in corso.
export function dailyVariable(at = today()) {
  const subList = Sub.all();
  const first = M.txs().reduce((m, t) => (t.date < m ? t.date : m), '9999');
  const sumVar = (from, to) => {
    let s = 0;
    for (const t of M.txs()) {
      if (t.date < from || t.date > to || isFixed(t, subList)) continue;
      for (const p of M.myParts(t)) {
        if (M.kindOf({ ...t, categoryId: p.categoryId, cents: p.cents }) === 'spesa') s -= p.cents;
      }
    }
    return Math.max(0, s);
  };
  const yesterday = addDays(at, -1);
  const from = addDays(at, -90);
  const start = first > from ? first : from;
  const days = daysBetween(start, yesterday) + 1;
  if (first !== '9999' && days >= 21) return { rate: sumVar(start, yesterday) / days, basis: days };
  const monthFrom = `${at.slice(0, 7)}-01`;
  const d = Math.max(1, daysBetween(monthFrom, at) + 1);
  return { rate: sumVar(monthFrom, at) / d, basis: 0 };
}

// ---------------------------------------------------------------- Entrate attese
// Stipendio: se è arrivato il mese scorso e questo mese non ancora, lo aspetto.
export function expectedIncome(at = today()) {
  const from = `${at.slice(0, 7)}-01`;
  const prevFrom = `${addDays(from, -1).slice(0, 7)}-01`;
  const salary = (a, b) => M.txs().filter((t) => t.date >= a && t.date < b && t.categoryId === 'stipendio' && t.cents > 0);
  if (salary(from, '9999').length) return { items: [], total: 0 };
  const prev = salary(prevFrom, from);
  if (!prev.length) return { items: [], total: 0 };
  const cents = prev.reduce((a, t) => a + t.cents, 0);
  const last = prev.sort((a, b) => b.date.localeCompare(a.date))[0];
  const day = Math.min(Number(last.date.slice(8)), Number(monthEnd(at).slice(8)));
  return { items: [{ name: 'Stipendio', cents, date: `${at.slice(0, 7)}-${String(day).padStart(2, '0')}` }], total: cents };
}

// ---------------------------------------------------------------- Previsione
export function forecast(at = today()) {
  const sp = spendable();
  const end = monthEnd(at);
  const daysLeft = daysBetween(at, end);
  const v = dailyVariable(at);
  const variable = Math.round(v.rate * daysLeft);
  const fixed = fixedLeft(at);
  const income = expectedIncome(at);
  const endCents = sp.base - variable - fixed.total + income.total;
  // Saldo di riferimento più vecchio tra i conti spendibili (l'ultimo import).
  const asOf = M.accounts().filter((a) => (a.role || 'spendibile') === 'spendibile' && a.balance?.asOf)
    .map((a) => a.balance.asOf).sort((a, b) => a - b)[0] || null;
  return {
    start: sp.base,
    variable,
    dailyRate: Math.round(v.rate),
    basisDays: v.basis,
    fixed,
    income,
    endCents,
    daysLeft,
    end,
    asOf,
    monthName: new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(fromIso(at)),
  };
}
