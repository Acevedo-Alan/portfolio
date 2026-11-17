/*
 * shell/contextMenu.js — the XP right-click menu.
 *
 * Replaces the browser's menu on the desktop background and on desktop icons
 * only. Everywhere else (inside windows, on links, in text fields, on the
 * taskbar) the native menu is left alone so copy/paste and "open link" keep
 * working.
 *
 * Menus are described as data: [{ label, onClick, submenu, bold, separator }].
 * Keyboard: Up/Down move, Right/Enter open a submenu, Left/Esc close it.
 */

import { $, $$, escapeHTML, clamp } from '../core/dom.js';
import { t } from '../i18n/i18n.js';
import { play } from '../audio/sounds.js';
import * as windows from './windowManager.js';
import * as desktopIcons from './desktopIcons.js';

const NATIVE_MENU_ZONES = '.window, .taskbar, #start-menu, .mascot, #balloon, .xp-backdrop, #vol-pop, input, textarea, a';
let menu = null;

export function init() {
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest(NATIVE_MENU_ZONES)) return;          // leave the native menu alone
    e.preventDefault();
    const iconBtn = e.target.closest('.d-icon');
    show(e.clientX, e.clientY, iconBtn ? iconItems(iconBtn.dataset.app) : desktopItems());
  });
  document.addEventListener('pointerdown', (e) => { if (menu && !e.target.closest('.ctx-menu')) close(); });
  window.addEventListener('blur', close);
  window.addEventListener('resize', close);
}

// ---------- Menu contents ----------

function desktopItems() {
  return [
    {
      label: t('ctx-arrange'),
      submenu: [
        { label: t('ctx-name'), onClick: () => desktopIcons.arrangeBy('name') },
        { label: t('ctx-size'), onClick: () => desktopIcons.arrangeBy('size') },
        { label: t('ctx-type'), onClick: () => desktopIcons.arrangeBy('type') },
      ],
    },
    { label: t('ctx-refresh'), onClick: desktopIcons.refresh },
    { separator: true },
    { label: t('ctx-properties'), onClick: () => windows.open('display') },
  ];
}

const iconItems = (id) => [{ label: t('ctx-open'), bold: true, onClick: () => windows.open(id) }];

// ---------- Rendering ----------

function build(items) {
  const list = document.createElement('ul');
  list.className = 'ctx-menu';
  list.setAttribute('role', 'menu');
  list.setAttribute('aria-label', t('ctx-menu'));

  items.forEach((item) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'none');
    if (item.separator) {
      li.className = 'ctx-sep';
      li.innerHTML = '<hr>';
      list.appendChild(li);
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ctx-item' + (item.bold ? ' bold' : '');
    btn.setAttribute('role', 'menuitem');
    btn.innerHTML = `<span>${escapeHTML(item.label)}</span>${item.submenu ? '<span class="ctx-arrow" aria-hidden="true">▸</span>' : ''}`;
    li.appendChild(btn);

    if (item.submenu) {
      const sub = build(item.submenu);
      sub.classList.add('ctx-sub');
      btn.setAttribute('aria-haspopup', 'menu');
      btn.setAttribute('aria-expanded', 'false');
      li.appendChild(sub);
      const open = () => { li.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); fitSubmenu(sub); };
      const shut = () => { li.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
      li.addEventListener('mouseenter', open);
      li.addEventListener('mouseleave', shut);
      btn.addEventListener('click', open);
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open(); $('.ctx-item', sub).focus(); }
      });
      sub.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(); btn.focus(); }
      });
    } else {
      btn.addEventListener('click', () => { close(); play('menu'); item.onClick && item.onClick(); });
    }
    list.appendChild(li);
  });

  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const entries = $$(':scope > li > .ctx-item', list);
    const at = entries.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % entries.length : (at - 1 + entries.length) % entries.length;
    entries[next].focus();
  });
  return list;
}

/** Flips a submenu to the left when it would run off the screen. */
function fitSubmenu(sub) {
  sub.classList.remove('flip');
  const rect = sub.getBoundingClientRect();
  if (rect.right > window.innerWidth) sub.classList.add('flip');
}

function show(x, y, items) {
  close();
  menu = build(items);
  menu.style.visibility = 'hidden';
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = clamp(x, 0, window.innerWidth - rect.width - 4) + 'px';
  menu.style.top = clamp(y, 0, window.innerHeight - rect.height - 44) + 'px';
  menu.style.visibility = '';
  $('.ctx-item', menu).focus();
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); } });
}

function close() {
  if (menu) { menu.remove(); menu = null; }
}
