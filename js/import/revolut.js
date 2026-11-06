// Lettore del CSV di Revolut (in italiano o in inglese).
// Un solo file contiene più "prodotti": il conto principale ("Attuale"/"Current") e il
// conto deposito ("Deposito"/"Savings"), ognuno con il suo saldo. Diventano conti separati.
// Interessi: "Importo" è il lordo, "Costo" la ritenuta; sul conto arriva Importo − Costo.

export const BANK_ID = 'revolut';
export const BANK_NAME = 'Revolut';

const COLS = {
  type: ['tipo', 'type'],
  product: ['prodotto', 'product'],
  started: ['data di inizio', 'started date'],
  completed: ['data di completamento', 'completed date'],
  description: ['descrizione', 'description'],
  amount: ['importo', 'amount'],
  fee: ['costo', 'fee'],
  currency: ['valuta', 'currency'],
  state: ['state', 'stato'],
  balance: ['saldo', 'balance'],
};

function indexes(header) {
  const h = header.map((x) => x.toLowerCase().trim());
  const idx = {};
  for (const [k, names] of Object.entries(COLS)) idx[k] = h.findIndex((x) => names.includes(x));
  return idx;
}

export function detect(rows) {
  if (!rows.length) return false;
  const i = indexes(rows[0]);
  return ['type', 'product', 'completed', 'description', 'amount', 'fee', 'currency', 'state', 'balance'].every((k) => i[k] >= 0);
}

const num = (s) => {
  const t = String(s || '').trim();
  if (!t) return null;
  const v = Number(t.replace(/,/g, ''));
  return Number.isFinite(v) ? Math.round(v * 100) : null;
};

function productKind(p) {
  const t = p.toLowerCase();
  if (/deposit|saving|risparm/.test(t)) return 'deposito';
  if (/attuale|current/.test(t)) return 'carta';
  return 'altro';
}

function hintFor(type, desc) {
  const t = type.toLowerCase();
  if (/interess|interest/.test(t)) return 'interessi';
  if (/cambio|exchange/.test(t)) return 'giroconto';
  if (/prelievo|atm/.test(t)) return 'contanti';
  if (/^(a|da|to|from) [a-z]{3} /i.test(desc) && /(deposito|savings|vincoli|pocket|salvadanaio)/i.test(desc)) return 'giroconto';
  if (/commission|fee|canone/.test(t)) return 'banca';
  return null;
}

function merchantOf(type, desc) {
  let d = desc.replace(/^Pagamento (a favore di|da)\s+/i, '').replace(/^(Payment from|Transfer to|Transfer from|To|From)\s+/i, '');
  if (/interess|interest/i.test(type)) return 'Interessi conto deposito';
  if (/^(a|da) [A-Z]{3} /i.test(desc)) d = desc.replace(/^(A|Da) [A-Z]{3} /i, (m) => (/^A/i.test(m) ? 'Verso ' : 'Da ')).replace('senza vincoli', '').trim();
  const t = d.trim();
  return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : t;
}

export function parse(rows) {
  const idx = indexes(rows[0]);
  const accounts = new Map();
  const out = [];
  for (const r of rows.slice(1)) {
    const state = (r[idx.state] || '').toUpperCase();
    const pending = /SOSPESO|PENDING/.test(state);
    if (!pending && !/COMPLET/.test(state)) continue;                  // annullati, rifiutati, ripristinati
    const amount = num(r[idx.amount]);
    if (amount == null) continue;
    const fee = num(r[idx.fee]) || 0;
    const currency = (r[idx.currency] || 'EUR').toUpperCase();
    const product = r[idx.product] || 'Attuale';
    const kind = productKind(product);
    const key = `${kind}:${currency}`;
    const when = (r[idx.completed] || r[idx.started] || '').trim();
    const type = r[idx.type] || '';
    const desc = r[idx.description] || '';
    const hint = hintFor(type, desc);
    const row = {
      accountKey: key,
      date: when.slice(0, 10),
      valueDate: when.slice(0, 10),
      time: when.slice(11, 19),
      currency,
      cents: amount - fee,
      causale: type,
      description: desc,
      merchant: merchantOf(type, desc),
      balance: num(r[idx.balance]),
      pending,
      hint,
    };
    if (hint === 'interessi') { row.grossCents = amount; row.taxCents = fee; }
    out.push(row);
    if (!accounts.has(key)) {
      accounts.set(key, {
        key,
        name: kind === 'deposito' ? `Revolut Deposito${currency !== 'EUR' ? ` ${currency}` : ''}` : `Revolut${currency !== 'EUR' ? ` ${currency}` : ''}`,
        type: kind === 'deposito' ? 'deposito' : kind === 'carta' ? 'carta' : 'altro',
        role: kind === 'carta' ? 'spendibile' : 'risparmio',
        currency,
        accountNumber: null,
      });
    }
  }

  // Saldo e controllo per ogni conto, in ordine di tempo.
  const mismatches = [];
  for (const acc of accounts.values()) {
    const list = out.filter((r) => r.accountKey === acc.key && !r.pending && r.balance != null)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    for (let i = 1; i < list.length; i++) {
      if (list[i - 1].balance + list[i].cents !== list[i].balance) mismatches.push(`${acc.key}:${i}`);
    }
    const last = list[list.length - 1];
    acc.balance = last ? last.balance : null;
    acc.asOf = last ? Date.parse(`${last.date}T${last.time || '00:00:00'}`) : Date.now();
  }

  return {
    bankId: BANK_ID,
    bankName: BANK_NAME,
    kind: 'Estratto conto (CSV)',
    holder: null,
    accounts: [...accounts.values()],
    rows: out.map(({ time, ...r }) => ({ ...r, seqKey: time })),
    mismatches,
  };
}
