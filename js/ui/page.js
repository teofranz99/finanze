// Struttura di pagina in stile iOS: titolo grande che, scorrendo, passa nella barra in alto sfocata.
import { html } from '../util.js';
import { icon } from './icons.js';

export function page({ title, eyebrow, back, right, body, large = true }) {
  return html`
  <div class="page">
    <header class="navbar ${large ? '' : 'always'}">
      <div class="navbar-inner">
        <div class="nav-side nav-left">${back ? html`<a class="nav-back" href="#/${back.href}">${icon('chevron-left')}<span>${back.label}</span></a>` : ''}</div>
        <div class="nav-title">${title}</div>
        <div class="nav-side nav-right">${right || ''}</div>
      </div>
    </header>
    <div class="page-content">
      ${large ? html`<div class="large-title-wrap">${eyebrow ? html`<div class="eyebrow">${eyebrow}</div>` : ''}<h1 class="large-title">${title}</h1></div>` : ''}
      ${body}
    </div>
  </div>`;
}

export function enhancePage(el) {
  const bar = el.querySelector('.navbar');
  const title = el.querySelector('.large-title');
  if (!bar) return null;
  if (!title) {
    const onScrollAlways = () => bar.classList.toggle('scrolled', window.scrollY > 2);
    addEventListener('scroll', onScrollAlways, { passive: true });
    onScrollAlways();
    return () => removeEventListener('scroll', onScrollAlways);
  }
  let raf = 0;
  const update = () => {
    raf = 0;
    const barBottom = bar.getBoundingClientRect().bottom;
    const r = title.getBoundingClientRect();
    bar.classList.toggle('show-title', r.bottom < barBottom + 2);
    bar.classList.toggle('scrolled', r.top < barBottom - 4);
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', onScroll, { passive: true });
  update();
  return () => removeEventListener('scroll', onScroll);
}
