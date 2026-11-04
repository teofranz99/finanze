// Impostazioni dell'app, salvate cifrate come un normale record (e quindi sincronizzate col backup).

import * as S from './store.js';
import { SECTIONS } from './sections.js';
import { wideMQ } from './platform.js';

export const PHONE_TABS = 5;
export const WIDE_TABS_MIN = 5;
export const WIDE_TABS_MAX = 8;

export const DEFAULT_SETTINGS = {
  tabOrder: ['home', 'movimenti', 'abbonamenti', 'documenti', 'desideri', 'scadenze', 'fondi', 'investimenti', 'report', 'auto'],
  wideTabCount: 7,
  widePosition: 'bottom',
  autoLockMinutes: 3,
};

export function getSettings() {
  const saved = S.get('settings', 'app') || {};
  const s = { ...DEFAULT_SETTINGS, ...saved };
  const known = new Set(SECTIONS.map((x) => x.id));
  const order = (Array.isArray(s.tabOrder) ? s.tabOrder : []).filter((id) => known.has(id));
  for (const sec of SECTIONS) if (!order.includes(sec.id)) order.push(sec.id);
  s.tabOrder = [...new Set(order)];
  s.wideTabCount = Math.min(WIDE_TABS_MAX, Math.max(WIDE_TABS_MIN, Number(s.wideTabCount) || DEFAULT_SETTINGS.wideTabCount));
  if (s.widePosition !== 'top') s.widePosition = 'bottom';
  return s;
}

export async function updateSettings(patch) {
  await S.put('settings', 'app', { ...(S.get('settings', 'app') || {}), ...patch });
}

export function visibleTabIds(wide = wideMQ.matches) {
  const s = getSettings();
  return s.tabOrder.slice(0, wide ? s.wideTabCount : PHONE_TABS);
}
