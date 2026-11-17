/*
 * apps/notepad.js — readme.txt in Notepad: a short, human note about the portfolio.
 * The text comes from the i18n dictionaries (`readme-text`) and follows the language
 * until the visitor types in it; after that their edits are left alone.
 */

import { $ } from '../core/dom.js';
import * as bus from '../core/bus.js';
import { dict } from '../i18n/i18n.js';

export function mount() {
  const field = $('#np-text');
  let edited = false;

  const render = () => { if (!edited) field.value = dict()['readme-text']; };
  field.addEventListener('input', () => { edited = true; });
  bus.on('lang:changed', render);
  render();
}
