/*
 * apps/explorer.js — Projects as a Windows Explorer: a folder tree filters the
 * case studies, the address bar shows the path, and Back / Forward / Up work
 * like the real thing (a linear history, forward is dropped on a new visit).
 */

import { $, $$ } from '../core/dom.js';
import * as windows from '../shell/windowManager.js';
import { play } from '../audio/sounds.js';

const ROOT = 'C:\\Portfolio\\proyectos';
const FOLDER_NAMES = { hexa: 'HEXA', lana: 'Lana-y-Lino' };   // 'all' is the root folder

export function mount() {
  const win = $('#win-proyectos');
  const nodes = $$('.ex-node', win);
  const cards = $$('.ex-main [data-proj]', win);
  const back = $('[data-nav="back"]', win);
  const forward = $('[data-nav="forward"]', win);
  const up = $('[data-nav="up"]', win);

  const history = ['all'];
  let index = 0;

  function render() {
    const selected = history[index];
    nodes.forEach((node) => {
      const active = node.dataset.proj === selected;
      node.classList.toggle('active', active);
      if (active) node.setAttribute('aria-current', 'true'); else node.removeAttribute('aria-current');
    });
    cards.forEach((card) => { card.hidden = selected !== 'all' && card.dataset.proj !== selected; });
    windows.setPath('proyectos', ROOT + (FOLDER_NAMES[selected] ? '\\' + FOLDER_NAMES[selected] : ''));
    back.disabled = index === 0;
    forward.disabled = index === history.length - 1;
    up.disabled = selected === 'all';
  }

  function visit(folder) {
    if (folder === history[index]) return;
    history.splice(index + 1);            // visiting somewhere new discards "forward"
    history.push(folder);
    index = history.length - 1;
    render();
    play('menu');
  }

  function step(delta) {
    index += delta;
    render();
    play('menu');
  }

  nodes.forEach((node) => node.addEventListener('click', () => visit(node.dataset.proj)));
  back.addEventListener('click', () => step(-1));
  forward.addEventListener('click', () => step(1));
  up.addEventListener('click', () => visit('all'));
  render();
}
