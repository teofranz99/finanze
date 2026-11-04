// Fogli modali che salgono dal basso, conferme e avvisi brevi (toast).
import { html, setHtml } from '../util.js';

export function openSheet(content, { dismissible = true, className = '' } = {}) {
  const layer = document.createElement('div');
  layer.className = 'sheet-layer';
  setHtml(layer, html`
    <div class="sheet-backdrop"></div>
    <div class="sheet ${className}" role="dialog" aria-modal="true">
      <div class="sheet-grabber"></div>
      <div class="sheet-content">${content}</div>
    </div>`);
  document.body.appendChild(layer);
  const prevFocus = document.activeElement;

  let closed = false;
  let resolveClosed;
  const closedP = new Promise((r) => { resolveClosed = r; });

  const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(null); };

  function close(value) {
    if (closed) return;
    closed = true;
    layer.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      layer.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      resolveClosed(value);
    };
    layer.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 450);
  }

  if (dismissible) layer.querySelector('.sheet-backdrop').addEventListener('click', () => close(null));
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('open')));

  return { el: layer.querySelector('.sheet-content'), close, closed: closedP };
}

export function confirmDialog({ title, message, confirmLabel = 'Conferma', cancelLabel = 'Annulla', destructive = false }) {
  const s = openSheet(html`
    <div class="dialog">
      <h2>${title}</h2>
      ${message ? html`<p>${message}</p>` : ''}
      <div class="dialog-actions">
        <button type="button" class="btn ${destructive ? 'destructive' : ''}" data-ok>${confirmLabel}</button>
        <button type="button" class="btn secondary" data-cancel>${cancelLabel}</button>
      </div>
    </div>`);
  s.el.querySelector('[data-ok]').onclick = () => s.close(true);
  s.el.querySelector('[data-cancel]').onclick = () => s.close(false);
  return s.closed.then((v) => v === true);
}

export function alertDialog({ title, message, body, okLabel = 'OK' }) {
  const s = openSheet(html`
    <div class="dialog">
      <h2>${title}</h2>
      ${message ? html`<p>${message}</p>` : ''}
      ${body || ''}
      <div class="dialog-actions"><button type="button" class="btn" data-ok>${okLabel}</button></div>
    </div>`);
  s.el.querySelector('[data-ok]').onclick = () => s.close(true);
  return s.closed;
}

// Chiede un testo segreto. `validate(value)` può restituire un messaggio d'errore.
export function promptSecret({ title, message, placeholder = 'Password', autocomplete = 'current-password', type = 'password', mono = false, submitLabel = 'Continua', validate }) {
  const s = openSheet(html`
    <form class="dialog" novalidate>
      <h2>${title}</h2>
      ${message ? html`<p>${message}</p>` : ''}
      <label class="field"><input class="text ${mono ? 'mono' : ''}" name="secret" type="${type}" placeholder="${placeholder}" autocomplete="${autocomplete}" autocapitalize="${mono ? 'characters' : 'off'}" spellcheck="false" required></label>
      <p class="form-error" hidden></p>
      <div class="dialog-actions">
        <button type="submit" class="btn">${submitLabel}</button>
        <button type="button" class="btn secondary" data-cancel>Annulla</button>
      </div>
    </form>`);
  const form = s.el.querySelector('form');
  const input = form.elements.secret;
  const err = form.querySelector('.form-error');
  const submit = form.querySelector('[type=submit]');
  setTimeout(() => input.focus(), 350);
  form.querySelector('[data-cancel]').onclick = () => s.close(null);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const value = input.value;
    if (!value) return;
    if (validate) {
      submit.disabled = true;
      submit.textContent = 'Verifica…';
      let msg = null;
      try { msg = await validate(value); } catch (ex) { msg = ex.message; }
      submit.disabled = false;
      submit.textContent = submitLabel;
      if (msg) {
        err.textContent = msg;
        err.hidden = false;
        form.classList.remove('shake');
        void form.offsetWidth;
        form.classList.add('shake');
        input.select();
        return;
      }
    }
    s.close(value);
  };
  return s.closed;
}

let toastEl = null;
let toastTimer = 0;
export function toast(message, { type = 'info', duration = 2600 } = {}) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.dataset.type = type;
  toastEl.classList.remove('show');
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
}
