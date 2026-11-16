/*
 * apps/recycleBin.js — the Recycle Bin as "deprecated code": a details view of
 * design decisions that were discarded and what replaced them. The rows come
 * from the i18n dictionaries (`bin-items`); "Empty" and "Restore all" are a
 * small easter egg.
 */

import { $, escapeHTML } from '../core/dom.js';
import * as bus from '../core/bus.js';
import { t, dict, translate } from '../i18n/i18n.js';
import { play } from '../audio/sounds.js';

export function mount() {
  const root = $('#win-papelera .bin-body');
  let emptied = false;

  function render() {
    const items = dict()['bin-items'];
    const columns = dict()['bin-cols'];

    const table = `<table class="bin-table"><thead><tr>${columns.map((c) => `<th scope="col">${escapeHTML(c)}</th>`).join('')}</tr></thead>`
      + `<tbody>${items.map((row) => `<tr>${row.map((cell) => `<td>${escapeHTML(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

    root.innerHTML = `
      <div class="bin-bar">
        <button type="button" class="btn-xp" data-bin="empty" ${emptied ? 'disabled' : ''} data-i18n="bin-empty-btn"></button>
        <button type="button" class="btn-xp" data-bin="restore" ${emptied ? '' : 'disabled'} data-i18n="bin-restore-btn"></button>
      </div>
      <div class="bin-main">
        <p class="bin-intro" data-i18n="bin-intro"></p>
        ${emptied ? '<p class="bin-empty" data-i18n="bin-empty"></p>' : table}
      </div>
      <div class="bin-status" role="status">${escapeHTML(t('bin-count', { n: emptied ? 0 : items.length }))}</div>`;

    translate(root);
    root.querySelector('[data-bin="empty"]').addEventListener('click', () => { emptied = true; play('ding'); render(); });
    root.querySelector('[data-bin="restore"]').addEventListener('click', () => { emptied = false; play('restore'); render(); });
  }

  bus.on('lang:changed', render);
  render();
}
