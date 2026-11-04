// Palette di colori. Ognuna ha una versione chiara e una scura; da pochi colori di base
// si ricavano tutti i token usati dal CSS (sfondi, testi, vetro, ombre...).
// `sec` sono i 10 colori delle icone: home, movimenti, abbonamenti, investimenti, fondi,
// documenti, desideri, scadenze, report, neutro.

export const PALETTES = [
  {
    id: 'autunno', name: 'Autunno', desc: 'Zucca, ruggine e bordeaux',
    hero: ['#EC8A2C', '#C9451F', '#8E2B3A'],
    sec: ['#D9622B', '#6E8B3D', '#8E3B5A', '#D4A017', '#2F6F68', '#8B5E3C', '#B83A4B', '#A8321E', '#D97757', '#7A6A5D'],
    light: { bg: '#F7F1EA', elev: '#FFFCF8', elev2: '#F1E8DE', ink: '#2B1D14', tint: '#BF5418', green: '#5F8A34', red: '#C0392B' },
    dark: { bg: '#14100C', elev: '#221A14', elev2: '#2E241C', ink: '#F6EDE4', tint: '#F08A3C', green: '#8FBF5A', red: '#FF6B55' },
  },
  {
    id: 'classico', name: 'Classico', desc: 'I colori di sistema di iPhone',
    hero: ['#0A84FF', '#3D6FF2', '#5E5CE6'],
    sec: ['#007AFF', '#34C759', '#AF52DE', '#FF9500', '#30B0C7', '#5856D6', '#FF2D55', '#FF3B30', '#D97757', '#8E8E93'],
    light: { bg: '#F2F2F7', elev: '#FFFFFF', elev2: '#E9E9EE', ink: '#000000', tint: '#007AFF', green: '#34C759', red: '#FF3B30' },
    dark: { bg: '#000000', elev: '#1C1C1E', elev2: '#2C2C2E', ink: '#FFFFFF', tint: '#0A84FF', green: '#30D158', red: '#FF453A' },
  },
  {
    id: 'salvia', name: 'Salvia', desc: 'Verdi morbidi e naturali',
    hero: ['#9CC5A1', '#5E8C6A', '#2F5443'],
    sec: ['#5E8C6A', '#88A47C', '#7D6B91', '#C9A66B', '#4E7D7A', '#8C7A5B', '#C07A7A', '#B5654A', '#D19A66', '#7F8A80'],
    light: { bg: '#F2F4EF', elev: '#FBFCF9', elev2: '#E7EBE2', ink: '#1F2A22', tint: '#4F7A5A', green: '#4F8A3C', red: '#B5483B' },
    dark: { bg: '#0F1411', elev: '#1A211C', elev2: '#252E28', ink: '#EAF0EA', tint: '#8CC09A', green: '#8FC48A', red: '#E07060' },
  },
  {
    id: 'menta', name: 'Menta', desc: 'Turchese fresco e luminoso',
    hero: ['#5EEAD4', '#14B8A6', '#0F766E'],
    sec: ['#0F9D8A', '#34B27D', '#6C63C9', '#E6A23C', '#2B8FBF', '#5A7FA8', '#E0688A', '#E25C4B', '#F08A5D', '#7D9294'],
    light: { bg: '#EFF7F5', elev: '#FBFEFD', elev2: '#E2EFEC', ink: '#10302B', tint: '#0F8C7A', green: '#2E9E5B', red: '#D64545' },
    dark: { bg: '#08120F', elev: '#13201C', elev2: '#1D2D28', ink: '#E6F5F1', tint: '#3DD6BE', green: '#4ADE80', red: '#F87171' },
  },
  {
    id: 'lavanda', name: 'Lavanda', desc: 'Viola delicati',
    hero: ['#B79CF5', '#8B5CF6', '#5B3A9E'],
    sec: ['#7C5CBF', '#5DA88A', '#B565C9', '#E3A45A', '#4F8FC9', '#6A6BD1', '#D96BA0', '#D6605E', '#E39A7A', '#8E8AA3'],
    light: { bg: '#F5F3FA', elev: '#FEFDFF', elev2: '#ECE8F5', ink: '#241D33', tint: '#6E4FC0', green: '#3F9A6B', red: '#C9455E' },
    dark: { bg: '#110E18', elev: '#1D1828', elev2: '#282236', ink: '#EFEAF8', tint: '#B39DFA', green: '#6EE7A8', red: '#FB7185' },
  },
  {
    id: 'sakura', name: 'Sakura', desc: 'Rosa di ciliegio',
    hero: ['#F9A8C2', '#E26D8F', '#9D2E5B'],
    sec: ['#D9577F', '#7FB08A', '#A76BCF', '#E8A55C', '#58A6C4', '#8A7CC9', '#F07EA3', '#D85A5A', '#F19D7A', '#9C8C94'],
    light: { bg: '#FBF3F5', elev: '#FFFDFD', elev2: '#F5E6EA', ink: '#33191F', tint: '#C2416B', green: '#4E9A6A', red: '#C8332F' },
    dark: { bg: '#170D10', elev: '#24161B', elev2: '#301E25', ink: '#FBEAF0', tint: '#F38BAE', green: '#7CCB97', red: '#FF7A7A' },
  },
  {
    id: 'mezzanotte', name: 'Mezzanotte', desc: 'Blu notte e oro',
    hero: ['#3B4F80', '#24345C', '#0F172A'],
    sec: ['#C9A227', '#4F9D84', '#8C6BC8', '#D9822B', '#3B82C4', '#5B6BB5', '#C2577A', '#C2453A', '#D8A25E', '#6B7280'],
    light: { bg: '#F4F2EC', elev: '#FFFEFA', elev2: '#EAE6DC', ink: '#141B2D', tint: '#1F3A6E', green: '#3F8F6E', red: '#B83A3A' },
    dark: { bg: '#0A0E18', elev: '#141A28', elev2: '#1E2638', ink: '#EEF0F6', tint: '#D8B54A', onTint: '#1A1405', green: '#6CC79E', red: '#F2716B' },
  },
  {
    id: 'grafite', name: 'Grafite', desc: 'Bianco, nero e grigi',
    hero: ['#6B6B70', '#3A3A3C', '#1C1C1E'],
    sec: ['#3A3A3C', '#5B6B5D', '#5D5670', '#7A6A4F', '#4D6470', '#55555A', '#7A5560', '#7A4A45', '#7B6556', '#8E8E93'],
    light: { bg: '#F4F4F5', elev: '#FFFFFF', elev2: '#E9E9EB', ink: '#111113', tint: '#2C2C2E', green: '#3E8E5E', red: '#C0392B' },
    dark: { bg: '#000000', elev: '#161618', elev2: '#222225', ink: '#F2F2F3', tint: '#E5E5EA', onTint: '#000000', green: '#6FCF97', red: '#FF6B6B' },
  },
  {
    id: 'tramonto', name: 'Tramonto', desc: 'Corallo, magenta e viola',
    hero: ['#FFB36B', '#F0566A', '#8E3DB8'],
    sec: ['#E8505B', '#F59E0B', '#9B4FD1', '#F07C2E', '#2E9BB5', '#6C5DD3', '#E0457B', '#D9363E', '#FF8A65', '#8A7F99'],
    light: { bg: '#FBF3F1', elev: '#FFFDFC', elev2: '#F5E5E2', ink: '#2D1720', tint: '#D9415A', green: '#3F9A6B', red: '#D33A2C' },
    dark: { bg: '#140B10', elev: '#22141B', elev2: '#2E1C25', ink: '#FBECEF', tint: '#FF7A8A', green: '#7CCB97', red: '#FF6B5B' },
  },
  {
    id: 'vino', name: 'Vino', desc: 'Bordeaux elegante',
    hero: ['#D9607A', '#A3243F', '#5A1028'],
    sec: ['#8E1F3B', '#5E7D4A', '#6B3A78', '#C08A2E', '#2F5F6F', '#7A4A3A', '#B0405F', '#A3302B', '#C8735A', '#7D6A6E'],
    light: { bg: '#F6F1F1', elev: '#FFFCFC', elev2: '#EDE3E4', ink: '#2A1418', tint: '#8E1F3B', green: '#5E7D4A', red: '#B3261E' },
    dark: { bg: '#120A0C', elev: '#1F1215', elev2: '#2A1A1E', ink: '#F5E9EB', tint: '#E67A94', green: '#93BF7A', red: '#FF6B6B' },
  },
];

