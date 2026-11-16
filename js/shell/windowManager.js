/*
 * shell/windowManager.js — turns each <section id="win-<id>"> into a window:
 * builds the title bar (and address bar), and handles open / focus / drag /
 * resize / minimize / maximize / close.
 *
 * It knows nothing about the taskbar, mascot or sounds' consumers: it just
 * announces what happened on the event bus (see core/bus.js).
 */

import { $, icon, clamp } from '../core/dom.js';
import { isMobile, desktopSize, TASKBAR_H } from '../core/viewport.js';
import * as bus from '../core/bus.js';
import { translate } from '../i18n/i18n.js';
import { play } from '../audio/sounds.js';

const CONTROLS = { normal: ['min', 'max', 'close'], fixed: ['min', 'close'], dialog: ['close'] };
const MIN_W = 300;
const MIN_H = 180;
const FIRST_WINDOW_LEFT = 210;   // clears the desktop icon columns

const GLYPHS = {
  min: '<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1" y="7" width="6" height="2" fill="#fff"/></svg>',
  max: '<svg class="g-max" viewBox="0 0 10 10" aria-hidden="true"><rect x="1" y="1" width="8" height="8" fill="none" stroke="#fff" stroke-width="1.2"/><rect x="1" y="1" width="8" height="2.4" fill="#fff"/></svg>'
     + '<svg class="g-rest" viewBox="0 0 10 10" aria-hidden="true"><rect x="3" y="1" width="6" height="6" fill="none" stroke="#fff" stroke-width="1.2"/><rect x="3" y="1" width="6" height="2" fill="#fff"/><rect x="1" y="3" width="6" height="6" fill="#2A62D8" stroke="#fff" stroke-width="1.2"/><rect x="1" y="3" width="6" height="2" fill="#fff"/></svg>',
  close: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

/** id -> { app, el, status: 'closed' | 'open' | 'min', maximized } */
const wins = new Map();
let zTop = 100;
let activeId = null;
let cascade = 0;

// ---------- Public API ----------

export function init(apps) {
  apps.forEach(build);
}

export const has = (id) => wins.has(id);
export const getStatus = (id) => (wins.has(id) ? wins.get(id).status : 'closed');
export const getActiveId = () => activeId;
export const getElement = (id) => (wins.has(id) ? wins.get(id).el : null);

export function open(id, { quiet = false } = {}) {
  const w = wins.get(id);
  if (!w) return;
  const wasClosed = w.status === 'closed';
  const restored = w.status === 'min';

  if (wasClosed) {
    place(w);
    w.el.hidden = false;
    w.el.classList.add('opening');
    w.el.addEventListener('animationend', () => w.el.classList.remove('opening'), { once: true });
    play('menu');
  } else if (restored) {
    w.el.hidden = false;
    play('restore');
  }
  w.status = 'open';
  focus(id);
  w.el.focus({ preventScroll: true });
  bus.emit('window:opened', { id, quiet, restored });
}

export function focus(id) {
  const w = wins.get(id);
  if (!w || w.status !== 'open') return;
  w.el.style.zIndex = ++zTop;
  activeId = id;
  wins.forEach((other) => other.el.classList.toggle('active', other === w));
  bus.emit('window:focused', { id });
}

export function minimize(id) {
  const w = wins.get(id);
  if (!w || w.status !== 'open') return;
  w.status = 'min';
  w.el.hidden = true;
  play('min');
  bus.emit('window:minimized', { id });
  activateTopmost();
}

export function close(id) {
  const w = wins.get(id);
  if (!w || w.status === 'closed') return;
  w.status = 'closed';
  w.el.hidden = true;
  w.maximized = false;
  w.el.classList.remove('maxi', 'active');
  bus.emit('window:closed', { id });
  activateTopmost();
}

export function closeAll() {
  wins.forEach((_, id) => close(id));
}

export function toggleMaximize(id) {
  const w = wins.get(id);
  if (!w || w.status !== 'open' || !CONTROLS[chromeOf(w.app)].includes('max')) return;
  w.maximized = !w.maximized;
  w.el.classList.toggle('maxi', w.maximized);
  const btn = $('.wb-max', w.el);
  btn.setAttribute('data-i18n-label', w.maximized ? 'win-restore' : 'win-max');
  translate(w.el);
  play('restore');
}

/** Updates the path shown in a window's address bar. */
export function setPath(id, path) {
  const span = $(`#addr-${id} span`);
  if (span) span.textContent = path;
}

// ---------- Building ----------

const chromeOf = (app) => app.chrome || 'normal';

function controlButton(act) {
  return `<button type="button" class="wb wb-${act}" data-act="${act}" data-i18n-label="win-${act}">${GLYPHS[act]}</button>`;
}

function navButtons() {
  return '<div class="addr-nav">'
    + [['back', 'i-nav-back'], ['forward', 'i-nav-fwd'], ['up', 'i-nav-up']]
      .map(([dir, sym]) => `<button type="button" class="nav-btn" data-nav="${dir}" data-i18n-label="nav-${dir}">${icon(sym)}</button>`)
      .join('')
    + '</div>';
}

function build(app) {
  const el = document.getElementById('win-' + app.id);
  const chrome = chromeOf(app);
  el.classList.add('window', chrome);
  el.hidden = true;
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', 'title-' + app.id);

  const bar = document.createElement('div');
  bar.className = 'titlebar';
  bar.innerHTML = `${icon(app.icon, 't-ico')}<span class="t-text" id="title-${app.id}" data-i18n="${app.title}"></span>`
    + `<div class="t-btns">${CONTROLS[chrome].map(controlButton).join('')}</div>`;
  el.prepend(bar);

  if (!app.noAddr) {
    const addr = document.createElement('div');
    addr.className = 'addr';
    addr.innerHTML = (app.nav ? navButtons() : '')
      + `<span data-i18n="addr-label"></span><div class="addr-box" id="addr-${app.id}">${icon('i-folder')}<span>C:\\Portfolio\\${app.id}</span></div>`;
    bar.after(addr);
  }

  const w = { app, el, status: 'closed', maximized: false };
  wins.set(app.id, w);

  el.addEventListener('pointerdown', () => focus(app.id), true);
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.wb');
    if (!btn) return;
    if (btn.dataset.act === 'min') minimize(app.id);
    else if (btn.dataset.act === 'max') toggleMaximize(app.id);
    else close(app.id);
  });
  bar.addEventListener('dblclick', (e) => {
    if (!e.target.closest('.wb') && !isMobile()) toggleMaximize(app.id);
  });
  enableDrag(w, bar);
  if (chrome === 'normal') enableResize(w);
}

