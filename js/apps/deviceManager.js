/*
 * apps/deviceManager.js — the Stack window as a Device Manager tree. The tree
 * is native <details> in index.html (the single source of truth for the
 * stack); this module adds expand/collapse-all and exposes the data so the
 * terminal's `skills` command can't drift from it.
 */

import { $, $$ } from '../core/dom.js';

/** The stack as [{ name, items: string[] }], read from the markup. */
export function getStackGroups() {
  return $$('#dm details').map((details) => ({
    name: $('summary', details).textContent,
    items: $$('li', details).map((li) => li.textContent),
  }));
}

export function mount() {
  const setAll = (open) => $$('#dm details').forEach((d) => { d.open = open; });
  $('#dm-expand').addEventListener('click', () => setAll(true));
  $('#dm-collapse').addEventListener('click', () => setAll(false));
}
