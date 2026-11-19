/*
 * shell/mascot.js — Patito, the rubber-duck mascot. Scripted tips only (no
 * network, no API): ES/EN strings in js/i18n/*.js, keyed `tip-<app id>`,
 * `mascot-greet`, `mascot-bye` and the `mascot-idle` list.
 *
 * Opt-in and dismissible:
 *   - first visit on desktop: greets once, then stays out of the way;
 *   - the × (or the Start-menu item) hides it for good; the choice is stored;
 *   - on phones it stays off until the visitor enables it from the Start menu.
 *
 * Reacts to the event bus: a short hover over a desktop icon, or opening a
 * window, shows that app's tip; after IDLE_MS of quiet it offers a random tip.
 * Contextual offers ("want the CV?") come from shell/mascotTips.js through offer(),
 * which adds an action button to the bubble.
 */

import { $ } from '../core/dom.js';
import { isMobile } from '../core/viewport.js';
import * as bus from '../core/bus.js';
import * as storage from '../core/storage.js';
import { t, dict, translate } from '../i18n/i18n.js';
import * as balloon from './balloon.js';
import { getActiveId } from './windowManager.js';

const STORAGE_KEY = 'portfolio-mascot';        // 'on' | 'off' (absent = never asked)
const IDLE_MS = 50000;
const BUBBLE_MS = 9000;
const GREETING_MS = 14000;
const GREETING_DELAY_MS = 2200;
const SAME_TIP_COOLDOWN_MS = 15000;
const OFFER_MS = 16000;

let on = false;
let bubbleTimer = null;
let idleTimer = null;
let lastTip = { key: '', at: 0 };

export const isOn = () => on;

/** Says `text` with a button that runs `action.run` ({ label, run }). No-op while Patito is hidden. Returns whether it spoke. */
export function offer(text, action) {
  if (!on) return false;
  say(text, OFFER_MS, action);
  return true;
}

export function init() {
  bus.on('power:down', hideBubble);
  bus.on('icon:hover', ({ id }) => tip('tip-' + id));
  bus.on('window:opened', ({ id, quiet }) => { if (!quiet) tip('tip-' + id); });

  $('#mascot-x').addEventListener('click', dismiss);
  $('#mascot-toggle').addEventListener('click', () => {
    bus.emit('startmenu:close');
    if (on) dismiss(); else show(true);
  });
  $('#mascot-char').addEventListener('click', () => {
    tip(getActiveId() ? 'tip-' + getActiveId() : 'mascot-greet');
    if ($('#mascot-bubble').hidden) say(randomIdleTip());   // that tip was on cooldown
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideBubble(); });

  syncMenuLabel();
  const stored = storage.get(STORAGE_KEY);
  if (isMobile() || stored === 'off') balloon.show();                       // plain hint instead
  else if (stored === 'on') show(false);
  else setTimeout(() => show(true), GREETING_DELAY_MS);                     // first visit
}

// ---------- State ----------

function show(greet) {
  on = true;
  $('#mascot').hidden = false;
  storage.set(STORAGE_KEY, 'on');
  syncMenuLabel();
  armIdle();
  if (greet) say(t('mascot-greet'), GREETING_MS);
}

function dismiss() {
  on = false;
  $('#mascot').hidden = true;
  hideBubble();
  clearTimeout(idleTimer);
  storage.set(STORAGE_KEY, 'off');
  syncMenuLabel();
  balloon.show('mascot-name', 'mascot-bye');
}

function syncMenuLabel() {
  $('#mascot-toggle-label').setAttribute('data-i18n', on ? 'mascot-hide-menu' : 'mascot-show');
  translate($('#mascot-toggle').parentElement);
}

// ---------- Speaking ----------

function say(html, ms = BUBBLE_MS, action = null) {
  if (!on || !html) return;
  const mascot = $('#mascot');
  $('#mascot-text').innerHTML = html;
  const button = $('#mascot-act');
  button.hidden = !action;
  button.textContent = action ? action.label : '';
  button.onclick = action ? () => { hideBubble(); action.run(); } : null;
  $('#mascot-bubble').hidden = false;
  mascot.classList.remove('hop');
  void mascot.offsetWidth;                    // restart the hop animation
  mascot.classList.add('hop');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(hideBubble, ms);
  armIdle();
}

/** Says the tip for `key`, unless that same tip was shown moments ago. */
function tip(key) {
  if (!on) return;
  const now = Date.now();
  if (lastTip.key === key && now - lastTip.at < SAME_TIP_COOLDOWN_MS) return;
  lastTip = { key, at: now };
  say(t(key));
}

function hideBubble() {
  clearTimeout(bubbleTimer);
  $('#mascot-bubble').hidden = true;
}

const randomIdleTip = () => {
  const list = dict()['mascot-idle'] || [];
  return list.length ? list[Math.floor(Math.random() * list.length)] : '';
};

function armIdle() {
  clearTimeout(idleTimer);
  if (!on) return;
  idleTimer = setTimeout(() => {
    if (document.visibilityState === 'visible') say(randomIdleTip());
    armIdle();
  }, IDLE_MS);
}
