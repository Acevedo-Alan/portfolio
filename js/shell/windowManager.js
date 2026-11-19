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
import * as motion from './motion.js';

const CONTROLS = { normal: ['min', 'max', 'close'], fixed: ['min', 'close'], skin: ['min', 'close'], dialog: ['close'] };
const MIN_W = 300;
const MIN_H = 180;
const FIRST_WINDOW_LEFT = 210;   // clears the desktop icon columns

const GLYPHS = {
  min: '<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1" y="7" width="6" height="2" fill="#fff"/></svg>',
  max: '<svg class="g-max" viewBox="0 0 10 10" aria-hidden="true"><rect x="1" y="1" width="8" height="8" fill="none" stroke="#fff" stroke-width="1.2"/><rect x="1" y="1" width="8" height="2.4" fill="#fff"/></svg>'
     + '<svg class="g-rest" viewBox="0 0 10 10" aria-hidden="true"><rect x="3" y="1" width="6" height="6" fill="none" stroke="#fff" stroke-width="1.2"/><rect x="3" y="1" width="6" height="2" fill="#fff"/><rect x="1" y="3" width="6" height="6" fill="#2A62D8" stroke="#fff" stroke-width="1.2"/><rect x="1" y="3" width="6" height="2" fill="#fff"/></svg>',
  close: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

/** id -> { app, el, status: 'closed' | 'open' | 'min', maximized, leaving } (leaving = the effect still hiding it) */
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
  cancelLeaving(w);

  if (wasClosed) {
    w.el.classList.remove('maxi');
    place(w);
    w.el.hidden = false;
    motion.windowOpen(w.el);
    play('menu');
  } else if (restored) {
    w.el.hidden = false;
    motion.windowRestore(w.el, taskRect(id));
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
  leave(w, motion.windowMinimize(w.el, taskRect(id)));
  play('min');
  bus.emit('window:minimized', { id });
  activateTopmost();
}

/** "Show desktop": minimizes every open window. */
export function minimizeAll() {
  [...wins.keys()].forEach((id) => minimize(id));
}

export function close(id) {
  const w = wins.get(id);
  if (!w || w.status === 'closed') return;
  const wasVisible = !w.el.hidden;
  w.status = 'closed';
  w.maximized = false;
  w.el.classList.remove('active');
  if (wasVisible) leave(w, motion.windowClose(w.el)); else { w.el.hidden = true; w.el.classList.remove('maxi'); }
  bus.emit('window:closed', { id });
  activateTopmost();
}

export function closeAll() {
  wins.forEach((_, id) => close(id));
}

export function toggleMaximize(id) {
  const w = wins.get(id);
  if (!w || w.status !== 'open' || !CONTROLS[chromeOf(w.app)].includes('max')) return;
  const before = w.el.getBoundingClientRect();
  w.maximized = !w.maximized;
  w.el.classList.toggle('maxi', w.maximized);
  motion.windowResize(w.el, before);
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

// ---------- Leaving effects ----------

/** The task button a window minimizes to / restores from (null when it has none yet). */
const taskRect = (id) => {
  const button = document.querySelector(`.task[data-win="${id}"]`);
  return button ? button.getBoundingClientRect() : null;
};

/** Keeps `w` on screen, inert, until its minimize/close effect ends, then hides it. */
function leave(w, effect) {
  w.leaving = effect;
  w.el.classList.add('leaving');
  effect.finished.then(() => {
    if (w.leaving !== effect) return;            // reopened meanwhile
    w.leaving = null;
    w.el.classList.remove('leaving');
    w.el.hidden = true;
    if (w.status === 'closed') w.el.classList.remove('maxi');
  });
}

function cancelLeaving(w) {
  if (!w.leaving) return;
  w.leaving.cancel();
  w.leaving = null;
  w.el.classList.remove('leaving');
}

// ---------- Building ----------

const chromeOf = (app) => app.chrome || 'normal';

function controlButton(act) {
  return `<button type="button" class="wb wb-${act}" data-act="${act}" data-i18n-label="win-${act}">${GLYPHS[act]}</button>`;
}

function navButtons() {
  return '<div class="addr-nav">'
    + [['back', 'back'], ['forward', 'forward'], ['up', 'up']]
      .map(([dir, sym]) => `<button type="button" class="nav-btn" data-nav="${dir}" data-i18n-label="nav-${dir}">${icon(sym)}</button>`)
      .join('')
    + '</div>';
}

const VIEWS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" fill="#fff" stroke="#3F5A8C"/><path d="M6 8h4M6 12h4M6 16h4" stroke="#3F5A8C" stroke-width="2"/><path d="M13 8h5M13 12h5M13 16h5" stroke="#9BB0D6" stroke-width="2"/></svg>';

/** The standard toolbar of an Explorer-style window: Back, Forward, Up and a Views menu. js/apps/experience.js wires it. */
function toolbar() {
  const button = (name, sym) => `<button type="button" class="xtb-btn" data-tb="${name}">${icon(sym)}<span data-i18n="nav-${name}"></span></button>`;
  return `<div class="xtb" role="toolbar" data-i18n-label="tb-label">`
    + button('back', 'back') + button('forward', 'forward') + button('up', 'up')
    + '<span class="xtb-sep" aria-hidden="true"></span>'
    + `<span class="xtb-drop"><button type="button" class="xtb-btn" data-tb="views" aria-haspopup="menu" aria-expanded="false">${VIEWS_ICON}<span data-i18n="tb-views"></span><i class="xtb-caret" aria-hidden="true"></i></button>`
    + '<ul class="xtb-menu" role="menu" hidden>'
    + ['details', 'list'].map((view) => `<li role="none"><button type="button" role="menuitemradio" aria-checked="false" data-view="${view}"><span class="xtb-dot" aria-hidden="true"></span><span data-i18n="tb-view-${view}"></span></button></li>`).join('')
    + '</ul></span></div>';
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
      + `<span data-i18n="addr-label"></span><div class="addr-box" id="addr-${app.id}">${icon('folder-closed')}<span>C:\\Portfolio\\${app.id}</span></div>`;
    bar.after(addr);
  }
  if (app.toolbar) {
    const tb = document.createElement('div');
    tb.innerHTML = toolbar();
    bar.after(tb.firstChild);                                     // title bar, toolbar, then the address bar
  }

  const w = { app, el, status: 'closed', maximized: false, leaving: null };
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
