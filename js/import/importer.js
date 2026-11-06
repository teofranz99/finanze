// Import di un estratto conto: lettura, confronto con i movimenti già presenti, salvataggio.
// Un file può contenere più conti (es. Revolut: carta e deposito).

import { pdfToLines } from './pdftext.js';
import * as BdP from './bancadipiacenza.js';
import * as Bper from './bper.js';
import * as Revolut from './revolut.js';
import { readText, parseCsv } from './csv.js';
import { findHeader, guessMapping, formatsFor, applyTemplate, signature } from './template.js';
import { analyze, normalizeKey, maskSensitive } from './analyze.js';
import * as M from '../data/model.js';
import * as S from '../store.js';
import { uid } from '../util.js';

const PDF_PARSERS = [BdP, Bper];

export class ImportError extends Error {
  constructor(msg) { super(msg); this.name = 'ImportError'; }
}

// Un estratto "a conto unico" (i PDF) diventa un estratto con un solo conto.
function single(st) {
  if (st.accounts) return st;
  return {
    ...st,
    accounts: [{ key: 'main', name: null, type: 'corrente', role: 'spendibile', currency: 'EUR', accountNumber: st.accountNumber, balance: st.balance, asOf: st.asOf }],
    rows: st.rows.map((r) => ({ ...r, accountKey: 'main' })),
  };
}

// Restituisce { st } oppure { mapping } se serve abbinare le colonne di un CSV nuovo.
export async function readStatement(file) {
  const name = file.name || '';
  if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) {
    let pages;
    try {
      pages = await pdfToLines(file);
    } catch (e) {
      console.error(e);
      throw new ImportError('Non riesco ad aprire questo PDF. Se è protetto da password, scaricalo di nuovo senza protezione.');
    }
    const parser = PDF_PARSERS.find((p) => p.detect(pages));
    if (!parser) throw new ImportError('Non riconosco il formato di questo PDF. Per i PDF sono supportate le liste movimenti di Banca di Piacenza e BPER; per le altre banche usa il file CSV.');
    const st = single(parser.parse(pages));
    if (!st.rows.length) throw new ImportError('Nel file non ho trovato movimenti.');
    return { st };
  }
  if (/\.(xlsx?|xlsm|ods)$/i.test(name)) {
    throw new ImportError('I file Excel non sono ancora supportati: scarica la lista movimenti in formato CSV.');
  }
  // CSV (o testo con separatori)
  const { rows, delimiter } = parseCsv(await readText(file));
  if (rows.length < 2) throw new ImportError('Il file è vuoto o non è un CSV.');
  if (Revolut.detect(rows)) return { st: Revolut.parse(rows) };
  const headerRow = findHeader(rows);
  const header = rows[headerRow];
  const sig = signature(header);
  const tpl = S.list('templates').find((t) => t.signature === sig);
  if (tpl) {
    const st = applyTemplate(rows, tpl);
    if (!st.rows.length) throw new ImportError(`Con il modello «${tpl.name}» non ho trovato movimenti. Puoi eliminarlo da Impostazioni › Modelli di import e riprovare.`);
    return { st };
  }
  const body = rows.slice(headerRow + 1);
  const guess = guessMapping(header, body);
  return { mapping: { rows, headerRow, header, body, delimiter, signature: sig, guess, formats: formatsFor(guess, body), fileName: name } };
}

// Salva un modello nuovo e lo applica.
export async function saveTemplateAndApply(m, { name, mapping, dateFormat, decimal, accountId }) {
  const tpl = { id: uid(), name, signature: m.signature, delimiter: m.delimiter, headerRow: m.headerRow, mapping, dateFormat, decimal, accountId: accountId || null, createdAt: Date.now() };
  const st = applyTemplate(m.rows, tpl);
  if (!st.rows.length) throw new ImportError('Con queste colonne non trovo movimenti: controlla la colonna della data e dell\'importo.');
  await S.put('templates', tpl.id, tpl);
  return st;
}

// Impronta di un movimento (con IBAN già mascherati: l'IBAN completo non va mai salvato).
const descKey = (causale, description) => normalizeKey(`${causale} ${maskSensitive(description)}`);
const fp = (r) => `${r.date}|${r.cents}|${descKey(r.causale, r.description)}`;
const dayDiff = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

function knownHolder(st) {
  return st.holder || M.accounts().find((a) => a.holder)?.holder || null;
}

function findAccount(st, def) {
  if (def.existingId) return M.account(def.existingId) || null;
  const list = M.accounts().filter((a) => a.bankId === st.bankId);
  if (def.accountNumber) return list.find((a) => a.last4 === def.accountNumber.slice(-4)) || null;
  return list.find((a) => (a.externalKey || 'main') === def.key) || null;
}

