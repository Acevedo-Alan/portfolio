/*
 * shell/taskbar.js — the task buttons: one per open window, with only the
 * focused one looking pressed. (The tray at the right of the bar lives in
 * shell/tray.js.)
 */

import { $, icon } from '../core/dom.js';
import * as bus from '../core/bus.js';
import * as windows from './windowManager.js';
import { findApp } from '../apps/registry.js';
import { translate } from '../i18n/i18n.js';

const tasks = new Map();   // window id -> <button>

export function init() {
  bus.on('window:opened', ({ id, restored }) => {
    if (!restored) addTask(id);
    markActive(windows.getActiveId());   // focus fired before the button existed
  });
  bus.on('window:closed', ({ id }) => removeTask(id));
  bus.on('window:focused', ({ id }) => markActive(id));
  bus.on('window:minimized', () => markActive(null));
}

function addTask(id) {
  if (tasks.has(id)) return;
  const app = findApp(id);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'task';
  btn.dataset.win = id;
  btn.innerHTML = `${icon(app.icon)}<span data-i18n="${app.title}"></span>`;
  btn.addEventListener('click', () => {
    if (windows.getStatus(id) === 'min') windows.open(id);
    else if (windows.getActiveId() === id) windows.minimize(id);
    else windows.focus(id);
  });
  $('#tasks').appendChild(btn);
  tasks.set(id, btn);
  translate(btn);
}

function removeTask(id) {
  const btn = tasks.get(id);
  if (btn) { btn.remove(); tasks.delete(id); }
}

function markActive(activeId) {
  tasks.forEach((btn, id) => btn.classList.toggle('active', id === activeId));
}
