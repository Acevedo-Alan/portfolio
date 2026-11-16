/*
 * core/dom.js — tiny DOM helpers shared by every module.
 */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Markup for an <svg><use> reference to a symbol in the sprite in index.html. */
export const icon = (id, className = '') =>
  `<svg${className ? ` class="${className}"` : ''} aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escapes text before it is interpolated into an HTML string. */
export const escapeHTML = (text) => String(text).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
