// Budget mensili per area o per categoria, con avviso quando ci si avvicina al limite.
// Record nella collezione 'budgets': { id, scope: 'area' | 'categoria', refId, cents, createdAt }.
// La soglia dell'avviso (80% di default) è in settings/plan.warnPct.

import * as S from '../store.js';
import * as M from './model.js';
import { uid } from '../util.js';
import { today, addDays, addMonths, monthsBetween } from '../dates.js';
import { planSettings } from './plan-settings.js';

export const all = () => S.list('budgets');
export const budget = (id) => S.get('budgets', id);

export function target(b) {
  if (b.scope === 'area') {
    const a = M.area(b.refId);
    return a ? { name: a.name, icon: a.icon, color: a.color } : null;
  }
  const c = S.get('categories', b.refId);
  return c ? { name: c.name, icon: c.icon, color: c.color } : null;
}

export const monthStart = (iso = today()) => `${iso.slice(0, 7)}-01`;

// Spese mie del mese (solo la mia quota, niente fondi, niente straordinarie) per area o categoria.
export function spentByRef(from = monthStart(), to = today()) {
  const byArea = new Map();
  const byCat = new Map();
  for (const t of M.txs()) {
    if (t.date < from || t.date > to) continue;
    for (const p of M.myParts(t)) {
      if (M.kindOf({ ...t, categoryId: p.categoryId, cents: p.cents }) !== 'spesa') continue;
      const v = -p.cents;
      byCat.set(p.categoryId, (byCat.get(p.categoryId) || 0) + v);
      if (p.areaId) byArea.set(p.areaId, (byArea.get(p.areaId) || 0) + v);
    }
  }
  return { byArea, byCat };
}

// Stato di ogni budget nel mese in corso, dal più vicino al limite.
export function status() {
  const { byArea, byCat } = spentByRef();
  const warn = planSettings().warnPct / 100;
  return all().map((b) => {
    const t = target(b);
    if (!t) return null;
    const spent = Math.max(0, (b.scope === 'area' ? byArea : byCat).get(b.refId) || 0);
    const pct = b.cents > 0 ? spent / b.cents : 0;
    return { b, t, spent, left: b.cents - spent, pct, over: pct > 1, warn: pct >= warn && pct <= 1 };
  }).filter(Boolean).sort((x, y) => y.pct - x.pct);
}

export const alerts = () => status().filter((x) => x.over || x.warn);

export function newBudget(p) {
  return { id: uid(), scope: p.scope, refId: p.refId, cents: p.cents, createdAt: Date.now() };
}
export const save = (b) => S.put('budgets', b.id, b);
export const remove = (id) => S.remove('budgets', id);

// Media delle spese mensili degli ultimi 3 mesi completi (per suggerire un budget).
export function averageMonthly(scope, refId) {
  const to = addDays(monthStart(), -1);
  const first = M.txs().reduce((m, t) => (t.date < m ? t.date : m), '9999');
  if (first > to) return 0;
  const months = Math.max(1, Math.min(3, monthsBetween(first, to) + 1));
  const from = monthStart(addMonths(monthStart(), -months));
  const { byArea, byCat } = spentByRef(from, to);
  return Math.round(((scope === 'area' ? byArea : byCat).get(refId) || 0) / months);
}
