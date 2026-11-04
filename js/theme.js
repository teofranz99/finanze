// Aspetto: tema (auto/chiaro/scuro) e palette. Scrive i colori come variabili CSS sulla radice.
// Sono preferenze di questo dispositivo, salvate in chiaro (non sono dati personali)
// così valgono anche nella schermata di sblocco.

import { getPalette, tokens, DEFAULT_PALETTE } from './palettes.js';

const mq = matchMedia('(prefers-color-scheme: dark)');
const state = { theme: 'auto', palette: DEFAULT_PALETTE };

function resolvedMode() {
  if (state.theme === 'dark') return 'dark';
  if (state.theme === 'light') return 'light';
  return mq.matches ? 'dark' : 'light';
}

function apply() {
  const root = document.documentElement;
  if (state.theme === 'light' || state.theme === 'dark') root.dataset.theme = state.theme;
  else delete root.dataset.theme;
  const mode = resolvedMode();
  const p = getPalette(state.palette);
  for (const [k, v] of Object.entries(tokens(p, mode))) root.style.setProperty(k, v);
  root.style.colorScheme = mode;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', p[mode].bg));
}

mq.addEventListener('change', () => { if (state.theme === 'auto') apply(); });

export function applyAppearance({ theme, palette } = {}) {
  if (theme !== undefined) state.theme = theme || 'auto';
  if (palette !== undefined) state.palette = palette || DEFAULT_PALETTE;
  apply();
}

export const currentPalette = () => getPalette(state.palette).id;
