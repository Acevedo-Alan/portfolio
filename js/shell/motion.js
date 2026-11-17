/*
 * shell/motion.js — the Windows XP "visual effects": windows zoom and fade in and
 * out, shrink toward their taskbar button when minimized and grow back when
 * restored, animate between normal and maximized; menus fade in (that part is CSS,
 * gated by html[data-effects="on"]).
 *
 * Effects follow the visitor's OS "reduce motion" setting by default and can be
 * switched with the Effects checkbox in Display Properties (like XP's Performance
 * Options). Every function here returns a promise that resolves when the effect is
 * over — immediately when effects are off — so callers never branch on the setting.
 */

import * as storage from '../core/storage.js';
import * as bus from '../core/bus.js';

const KEY = 'portfolio-effects';                  // 'on' | 'off'; absent = follow the system setting
const EASING = 'cubic-bezier(.2, .7, .3, 1)';
const MS = { open: 170, close: 130, shrink: 230, grow: 200, resize: 180 };
const POP = 'scale(.92)';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export function isOn() {
  const saved = storage.get(KEY);
  return saved ? saved === 'on' : !reduceMotion.matches;
}

function sync() { document.documentElement.dataset.effects = isOn() ? 'on' : 'off'; }

export function setEnabled(on) {
  storage.set(KEY, on ? 'on' : 'off');
  sync();
  bus.emit('effects:changed', on);
}

export function init() {
  sync();
  reduceMotion.addEventListener('change', sync);
}

/** The desktop fades in after logging on ("Loading your personal settings…"). */
export function desktopFadeIn() {
  const root = document.documentElement;
  root.classList.add('desktop-enter');
  setTimeout(() => root.classList.remove('desktop-enter'), 1000);
}

/**
 * Plays an animation. Returns { finished, cancel }: `finished` resolves once the
 * effect completes (or is skipped); cancelling leaves it unresolved to the caller's
 * identity check, see windowManager.leave().
 */
function run(el, keyframes, duration) {
  if (!isOn() || !el.animate) return { finished: Promise.resolve(), cancel() {} };
  const animation = el.animate(keyframes, { duration, easing: EASING });
  return { finished: animation.finished.then(() => {}, () => {}), cancel: () => animation.cancel() };
}

/** Transform that makes `el` (at `from`) look like the rectangle `to`. */
function morph(from, to) {
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${to.width / from.width}, ${to.height / from.height})`;
}

const flat = (rect) => ({ left: rect.left, top: rect.top, width: Math.max(rect.width, 1), height: Math.max(rect.height, 1) });

export const windowOpen = (el) => run(el, [{ transform: POP, opacity: 0 }, { transform: 'none', opacity: 1 }], MS.open);
export const windowClose = (el) => run(el, [{ transform: 'none', opacity: 1 }, { transform: POP, opacity: 0 }], MS.close);

/** Shrink toward `target` (the task button's rectangle). */
export function windowMinimize(el, target) {
  if (!target) return windowClose(el);
  const to = morph(flat(el.getBoundingClientRect()), flat(target));
  return run(el, [{ transform: 'none', opacity: 1 }, { transform: to, opacity: 0 }], MS.shrink);
}

/** Grow back out of `source` (the task button's rectangle). */
export function windowRestore(el, source) {
  if (!source) return windowOpen(el);
  const from = morph(flat(el.getBoundingClientRect()), flat(source));
  return run(el, [{ transform: from, opacity: 0 }, { transform: 'none', opacity: 1 }], MS.grow);
}

/** Animates from the rectangle the window had (`before`) to where it is now. */
export function windowResize(el, before) {
  const after = el.getBoundingClientRect();
  const dx = before.left - after.left;
  const dy = before.top - after.top;
  const frame = `translate(${dx}px, ${dy}px) scale(${before.width / after.width}, ${before.height / after.height})`;
  el.style.transformOrigin = 'top left';
  const effect = run(el, [{ transform: frame }, { transform: 'none' }], MS.resize);
  effect.finished.then(() => { el.style.transformOrigin = ''; });
  return effect;
}
