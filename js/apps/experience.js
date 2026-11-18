/*
 * apps/experience.js — Experience as a Windows "Add or Remove Programs" list. Only the titles show;
 * clicking an entry expands it (an accordion, one open at a time) and the address bar follows
 * (C:\Portfolio\experiencia\RDAM). The toolbar above the address bar (built by windowManager) works
 * like Explorer's: Back and Forward walk through what you opened, Up collapses to the list, and the
 * Views menu switches between Details (titles with their organization) and List (titles only).
 */

import { $, $$ } from '../core/dom.js';
import * as bus from '../core/bus.js';
import * as storage from '../core/storage.js';
import * as windows from '../shell/windowManager.js';
import { play } from '../audio/sounds.js';
import { t } from '../i18n/i18n.js';

const ROOT = 'C:\\Portfolio\\experiencia';
const K_VIEW = 'portfolio-exp-view';

export function mount() {
  const win = $('#win-experiencia');
  const rows = $$('.exp-row', win);
  const list = $('.exp-list', win);
  const statusText = $('#exp-status-text', win);
  const back = $('[data-tb="back"]', win);
  const forward = $('[data-tb="forward"]', win);
  const up = $('[data-tb="up"]', win);
  const viewsButton = $('[data-tb="views"]', win);
  const menu = $('.xtb-menu', win);
  const viewItems = $$('[data-view]', menu);

  const history = [-1];                 // indexes into `rows`; -1 is the plain list
  let index = 0;
  let view = storage.get(K_VIEW, 'details') === 'list' ? 'list' : 'details';

  function paintStatus(selected) {
    statusText.textContent = selected >= 0
      ? $('.exp-title', rows[selected]).textContent
      : t('exp-count').replace('%n', rows.length);
  }

  function render() {
    const selected = history[index];
    rows.forEach((row, i) => {
      const open = i === selected;
      row.classList.toggle('open', open);
      $('.exp-toggle', row).setAttribute('aria-expanded', String(open));
      $('.exp-panel', row).hidden = !open;
    });
    list.dataset.view = view;
    viewItems.forEach((item) => item.setAttribute('aria-checked', String(item.dataset.view === view)));
    windows.setPath('experiencia', ROOT + (selected >= 0 ? '\\' + rows[selected].dataset.folder : ''));
    back.disabled = index === 0;
    forward.disabled = index === history.length - 1;
    up.disabled = selected === -1;
    paintStatus(selected);
  }

  function visit(row) {
    if (row === history[index]) return;
    history.splice(index + 1);          // opening something new discards "forward"
    history.push(row);
    index = history.length - 1;
    render();
    play('menu');
  }

  function step(delta) {
    index += delta;
    render();
    play('menu');
  }

  rows.forEach((row, i) => {
    $('.exp-toggle', row).addEventListener('click', () => visit(history[index] === i ? -1 : i));
  });
  back.addEventListener('click', () => step(-1));
  forward.addEventListener('click', () => step(1));
  up.addEventListener('click', () => visit(-1));

  // ---------- Views menu ----------

  const menuOpen = () => !menu.hidden;
  function closeMenu() { menu.hidden = true; viewsButton.setAttribute('aria-expanded', 'false'); }
  function openMenu() { menu.hidden = false; viewsButton.setAttribute('aria-expanded', 'true'); $('[aria-checked="true"]', menu)?.focus(); }

  viewsButton.addEventListener('click', () => (menuOpen() ? closeMenu() : openMenu()));
  viewItems.forEach((item) => item.addEventListener('click', () => {
    view = item.dataset.view;
    storage.set(K_VIEW, view);
    closeMenu();
    viewsButton.focus();
    render();
    play('menu');
  }));
  menu.addEventListener('keydown', (e) => {
    const at = viewItems.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); viewItems[(at + 1) % viewItems.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); viewItems[(at - 1 + viewItems.length) % viewItems.length].focus(); }
  });
  win.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen()) { e.preventDefault(); closeMenu(); viewsButton.focus(); }
  });
  document.addEventListener('pointerdown', (e) => { if (menuOpen() && !e.target.closest('#win-experiencia .xtb-drop')) closeMenu(); });
  bus.on('window:focused', ({ id }) => { if (id !== 'experiencia') closeMenu(); });
  bus.on('lang:changed', () => paintStatus(history[index]));

  render();
}
