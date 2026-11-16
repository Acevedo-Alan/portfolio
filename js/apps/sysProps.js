/*
 * apps/sysProps.js — "Sobre mí" as a System Properties dialog: tabs plus
 * OK / Cancel (both just close the window).
 */

import { $, $$ } from '../core/dom.js';
import { initTabs } from '../ui/tabs.js';
import * as windows from '../shell/windowManager.js';

export function mount() {
  const root = $('#win-whoami');
  initTabs(root);
  $$('[data-dlg]', root).forEach((btn) => btn.addEventListener('click', () => windows.close('whoami')));
}
