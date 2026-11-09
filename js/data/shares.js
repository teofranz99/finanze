// Spese condivise e «chi deve cosa a chi».
//
// Su un movimento in uscita: t.share = { mine, people: [{ id, name, cents, settledAt, settledTxId }] }
// (importi in centesimi, positivi). Nei miei totali conta solo `mine`.
// Il rimborso che arriva sul conto: t.repays = [{ txId, personId }]; non conta come entrata.
// Crediti e debiti senza una spesa (es. «Marco mi ha pagato il cinema»): collezione 'debts',
// { id, name, cents (+ mi deve, − gli devo), note, date, settledAt, settledTxId, createdAt }.

import * as S from '../store.js';
import * as M from './model.js';
import { uid } from '../util.js';
import { today } from '../dates.js';

export const debts = () => S.list('debts').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
export const debt = (id) => S.get('debts', id);
export const sharedTxs = () => M.txs().filter((t) => t.share?.people?.length);

const norm = (name) => String(name || '').trim().toLowerCase();

// Nomi già usati, per i suggerimenti.
export function knownNames() {
  const seen = new Map();
  for (const t of sharedTxs()) for (const p of t.share.people) if (p.name) seen.set(norm(p.name), p.name.trim());
  for (const d of debts()) if (d.name) seen.set(norm(d.name), d.name.trim());
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// Divide in parti uguali tra me e `n` persone; i centesimi in più vanno alle altre persone.
export function equalSplit(totalCents, n) {
  const k = n + 1;
  const base = Math.floor(totalCents / k);
  const extra = totalCents - base * k;
  return { mine: base, others: Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0)) };
}

// Voci aperte e chiuse, raggruppate per persona.
// Ogni voce: { kind: 'quota' | 'debito', name, cents (+ mi deve, − gli devo), date, label, txId, personId, debtId, settled }
export function items() {
  const out = [];
  for (const t of sharedTxs()) {
    for (const p of t.share.people) {
      out.push({
        kind: 'quota', name: p.name, cents: p.cents, date: t.date, label: M.displayName(t),
        txId: t.id, personId: p.id, settled: !!(p.settledAt || p.settledTxId), settledTxId: p.settledTxId || null,
      });
    }
  }
  for (const d of debts()) {
    out.push({
      kind: 'debito', name: d.name, cents: d.cents, date: d.date, label: d.note || (d.cents > 0 ? 'Mi deve' : 'Gli devo'),
      debtId: d.id, settled: !!(d.settledAt || d.settledTxId), settledTxId: d.settledTxId || null,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function people() {
  const map = new Map();
  for (const it of items()) {
    const k = norm(it.name);
    if (!k) continue;
    if (!map.has(k)) map.set(k, { key: k, name: it.name.trim(), net: 0, open: [], done: [] });
    const p = map.get(k);
    if (it.settled) p.done.push(it);
    else { p.open.push(it); p.net += it.cents; }
  }
  return [...map.values()].sort((a, b) => (b.open.length > 0) - (a.open.length > 0) || Math.abs(b.net) - Math.abs(a.net));
}

export const person = (key) => people().find((p) => p.key === key) || null;

export function summary() {
  let owedToMe = 0;
  let iOwe = 0;
  for (const p of people()) {
    if (p.net > 0) owedToMe += p.net;
    else iOwe -= p.net;
  }
  return { owedToMe, iOwe };
}

// ---------------------------------------------------------------- Scrittura
export async function setShare(txId, share) {
  const t = M.tx(txId);
  if (!t) return;
  await S.put('tx', t.id, { ...t, share: share && share.people?.length ? share : null });
}

// Una quota è stata pagata: con un movimento (il rimborso sul conto) oppure a mano (contanti).
export async function settleQuota(txId, personId, repayTxId = null) {
  const t = M.tx(txId);
  if (!t?.share) return;
  const people = t.share.people.map((p) => (p.id === personId ? { ...p, settledAt: today(), settledTxId: repayTxId } : p));
  await S.put('tx', t.id, { ...t, share: { ...t.share, people } });
  if (repayTxId) {
    const r = M.tx(repayTxId);
    if (r) await S.put('tx', r.id, { ...r, repays: [...(r.repays || []), { txId, personId }] });
  }
}

export async function unsettleQuota(txId, personId) {
  const t = M.tx(txId);
  if (!t?.share) return;
  const p0 = t.share.people.find((p) => p.id === personId);
  const people = t.share.people.map((p) => (p.id === personId ? { ...p, settledAt: null, settledTxId: null } : p));
  await S.put('tx', t.id, { ...t, share: { ...t.share, people } });
  if (p0?.settledTxId) {
    const r = M.tx(p0.settledTxId);
    if (r) await S.put('tx', r.id, { ...r, repays: (r.repays || []).filter((x) => !(x.txId === txId && x.personId === personId)) });
  }
}

export const saveDebt = (d) => S.put('debts', d.id, d);
export function newDebt(p) {
  return { id: uid(), name: p.name, cents: p.cents, note: p.note || '', date: p.date || today(), settledAt: null, settledTxId: null, createdAt: Date.now() };
}
export const removeDebt = (id) => S.remove('debts', id);

export async function settleDebt(id, txId = null) {
  const d = debt(id);
  if (d) await saveDebt({ ...d, settledAt: today(), settledTxId: txId });
}
export async function unsettleDebt(id) {
  const d = debt(id);
  if (d) await saveDebt({ ...d, settledAt: null, settledTxId: null });
}

// Rimborsi in arrivo che si possono collegare a una quota: entrate non ancora usate.
export function repayCandidates() {
  return M.txs().filter((t) => t.cents > 0 && !t.fundId && !t.repays?.length && M.kindOf(t) !== 'giroconto')
    .sort((a, b) => b.date.localeCompare(a.date) || (b.seq || 0) - (a.seq || 0));
}

// Quote ancora aperte (per collegare un rimborso dal dettaglio di un'entrata).
export const openQuotas = () => items().filter((it) => it.kind === 'quota' && !it.settled);

// Togliere la divisione da un movimento: i rimborsi collegati tornano normali entrate.
export async function clearShare(txId) {
  const t = M.tx(txId);
  if (!t?.share) return;
  for (const p of t.share.people) if (p.settledTxId) await unsettleQuota(txId, p.id);
  await setShare(txId, null);
}
