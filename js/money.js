// Importi in centesimi (interi) per evitare errori di arrotondamento.

// useGrouping 'always': anche 4.869,75 € con il punto delle migliaia, come 16.738,22 €.
const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });

// "1.234,56" / "-3.000,00" → centesimi. null se non è un importo.
export function parseItAmount(s) {
  const t = String(s).replace(/\s/g, '');
  if (!/^[-+]?\d{1,3}(\.\d{3})*,\d{2}$|^[-+]?\d+,\d{2}$/.test(t)) return null;
  const neg = t.startsWith('-');
  const digits = t.replace(/[-+.]/g, '').replace(',', '');
  const v = parseInt(digits, 10);
  return neg ? -v : v;
}

export function formatCents(cents, { sign = false } = {}) {
  const s = eur.format(cents / 100);
  return sign && cents > 0 ? `+${s}` : s;
}

// "dd/mm/yyyy" → "yyyy-mm-dd"
export function itDateToIso(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s).trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function isoToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Codici ISO numerici delle valute più comuni.
export const CURRENCY_NUM = {
  840: 'USD', 826: 'GBP', 756: 'CHF', 978: 'EUR', 392: 'JPY', 124: 'CAD', 36: 'AUD',
  752: 'SEK', 578: 'NOK', 208: 'DKK', 985: 'PLN', 203: 'CZK', 348: 'HUF', 949: 'TRY', 156: 'CNY',
};