// ---------- Placement, dragging, resizing ----------

function place(w) {
  const { w: vw, h: vh } = desktopSize();
  const width = Math.min(w.app.w, vw - 16);
  const height = Math.min(w.app.h, vh - 16);
  const n = cascade++ % 6;
  w.el.style.width = width + 'px';
  w.el.style.height = height + 'px';
  w.el.style.left = Math.max(8, Math.min(FIRST_WINDOW_LEFT + n * 32, vw - width - 8)) + 'px';
  w.el.style.top = Math.max(8, Math.min(20 + n * 32, vh - height - 8)) + 'px';
}

function enableDrag(w, bar) {
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.wb') || isMobile() || w.maximized) return;
    const rect = w.el.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    bar.setPointerCapture(e.pointerId);

    const move = (ev) => {
      w.el.style.left = clamp(ev.clientX - dx, 90 - rect.width, window.innerWidth - 90) + 'px';
      w.el.style.top = clamp(ev.clientY - dy, 0, window.innerHeight - TASKBAR_H - 30) + 'px';
    };
    const up = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  });
}

// Eight invisible handles around the window edge; dragging one resizes from
// that side/corner (west/north handles also move the window's origin).
function enableResize(w) {
  ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach((dir) => {
    const handle = document.createElement('div');
    handle.className = 'rz ' + dir;
    handle.setAttribute('aria-hidden', 'true');
    w.el.appendChild(handle);

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || isMobile() || w.maximized) return;
      e.preventDefault();
      const r = w.el.getBoundingClientRect();
      handle.setPointerCapture(e.pointerId);

      const move = (ev) => {
        const dx = ev.clientX - e.clientX;
        const dy = ev.clientY - e.clientY;
        let { left, top, width, height } = r;
        if (dir.includes('e')) width = Math.max(MIN_W, r.width + dx);
        if (dir.includes('s')) height = Math.max(MIN_H, r.height + dy);
        if (dir.includes('w')) { width = Math.max(MIN_W, r.width - dx); left = r.left + (r.width - width); }
        if (dir.includes('n')) {
          height = Math.max(MIN_H, r.height - dy);
          top = Math.max(0, r.top + (r.height - height));
          height = r.top + r.height - top;
        }
        Object.assign(w.el.style, { left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px' });
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  });
}

// ---------- Focus bookkeeping ----------

function activateTopmost() {
  let top = null;
  wins.forEach((w) => {
    if (w.status === 'open' && (!top || Number(w.el.style.zIndex) > Number(top.el.style.zIndex))) top = w;
  });
  if (top) {
    focus(top.app.id);
  } else {
    activeId = null;
    wins.forEach((w) => w.el.classList.remove('active'));
    bus.emit('window:focused', { id: null });
  }
}
