// Lettura di file CSV: codifica, separatore, virgolette. Più le funzioni per capire
// da soli il formato di date e importi.

export async function readText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buf);   // file salvati da Excel in italiano
  }
}

function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const counts = [',', ';', '\t', '|'].map((d) => [d, sample.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][0];
}

export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
  return { delimiter, rows };
}

// ---------------------------------------------------------------- Date
const DATE_PATTERNS = [
  { id: 'ymd', re: /^(\d{4})-(\d{1,2})-(\d{1,2})/, map: (m) => [m[1], m[2], m[3]] },
  { id: 'dmy', re: /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/, map: (m) => [m[3], m[2], m[1]] },
  { id: 'dmy2', re: /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})(?!\d)/, map: (m) => [`20${m[3]}`, m[2], m[1]] },
  { id: 'mdy', re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})/, map: (m) => [m[3], m[1], m[2]] },
];

export function parseDate(s, format) {
  const t = String(s || '').trim();
  const list = format ? DATE_PATTERNS.filter((p) => p.id === format) : DATE_PATTERNS;
  for (const p of list) {
    const m = p.re.exec(t);
    if (!m) continue;
    const [y, mo, d] = p.map(m);
    const mm = +mo;
    const dd = +d;
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) continue;
    return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  return null;
}

export function detectDateFormat(values) {
  const vals = values.filter(Boolean).slice(0, 40);
  if (!vals.length) return null;
  for (const id of ['ymd', 'dmy', 'dmy2']) {
    if (vals.every((v) => parseDate(v, id))) return id;
  }
  if (vals.every((v) => parseDate(v, 'mdy'))) return 'mdy';
  return null;
}

export const looksLikeDate = (v) => !!parseDate(v);

// ---------------------------------------------------------------- Importi
// decimal: ',' (1.234,56) oppure '.' (1,234.56)
export function parseNumber(s, decimal) {
  let t = String(s || '').trim().replace(/[€$£\s ]|EUR|USD|GBP/gi, '');
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }
  if (t.startsWith('-')) { neg = !neg; t = t.slice(1); }
  if (t.startsWith('+')) t = t.slice(1);
  if (decimal === ',') t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const cents = Math.round(parseFloat(t) * 100);
  return neg ? -cents : cents;
}

export function detectDecimal(values) {
  let comma = 0;
  let dot = 0;
  for (const v of values.filter(Boolean).slice(0, 60)) {
    const t = String(v).replace(/[^\d.,-]/g, '');
    if (/,\d{1,2}$/.test(t)) comma++;
    else if (/\.\d{1,2}$/.test(t)) dot++;
  }
  return comma > dot ? ',' : '.';
}

export const looksLikeAmount = (v) => /^[-+(]?\s*[€$£]?\s*\d[\d.,\s]*\)?-?\s*(€|EUR)?$/i.test(String(v || '').trim()) && /\d/.test(v);
