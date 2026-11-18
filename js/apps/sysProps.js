/*
 * apps/sysProps.js — "Sobre mí" as a System Properties dialog: tabs plus
 * OK / Cancel (both just close the window). On the Tools tab the checked
 * components are selectable; the chosen one is described in the sunken box.
 */

import { $, $$ } from '../core/dom.js';
import * as bus from '../core/bus.js';
import { initTabs } from '../ui/tabs.js';
import { t } from '../i18n/i18n.js';
import * as windows from '../shell/windowManager.js';

export function mount() {
  const root = $('#win-whoami');
  initTabs(root);
  $$('[data-dlg]', root).forEach((btn) => btn.addEventListener('click', () => windows.close('whoami')));

  const items = $$('[data-tool]', root);
  const desc = $('#sp-tool-desc', root);
  let current = null;

  function paint() {
    items.forEach((el) => el.classList.toggle('sel', el === current));
    desc.textContent = current ? t('tool-' + current.dataset.tool) : t('sp-tool-hint');
  }
  items.forEach((el) => {
    el.addEventListener('click', () => { current = el; paint(); });
    el.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); current = el; paint(); }
    });
  });
  bus.on('lang:changed', paint);
  paint();
}
