/*
 * shell/keyboard.js — desktop keyboard shortcuts.
 *
 *   Alt+W (Shift reverses)   the window switcher: hold Alt, press W to cycle through the open
 *                            windows, release Alt to switch. (Browsers never receive the real
 *                            Alt+Tab — the OS keeps it — so this is the closest thing.)
 *   Esc                      closes the window in front, unless something smaller is open first
 *                            (menu, dialog, Patito's bubble, the switcher)
 *   Enter on a desktop icon  opens it (the icons are real buttons, so this works natively;
 *                            arrow keys move between them)
 */

import { $, $$, icon, escapeHTML } from '../core/dom.js';
import * as windows from './windowManager.js';
import { findApp } from '../apps/registry.js';
import { t } from '../i18n/i18n.js';
import { play } from '../audio/sounds.js';

let panel = null;
let order = [];
let at = 0;

// ---------- Window switcher ----------

const openWindowIds = () => [...document.querySelectorAll('.task')].map((btn) => btn.dataset.win).filter((id) => windows.getStatus(id) !== 'closed');

function paint() {
  panel.innerHTML = `<ul role="listbox" aria-label="${escapeHTML(t('switch-label'))}">${order.map((id, i) => {
    const app = findApp(id);
    return `<li role="option" aria-selected="${i === at}" class="${i === at ? 'on' : ''}">${icon(app.icon)}</li>`;
  }).join('')}</ul><p class="sw-title">${escapeHTML(t(findApp(order[at]).title))}</p>`;
}

function startSwitcher(step) {
  order = openWindowIds();
  if (order.length < 2) return;
  const current = order.indexOf(windows.getActiveId());
  at = (Math.max(current, 0) + step + order.length) % order.length;
  panel = document.createElement('div');
  panel.className = 'switcher';
  panel.setAttribute('role', 'status');
  document.body.appendChild(panel);
  paint();
  play('menu');
}

function cycle(step) {
  at = (at + step + order.length) % order.length;
  paint();
  play('menu');
}

function endSwitcher(commit) {
  if (!panel) return;
  panel.remove();
  panel = null;
  if (commit) windows.open(order[at]);       // opens a minimized window or just brings it forward
}

// ---------- Escape ----------

/** True when something that should take Escape first is showing. */
function escapeBelongsElsewhere() {
  return !!(document.querySelector('.ctx-menu, .xp-backdrop, .power-backdrop, .power-screen, .bsod, .welcome, #start-menu:not([hidden]), #vol-pop:not([hidden]), #mascot-bubble:not([hidden])'));
}

// ---------- Desktop icon navigation ----------

function moveBetweenIcons(e) {
  const icons = $$('.d-icon');
  const at = icons.indexOf(document.activeElement);
  if (at < 0 || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
  icons[(at + step + icons.length) % icons.length].focus();
}

export function init() {
  window.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      const step = e.shiftKey ? -1 : 1;
      if (panel) cycle(step); else startSwitcher(step);
      return;
    }
    if (panel && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endSwitcher(false); return; }
    if (e.key === 'Escape' && !e.defaultPrevented && !escapeBelongsElsewhere()) {
      const id = windows.getActiveId();
      if (id) { e.preventDefault(); windows.close(id); }
      return;
    }
    if (!panel) moveBetweenIcons(e);
  }, true);

  window.addEventListener('keyup', (e) => { if (e.key === 'Alt') endSwitcher(true); });
  window.addEventListener('blur', () => endSwitcher(false));
}
