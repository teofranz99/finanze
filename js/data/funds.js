// Fondi vincolati: soldi che stanno sul conto ma non sono miei (anticipo aziendale, soldi
// da restituire, cassa comune di un viaggio).
//
// Record nella collezione 'funds':
// { id, name, owner, kind: 'fondo' | 'cassa', accountId, note, status: 'aperto' | 'chiuso', closedAt,
//   openingCents, openingDate, entries: [{ id, date, cents, type, note, receiptId }], createdAt }
// - openingCents: importo iniziale scritto a mano (se il bonifico non è tra i movimenti).
// - entries: ricariche (+) e restituzioni o spese (−) senza un movimento della banca.
// Movimenti collegati: t.fundId. Un'entrata collegata è un versamento nel fondo; un'uscita è
// una spesa pagata con il fondo (o una restituzione, se t.fundReturn). Nessuno dei due conta
// tra le mie entrate e uscite.

import * as S from '../store.js';
import * as M from './model.js';
import { uid } from '../util.js';
import { today } from '../dates.js';

export const all = () => S.list('funds').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
export const fund = (id) => (id ? S.get('funds', id) : null);
export const open = () => all().filter((f) => f.status !== 'chiuso');
export const closed = () => all().filter((f) => f.status === 'chiuso');

export const linkedTxs = (f) => M.txs().filter((t) => t.fundId === f.id);

const TYPE_LABEL = { versamento: 'Versamento', ricarica: 'Ricarica', spesa: 'Spesa', restituzione: 'Restituzione' };
export const typeLabel = (type) => TYPE_LABEL[type] || 'Movimento';

// Tutti i movimenti del fondo, dal più recente. `cents` è dal punto di vista del fondo:
// positivo = soldi entrati nel fondo, negativo = usciti.
export function ledger(f) {
  const rows = [];
  if (f.openingCents) {
    rows.push({ key: 'opening', date: f.openingDate || today(), cents: f.openingCents, type: 'versamento', label: 'Importo iniziale' });
  }
  for (const e of f.entries || []) {
    rows.push({ key: `e:${e.id}`, entryId: e.id, date: e.date, cents: e.cents, type: e.type, label: e.note || typeLabel(e.type), receiptId: e.receiptId || null });
  }
  for (const t of linkedTxs(f)) {
    const type = t.cents > 0 ? 'versamento' : t.fundReturn ? 'restituzione' : 'spesa';
    rows.push({ key: `t:${t.id}`, txId: t.id, date: t.date, cents: t.cents, type, label: M.displayName(t), receiptId: t.receiptId || null });
  }
  // L'importo iniziale viene prima di tutto, anche se scritto dopo le prime spese.
  const opening = rows.find((r) => r.key === 'opening');
  if (opening) opening.date = rows.reduce((m, r) => (r.date < m ? r.date : m), opening.date);
  return rows.sort((a, b) => b.date.localeCompare(a.date) || (a.key === 'opening') - (b.key === 'opening') || (b.cents - a.cents));
}

export function balance(f) {
  let inCents = 0;
  let spent = 0;
  let returned = 0;
  for (const r of ledger(f)) {
    if (r.cents > 0) inCents += r.cents;
    else if (r.type === 'restituzione') returned -= r.cents;
    else spent -= r.cents;
  }
  const remaining = inCents - spent - returned;
  return { inCents, spent, returned, remaining, pct: inCents > 0 ? Math.max(0, remaining) / inCents : 0 };
}

// Soldi non miei ancora sul conto, per conto ('' = conto non indicato).
export function restrictedByAccount() {
  const map = new Map();
  for (const f of open()) {
    const r = balance(f).remaining;
    if (r <= 0) continue;
    const k = f.accountId || '';
    map.set(k, (map.get(k) || 0) + r);
  }
  return map;
}
export const totalRestricted = () => [...restrictedByAccount().values()].reduce((a, b) => a + b, 0);

// Saldo reale di ogni conto con fondi: saldo, soldi non miei, disponibile mio.
export function realBalances() {
  const map = restrictedByAccount();
  return M.accounts().filter((a) => map.has(a.id)).map((a) => {
    const bal = M.accountBalance(a);
    const restricted = map.get(a.id);
    return { account: a, balance: bal, restricted, mine: bal - restricted };
  });
}

// Avvisi: fondo quasi finito (meno del 10% o già sotto zero) e conti in cui sto usando
// soldi non miei (disponibile mio sotto zero).
export function lowFunds() {
  return open().map((f) => ({ f, b: balance(f) })).filter(({ b }) => b.inCents > 0 && b.remaining < b.inCents * 0.1);
}
export const overdrawn = () => realBalances().filter((x) => x.mine < 0);

// ---------------------------------------------------------------- Scrittura
export function newFund(p) {
  return {
    id: uid(),
    name: p.name,
    owner: p.owner || '',
    kind: p.kind || 'fondo',
    accountId: p.accountId || null,
    note: p.note || '',
    status: 'aperto',
    closedAt: null,
    openingCents: p.openingCents || 0,
    openingDate: p.openingDate || today(),
    entries: [],
    createdAt: Date.now(),
  };
}

export const save = (f) => S.put('funds', f.id, f);

export async function remove(id) {
  const txs = M.txs().filter((t) => t.fundId === id).map((t) => ({ ...t, fundId: null, fundReturn: false }));
  await S.putMany('tx', txs);
  await S.remove('funds', id);
}

export async function linkTx(txId, fundId, { asReturn = false } = {}) {
  const t = M.tx(txId);
  if (!t) return;
  await S.put('tx', t.id, { ...t, fundId, fundReturn: t.cents < 0 && asReturn });
}

export async function unlinkTx(txId) {
  const t = M.tx(txId);
  if (t) await S.put('tx', t.id, { ...t, fundId: null, fundReturn: false });
}

export async function addEntry(fundId, e) {
  const f = fund(fundId);
  await save({ ...f, entries: [...(f.entries || []), { id: uid(), date: today(), note: '', receiptId: null, ...e }] });
}

export async function updateEntry(fundId, entryId, patch) {
  const f = fund(fundId);
  await save({ ...f, entries: (f.entries || []).map((e) => (e.id === entryId ? { ...e, ...patch } : e)) });
}

export async function removeEntry(fundId, entryId) {
  const f = fund(fundId);
  await save({ ...f, entries: (f.entries || []).filter((e) => e.id !== entryId) });
}

// Movimenti che si possono collegare: entrate (versamenti) o uscite (spese), non ancora
// collegati a un fondo, degli ultimi mesi, dal più recente.
export function candidates(sign) {
  return M.txs().filter((t) => !t.fundId && !t.repays?.length && (sign > 0 ? t.cents > 0 : t.cents < 0) && M.kindOf(t) !== 'giroconto')
    .sort((a, b) => b.date.localeCompare(a.date) || (b.seq || 0) - (a.seq || 0));
}