// Confronta l'estratto con i movimenti già presenti, conto per conto.
export function plan(st) {
  const holder = knownHolder(st);
  const groups = st.accounts.map((def) => {
    const account = findAccount(st, def);
    const existing = account ? M.txs().filter((t) => t.accountId === account.id) : [];
    const used = new Set();
    const added = [];
    const updated = [];
    let duplicates = 0;
    const rows = st.rows.filter((r) => r.accountKey === def.key);
    rows.forEach((row, i) => {
      const key = fp(row);
      const info = analyze(row, { holder });
      let match = existing.find((t) => !used.has(t.id) && t.fp === key);
      if (!match) {
        match = existing.find((t) => !used.has(t.id) && t.pending && t.cents === row.cents
          && dayDiff(t.date, row.date) <= 10
          && ((info.opDate && t.opDate === info.opDate && t.opTime === info.opTime)
            || descKey(t.causale, t.rawDescription) === descKey(row.causale, row.description)));
      }
      if (match) {
        used.add(match.id);
        if (match.pending && !row.pending) updated.push({ tx: match, row, info });
        else duplicates++;
        return;
      }
      const seq = row.seqKey ? Date.parse(`${row.date}T${row.seqKey}`) : rows.length - i;
      added.push({ row, info, seq });
    });
    return { def, account, added, updated, duplicates };
  });
  const dates = st.rows.map((r) => r.date).sort();
  return {
    st,
    groups,
    added: groups.flatMap((g) => g.added),
    updated: groups.flatMap((g) => g.updated),
    duplicates: groups.reduce((s, g) => s + g.duplicates, 0),
    from: dates[0],
    to: dates[dates.length - 1],
    balanceOk: st.mismatches.length === 0,
  };
}

function accountName(st, def) {
  if (def.name) return def.name;
  const last4 = def.accountNumber ? def.accountNumber.slice(-4) : null;
  return last4 ? `${st.bankName} ····${last4}` : st.bankName;
}

export async function commit(p) {
  const { st } = p;
  const importId = uid();
  const now = Date.now();
  let addedTotal = 0;
  let updatedTotal = 0;
  const accountsTouched = [];

  for (const g of p.groups) {
    const { def } = g;
    let acc = g.account;
    if (!acc) {
      acc = {
        id: uid(),
        name: accountName(st, def),
        bankId: st.bankId,
        bankName: st.bankName,
        externalKey: def.key,
        last4: def.accountNumber ? def.accountNumber.slice(-4) : null,
        holder: st.holder || null,
        type: def.type || 'corrente',
        role: def.role || 'spendibile',
        currency: def.currency || 'EUR',
        balanceMode: 'import',
        balance: null,
        order: M.accounts().length,
        createdAt: now,
      };
    }
    if (def.balance != null && (!acc.balance || (def.asOf || now) >= acc.balance.asOf)) {
      acc = { ...acc, balance: { cents: def.balance, asOf: def.asOf || now } };
    }
    if (st.holder && !acc.holder) acc = { ...acc, holder: st.holder };
    acc = { ...acc, lastImportAt: now };
    await S.put('accounts', acc.id, acc);
    accountsTouched.push(acc);

    const newTx = g.added.map(({ row, info, seq }) => M.autoClassify({
      id: uid(),
      accountId: acc.id,
      date: row.date,
      valueDate: row.valueDate,
      cents: row.cents,
      currency: row.currency || acc.currency || 'EUR',
      causale: row.causale,
      rawDescription: info.description,
      description: info.description,
      merchant: info.merchant,
      opDate: info.opDate,
      opTime: info.opTime,
      origCents: info.origCents,
      origCurrency: info.origCurrency,
      grossCents: row.grossCents ?? null,
      taxCents: row.taxCents ?? null,
      hint: row.hint || null,
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
    const updTx = g.updated.map(({ tx, row, info }) => ({
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
    addedTotal += newTx.length;
    updatedTotal += updTx.length;
  }

  await M.linkTransfers();
  await S.put('imports', importId, {
    id: importId,
    accountIds: accountsTouched.map((a) => a.id),
    bankId: st.bankId,
    kind: st.kind,
    at: now,
    from: p.from,
    to: p.to,
    added: addedTotal,
    updated: updatedTotal,
    duplicates: p.duplicates,
  });
  return { accounts: accountsTouched, added: addedTotal, updated: updatedTotal, duplicates: p.duplicates };
}
