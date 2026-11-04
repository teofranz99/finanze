// Sblocco con Face ID / Touch ID tramite passkey WebAuthn con estensione PRF.
// Il PRF restituisce 32 byte segreti, sempre uguali per la stessa passkey, da cui si
// ricava la chiave che apre la chiave dati. Senza server: la sicurezza non dipende dalla
// verifica della firma, ma dal fatto che senza Face ID quei byte non si ottengono.

import { randomBytes, b64, unb64 } from './util.js';

export class PrfUnsupportedError extends Error {
  constructor() { super('Il browser non supporta lo sblocco con passkey (PRF)'); this.name = 'PrfUnsupportedError'; }
}

export function supported() {
  return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
}

export async function platformAvailable() {
  try {
    return supported() && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function prfResult(cred) {
  const ext = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
  const first = ext.prf?.results?.first;
  return { enabled: ext.prf?.enabled, first: first ? new Uint8Array(first) : null };
}

export async function register() {
  const prfSalt = randomBytes(32);
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Finanze', id: location.hostname },
      user: { id: randomBytes(16), name: 'Finanze', displayName: 'Finanze' },
      challenge: randomBytes(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      timeout: 60000,
      attestation: 'none',
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  const credId = b64(new Uint8Array(cred.rawId));
  let { enabled, first } = prfResult(cred);
  if (!first) {
    if (enabled === false) throw new PrfUnsupportedError();
    // Alcuni sistemi attivano il PRF alla creazione ma lo calcolano solo al primo accesso.
    first = await authenticate({ credId, prfSalt: b64(prfSalt) });
  }
  return { credId, prfSalt: b64(prfSalt), output: first };
}

export async function authenticate({ credId, prfSalt }) {
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: unb64(credId) }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: unb64(prfSalt) } } },
    },
  });
  const { first } = prfResult(cred);
  if (!first) throw new PrfUnsupportedError();
  return first;
}
