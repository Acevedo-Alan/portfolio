/*
 * apps/displayProps.js — Display Properties: choose a wallpaper, a color
 * scheme (Luna or the dark Zune theme) and the user picture shown in the
 * Start menu (the XP account pictures). Like the real dialog, choices are
 * pending until Apply / OK; Cancel (or closing) discards them.
 */

import { $, $$ } from '../core/dom.js';
import * as bus from '../core/bus.js';
import { translate } from '../i18n/i18n.js';
import { initTabs } from '../ui/tabs.js';
import { WALLPAPERS, THEMES, TILES, tileUrl, get as getAppearance, set as setAppearance } from '../shell/appearance.js';
import * as windows from '../shell/windowManager.js';
import * as motion from '../shell/motion.js';

export function mount() {
  const root = $('#win-display .dp-body');
  const current = () => ({ ...getAppearance(), effects: motion.isOn() });
  let pending = current();

  const radios = (name, values, labelPrefix, kind) => values.map((value) => `
    <label class="dp-option">
      <input type="radio" name="${name}" value="${value}">
      <span class="dp-swatch" ${kind === 'wallpaper' ? `data-wallpaper="${value}"` : `data-swatch="${value}"`} aria-hidden="true"></span>
      <span data-i18n="${labelPrefix}${value}"></span>
    </label>`).join('');

  root.innerHTML = `
    <div class="tabs" role="tablist" data-i18n-label="box-display">
      <button type="button" role="tab" id="dp-tab-desktop" aria-controls="dp-panel-desktop" data-i18n="dp-tab-desktop"></button>
      <button type="button" role="tab" id="dp-tab-appearance" aria-controls="dp-panel-appearance" data-i18n="dp-tab-appearance"></button>
      <button type="button" role="tab" id="dp-tab-account" aria-controls="dp-panel-account" data-i18n="dp-tab-account"></button>
    </div>
    <div class="tab-panels">
      <div role="tabpanel" id="dp-panel-desktop" class="tab-panel" aria-labelledby="dp-tab-desktop">
        <div class="dp-monitor" data-i18n-label="dp-preview" role="img"><div class="dp-screen" id="dp-preview"></div></div>
        <fieldset class="group"><legend data-i18n="dp-background"></legend>
          <div class="dp-list" role="radiogroup" data-i18n-label="dp-background">${radios('dp-wallpaper', WALLPAPERS, 'dp-wp-', 'wallpaper')}</div>
        </fieldset>
      </div>
      <div role="tabpanel" id="dp-panel-appearance" class="tab-panel" aria-labelledby="dp-tab-appearance" hidden>
        <fieldset class="group"><legend data-i18n="dp-theme"></legend>
          <div class="dp-list" role="radiogroup" data-i18n-label="dp-theme">${radios('dp-theme', THEMES, 'dp-theme-', 'theme')}</div>
        </fieldset>
        <fieldset class="group"><legend data-i18n="dp-effects"></legend>
          <label class="dp-check"><input type="checkbox" name="dp-effects"> <span data-i18n="dp-effects-label"></span></label>
          <p class="dp-note" data-i18n="dp-effects-note"></p>
        </fieldset>
      </div>
      <div role="tabpanel" id="dp-panel-account" class="tab-panel" aria-labelledby="dp-tab-account" hidden>
        <fieldset class="group"><legend data-i18n="dp-account-h"></legend>
          <div class="dp-tiles" role="radiogroup" data-i18n-label="dp-account-h">${TILES.map((tile) => `<label class="dp-tile"><input type="radio" name="dp-tile" value="${tile}" data-i18n-label="tile-${tile}"><span style="background-image:url('${tileUrl(tile)}')"></span></label>`).join('')}</div>
        </fieldset>
      </div>
    </div>
    <div class="dialog-btns">
      <button type="button" class="btn-xp principal-d" data-dp="ok" data-i18n="btn-ok"></button>
      <button type="button" class="btn-xp" data-dp="cancel" data-i18n="btn-cancel"></button>
      <button type="button" class="btn-xp" data-dp="apply" data-i18n="btn-apply" disabled></button>
    </div>`;
  translate(root);
  initTabs(root);

  const applyBtn = $('[data-dp="apply"]', root);
  const dirty = () => { const now = current(); return Object.keys(now).some((key) => pending[key] !== now[key]); };

  function render() {
    $$('input[name="dp-wallpaper"]', root).forEach((r) => { r.checked = r.value === pending.wallpaper; });
    $$('input[name="dp-theme"]', root).forEach((r) => { r.checked = r.value === pending.theme; });
    $$('input[name="dp-tile"]', root).forEach((r) => { r.checked = r.value === pending.tile; });
    $('input[name="dp-effects"]', root).checked = pending.effects;
    $('#dp-preview', root).dataset.wallpaper = pending.wallpaper;
    applyBtn.disabled = !dirty();
  }

  root.addEventListener('change', (e) => {
    if (e.target.name === 'dp-wallpaper') pending.wallpaper = e.target.value;
    if (e.target.name === 'dp-theme') pending.theme = e.target.value;
    if (e.target.name === 'dp-tile') pending.tile = e.target.value;
    if (e.target.name === 'dp-effects') pending.effects = e.target.checked;
    render();
  });

  const commit = () => { setAppearance(pending); motion.setEnabled(pending.effects); render(); };
  $('[data-dp="apply"]', root).addEventListener('click', commit);
  $('[data-dp="ok"]', root).addEventListener('click', () => { commit(); windows.close('display'); });
  $('[data-dp="cancel"]', root).addEventListener('click', () => windows.close('display'));

  // Every time the dialog opens, start from what's currently applied.
  const reset = () => { pending = current(); render(); };
  bus.on('window:opened', ({ id }) => { if (id === 'display') reset(); });
  bus.on('window:closed', ({ id }) => { if (id === 'display') reset(); });
  bus.on('appearance:changed', reset);
  bus.on('effects:changed', reset);
  bus.on('lang:changed', render);
  bus.on('display:tab', (tab) => { const button = $(`#dp-tab-${tab}`, root); if (button) button.click(); });   // e.g. the Start menu portrait opens the Account tab
  render();
}
