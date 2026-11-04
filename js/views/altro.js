// "Altro": le sezioni che non stanno nella barra, più le Impostazioni.
import { setHtml, html } from '../util.js';
import { page, enhancePage } from '../ui/page.js';
import { group, navRow } from '../ui/list.js';
import { getSettings, visibleTabIds } from '../settings.js';
import { sectionById } from '../sections.js';

export function altroView(el) {
  const vis = new Set(visibleTabIds());
  const hidden = getSettings().tabOrder.filter((id) => !vis.has(id)).map(sectionById);

  setHtml(el, page({
    title: 'Altro',
    body: html`
      ${hidden.length ? group({
        rows: hidden.map((s) => navRow({ href: `#/${s.id}`, icon: s.icon, color: s.color, label: s.title })),
      }) : ''}
      ${group({
        rows: navRow({ href: '#/impostazioni', icon: 'sliders', color: '#8E8E93', label: 'Impostazioni' }),
        footer: 'Puoi scegliere quali sezioni tenere nella barra da Impostazioni › Barra delle sezioni.',
      })}`,
  }));
  return enhancePage(el);
}
