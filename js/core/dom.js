/*
 * core/dom.js — tiny DOM helpers shared by every module.
 */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/**
 * Markup for an icon. Ids starting with "i-" are symbols in the SVG sprite in index.html;
 * anything else is a Windows XP icon in imgs/xp-icons/<id>.png (96px, transparent).
 * Both are decorative: labels belong on the button that contains them.
 */
export const icon = (id, className = '') => {
  const cls = className ? ` class="${className}"` : '';
  if (id.startsWith('i-')) return `<svg${cls} aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;
  return `<img${cls} src="imgs/xp-icons/${id}.png" alt="" aria-hidden="true" draggable="false" decoding="async">`;
};

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escapes text before it is interpolated into an HTML string. */
export const escapeHTML = (text) => String(text).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** Makes the page chrome behind a modal screen unreachable (mouse, keyboard and screen readers). */
export const setInert = (selectors, value) => selectors.forEach((selector) => {
  const el = document.querySelector(selector);
  if (el) el.inert = value;
});

const TABBABLE = 'button:not([disabled]), input:not([disabled]), textarea, a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside `root` and reports Escape. Returns a function that stops doing so.
 * Used by full-screen dialogs (the Turn Off dialog, the blue screen).
 */
export function trapFocus(root, onEscape = () => {}) {
  const onKeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onEscape(); return; }
    if (e.key !== 'Tab') return;
    const items = $$(TABBABLE, root).filter((el) => el.offsetParent !== null);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKeydown, true);
  return () => document.removeEventListener('keydown', onKeydown, true);
}