export const DEFAULT_PALETTE = 'autunno';

export function getPalette(id) {
  return PALETTES.find((p) => p.id === id) || PALETTES.find((p) => p.id === DEFAULT_PALETTE);
}

const rgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (h, a) => `rgba(${rgb(h).join(', ')}, ${a})`;
const mix = (a, b, t) => {
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

export function tokens(p, mode) {
  const m = p[mode];
  const dark = mode === 'dark';
  const ink = m.ink;
  const t = {
    '--bg': m.bg,
    '--bg-elev': m.elev,
    '--bg-elev2': m.elev2,
    '--fill': rgba(ink, dark ? 0.14 : 0.09),
    '--fill2': rgba(ink, dark ? 0.22 : 0.15),
    '--label': ink,
    '--label2': rgba(ink, 0.62),
    '--label3': rgba(ink, 0.3),
    '--sep': rgba(ink, dark ? 0.13 : 0.14),
    '--tint': m.tint,
    '--on-tint': m.onTint || '#ffffff',
    '--green': m.green,
    '--red': m.red,
    '--glass': rgba(m.bg, 0.72),
    '--glass-strong': rgba(m.elev, 0.86),
    '--glass-border': rgba(ink, 0.1),
    '--seg-on': dark ? mix(m.elev, ink, 0.22) : m.elev,
    '--shadow': dark ? 'none' : `0 1px 2px ${rgba(ink, 0.05)}, 0 6px 20px ${rgba(ink, 0.06)}`,
    '--shadow-float': dark ? '0 10px 40px rgba(0, 0, 0, 0.55)' : `0 10px 40px ${rgba(ink, 0.15)}, 0 2px 6px ${rgba(ink, 0.07)}`,
    '--hero-a': p.hero[0],
    '--hero-m': p.hero[1],
    '--hero-b': p.hero[2],
    '--lg-bg': dark
      ? `linear-gradient(180deg, ${rgba(m.elev2, 0.6)}, ${rgba(m.elev, 0.45)})`
      : `linear-gradient(180deg, rgba(255, 255, 255, 0.62), ${rgba(m.bg, 0.34)})`,
    '--lg-edge': dark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.85)',
    '--lg-edge-low': dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.3)',
    '--lg-shadow': dark
      ? '0 10px 30px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)'
      : `0 10px 30px ${rgba(ink, 0.14)}, 0 2px 6px ${rgba(ink, 0.07)}`,
    '--lg-lens': dark
      ? `linear-gradient(180deg, ${rgba(m.tint, 0.3)}, ${rgba(m.tint, 0.12)})`
      : `linear-gradient(180deg, ${rgba(mix('#ffffff', m.tint, 0.14), 0.95)}, ${rgba(mix('#ffffff', m.tint, 0.38), 0.55)})`,
    '--lg-tab': rgba(ink, 0.72),
  };
  p.sec.forEach((c, i) => { t[`--s${i + 1}`] = c; });
  return t;
}
