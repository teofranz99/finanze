// Import di un estratto conto: lettura, confronto con i movimenti già presenti, salvataggio.

import { pdfToLines } from './pdftext.js';
import * as BdP from './bancadipiacenza.js';
import { analyze, normalizeKey, maskSensitive } from './analyze.js';
import * as M from '../data/model.js';
import * as S from '../store.js';
import { uid } from '../util.js';

const PDF_PARSERS = [BdP];

export class ImportError extends Error {
  constructor(msg) { super(msg); this.name = 'ImportError'; }
}

export async function readStatement(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    throw new ImportError('Per ora si può importare il PDF «Lista movimenti» di Banca di Piacenza. CSV ed Excel arriveranno con la fase 3.');
  }
  let pages;
  try {
    pages = await pdfToLines(file);
  } catch (e) {
    console.error(e);
    throw new ImportError('Non riesco ad aprire questo PDF. Se è protetto da password, scaricalo di nuovo senza protezione.');
  }
  const parser = PDF_PARSERS.find((p) => p.detect(pages));
  if (!parser) throw new ImportError('Non riconosco il formato di questo PDF. Per ora è supportata la «Lista movimenti» di Banca di Piacenza.');
  const st = parser.parse(pages);
  if (!st.rows.length) throw new ImportError('Nel file non ho trovato movimenti.');
  return st;
}

// Impronta di un movimento (con IBAN già mascherati: l'IBAN completo non va mai salvato).
const descKey = (causale, description) => normalizeKey(`${causale} ${maskSensitive(description)}`);
const fp = (r) => `${r.date}|${r.cents}|${descKey(r.causale, r.description)}`;
const dayDiff = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

// Trova il conto a cui appartiene l'estratto (stessa banca e stesse ultime cifre).
function findAccount(st) {
  const last4 = st.accountNumber ? st.accountNumber.slice(-4) : null;
  return M.accounts().find((a) => a.bankId === st.bankId && (a.last4 || null) === last4) || null;
}

// Confronta l'estratto con i movimenti già presenti.
export function plan(st) {
  const acc = findAccount(st);
  const existing = acc ? M.txs().filter((t) => t.accountId === acc.id) : [];
  const used = new Set();
  const added = [];
  const updated = [];
  let duplicates = 0;

  st.rows.forEach((row, i) => {
    const key = fp(row);
    const info = analyze(row, { holder: st.holder });
    // 1. Stesso movimento già presente.
    let match = existing.find((t) => !used.has(t.id) && t.fp === key);
    // 2. Un movimento "non consolidato" che ora è arrivato definitivo (la data può cambiare).
    if (!match) {
      match = existing.find((t) => !used.has(t.id) && t.pending && t.cents === row.cents
        && dayDiff(t.date, row.date) <= 10
        && ((info.opDate && t.opDate === info.opDate && t.opTime === info.opTime)
          || descKey(t.causale, t.rawDescription) === descKey(row.causale, row.description)));
    }
    if (match) {
      used.add(match.id);
      if (match.pending && !row.pending) updated.push({ tx: match, row, info, seq: st.rows.length - i });
      else duplicates++;
      return;
    }
    added.push({ row, info, seq: st.rows.length - i });
  });

  const dates = st.rows.map((r) => r.date).sort();
  return {
    st,
    account: acc,
    added,
    updated,
    duplicates,
    from: dates[0],
    to: dates[dates.length - 1],
    balanceOk: st.mismatches.length === 0,
  };
}

export async function commit(p) {
  const { st } = p;
  let acc = p.account;
  const importId = uid();
  const now = Date.now();

  if (!acc) {
    const last4 = st.accountNumber ? st.accountNumber.slice(-4) : null;
    acc = {
      id: uid(),
      name: last4 ? `${st.bankName} ····${last4}` : st.bankName,
      bankId: st.bankId,
      bankName: st.bankName,
      last4,
      holder: st.holder || null,
      type: 'corrente',
      role: 'spendibile',
      currency: 'EUR',
      balanceMode: 'import',
      balance: null,
      order: M.accounts().length,
      createdAt: now,
    };
  }
  // Saldo: si aggiorna solo se l'estratto è più recente di quello già noto.
  if (st.balance != null && (!acc.balance || st.asOf >= acc.balance.asOf)) {
    acc = { ...acc, balance: { cents: st.balance, asOf: st.asOf } };
  }
  if (st.holder && !acc.holder) acc = { ...acc, holder: st.holder };
  acc = { ...acc, lastImportAt: now };
  await S.put('accounts', acc.id, acc);

  const newTx = p.added.map(({ row, info, seq }) => M.autoClassify({
    id: uid(),
    accountId: acc.id,
    date: row.date,
    valueDate: row.valueDate,
    cents: row.cents,
    currency: row.currency,
    causale: row.causale,
    rawDescription: info.description,
    description: info.description,
    merchant: info.merchant,
    opDate: info.opDate,
    opTime: info.opTime,
    origCents: info.origCents,
    origCurrency: info.origCurrency,
    toSelf: info.toSelf,
    balanceAfter: row.balance,
    pending: row.pending,
    fp: fp(row),
    seq: now + seq,
    tags: [],
    note: '',
    splits: null,
    manual: {},
    source: 'import',
    importId,
    createdAt: now,
  }));

  const updTx = p.updated.map(({ tx, row, info }) => ({
    ...tx,
    date: row.date,
    valueDate: row.valueDate,
    balanceAfter: row.balance,
    pending: row.pending,
    fp: fp(row),
    rawDescription: info.description,
    description: info.description,
  }));

  await S.putMany('tx', [...newTx, ...updTx]);
  if (newTx.some((t) => t.categoryId === 'contanti')) await M.ensureCashAccount();
  await S.put('imports', importId, {
    id: importId,
    accountId: acc.id,
    bankId: st.bankId,
    kind: st.kind,
    at: now,
    from: p.from,
    to: p.to,
    added: newTx.length,
    updated: updTx.length,
    duplicates: p.duplicates,
  });
  return { account: acc, added: newTx.length, updated: updTx.length, duplicates: p.duplicates };
}
