/*
 * shell/startMenu.js — the Start button and its menu: every app from the
 * registry, quick links (static in index.html), and "close all windows".
 * Other modules can close it by emitting "startmenu:close".
 */

import { $, icon } from '../core/dom.js';
import * as bus from '../core/bus.js';
import * as windows from './windowManager.js';
import { play } from '../audio/sounds.js';
import { translate } from '../i18n/i18n.js';

const button = () => $('#start-btn');
const menu = () => $('#start-menu');

export function init(apps) {
  const list = $('#start-apps');
  apps.forEach((app) => {
    const item = document.createElement('li');
    item.innerHTML = `<button type="button" role="menuitem">${icon(app.icon)}<span data-i18n="${app.title}"></span></button>`;
    $('button', item).addEventListener('click', () => { close(); windows.open(app.id); });
    list.appendChild(item);
  });
  translate(list);

  button().addEventListener('click', toggle);
  $('#sm-avatar').addEventListener('click', () => {            // like XP: click your picture to change it
    close();
    windows.open('display');
    bus.emit('display:tab', 'account');
  });
  $('#close-all').addEventListener('click', () => { windows.closeAll(); close(); play('min'); });
  menu().addEventListener('click', (e) => { if (e.target.closest('a')) close(); });

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
