// Backup cifrato: un file JSON da salvare in iCloud Drive (o dove si preferisce).
// Contiene le chiavi avvolte (password e chiave di recupero) e tutti i record
// cifrati con la chiave dati. Senza password o chiave di recupero è illeggibile.

import * as C from './crypto.js';
import * as V from './vault.js';
import * as S from './store.js';
import * as DB from './db.js';

const FORMAT = 'finanze-backup';
const aad = (vaultId) => `finanze:backup:v1:${vaultId}`;

export class BackupError extends Error {
  constructor(msg) { super(msg); this.name = 'BackupError'; }
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function createBackupFile() {
  const h = V.getHeader();
  const data = await C.sealJson(V.getDataKey(), { records: S.allRecords() }, aad(h.vaultId));
  const file = {
    format: FORMAT,
    v: 1,
    vaultId: h.vaultId,
    createdAt: Date.now(),
    deviceId: V.getDeviceId(),
    keys: {
      createdAt: h.createdAt,
      keysUpdatedAt: h.keysUpdatedAt,
      password: h.password,
      recovery: h.recovery,
    },
    data,
  };
  return new File([JSON.stringify(file)], `Finanze-backup-${stamp()}.json`, { type: 'application/json' });
}

export async function markSaved() {
  const now = Date.now();
  await DB.metaSet('lastBackupAt', now);
  await DB.metaSet('lastSyncAt', now);
}

// Computer: finestra "Salva con nome". iPhone/iPad: foglio di condivisione → "Salva in File".
export async function saveBackup() {
  const file = await createBackupFile();

  if (typeof window.showSaveFilePicker === 'function') {
    let handle = null;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: file.name,
        types: [{ description: 'Backup di Finanze', accept: { 'application/json': ['.json'] } }],
      });
    } catch (e) {
      if (e.name === 'AbortError') return { cancelled: true };
    }
    if (handle) {
      const w = await handle.createWritable();
      await w.write(file);
      await w.close();
      await markSaved();
      return { saved: true };
    }
  }

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      await markSaved();
      return { saved: true };
    } catch (e) {
      if (e.name === 'AbortError') return { cancelled: true };
      // Safari vuole un tocco "fresco": la UI mostrerà un pulsante dedicato.
      if (e.name === 'NotAllowedError') return { needsTap: true, file };
      throw e;
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  await markSaved();
  return { saved: true, downloaded: true };
}

export async function shareFile(file) {
  await navigator.share({ files: [file] });
  await markSaved();
}

export async function readBackup(file) {
  let obj;
  try {
    obj = JSON.parse(await file.text());
  } catch {
    throw new BackupError('Il file scelto non è un backup di Finanze.');
  }
  if (!obj || obj.format !== FORMAT || !obj.data || !obj.keys || !obj.vaultId) {
    throw new BackupError('Il file scelto non è un backup di Finanze.');
  }
  if (obj.v !== 1) throw new BackupError('Questo backup è stato creato da una versione più recente dell\'app.');
  return obj;
}

// "Aggiorna file": unisce un backup a questo dispositivo.
export async function importBackup(obj, password) {
  const h = V.getHeader();
  const same = obj.vaultId === h.vaultId;
  let key;
  if (same) {
    key = V.getDataKey();
  } else {
    if (password == null) return { needsPassword: true };
    key = await V.dataKeyFromWrapped(obj.keys.password, password);
  }
  let payload;
  try {
    payload = await C.openJson(key, obj.data, aad(obj.vaultId));
  } catch {
    throw new BackupError('Il backup è danneggiato o non si può aprire con questa chiave.');
  }
  const lastSync = (await DB.metaGet('lastSyncAt')) || 0;
  const stats = await S.merge(payload.records || [], lastSync);
  if (same && obj.keys.keysUpdatedAt > h.keysUpdatedAt) {
    await V.adoptKeys(obj.keys);
    stats.keysUpdated = true;
  }
  const now = Date.now();
  await DB.metaSet('lastImportAt', now);
  await DB.metaSet('lastSyncAt', now);
  stats.backupDate = obj.createdAt;
  return stats;
}

// Primo avvio su un nuovo dispositivo: ricrea l'archivio dal backup.
export async function restoreBackup(obj, secret, kind) {
  await V.restoreFromKeys(obj.vaultId, obj.keys, secret, kind);
  await S.loadAll();
  let payload;
  try {
    payload = await C.openJson(V.getDataKey(), obj.data, aad(obj.vaultId));
  } catch {
    throw new BackupError('Il backup è danneggiato.');
  }
  await S.merge(payload.records || [], 0);
  const now = Date.now();
  await DB.metaSet('lastImportAt', now);
  await DB.metaSet('lastSyncAt', now);
}
