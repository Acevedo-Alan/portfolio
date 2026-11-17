/*
 * shell/welcome.js — the XP welcome (log-on) screen. Shown once per browser
 * session: the visitor clicks their user name, the startup chime plays
 * (that click is also the user gesture browsers require for audio), a short
 * "Loading your personal settings…" follows, then the desktop appears.
 *
 * Visibility is decided before first paint by the boot guard in index.html
 * (html.welcome-pending); this module only runs the interaction. Add ?skip
 * to the URL to bypass it.
 */

import { $ } from '../core/dom.js';
import { play } from '../audio/sounds.js';

const INERT_SELECTORS = ['#desktop', '.taskbar', '#start-menu'];
const LOADING_MS = 1400;
const FADE_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Resolves to true if the welcome screen ran, false if it was skipped. */
export async function run() {
  const root = document.documentElement;
  if (!root.classList.contains('welcome-pending')) return false;

  const screen = $('#welcome');
  const user = $('#ws-user');
  INERT_SELECTORS.forEach((sel) => { const el = $(sel); if (el) el.inert = true; });
  user.focus();

  await new Promise((resolve) => user.addEventListener('click', resolve, { once: true }));

  play('startup');
  user.disabled = true;
  $('#ws-loading').hidden = false;
  await sleep(reducedMotion() ? 300 : LOADING_MS);

  screen.classList.add('leaving');
  await sleep(reducedMotion() ? 0 : FADE_MS);
  root.classList.remove('welcome-pending');
  screen.classList.remove('leaving');
  INERT_SELECTORS.forEach((sel) => { const el = $(sel); if (el) el.inert = false; });
  try { sessionStorage.setItem('portfolio-welcomed', '1'); } catch (e) { /* storage unavailable */ }
  return true;
}
