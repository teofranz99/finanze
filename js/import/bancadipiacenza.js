// Lettore della "Lista movimenti contabili" in PDF (formato usato da Banca di Piacenza online).
// Ogni movimento inizia con una riga:
//   data  valuta  divisa  importo  CAUSALE  saldo  [*]
// seguita da righe di descrizione. L'asterisco indica un movimento non ancora consolidato.

import { parseItAmount, itDateToIso } from '../money.js';

export const BANK_ID = 'bancadipiacenza';
export const BANK_NAME = 'Banca di Piacenza';

const START = /^(\d{2}\/\d{2}\/\d{4}) (\d{2}\/\d{2}\/\d{4}) ([A-Z]{3}) ([-+]?[\d.]+,\d{2}) (.*?) ?([-+]?[\d.]+,\d{2})( ?\*)?$/;
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export function detect(pages) {
  const first = (pages[0] || []).map((l) => l.text).join('\n');
  return /Lista movimenti contabili/i.test(first)
    && /Descrizione Operazione/i.test(first)
    && /Saldo Movimento/i.test(first);
}

function isHeader(text) {
  return /\bData\b.*\bValuta\b.*\bImporto\b/i.test(text) || /Descrizione Operazione.*Saldo Movimento/i.test(text);
}
function isFooter(text) {
  return /sono evidenziati i movimenti/i.test(text) || /^Pag\.\s*\d+\s+di\s+\d+$/i.test(text);
}

function parseHeader(lines) {
  const info = {};
  for (const l of lines) {
    const t = l.text;
    let m;
    if (!info.accountNumber && (m = /Conto:\s*([\d][\d\s-]*\d)/.exec(t))) info.accountNumber = m[1].replace(/\D/g, '');
    if (!info.holder && (m = /Intestato a:\s*(.+)$/i.exec(t))) info.holder = m[1].trim();
    if (info.balance == null && (m = /Saldo Contabile Attuale:\s*([A-Z]{3})?\s*([-+]?[\d.]+,\d{2})/i.exec(t))) {
      info.balance = parseItAmount(m[2]);
      info.currency = m[1] || 'EUR';
    }
    if (!info.asOf && (m = /(\d{1,2}) ([a-zà]+) (\d{4})\s+(\d{1,2})[.:](\d{2})/i.exec(t))) {
      const mi = MONTHS.indexOf(m[2].toLowerCase());
      if (mi >= 0) info.asOf = new Date(+m[3], mi, +m[1], +m[4], +m[5]).getTime();
    }
  }
  return info;
}

export function parse(pages) {
  const rows = [];
  let cur = null;
  const flush = () => { if (cur) { rows.push(cur); cur = null; } };

  pages.forEach((lines, pi) => {
    let inTable = false;
    for (const l of lines) {
      const t = l.text;
      if (isHeader(t)) { inTable = true; continue; }
      if (!inTable) continue;
      if (isFooter(t)) { inTable = false; continue; }
      const m = START.exec(t);
      if (m) {
        flush();
        cur = {
          date: itDateToIso(m[1]),
          valueDate: itDateToIso(m[2]),
          currency: m[3],
          cents: parseItAmount(m[4]),
          causale: m[5].trim(),
          details: [],
          balance: parseItAmount(m[6]),
          pending: !!m[7],
          page: pi + 1,
        };
      } else if (cur) {
        cur.details.push(t);
      }
    }
  });
  flush();

  const header = parseHeader(pages[0] || []);
  for (const r of rows) r.description = r.details.join(' ').replace(/\s+/g, ' ').trim();

  // Controllo: il saldo dopo ogni movimento deve tornare con quello precedente.
  // La lista è dal più recente al più vecchio.
  const mismatches = [];
  for (let i = 0; i < rows.length - 1; i++) {
    if (rows[i + 1].balance + rows[i].cents !== rows[i].balance) mismatches.push(i);
  }
  if (rows.length && header.balance != null && rows[0].balance !== header.balance) mismatches.push(-1);

  return {
    bankId: BANK_ID,
    bankName: BANK_NAME,
    kind: 'Lista movimenti (PDF)',
    accountNumber: header.accountNumber || null,
    holder: header.holder || null,
    balance: header.balance ?? (rows[0] ? rows[0].balance : null),
    asOf: header.asOf || Date.now(),
    rows: rows.map(({ details, page, ...r }) => r),
    mismatches,
  };
}
