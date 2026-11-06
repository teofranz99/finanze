// Analisi della descrizione di un movimento bancario: esercente, data e ora reali,
// importo in valuta estera, bonifici verso sé stessi. Maschera IBAN e codici simili.

import { parseItAmount, itDateToIso, CURRENCY_NUM } from '../money.js';

// IBAN e identificativi SEPA: si tengono solo paese e ultime 4 cifre.
export function maskSensitive(text) {
  return String(text || '').replace(/\b([A-Z]{2}\d{2})[A-Z0-9]{8,30}([A-Z0-9]{4})\b/g, '$1…$2');
}

export function titleCase(s) {
  const t = String(s || '').trim();
  if (!t || t !== t.toUpperCase()) return t;
  return t.toLowerCase().split(/\s+/).map((w) => {
    if (/\./.test(w) && w.length <= 7) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function cleanMerchant(s) {
  let t = String(s || '')
    .replace(/\*\S+/g, ' ')          // codici dopo l'asterisco (Amazon, ecc.)
    .replace(/\b\d{3,}\b/g, ' ')     // numeri lunghi (punti vendita, ordini)
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s\-–.,]+$/g, '')
    .replace(/^[\s\-–]+/g, '')
    .replace(/\s+-\s*$/, '')
    .replace(/\s+(DI|E|DEL|DELLA|DEI|&)$/i, '')   // nomi troncati dalla banca: "TABACCHERIA GLORIA DI"
    .trim();
  if (/paypal/i.test(t)) return 'PayPal';
  if (/telecom\s?italia/i.test(t)) return 'TIM';
  return titleCase(t) || null;
}

export function normalizeKey(s) {
  return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9&/.]+/g, ' ').trim();
}

function nameTokens(s) {
  return normalizeKey(s).split(' ').filter((w) => w.length > 1);
}

// Vero se tutti i nomi dell'intestatario compaiono nel beneficiario (in qualsiasi ordine).
export function sameHolder(name, holder) {
  if (!name || !holder) return false;
  const a = new Set(nameTokens(name));
  const h = nameTokens(holder);
  return h.length > 0 && h.every((w) => a.has(w));
}

export function analyze(row, { holder } = {}) {
  const raw = maskSensitive(row.description || '');
  const out = {
    description: raw,
    merchant: null,
    opDate: null,
    opTime: null,
    origCents: null,
    origCurrency: null,
    method: null,
    toSelf: false,
  };
  let m;
  if ((m = /Operazione (POS|ATM) del (\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2})/i.exec(raw))) {
    out.method = m[1].toUpperCase();
    out.opDate = itDateToIso(m[2]);
    out.opTime = m[3];
  }
  if ((m = /importo ([\d.]+,\d{2}) divisa (\d{3})/i.exec(raw))) {
    const code = CURRENCY_NUM[Number(m[2])] || m[2];
    if (code !== 'EUR') {
      out.origCents = parseItAmount(m[1]);
      out.origCurrency = code;
    }
  }

  let beneficiary = null;
  if (out.method === 'ATM') {
    out.merchant = 'Prelievo bancomat';
  } else if (out.method === 'POS') {
    let s = raw.replace(/^.*?con carta \S+ \S+\s*/i, '').replace(/importo [\d.]+,\d{2} divisa \d{3}\s*/i, '');
    s = s.replace(/\s*\([A-Z]{3}\)\s*$/, '');
    const i = s.lastIndexOf('- ');
    if (i > 0) s = s.slice(0, i);
    out.merchant = cleanMerchant(s);
  } else if ((m = /SDD CORE Cred:\s*\S+\s+(.+?)\s+Deb:/i.exec(raw))) {
    out.merchant = cleanMerchant(m[1]);
  } else if ((m = /a favore di (.+?) di importo/i.exec(raw))) {
    out.merchant = cleanMerchant(m[1]);
  } else if ((m = /A FAVORE DI (.+?)(?:\s+C\. ?BENEF\.|\s+NOTE:|$)/i.exec(raw))) {
    beneficiary = m[1].trim();
    out.merchant = titleCase(beneficiary);
  } else if ((m = /BONIFICO (?:O\/C|DA|A VOSTRO FAVORE DA)\s+(.+?)(?:\s+BIC:|\s+CRO:|\s+NOTE:|$)/i.exec(raw))) {
    beneficiary = m[1].trim();
    out.merchant = cleanMerchant(beneficiary);
  } else if ((m = /Pac Fondo\s*:\s*(.+?)(?:\s+Dossier|$)/i.exec(raw))) {
    out.merchant = `PAC ${titleCase(m[1])}`;
  }
  if (!out.merchant) out.merchant = titleCase(row.causale || '') || 'Movimento';

  // Bonifico tra conti propri: beneficiario (o ordinante) = intestatario del conto.
  if (beneficiary && sameHolder(beneficiary, holder)) out.toSelf = true;
  return out;
}
