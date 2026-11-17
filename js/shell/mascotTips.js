/*
 * shell/mascotTips.js — contextual offers from Patito, driven by what the visitor is doing.
 * Rules are data (RULES below); each fires at most once per browser session, and only while
 * Patito is visible.
 *
 *   dwell   the same window has had focus for `afterMs`  ("you've been on Stack a while…")
 *   opened  `count` different windows have been opened    ("looks like you're browsing…")
 *
 * Text comes from the i18n keys `offer-<id>` and the button label from `offer-<id>-btn`.
 * RULES is exported so tests can shorten the timers.
 */

import * as bus from '../core/bus.js';
import { t } from '../i18n/i18n.js';
import * as windows from './windowManager.js';
import * as mascot from './mascot.js';
import { openBurnWizard } from './wizards/burnResume.js';
import { openDialupWizard } from './wizards/dialup.js';

const openContact = openDialupWizard;

export const RULES = [
  { id: 'stack', kind: 'dwell', app: 'stack', afterMs: 25000, run: openBurnWizard },
  { id: 'projects', kind: 'dwell', app: 'proyectos', afterMs: 30000, run: openContact },
  { id: 'terminal', kind: 'dwell', app: 'terminal', afterMs: 20000, run: () => windows.open('contacto') },
  { id: 'browsing', kind: 'opened', count: 4, run: openBurnWizard },
];

const SESSION_KEY = 'portfolio-offers';
const fired = new Set();
const opened = new Set();
let dwellTimer = null;

function remember() {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify([...fired])); } catch (e) { /* storage unavailable */ }
}

function fire(rule) {
  if (fired.has(rule.id) || !mascot.isOn()) return;
  const spoke = mascot.offer(t('offer-' + rule.id), { label: t(`offer-${rule.id}-btn`), run: rule.run });
  if (spoke) { fired.add(rule.id); remember(); }
}

function onFocused({ id }) {
  clearTimeout(dwellTimer);
  if (!id) return;
  const rule = RULES.find((r) => r.kind === 'dwell' && r.app === id && !fired.has(r.id));
  if (!rule) return;
  dwellTimer = setTimeout(() => { if (windows.getActiveId() === id && document.visibilityState === 'visible') fire(rule); }, rule.afterMs);
}

function onOpened({ id, quiet }) {
  if (quiet) return;
  opened.add(id);
  RULES.filter((r) => r.kind === 'opened' && opened.size >= r.count).forEach(fire);
}

export function init() {
  try { JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]').forEach((id) => fired.add(id)); } catch (e) { /* none yet */ }
  bus.on('window:focused', onFocused);
  bus.on('window:opened', onOpened);
}
