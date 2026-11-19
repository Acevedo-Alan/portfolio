/*
 * shell/quickLaunch.js — the Quick Launch toolbar next to Start: one click opens a section,
 * and the first button is "Show desktop" (minimizes every window).
 */

import { $$ } from '../core/dom.js';
import * as windows from './windowManager.js';

export function init() {
  $$('#quick-launch .ql-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.ql;
      if (target === 'desktop') windows.minimizeAll(); else windows.open(target);
    });
  });
}
