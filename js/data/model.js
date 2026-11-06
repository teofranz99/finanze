// Modello dei dati: conti, movimenti, categorie, aree, regole, e i calcoli comuni.
// Tutto è salvato cifrato tramite lo store.

import * as S from '../store.js';
import { uid } from '../util.js';
import { DEFAULT_AREAS, DEFAULT_CATEGORIES, CAUSALE_RULES, TEXT_RULES } from './defaults.js';
import { normalizeKey } from '../import/analyze.js';

// ---------------------------------------------------------------- Lettura
export const accounts = () => S.list('accounts').sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
export const account = (id) => S.get('accounts', id);
export const txs = () => S.list('tx');
export const tx = (id) => S.get('tx', id);
export const rules = () => S.list('rules').sort((a, b) => b.createdAt - a.createdAt);

export function categories() {
  return S.list('categories').sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
}
export const category = (id) => S.get('categories', id) || S.get('categories', 'nc') || DEFAULT_CATEGORIES.find((c) => c.id === 'nc');
export function areas() {
  return S.list('areas').sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
}
export const area = (id) => (id ? S.get('areas', id) : null);

// Al primo sblocco copia categorie e aree predefinite nell'archivio.
export async function ensureDefaults() {
  if (!S.list('areas').length) {
    await S.putMany('areas', DEFAULT_AREAS.map((a, i) => ({ ...a, order: i })));
  }
  if (!S.list('categories').length) {
    await S.putMany('categories', DEFAULT_CATEGORIES.map((c, i) => ({ ...c, order: i })));
  }
  // I prelievi sono un passaggio verso i contanti, non una spesa.
  const cash = S.get('categories', 'contanti');
  if (cash && cash.kind !== 'giroconto') await S.put('categories', 'contanti', { ...cash, kind: 'giroconto' });
}

// Il conto «Contanti» (creato al primo bisogno). Il suo saldo è: saldo iniziale
// + prelievi dagli altri conti + movimenti registrati a mano sul conto stesso.
export const cashAccount = () => accounts().find((a) => a.type === 'contanti') || null;

export async function ensureCashAccount() {
  let cash = cashAccount();
  if (!cash) {
    cash = {
      id: uid(), name: 'Contanti', type: 'contanti', role: 'spendibile', balanceMode: 'sum',
      openingCents: 0, currency: 'EUR', order: accounts().length, createdAt: Date.now(),
    };
    await S.put('accounts', cash.id, cash);
  }
  return cash;
}

// Prelievi che hanno alimentato i contanti (dagli altri conti).
function withdrawalsCents(cashId) {
  let sum = 0;
  for (const t of txs()) {
    if (t.accountId === cashId) continue;
    for (const p of parts(t)) if (p.categoryId === 'contanti') sum -= p.cents;
  }
  return sum;
}

// ---------------------------------------------------------------- Calcoli
export function kindOf(t) {
  const k = category(t.categoryId)?.kind || 'auto';
  if (k === 'auto') return t.cents >= 0 ? 'entrata' : 'spesa';
  return k;
}

// Le parti di un movimento: una sola, oppure quelle della divisione.
export function parts(t) {
  if (Array.isArray(t.splits) && t.splits.length) return t.splits;
  return [{ cents: t.cents, categoryId: t.categoryId, areaId: t.areaId }];
}

// Entrate e uscite: giroconti e investimenti non contano. Un rimborso in una categoria di spesa
// riduce le uscite.
export function totals(list) {
  let income = 0;
  let expense = 0;
  for (const t of list) {
    for (const p of parts(t)) {
      const k = kindOf({ ...t, categoryId: p.categoryId, cents: p.cents });
      if (k === 'entrata') income += p.cents;
      else if (k === 'spesa') expense -= p.cents;
    }
  }
  return { income, expense, net: income - expense };
}

export function byCategory(list) {
  const map = new Map();
  for (const t of list) {
    for (const p of parts(t)) {
      if (kindOf({ ...t, categoryId: p.categoryId, cents: p.cents }) !== 'spesa') continue;
      map.set(p.categoryId, (map.get(p.categoryId) || 0) - p.cents);
    }
  }
  return [...map.entries()].map(([id, cents]) => ({ id, cents })).filter((x) => x.cents > 0).sort((a, b) => b.cents - a.cents);
}

