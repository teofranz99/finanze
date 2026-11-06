// Import universale di CSV: abbinamento delle colonne (proposto in automatico dalle
// intestazioni più comuni), salvato come "modello" per quella banca e riusato in seguito.
// Un modello contiene solo nomi di colonne e formati: nessun dato personale, si può condividere.

import { parseDate, detectDateFormat, parseNumber, detectDecimal, looksLikeDate, looksLikeAmount } from './csv.js';

export const FIELDS = [
  ['date', 'Data', true],
  ['description', 'Descrizione', true],
  ['amount', 'Importo (con segno)', false],
  ['income', 'Entrate', false],
  ['expense', 'Uscite', false],
  ['balance', 'Saldo', false],
  ['valueDate', 'Data valuta', false],
  ['currency', 'Divisa', false],
];

const GUESS = {
  date: /^(data( (operazione|contabile|registrazione|movimento|transazione))?|date|booking date|transaction date|data op\.?|data mov\.?)$/i,
  valueDate: /(data )?valuta|value date/i,
  causale: /^(operazione|causale|tipo|tipo operazione|tipologia|type|transaction type|categoria banca)$/i,
  description: /descr|dettagli|description|payee|beneficiario|esercente|controparte|partner|memo|reference|riferimento|movimento|causale|operazione/i,
  amount: /^(importo|amount|ammontare|valore|importo eur|importo \(eur\)|amount \(eur\)|importo in euro)$/i,
  income: /entrat|avere|accredit|credit|^in$/i,
  expense: /uscit|dare|addebit|debit|^out$/i,
  balance: /saldo|balance/i,
  currency: /^(divisa|valuta|currency|moneta)$/i,
};

export const signature = (header) => header.map((h) => h.trim().toLowerCase()).join('|');

// Trova la riga di intestazione: la prima con almeno 3 celle testuali seguita da righe con date.
export function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length - 1, 30); i++) {
    const r = rows[i];
    const texts = r.filter((c) => c && !looksLikeDate(c) && !looksLikeAmount(c)).length;
    const next = rows.slice(i + 1, i + 4);
    if (texts >= 3 && next.some((n) => n.some(looksLikeDate))) return i;
  }
  return 0;
}

export function guessMapping(header, body) {
  const mapping = {};
  const used = new Set();
  const col = (i) => body.slice(0, 30).map((r) => r[i]);
  const pick = (field, test) => {
    const i = header.findIndex((h, j) => !used.has(j) && GUESS[field].test(h.trim()) && (!test || test(col(j))));
    if (i >= 0) { mapping[field] = i; used.add(i); }
  };
  const datesCol = (vals) => vals.filter(Boolean).every(looksLikeDate);
  const amountsCol = (vals) => vals.filter(Boolean).length > 0 && vals.filter(Boolean).every(looksLikeAmount);
  const currencyCol = (vals) => vals.filter(Boolean).every((v) => /^[A-Z]{3}$/.test(v));
  pick('date', datesCol);
  pick('valueDate', datesCol);
  pick('amount', amountsCol);
  if (mapping.amount == null) { pick('income', amountsCol); pick('expense', amountsCol); }
  pick('balance', amountsCol);
  pick('currency', currencyCol);
  // Descrizione: prima le colonne più descrittive, poi le altre.
  for (const re of [/descr|description/i, /dettagli|details|payee|beneficiario|esercente|controparte|partner/i, /memo|reference|riferimento|movimento/i]) {
    if (mapping.description != null) break;
    const i = header.findIndex((h, j) => !used.has(j) && re.test(h.trim()));
    if (i >= 0) { mapping.description = i; used.add(i); }
  }
  pick('causale');
  pick('description');
  // Senza intestazioni chiare: prima colonna di date e la colonna di testo più lunga.
  if (mapping.date == null) {
    const i = header.findIndex((_, j) => !used.has(j) && datesCol(col(j)));
    if (i >= 0) { mapping.date = i; used.add(i); }
  }
  if (mapping.description == null) {
    let best = -1;
    let len = 0;
    header.forEach((_, j) => {
      if (used.has(j)) return;
      const l = col(j).reduce((s, v) => s + String(v || '').length, 0);
      if (l > len) { len = l; best = j; }
    });
    if (best >= 0) mapping.description = best;
  }
  return mapping;
}

