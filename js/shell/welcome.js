/*
 * shell/welcome.js — the XP welcome (log-on) screen: the first thing every visitor sees.
 *
 *   Alan Acevedo   asks for a password (hint on screen: "admin", or look in the console). After a
 *                  short simulated network delay it stores a fake JWT in sessionStorage.
 *   Reclutador     the recruiter profile: no password, a summary view (see "Recruiter profile" in welcome.css).
 *   Turn off       an easter egg: the screen collapses like a CRT, then plain contact details on black.
 *
 * Logging in fades the screen to black, then fades in to the desktop and plays the startup chime at that
 * instant. The click on a user is also the user gesture browsers require for audio.
 *
 * Visibility is decided before first paint by the boot guard in index.html (html.welcome-pending);
 * this module only runs the interaction. Add ?skip to the URL to bypass it.
 * The "token" is theatre: nothing here is secured, there is no server.
 */

import { $, setInert } from '../core/dom.js';
import { play } from '../audio/sounds.js';

const INERT_SELECTORS = ['#desktop', '.taskbar', '#start-menu'];
const PASSWORD = 'admin';
const SESSION_KEY = 'portfolio-welcomed';
const TOKEN_KEY = 'portfolio-token';
const PROFILE_KEY = 'portfolio-profile';
const FADE_OUT_MS = 650;       // welcome screen to black
const CRT_MS = 950;            // the collapse of the "monitor"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

console.info("🔐 Portfolio log-on: the password for Alan Acevedo is 'admin'. Or enter as Reclutador, no password needed.");

/** True while the recruiter's summary profile is active. */
export const isRecruiter = () => document.documentElement.dataset.profile === 'recruiter';

const b64url = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A made-up JWT: real header and payload encoding, a random signature. Stored for the session, verified by nobody. */
function fakeToken(profile) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: profile === 'recruiter' ? 'guest' : 'alan.acevedo', role: profile === 'recruiter' ? 'RECRUITER' : 'ADMIN', iat: now, exp: now + 3600 };
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const signature = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.${signature}`;
}

/** Resolves on the next click or key press that isn't on a link (so the contact links stay usable). */
const anyInput = () => new Promise((resolve) => {
  const done = (e) => {
    if (e.target.closest && e.target.closest('a')) return;
    ['pointerdown', 'keydown'].forEach((type) => window.removeEventListener(type, done, true));
    resolve();
  };
  ['pointerdown', 'keydown'].forEach((type) => window.addEventListener(type, done, true));
});

/**
 * Resolves to true if the welcome screen ran, false if it was skipped.
 * `force` shows it again (after Log Off or a restart) even though this session already logged on.
 */
export async function run({ force = false } = {}) {
  const root = document.documentElement;
  if (force) root.classList.add('welcome-pending');
  if (!root.classList.contains('welcome-pending')) return false;

  const screen = $('#welcome');
  const curtain = $('#ws-curtain');
  const adminButton = $('#ws-user');
  const guestButton = $('#ws-guest');
  const form = $('#ws-pass');
  const input = $('#ws-pwd');
  const error = $('#ws-pass-err');
  const loading = $('#ws-loading');
  const offButton = $('#ws-off');
  const controls = [adminButton, guestButton, input, $('#ws-go'), offButton];

  // A clean slate (this runs again after Log Off or Restart).
  delete root.dataset.profile;
  form.hidden = true;
  error.hidden = true;
  input.value = '';
  adminButton.setAttribute('aria-expanded', 'false');
  controls.forEach((control) => { control.disabled = false; });
  loading.hidden = true;
  setInert(INERT_SELECTORS, true);
  adminButton.focus();

  const profile = await new Promise((resolve) => {
    const listen = new AbortController();
    const options = { signal: listen.signal };
    const choose = (who) => { listen.abort(); resolve(who); };

    adminButton.addEventListener('click', () => {
      form.hidden = false;
      adminButton.setAttribute('aria-expanded', 'true');
      input.focus();
    }, options);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value === PASSWORD) { choose('admin'); return; }
      error.hidden = false;
      form.classList.remove('shake');
      void form.offsetWidth;                                  // restart the shake
      form.classList.add('shake');
      play('error');
      input.select();
    }, options);
    input.addEventListener('input', () => { error.hidden = true; }, options);

    guestButton.addEventListener('click', () => choose('recruiter'), options);

    offButton.addEventListener('click', async () => {
      await turnOff(screen, adminButton);
    }, options);
  });

  // "Sign in": a pretend request, then the token.
  controls.forEach((control) => { control.disabled = true; });
  loading.hidden = false;
  await sleep(reducedMotion() ? 200 : 700 + Math.random() * 500);
  const token = fakeToken(profile);
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(PROFILE_KEY, profile);
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch (e) { /* storage unavailable */ }
  console.info(`POST /api/auth/login → 200\n{ "token": "${token}" }`);

  // Fade to black, swap the screens underneath, then fade in to the desktop with the chime.
  curtain.classList.add('on');
  await sleep(reducedMotion() ? 0 : FADE_OUT_MS);
  if (profile === 'recruiter') root.dataset.profile = 'recruiter';
  root.classList.remove('welcome-pending');
  setInert(INERT_SELECTORS, false);
  play('startup');
  curtain.classList.remove('on');
  return true;
}

/** The easter egg: the screen collapses to a line and then a dot, and contact details appear on black. */
async function turnOff(screen, returnFocus) {
  const off = $('#ws-offscreen');
  play('shutdown');
  if (!reducedMotion()) {
    screen.classList.add('crt-off');
    await sleep(CRT_MS);
  }
  screen.classList.add('crt-gone');
  off.hidden = false;
  await sleep(500);                                           // the click that chose Turn off must not wake it
  await anyInput();
  off.hidden = true;
  screen.classList.remove('crt-off', 'crt-gone');
  screen.classList.add('crt-on');
  setTimeout(() => screen.classList.remove('crt-on'), 600);
  returnFocus.focus();
}
