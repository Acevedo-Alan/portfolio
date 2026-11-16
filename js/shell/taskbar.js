/*
 * shell/taskbar.js — the bottom bar: one button per open window (only the
 * focused one looks pressed), plus the tray with the language toggle, the
 * sound switch and the clock.
 */

import { $, icon } from '../core/dom.js';
import * as bus from '../core/bus.js';
import * as windows from './windowManager.js';
import { findApp } from '../apps/registry.js';
import { setLang, dict, getLang, translate } from '../i18n/i18n.js';
import { play, isMuted, setMuted } from '../audio/sounds.js';

const CLOCK_REFRESH_MS = 15000;
const tasks = new Map();   // window id -> <button>

export function init() {
  bus.on('window:opened', ({ id, restored }) => {
    if (!restored) addTask(id);
    markActive(windows.getActiveId());   // focus fired before the button existed
  });
  bus.on('window:closed', ({ id }) => removeTask(id));
  bus.on('window:focused', ({ id }) => markActive(id));
  bus.on('window:minimized', () => markActive(null));

  initLanguageToggle();
  initSoundButton();
  initClock();
}

// ---------- Window buttons ----------

function addTask(id) {
  if (tasks.has(id)) return;
  const app = findApp(id);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'task';
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

// ---------- Tray ----------

function initLanguageToggle() {
  const es = $('#btn-es');
  const en = $('#btn-en');
  const sync = () => {
    const isEs = getLang() === 'es';
    es.classList.toggle('active', isEs);
    en.classList.toggle('active', !isEs);
    es.setAttribute('aria-pressed', String(isEs));
    en.setAttribute('aria-pressed', String(!isEs));
    es.setAttribute('aria-label', dict()['lang-es-label']);
    en.setAttribute('aria-label', dict()['lang-en-label']);
  };
  es.addEventListener('click', () => { setLang('es'); play('ding'); });
  en.addEventListener('click', () => { setLang('en'); play('ding'); });
  bus.on('lang:changed', sync);
}

function initSoundButton() {
  const btn = $('#sound-btn');
  const sync = () => {
    const label = dict()[isMuted() ? 'unmute' : 'mute'];
    btn.classList.toggle('muted', isMuted());
    btn.setAttribute('aria-pressed', String(isMuted()));
    btn.setAttribute('aria-label', label);
    btn.title = label;
  };
  btn.addEventListener('click', () => { setMuted(!isMuted()); play('ding'); });
  bus.on('sound:muted', sync);
  bus.on('lang:changed', sync);
}

function initClock() {
  const clock = $('#clock');
  const tick = () => {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString(getLang() === 'en' ? 'en-US' : 'es-AR', { hour: '2-digit', minute: '2-digit' });
    clock.dateTime = now.toISOString();
  };
  setInterval(tick, CLOCK_REFRESH_MS);
  bus.on('lang:changed', tick);
  tick();
}