// Saldo calcolato senza il saldo iniziale (serve per impostare i contanti "in tasca adesso").
export function accountMovementsCents(a) {
  let sum = txs().filter((t) => t.accountId === a.id).reduce((s, t) => s + t.cents, 0);
  if (a.type === 'contanti') sum += withdrawalsCents(a.id);
  return sum;
}

export function accountBalance(a) {
  if (a.balanceMode === 'sum') return accountMovementsCents(a) + (a.openingCents || 0);
  return a.balance?.cents ?? 0;
}

export function wealth() {
  const list = accounts().map((a) => ({ account: a, cents: accountBalance(a) }));
  const sum = (role) => list.filter((x) => (x.account.role || 'spendibile') === role).reduce((s, x) => s + x.cents, 0);
  const spendable = sum('spendibile');
  const savings = sum('risparmio');
  const restricted = sum('vincolato');
  return { list, spendable, savings, restricted, total: spendable + savings };
}

// ---------------------------------------------------------------- Regole
function wordRegex(word) {
  const esc = normalizeKey(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9])${esc}([^A-Z0-9]|$)`);
}
const compiled = new Map();
function rx(word) {
  if (!compiled.has(word)) compiled.set(word, wordRegex(word));
  return compiled.get(word);
}

export const merchantKey = (m) => normalizeKey(m);

// Restituisce l'id della categoria (e l'area, se la regola la fissa) per un movimento.
export function classify(t) {
  const mk = merchantKey(t.merchant);
  for (const r of rules()) {
    if (r.pattern && mk.includes(r.pattern)) return { categoryId: r.categoryId, areaId: r.areaId ?? undefined, ruleId: r.id };
  }
  const causale = normalizeKey(t.causale);
  for (const r of CAUSALE_RULES) {
    if (r.words.some((w) => rx(w).test(causale))) return { categoryId: r.cat };
  }
  if (t.toSelf) return { categoryId: 'giroconto' };
  const text = `${mk} ${normalizeKey(t.description)}`;
  for (const r of TEXT_RULES) {
    if (r.words.some((w) => rx(w).test(text))) return { categoryId: r.cat };
  }
  return { categoryId: 'nc' };
}

// Applica la classificazione automatica, senza toccare le scelte fatte a mano.
export function autoClassify(t) {
  const next = { ...t, manual: { ...(t.manual || {}) } };
  if (!next.manual.category) {
    const c = classify(next);
    next.categoryId = c.categoryId;
    next.ruleId = c.ruleId || null;
    if (!next.manual.area) next.areaId = c.areaId !== undefined ? c.areaId : (category(c.categoryId)?.areaId ?? null);
  }
  return next;
}

// L'utente sceglie una categoria: l'area segue quella predefinita, se non è stata scelta a mano.
export function withCategory(t, categoryId) {
  const next = { ...t, categoryId, manual: { ...(t.manual || {}), category: true } };
  if (!next.manual.area) next.areaId = category(categoryId)?.areaId ?? null;
  return next;
}

export function withArea(t, areaId) {
  return { ...t, areaId, manual: { ...(t.manual || {}), area: true } };
}

// Crea (o aggiorna) la regola per un esercente e la applica ai movimenti non scelti a mano.
export async function saveRuleForMerchant(merchant, categoryId) {
  const pattern = merchantKey(merchant);
  if (!pattern) return 0;
  const existing = rules().find((r) => r.pattern === pattern);
  const rule = { id: existing?.id || uid(), pattern, label: merchant, categoryId, areaId: null, createdAt: Date.now() };
  await S.put('rules', rule.id, rule);
  const changed = txs()
    .filter((t) => !t.manual?.category && merchantKey(t.merchant).includes(pattern) && t.categoryId !== categoryId)
    .map((t) => autoClassify(t));
  await S.putMany('tx', changed);
  return changed.length;
}

export function similarCount(t, categoryId) {
  const key = merchantKey(t.merchant);
  if (!key) return 0;
  return txs().filter((x) => x.id !== t.id && !x.manual?.category && merchantKey(x.merchant).includes(key) && x.categoryId !== categoryId).length;
}

// Ricalcola tutti i movimenti non scelti a mano (dopo modifiche a regole o categorie).
export async function reclassifyAll() {
  const changed = [];
  for (const t of txs()) {
    if (t.manual?.category) continue;
    const n = autoClassify(t);
    if (n.categoryId !== t.categoryId || n.areaId !== t.areaId) changed.push(n);
  }
  await S.putMany('tx', changed);
  return changed.length;
}
