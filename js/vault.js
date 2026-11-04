// Vault: custodisce la chiave dati in memoria solo mentre l'app è sbloccata.

import * as C from './crypto.js';
import * as DB from './db.js';
import { b64, unb64, randomBytes, uid } from './util.js';

const AAD_DEK = 'finanze:dek:v1';
const INFO_RECOVERY = 'finanze:recovery';
const INFO_PASSKEY = 'finanze:passkey';

let dataKey = null;     // CryptoKey non esportabile per cifrare i record
let dataKeyRaw = null;  // byte della chiave, servono per aggiungere metodi di sblocco
let header = null;
let deviceId = null;

export class WrongSecretError extends Error {
  constructor() { super('Password o chiave non corretta'); this.name = 'WrongSecretError'; }
}

export async function loadHeader() {
  header = (await DB.metaGet('header')) || null;
  deviceId = await DB.metaGet('deviceId');
  if (!deviceId) {
    deviceId = uid();
    await DB.metaSet('deviceId', deviceId);
  }
  return header;
}

export const hasVault = () => !!header;
export const getHeader = () => header;
export const getDeviceId = () => deviceId;
export const isUnlocked = () => !!dataKey;

export function getDataKey() {
  if (!dataKey) throw new Error('App bloccata');
  return dataKey;
}

function requireUnlocked() {
  if (!dataKeyRaw) throw new Error('App bloccata');
}

async function wrapPassword(raw, password) {
  const salt = randomBytes(16);
  const kek = await C.keyFromPassword(password, salt);
  return { kdf: 'PBKDF2-SHA256', iterations: C.PBKDF2_ITERATIONS, salt: b64(salt), ...(await C.seal(kek, raw, AAD_DEK)) };
}

async function wrapSecret(raw, secret, info) {
  const salt = randomBytes(16);
  const kek = await C.keyFromSecret(secret, salt, info);
  return { kdf: 'HKDF-SHA256', info, salt: b64(salt), ...(await C.seal(kek, raw, AAD_DEK)) };
}

async function unwrapPassword(w, password) {
  const kek = await C.keyFromPassword(password, unb64(w.salt), w.iterations);
  return C.open(kek, w, AAD_DEK);
}

async function unwrapSecret(w, secret) {
  const kek = await C.keyFromSecret(secret, unb64(w.salt), w.info);
  return C.open(kek, w, AAD_DEK);
}

// La decifratura AES-GCM fallisce con OperationError se la chiave è sbagliata.
async function tryUnwrap(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e && e.name === 'OperationError') throw new WrongSecretError();
    throw e;
  }
}

async function setDataKey(raw) {
  dataKeyRaw = raw;
  dataKey = await C.importDataKey(raw);
}

async function saveHeader(next) {
  header = next;
  await DB.metaSet('header', header);
}

// Primo avvio: crea la chiave dati e la protegge con password e chiave di recupero.
export async function createVault(password) {
  const raw = randomBytes(32);
  const recovery = C.newRecoveryKey();
  const now = Date.now();
  await saveHeader({
    v: 1,
    vaultId: uid(),
    createdAt: now,
    keysUpdatedAt: now,
    password: await wrapPassword(raw, password),
    recovery: await wrapSecret(raw, recovery.bytes, INFO_RECOVERY),
  });
  await setDataKey(raw);
  return recovery.text;
}

export async function unlockWithPassword(password) {
  const raw = await tryUnwrap(() => unwrapPassword(header.password, password));
  await setDataKey(raw);
}

export async function unlockWithRecovery(text) {
  const bytes = C.parseRecoveryKey(text);
  if (!bytes) throw new WrongSecretError();
  const raw = await tryUnwrap(() => unwrapSecret(header.recovery, bytes));
  await setDataKey(raw);
}

export async function unlockWithPasskeyOutput(prfOutput) {
  const pk = await DB.metaGet('passkey');
  if (!pk) throw new WrongSecretError();
  const raw = await tryUnwrap(() => unwrapSecret(pk.wrap, prfOutput));
  await setDataKey(raw);
}

export async function verifyPassword(password) {
  try {
    await tryUnwrap(() => unwrapPassword(header.password, password));
    return true;
  } catch (e) {
    if (e instanceof WrongSecretError) return false;
    throw e;
  }
}

export async function changePassword(newPassword) {
  requireUnlocked();
  await saveHeader({ ...header, password: await wrapPassword(dataKeyRaw, newPassword), keysUpdatedAt: Date.now() });
}

export async function newRecoveryKey() {
  requireUnlocked();
  const r = C.newRecoveryKey();
  await saveHeader({ ...header, recovery: await wrapSecret(dataKeyRaw, r.bytes, INFO_RECOVERY), keysUpdatedAt: Date.now() });
  return r.text;
}

// --- Passkey (Face ID / Touch ID). Resta su questo dispositivo: non va nel backup.
export const getPasskey = () => DB.metaGet('passkey');

export async function savePasskey({ credId, prfSalt, output }) {
  requireUnlocked();
  const wrap = await wrapSecret(dataKeyRaw, output, INFO_PASSKEY);
  await DB.metaSet('passkey', { credId, prfSalt, wrap, createdAt: Date.now() });
}

export const removePasskey = () => DB.metaDel('passkey');

// --- Backup
// Chiave dati di un backup di un altro archivio, sbloccata con la sua password.
export async function dataKeyFromWrapped(wrapped, password) {
  const raw = await tryUnwrap(() => unwrapPassword(wrapped, password));
  const key = await C.importDataKey(raw);
  raw.fill(0);
  return key;
}

// Password o chiave di recupero cambiate su un altro dispositivo: adotta le nuove.
export async function adoptKeys(keys) {
  await saveHeader({ ...header, password: keys.password, recovery: keys.recovery, keysUpdatedAt: keys.keysUpdatedAt });
}

// Nuovo dispositivo: ripristina l'archivio da un backup (stessa chiave dati).
export async function restoreFromKeys(vaultId, keys, secret, kind) {
  let raw;
  if (kind === 'recovery') {
    const bytes = C.parseRecoveryKey(secret);
    if (!bytes) throw new WrongSecretError();
    raw = await tryUnwrap(() => unwrapSecret(keys.recovery, bytes));
  } else {
    raw = await tryUnwrap(() => unwrapPassword(keys.password, secret));
  }
  await saveHeader({
    v: 1,
    vaultId,
    createdAt: keys.createdAt || Date.now(),
    keysUpdatedAt: keys.keysUpdatedAt || Date.now(),
    password: keys.password,
    recovery: keys.recovery,
  });
  await setDataKey(raw);
}

export function lock() {
  if (dataKeyRaw) dataKeyRaw.fill(0);
  dataKeyRaw = null;
  dataKey = null;
}
