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
