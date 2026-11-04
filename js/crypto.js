// Primitive crittografiche (Web Crypto API, nessuna libreria esterna).
//
// Schema:
// - Una chiave dati casuale (AES-256-GCM) cifra tutti i record e i backup.
// - La chiave dati è "avvolta" (cifrata) da chiavi derivate da:
//   password principale (PBKDF2-SHA256, 600.000 iterazioni),
//   chiave di recupero (HKDF-SHA256, 160 bit casuali),
//   passkey Face ID (estensione WebAuthn PRF + HKDF).

import { enc, dec, b64, unb64, randomBytes } from './util.js';

export const PBKDF2_ITERATIONS = 600000;
const subtle = crypto.subtle;

export async function keyFromPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  const base = await subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function keyFromSecret(secret, salt, info) {
  const base = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function importDataKey(rawKey) {
  return subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// Cifra con AES-GCM (IV casuale da 96 bit). `aad` lega il testo cifrato al suo contesto.
export async function seal(key, data, aad) {
  const iv = randomBytes(12);
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = enc.encode(aad);
  const ct = await subtle.encrypt(params, key, data);
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

export async function open(key, box, aad) {
  const params = { name: 'AES-GCM', iv: unb64(box.iv) };
  if (aad) params.additionalData = enc.encode(aad);
  return new Uint8Array(await subtle.decrypt(params, key, unb64(box.ct)));
}

export const sealJson = (key, obj, aad) => seal(key, enc.encode(JSON.stringify(obj)), aad);
export const openJson = async (key, box, aad) => JSON.parse(dec.decode(await open(key, box, aad)));

// --- Chiave di recupero: 160 bit casuali in Base32 Crockford, 8 gruppi da 4 caratteri.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newRecoveryKey() {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return { bytes, text: out.match(/.{4}/g).join('-') };
}

export function parseRecoveryKey(text) {
  const clean = String(text).toUpperCase().replace(/[\s-]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');
  if (clean.length !== 32) return null;
  const out = new Uint8Array(20);
  let bits = 0;
  let value = 0;
  let i = 0;
  for (const c of clean) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out[i++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return out;
}
