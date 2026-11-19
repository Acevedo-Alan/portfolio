/*
 * shell/startMenu.js — the Start button and its menu. The left column is XP's: pinned sections on top,
 * a separator, recent programs below, and an "All Programs" strip that swaps in the full list from the
 * registry. Quick links on the right are static in index.html.
 * Other modules can close it by emitting "startmenu:close".
 */

import { $, $$, icon } from '../core/dom.js';
import * as bus from '../core/bus.js';
import * as windows from './windowManager.js';
import { play } from '../audio/sounds.js';
import { translate } from '../i18n/i18n.js';

const button = () => $('#start-btn');
const menu = () => $('#start-menu');

const PINNED = ['whoami', 'experiencia', 'proyectos'];
const RECENT = ['bugsweeper', 'doom', 'chess'];

export function init(apps) {
  const list = $('#start-apps');
  const all = $('#sm-all');
  const column = $('.sm-leftcol');

  const entry = (app) => {
    const item = document.createElement('li');
    item.dataset.group = app.group || '';                      // the recruiter profile hides the "extras" group
    item.innerHTML = `<button type="button" role="menuitem">${icon(app.icon)}<span data-i18n="${app.title}"></span></button>`;
    $('button', item).addEventListener('click', () => { close(); windows.open(app.id); });
    return item;
  };
  const separator = () => {
    const li = document.createElement('li');
    li.className = 'sm-sep';
    li.setAttribute('role', 'separator');
    return li;
  };
  const byId = (ids) => ids.map((id) => apps.find((a) => a.id === id)).filter(Boolean);

  function fill(showAll) {
    list.replaceChildren();
    if (showAll) apps.forEach((app) => list.appendChild(entry(app)));
    else {
      byId(PINNED).forEach((app) => {
        const item = entry(app);
        item.classList.add('pinned');                          // bold, like XP's pinned programs
        list.appendChild(item);
      });
      list.appendChild(separator());
      byId(RECENT).forEach((app) => list.appendChild(entry(app)));
    }
    column.classList.toggle('all', showAll);
    all.setAttribute('aria-expanded', String(showAll));
    $('span', all).dataset.i18n = showAll ? 'nav-back' : 'sm-all';
    translate(column);
  }
  fill(false);
  all.addEventListener('click', () => { fill(!column.classList.contains('all')); play('menu'); });

  button().addEventListener('click', toggle);
  $('#sm-avatar').addEventListener('click', () => {            // like XP: click your picture to change it
    close();
    windows.open('display');
    bus.emit('display:tab', 'account');
  });
  menu().addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  $$('.sm-util button', menu()).forEach((btn) => btn.addEventListener('click', () => { close(); windows.open(btn.dataset.open); }));

  document.addEventListener('pointerdown', (e) => {
    if (!menu().hidden && !e.target.closest('#start-menu') && !e.target.closest('#start-btn')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu().hidden) { close(); button().focus(); }
  });
  bus.on('startmenu:close', close);
}

export function close() {
  menu().hidden = true;
  button().setAttribute('aria-expanded', 'false');
}

function toggle() {
  const opening = menu().hidden;
  menu().hidden = !opening;
  button().setAttribute('aria-expanded', String(opening));
  if (opening) { play('start'); bus.emit('startmenu:opened'); }
}
