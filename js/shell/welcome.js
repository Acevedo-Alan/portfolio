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

import { $, setInert } from '../core/dom.js';
import { play } from '../audio/sounds.js';

const INERT_SELECTORS = ['#desktop', '.taskbar', '#start-menu'];
const LOADING_MS = 1400;
const FADE_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Resolves to true if the welcome screen ran, false if it was skipped.
 * `force` shows it again (after Log Off or a restart) even though this session already logged on.
 */
export async function run({ force = false } = {}) {
  const root = document.documentElement;
  if (force) root.classList.add('welcome-pending');
  if (!root.classList.contains('welcome-pending')) return false;

  const screen = $('#welcome');
  const user = $('#ws-user');
  user.disabled = false;
  $('#ws-loading').hidden = true;
  setInert(INERT_SELECTORS, true);
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
  setInert(INERT_SELECTORS, false);
  try { sessionStorage.setItem('portfolio-welcomed', '1'); } catch (e) { /* storage unavailable */ }
  return true;
}