export function formatsFor(mapping, body) {
  const col = (i) => (i == null ? [] : body.map((r) => r[i]));
  const amounts = [...col(mapping.amount), ...col(mapping.income), ...col(mapping.expense), ...col(mapping.balance)];
  return {
    dateFormat: detectDateFormat(col(mapping.date)) || 'dmy',
    decimal: detectDecimal(amounts),
  };
}

export function validateMapping(m) {
  if (m.date == null) return 'Scegli la colonna della data.';
  if (m.description == null) return 'Scegli la colonna della descrizione.';
  if (m.amount == null && m.income == null && m.expense == null) return 'Scegli la colonna dell\'importo, oppure quelle di entrate e uscite.';
  return null;
}

// Trasforma le righe del CSV in movimenti con un modello.
export function applyTemplate(rows, tpl) {
  const header = rows[tpl.headerRow] || [];
  const body = rows.slice(tpl.headerRow + 1);
  const m = tpl.mapping;
  const out = [];
  for (const r of body) {
    const date = parseDate(r[m.date], tpl.dateFormat);
    if (!date) continue;                        // righe di totale, note, righe vuote
    let cents = null;
    if (m.amount != null) cents = parseNumber(r[m.amount], tpl.decimal);
    else {
      const inc = m.income != null ? parseNumber(r[m.income], tpl.decimal) : null;
      const exp = m.expense != null ? parseNumber(r[m.expense], tpl.decimal) : null;
      if (inc) cents = Math.abs(inc);
      else if (exp) cents = -Math.abs(exp);
    }
    if (!cents) continue;
    const desc = String(r[m.description] || '').replace(/\s+/g, ' ').trim();
    out.push({
      date,
      valueDate: m.valueDate != null ? (parseDate(r[m.valueDate], tpl.dateFormat) || date) : date,
      currency: m.currency != null && /^[A-Z]{3}$/.test(r[m.currency] || '') ? r[m.currency] : 'EUR',
      cents,
      causale: m.causale != null ? String(r[m.causale] || '').trim().toUpperCase() : '',
      description: desc,
      balance: m.balance != null ? parseNumber(r[m.balance], tpl.decimal) : null,
      pending: false,
      generic: true,
    });
  }

  // Controllo con il saldo, se c'è: va bene sia dal più recente sia dal più vecchio.
  const mismatches = [];
  const withBal = out.filter((x) => x.balance != null);
  if (withBal.length > 1 && withBal.length === out.length) {
    const okNewestFirst = out.every((x, i) => i === out.length - 1 || out[i + 1].balance + x.cents === x.balance);
    const okOldestFirst = out.every((x, i) => i === 0 || out[i - 1].balance + x.cents === x.balance);
    if (!okNewestFirst && !okOldestFirst) mismatches.push('saldo');
  }
  const newest = [...out].sort((a, b) => b.date.localeCompare(a.date))[0];
  const newestBal = withBal.length === out.length && out.length
    ? (out[0].date >= out[out.length - 1].date ? out[0].balance : out[out.length - 1].balance)
    : null;

  return {
    bankId: `tpl:${tpl.id}`,
    bankName: tpl.name,
    kind: 'File CSV',
    holder: null,
    accounts: [{ key: 'main', name: tpl.name, type: 'corrente', role: 'spendibile', currency: 'EUR', accountNumber: null, balance: newestBal, asOf: newest ? Date.parse(`${newest.date}T23:59:00`) : Date.now(), existingId: tpl.accountId || null }],
    rows: out.map((x) => ({ ...x, accountKey: 'main' })),
    mismatches,
    header,
  };
}

// Esporta un modello come file da condividere (senza riferimenti ai tuoi conti).
export function exportTemplate(tpl) {
  const { accountId, id, ...rest } = tpl;
  return new File([JSON.stringify({ format: 'finanze-modello', v: 1, ...rest }, null, 2)], `Modello ${tpl.name}.json`, { type: 'application/json' });
}

export function readTemplateFile(obj) {
  if (!obj || obj.format !== 'finanze-modello' || !obj.mapping || !obj.signature) throw new Error('Il file non è un modello di Finanze.');
  const { format, v, ...rest } = obj;
  return rest;
}
