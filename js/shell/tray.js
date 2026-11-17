/*
 * shell/tray.js — the system tray at the right of the taskbar:
 *
 *   ES/EN toggle   switches the language
 *   network icon   opens the dial-up "contact" wizard
 *   speaker icon   a volume popup (slider + mute) that drives the master
 *                  volume for every sound, including the Media Player's
 *                  Web Audio master gain (see audio/volume.js)
 *   clock          real time, refreshed every few seconds
 */

import { $ } from '../core/dom.js';
import * as bus from '../core/bus.js';
import { setLang, dict, getLang } from '../i18n/i18n.js';
import { play } from '../audio/sounds.js';
import { getLevel, isMuted, setLevel, setMuted } from '../audio/volume.js';
import { openDialupWizard } from './wizards/dialup.js';

const CLOCK_REFRESH_MS = 15000;

export function init() {
  initLanguageToggle();
  initNetwork();
  initVolume();
  initClock();
}

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

function initNetwork() {
  $('#net-btn').addEventListener('click', openDialupWizard);
}

function initVolume() {
  const button = $('#sound-btn');
  const popup = $('#vol-pop');
  const range = $('#vol-range');
  const mute = $('#vol-mute');

  const sync = () => {
    const silent = isMuted() || getLevel() === 0;
    button.classList.toggle('muted', silent);
    $('img', button).src = `imgs/xp-icons/${silent ? 'mute' : 'volume'}.png`;     // the speaker turns into the XP "muted" icon
    range.value = String(Math.round(getLevel() * 100));
    mute.checked = isMuted();
  };

  const open = () => {
    const rect = button.getBoundingClientRect();
    popup.hidden = false;
    popup.style.left = Math.max(4, Math.min(rect.left + rect.width / 2 - popup.offsetWidth / 2, window.innerWidth - popup.offsetWidth - 4)) + 'px';
    button.setAttribute('aria-expanded', 'true');
    range.focus();
  };
  const close = () => { popup.hidden = true; button.setAttribute('aria-expanded', 'false'); };

  button.addEventListener('click', () => (popup.hidden ? open() : close()));
  range.addEventListener('input', () => { setLevel(Number(range.value) / 100); if (isMuted() && Number(range.value) > 0) setMuted(false); });
  range.addEventListener('change', () => play('ding'));          // audible feedback at the new level, like XP
  mute.addEventListener('change', () => setMuted(mute.checked));
  document.addEventListener('pointerdown', (e) => { if (!popup.hidden && !e.target.closest('#vol-pop') && !e.target.closest('#sound-btn')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !popup.hidden) { close(); button.focus(); } });
  bus.on('volume:changed', sync);
  sync();
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
