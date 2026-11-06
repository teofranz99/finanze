// Lettore della lista movimenti in PDF di BPER Banca (home banking).
// Colonne: Data operazione, Data valuta, Descrizione (su più righe), Entrate, Uscite, Note, Categorie.
// Non c'è il saldo riga per riga: il controllo si fa con saldo iniziale + movimenti = saldo finale.

import { parseItAmount, itDateToIso } from '../money.js';

export const BANK_ID = 'bper';
export const BANK_NAME = 'BPER';

const DATE = /^\d{2}\/\d{2}\/\d{4}$/;
const AMOUNT = /^[-+]?[\d.]+,\d{2}\s*€$/;
const amount = (s) => parseItAmount(String(s).replace(/\s*€\s*$/, ''));

export function detect(pages) {
  const t = (pages[0] || []).map((l) => l.text).join('\n');
  return /Saldo contabile iniziale/i.test(t) && /\bEntrate\b/.test(t) && /\bUscite\b/.test(t) && /Categorie/.test(t);
}

function columns(lines) {
  for (const l of lines) {
    const find = (re) => l.items.find((i) => re.test(i.str.trim()))?.x;
    const desc = find(/^Descrizione$/i);
    const inc = find(/^Entrate$/i);
    const out = find(/^Uscite$/i);
    const note = find(/^Note$/i);
    const cat = find(/^Categorie$/i);
    if (desc != null && inc != null && out != null) return { y: l.y, desc, inc, out, note: note ?? out + 50, cat: cat ?? (note ?? out + 50) + 70 };
  }
  return null;
}

function parseHeader(lines) {
  const info = {};
  lines.forEach((l, i) => {
    const t = l.text;
    let m;
    if (!info.accountNumber && (m = /Conto Corrente:\s*(\d+)/i.exec(t))) info.accountNumber = m[1];
    if (!info.holder && (m = /Intestatario:\s*(.+)$/i.exec(t))) info.holder = m[1].trim();
    if (info.balance == null && (m = /Saldo contabile:\s*([-+]?[\d.]+,\d{2})/i.exec(t))) info.balance = parseItAmount(m[1]);
    if (!info.asOf && (m = /,\s*(\d{2}\/\d{2}\/\d{4})\s*$/.exec(t))) info.asOf = Date.parse(`${itDateToIso(m[1])}T23:59:00`);
    if (/Saldo contabile iniziale/i.test(t) && lines[i + 1]) {
      const vals = lines[i + 1].items.map((x) => x.str.trim()).filter((s) => AMOUNT.test(s));
      if (vals.length >= 2) { info.opening = amount(vals[0]); info.closing = amount(vals[1]); }
    }
  });
  return info;
}

export function parse(pages) {
  const rows = [];
  let totals = null;
  let col = null;
  let cur = null;
  const flush = () => { if (cur) { rows.push(cur); cur = null; } };

  for (const lines of pages) {
    const c = columns(lines);
    if (c) col = c;
    if (!col) continue;
    const headerY = c ? c.y : Infinity;
    for (const l of lines) {
      if (c && l.y >= headerY - 12) continue;          // intestazione della tabella (anche "operazione valuta")
      const first = l.items[0]?.str.trim() || '';
      if (/^\d{1,3}$/.test(l.text) && l.items[0].x > col.cat) continue;   // numero di pagina
      if (/^TOTALE$/i.test(first)) {
        flush();
        const vals = l.items.map((x) => x.str.trim()).filter((s) => AMOUNT.test(s)).map(amount);
        totals = { income: vals.find((v) => v >= 0) ?? 0, expense: vals.find((v) => v < 0) ?? 0 };
        continue;
      }
      const startsRow = DATE.test(first) && l.items[0].x < col.desc - 5;
      if (!startsRow && !cur) continue;
      if (startsRow) {
        flush();
        cur = { dates: [], desc: [], cents: null, note: '', bankCategory: '' };
      }
      for (const it of l.items) {
        const s = it.str.trim();
        if (!s) continue;
        if (it.x < col.desc - 5) { if (DATE.test(s)) cur.dates.push(s); }
        else if (it.x < col.inc - 15) cur.desc.push(s);
        else if (it.x < col.note - 2) { if (AMOUNT.test(s)) cur.cents = amount(s); }
        else if (it.x < col.cat - 5) cur.note += (cur.note ? ' ' : '') + s;
        else cur.bankCategory += (cur.bankCategory ? ' ' : '') + s;
      }
    }
    // Numero di pagina e righe sotto la tabella non hanno date: finiscono nella descrizione
    // solo se una riga è aperta; si ripuliscono qui sotto.
  }
  flush();

  const header = parseHeader(pages[0] || []);
  const out = rows
    .filter((r) => r.cents != null && r.cents !== 0 && r.dates.length)
    .map((r) => {
      const desc = r.desc.join(' ').replace(/\s+/g, ' ').trim();
      const words = desc.split(' ');
      // La causale è la parte iniziale in maiuscolo (es. "DISPOSIZIONE BONIFICO").
      let n = 0;
      while (n < words.length && /^[A-Z.'/]+$/.test(words[n]) && n < 4 && !words.slice(0, n).includes(words[n])) n++;
      return {
        date: itDateToIso(r.dates[0]),
        valueDate: itDateToIso(r.dates[1] || r.dates[0]),
        currency: 'EUR',
        cents: r.cents,
        causale: words.slice(0, Math.max(1, n)).join(' '),
        description: desc,
        balance: null,
        pending: !!r.note && !/contabilizzat/i.test(r.note),
        hint: /COMMISSION/i.test(r.bankCategory) ? 'banca' : null,
      };
    });

  // Controlli: saldo iniziale + movimenti = saldo finale; totali di entrate e uscite.
  const sum = out.reduce((s, r) => s + r.cents, 0);
  const mismatches = [];
  if (header.opening != null && header.closing != null && header.opening + sum !== header.closing) mismatches.push('saldo');
  if (totals) {
    const inc = out.filter((r) => r.cents > 0).reduce((s, r) => s + r.cents, 0);
    const exp = out.filter((r) => r.cents < 0).reduce((s, r) => s + r.cents, 0);
    if (inc !== totals.income || exp !== totals.expense) mismatches.push('totali');
  }

  return {
    bankId: BANK_ID,
    bankName: BANK_NAME,
    kind: 'Lista movimenti (PDF)',
    accountNumber: header.accountNumber || null,
    holder: header.holder || null,
    balance: header.closing ?? header.balance ?? null,
    asOf: header.asOf || Date.now(),
    rows: out,
    mismatches,
  };
}
