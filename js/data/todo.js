// Le cose da fare adesso, per la Home: avvisi degli abbonamenti, addebiti dopo una disdetta,
// scadenze nel periodo di preavviso, estratti conto da caricare, fondi quasi finiti,
// soldi non miei usati per spese mie, budget vicini al limite.

import * as Sub from './subs.js';
import * as D from './deadlines.js';
import { alertSettings } from '../reminders.js';
import { relDays } from '../dates.js';
import * as F from './funds.js';
import * as B from './budgets.js';
import { formatCents } from '../money.js';

export function todoItems() {
  const out = [];
  for (const { s, st } of Sub.pendingAlerts()) {
    out.push({ href: '#/abbonamenti', icon: 'repeat', color: 'var(--s3)', label: s.name, detail: `${s.trial ? 'Fine prova' : 'Rinnovo'} ${relDays(st.next)} · da decidere` });
  }
  for (const { s } of Sub.closureAlarms()) {
    out.push({ href: '#/abbonamenti', icon: 'info', color: 'var(--red)', label: s.name, detail: 'Addebito dopo la disdetta' });
  }
  for (const d of D.open()) {
    const st = D.state(d);
    if (!st?.due) continue;
    const m = D.meta(d);
    out.push({ href: '#/scadenze', icon: m.icon, color: m.color, label: D.titleOf(d), detail: st.expired ? `Scaduta ${relDays(d.date)}` : `Scade ${relDays(d.date)}` });
  }
  const every = alertSettings().importEvery;
  for (const a of D.importAccounts()) {
    if (D.importState(a, every).late) out.push({ href: '#/scadenze', icon: 'upload', color: 'var(--s5)', label: a.name, detail: 'Estratto conto da caricare' });
  }
  for (const x of F.overdrawn()) {
    out.push({ href: '#/fondi', icon: 'info', color: 'var(--red)', label: x.account.name, detail: `Stai usando ${formatCents(-x.mine)} non tuoi` });
  }
  for (const { f, b } of F.lowFunds()) {
    out.push({ href: '#/fondi', icon: 'briefcase', color: 'var(--orange)', label: f.name, detail: b.remaining > 0 ? `Il fondo sta per finire: restano ${formatCents(b.remaining)}` : 'Il fondo è finito' });
  }
  for (const x of B.alerts()) {
    out.push({ href: '#/movimenti/budget', icon: x.t.icon, color: x.over ? 'var(--red)' : 'var(--orange)', label: `Budget ${x.t.name}`, detail: x.over ? `Superato di ${formatCents(-x.left)}` : `Al ${Math.round(x.pct * 100)}%: restano ${formatCents(x.left)}` });
  }
  return out;
}
