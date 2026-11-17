/*
 * shell/power.js — Log Off, Turn Off (Stand By / Turn Off / Restart), the way XP does it.
 *
 *   Log Off   "Logging off…" screen + sound, then back to the welcome screen
 *   Turn Off  grayed-out desktop with the three-button dialog; Turn Off plays the shutdown
 *             sound on the blue screen, then goes black until the visitor clicks or presses a key
 *   Restart   same shutdown, then the boot logo with its sliding bar, then the welcome screen
 *   Stand By  black screen; any click or key resumes where you left off
 *
 * It's theatre over a single page: nothing reloads. Windows close, the music stops (the
 * "power:down" event), and the welcome flag is cleared so a reload also starts at log-on.
 */

import { $, icon, escapeHTML, setInert, trapFocus } from '../core/dom.js';
import * as bus from '../core/bus.js';
import { t } from '../i18n/i18n.js';
import { play } from '../audio/sounds.js';
import * as windows from './windowManager.js';
import * as welcome from './welcome.js';
import { desktopFadeIn } from './motion.js';

const INERT = ['#desktop', '.taskbar', '#start-menu', '.mascot', '#balloon', '#vol-pop'];
const SHUTDOWN_MS = 3300;      // the shutdown chime is 3.2 s
const LOGOFF_MS = 2300;
const BOOT_MS = 2800;
const SESSION_KEY = 'portfolio-welcomed';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const FLAG = '<svg class="ps-flag" aria-hidden="true" focusable="false"><use href="#i-flag"/></svg>';

let screenEl = null;
let busy = false;

// ---------- Full-screen states ----------

function showScreen(mode, html) {
  if (!screenEl) {
    screenEl = document.createElement('div');
    screenEl.className = 'power-screen';
    document.body.appendChild(screenEl);
    setInert(INERT, true);
  }
  screenEl.dataset.mode = mode;
  screenEl.innerHTML = html;
  return screenEl;
}

function hideScreen() {
  if (!screenEl) return;
  screenEl.remove();
  screenEl = null;
  setInert(INERT, false);
}

const blueScreen = (title, sub = '') => `
  <div class="ws-top" aria-hidden="true"></div>
  <div class="ps-main" role="status">
    <div class="ws-brand">${FLAG}<span>${escapeHTML(t('ws-title'))}</span></div>
    <p class="ps-msg">${escapeHTML(title)}</p>
    ${sub ? `<p class="ps-sub">${escapeHTML(sub)}</p>` : ''}
  </div>
  <div class="ws-bottom" aria-hidden="true"></div>`;

const bootScreen = () => `
  <div class="ps-main" role="status" aria-label="${escapeHTML(t('pw-booting'))}">
    <div class="ws-brand">${FLAG}<span>${escapeHTML(t('ws-title'))}</span></div>
    <div class="boot-bar" aria-hidden="true"><i></i><i></i><i></i></div>
  </div>
  <p class="ps-copy" aria-hidden="true">© Alan Acevedo</p>`;

/** Resolves on the next click, tap or key press. */
const anyInput = () => new Promise((resolve) => {
  const done = () => { ['pointerdown', 'keydown'].forEach((type) => window.removeEventListener(type, done, true)); resolve(); };
  ['pointerdown', 'keydown'].forEach((type) => window.addEventListener(type, done, true));
});

// ---------- Flows ----------

function leaveDesktop() {
  bus.emit('power:down');
  bus.emit('startmenu:close');
  windows.closeAll();
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* storage unavailable */ }
}

/** Back to the welcome screen, then the desktop. */
async function logOn() {
  hideScreen();
  await welcome.run({ force: true });
  windows.open('whoami', { quiet: true });
  desktopFadeIn();
}

export async function logOff() {
  if (busy) return;
  busy = true;
  leaveDesktop();
  showScreen('logoff', blueScreen(t('pw-logoff'), t('pw-saving')));
  play('logoff');
  await sleep(LOGOFF_MS);
  await logOn();
  busy = false;
}

async function shutDown({ restart }) {
  if (busy) return;
  busy = true;
  leaveDesktop();
  showScreen('shutdown', blueScreen(t('pw-shutting')));
  play('shutdown');
  await sleep(SHUTDOWN_MS);

  if (restart) {
    await boot();
  } else {
    showScreen('off', `<p class="ps-hint">${escapeHTML(t('pw-off-hint'))}</p>`);
    await anyInput();
    await boot();
  }
  await logOn();
  busy = false;
}

async function boot() {
  showScreen('boot', bootScreen());
  await sleep(BOOT_MS);
}

async function standBy() {
  if (busy) return;
  busy = true;
  bus.emit('power:standby');
  showScreen('off', `<p class="ps-hint">${escapeHTML(t('pw-standby-hint'))}</p>`);
  await sleep(300);                        // the click that chose Stand By must not wake it
  await anyInput();
  hideScreen();
  busy = false;
}

// ---------- The Turn Off dialog ----------

const CHOICES = [
  { act: 'standby', icon: 'standby', label: 'pw-standby' },
  { act: 'off', icon: 'power', label: 'pw-off' },
  { act: 'restart', icon: 'restart', label: 'pw-restart' },
];

export function openTurnOff() {
  if (busy || $('.power-backdrop')) return;
  const previous = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'power-backdrop';
  backdrop.innerHTML = `
    <div class="power-dialog" role="dialog" aria-modal="true" aria-labelledby="pd-title">
      <div class="pd-head"><strong id="pd-title">${escapeHTML(t('pw-turnoff'))}</strong></div>
      <div class="pd-body">
        ${CHOICES.map((c) => `<button type="button" class="pd-choice" data-act="${c.act}">${icon(c.icon)}<span>${escapeHTML(t(c.label))}</span></button>`).join('')}
      </div>
      <div class="pd-foot"><button type="button" class="btn-xp" data-act="cancel">${escapeHTML(t('btn-cancel'))}</button></div>
    </div>`;
  document.body.appendChild(backdrop);
  setInert(INERT, true);
  play('exclamation');
  $('[data-act="off"]', backdrop).focus();

  const release = trapFocus(backdrop, () => close());
  function close() {
    release();
    backdrop.remove();
    setInert(INERT, false);
    if (previous && previous.focus) previous.focus();
  }

  backdrop.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    close();
    if (act === 'standby') standBy();
    else if (act === 'off') shutDown({ restart: false });
    else if (act === 'restart') shutDown({ restart: true });
  });
}

export function init() {
  $('#logoff').addEventListener('click', () => { bus.emit('startmenu:close'); logOff(); });
  $('#turnoff').addEventListener('click', () => { bus.emit('startmenu:close'); openTurnOff(); });
}
