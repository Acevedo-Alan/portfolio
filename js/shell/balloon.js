/*
 * shell/balloon.js — the yellow tray notification. Dismisses itself after a
 * few seconds, when its × is pressed, or as soon as the visitor opens a
 * window or the Start menu.
 */

import { $ } from '../core/dom.js';
import * as bus from '../core/bus.js';
import { translate } from '../i18n/i18n.js';
import { play } from '../audio/sounds.js';

const AUTO_HIDE_MS = 10000;
let timer = null;

export function init() {
  $('#balloon-x').addEventListener('click', hide);
  bus.on('window:opened', ({ quiet }) => { if (!quiet) hide(); });   // the automatic first window shouldn't dismiss the hint
  bus.on('startmenu:opened', hide);
}

/** Shows the balloon with the given i18n keys (defaults to the welcome hint). */
export function show(titleKey = 'welcome-title', textKey = 'welcome-text') {
  $('#balloon-title').setAttribute('data-i18n', titleKey);
  $('#balloon-text').setAttribute('data-i18n', textKey);
  translate($('#balloon'));
  clearTimeout(timer);
  $('#balloon').hidden = false;
  play('balloon');
  timer = setTimeout(hide, AUTO_HIDE_MS);
}

export function hide() {
  clearTimeout(timer);
  $('#balloon').hidden = true;
}
