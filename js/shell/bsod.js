/*
 * shell/bsod.js — the Blue Screen of Death easter egg. Shown by typing `bsod` in the
 * terminal or by entering the Konami code (↑ ↑ ↓ ↓ ← → ← → B A) anywhere on the desktop.
 * Any key or click dismisses it (after a short grace period so the key that
 * triggered it doesn't close it again).
 *
 * Accessibility: role=alertdialog, focus moves in, the desktop is inert while it shows,
 * and focus returns to where it was.
 */

import { escapeHTML, setInert, trapFocus } from '../core/dom.js';
import { dict } from '../i18n/i18n.js';
import { play } from '../audio/sounds.js';

const INERT = ['#desktop', '.taskbar', '#start-menu', '.mascot', '#balloon', '#vol-pop'];
const GRACE_MS = 600;
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

let el = null;

export const isShowing = () => el !== null;

export function show() {
  if (el) return;
  const previous = document.activeElement;
  const lines = dict()['bsod-lines'];
  el = document.createElement('div');
  el.className = 'bsod';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', dict()['bsod-label']);
  el.tabIndex = -1;
  el.innerHTML = `<div class="bsod-text">${lines.map((line) => (line ? `<p>${escapeHTML(line)}</p>` : '<br>')).join('')}</div>`;
  document.body.appendChild(el);
  setInert(INERT, true);
  el.focus();
  play('critical');

  const release = trapFocus(el);
  const armedAt = Date.now() + GRACE_MS;
  const dismiss = (e) => {
    if (Date.now() < armedAt) return;
    e.preventDefault();
    e.stopPropagation();
    ['keydown', 'pointerdown'].forEach((type) => window.removeEventListener(type, dismiss, true));
    release();
    el.remove();
    el = null;
    setInert(INERT, false);
    if (previous && previous.focus) previous.focus();
  };
  ['keydown', 'pointerdown'].forEach((type) => window.addEventListener(type, dismiss, true));
}

/** Listens for the Konami code anywhere except inside text fields. */
export function initKonami() {
  let at = 0;
  window.addEventListener('keydown', (e) => {
    if (el || e.target.closest('input, textarea, [contenteditable]')) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    at = key === KONAMI[at] ? at + 1 : (key === KONAMI[0] ? 1 : 0);
    if (at === KONAMI.length) { at = 0; show(); }
  });
}
