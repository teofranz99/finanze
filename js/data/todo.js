// Le cose da fare adesso, per la Home: avvisi degli abbonamenti, addebiti dopo una disdetta,
// scadenze nel periodo di preavviso, estratti conto da caricare.

import * as Sub from './subs.js';
import * as D from './deadlines.js';
import { alertSettings } from '../reminders.js';
import { relDays } from '../dates.js';

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
  return out;
}
