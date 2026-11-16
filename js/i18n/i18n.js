/*
 * i18n/i18n.js — language state and translation helpers.
 *
 * Markup opts into translation with:
 *   data-i18n="key"        sets innerHTML from the dictionary
 *   data-i18n-list="key"   fills a <ul> from an array of strings
 *   data-i18n-label="key"  sets aria-label + title
 * Modules that render their own text call t(key, vars) and re-render when
 * they hear the "lang:changed" event.
 */

import es from './es.js';
import en from './en.js';
import { $$ } from '../core/dom.js';
import * as bus from '../core/bus.js';
import * as storage from '../core/storage.js';

const DICTIONARIES = { es, en };
const STORAGE_KEY = 'portfolio-lang';

export const getLang = () => (document.documentElement.lang === 'en' ? 'en' : 'es');
export const dict = () => DICTIONARIES[getLang()];

/** Translates `key`; `vars` replaces %-tokens, e.g. t('ms-cell', { r: 1, c: 2, s: '…' }). */
export function t(key, vars) {
  const value = dict()[key];
  if (value === undefined) return '';
  if (typeof value !== 'string' || !vars) return value;
  return Object.entries(vars).reduce((text, [name, v]) => text.replaceAll('%' + name, v), value);
}

/** Applies the current language to every opted-in node under `root`. */
export function translate(root = document) {
  const d = dict();
  $$('[data-i18n]', root).forEach((el) => {
    const value = d[el.getAttribute('data-i18n')];
    if (value !== undefined) el.innerHTML = value;
  });
  $$('[data-i18n-list]', root).forEach((el) => {
    const items = d[el.getAttribute('data-i18n-list')];
    if (items) el.innerHTML = items.map((item) => `<li>${item}</li>`).join('');
  });
  $$('[data-i18n-label]', root).forEach((el) => {
    const value = d[el.getAttribute('data-i18n-label')];
    if (value !== undefined) { el.setAttribute('aria-label', value); el.title = value; }
  });
}

export function setLang(lang) {
  document.documentElement.lang = lang;
  storage.set(STORAGE_KEY, lang);
  translate();
  bus.emit('lang:changed', lang);
}

export function initLang() {
  setLang(storage.get(STORAGE_KEY) === 'en' ? 'en' : 'es');
}
