// Archivio dati in memoria (decifrato) con salvataggio cifrato in IndexedDB.
// Ogni record: { col, id, data, updatedAt, deviceId, deleted? }.
// Le cancellazioni restano come "lapidi" così si propagano agli altri dispositivi.

import * as DB from './db.js';
import * as V from './vault.js';
import * as C from './crypto.js';

const cols = new Map();
const listeners = new Set();

const recKey = (col, id) => `${col}/${id}`;

function setLocal(rec) {
  let m = cols.get(rec.col);
  if (!m) { m = new Map(); cols.set(rec.col, m); }
  m.set(rec.id, rec);
}

function emit(col) {
  for (const fn of listeners) {
    try { fn(col); } catch (e) { console.error(e); }
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function loadAll() {
  cols.clear();
  const key = V.getDataKey();
  const rows = await DB.recordsAll();
  await Promise.all(rows.map(async ([k, box]) => {
    try {
      setLocal(await C.openJson(key, box, k));
    } catch {
      console.error('Record illeggibile:', k);
    }
  }));
}

async function persist(recs) {
  const key = V.getDataKey();
  const entries = await Promise.all(recs.map(async (r) => {
    const k = recKey(r.col, r.id);
    return [k, await C.sealJson(key, r, k)];
  }));
  await DB.recordsPutMany(entries);
}

export function get(col, id) {
  const r = cols.get(col)?.get(id);
  return r && !r.deleted ? r.data : undefined;
}

export function list(col) {
  const m = cols.get(col);
  return m ? [...m.values()].filter((r) => !r.deleted).map((r) => r.data) : [];
}

export async function put(col, id, data) {
  const rec = { col, id, data, updatedAt: Date.now(), deviceId: V.getDeviceId() };
  setLocal(rec);
  await persist([rec]);
  emit(col);
  return rec;
}

// Salva molti record della stessa collezione in una sola transazione. Ogni oggetto deve avere `id`.
export async function putMany(col, items) {
  if (!items.length) return [];
  const now = Date.now();
  const recs = items.map((data) => ({ col, id: data.id, data, updatedAt: now, deviceId: V.getDeviceId() }));
  for (const r of recs) setLocal(r);
  await persist(recs);
  emit(col);
  return recs;
}

export async function removeMany(col, ids) {
  if (!ids.length) return;
  const now = Date.now();
  const recs = ids.map((id) => ({ col, id, data: null, deleted: true, updatedAt: now, deviceId: V.getDeviceId() }));
  for (const r of recs) setLocal(r);
  await persist(recs);
  emit(col);
}

export async function remove(col, id) {
  const rec = { col, id, data: null, deleted: true, updatedAt: Date.now(), deviceId: V.getDeviceId() };
  setLocal(rec);
  await persist([rec]);
  emit(col);
}

export function allRecords() {
  return [...cols.values()].flatMap((m) => [...m.values()]);
}

// Unisce i record di un backup: vince la modifica più recente.
// Conta come "conflitto" un dato cambiato su entrambi i dispositivi dopo l'ultima sincronizzazione.
export async function merge(incoming, lastSyncAt = 0) {
  const changed = [];
  let added = 0;
  let updated = 0;
  let conflicts = 0;
  for (const inc of incoming) {
    if (!inc || typeof inc.col !== 'string' || typeof inc.id !== 'string' || typeof inc.updatedAt !== 'number') continue;
    const cur = cols.get(inc.col)?.get(inc.id);
    if (!cur) {
      setLocal(inc);
      changed.push(inc);
      if (!inc.deleted) added++;
      continue;
    }
    if (inc.updatedAt === cur.updatedAt && inc.deviceId === cur.deviceId) continue;
    const incWins = inc.updatedAt > cur.updatedAt
      || (inc.updatedAt === cur.updatedAt && String(inc.deviceId) > String(cur.deviceId));
    if (cur.updatedAt > lastSyncAt && inc.updatedAt > lastSyncAt) conflicts++;
    if (incWins) {
      setLocal(inc);
      changed.push(inc);
      updated++;
    }
  }
  if (changed.length) {
    await persist(changed);
    emit('*');
  }
  return { added, updated, conflicts };
}
