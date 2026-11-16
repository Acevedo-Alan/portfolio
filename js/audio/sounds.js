/*
 * audio/sounds.js — the Windows XP UI sounds (files in /sounds) plus the
 * global mute switch. Browsers block audio until the visitor interacts, so
 * the startup chime waits for the first click or keypress.
 *
 * Note: the Winamp player synthesizes its own audio (see apps/winamp) and is
 * deliberately independent of this mute switch: pressing Play is explicit.
 */

import * as bus from '../core/bus.js';
import * as storage from '../core/storage.js';

const FILES = {
  startup: 'startup.mp3',
  start: 'Windows XP Start.mp3',
  menu: 'Windows XP Menu Command.mp3',
  min: 'Windows XP Minimize.mp3',
  restore: 'Windows XP Restore.mp3',
  balloon: 'Windows XP Balloon.mp3',
  ding: 'Windows XP Ding.mp3',
  error: 'Windows XP Error.mp3',
  exclamation: 'Windows XP Exclamation.mp3',
};
const MUTE_KEY = 'portfolio-muted';

const cache = {};
let muted = storage.get(MUTE_KEY) === '1';

export const isMuted = () => muted;

export function setMuted(value) {
  muted = value;
  storage.set(MUTE_KEY, value ? '1' : '0');
  bus.emit('sound:muted', value);
}

export function play(name) {
  if (muted || !FILES[name]) return;
  try {
    let audio = cache[name];
    if (!audio) {
      audio = cache[name] = new Audio('sounds/' + encodeURIComponent(FILES[name]));
      audio.preload = 'auto';
    }
    audio.currentTime = 0;
    const result = audio.play();
    if (result && result.catch) result.catch(() => {});
  } catch (e) { /* audio unavailable: stay silent */ }
}

export function playStartupOnFirstGesture() {
  let done = false;
  const handler = () => {
    if (done) return;
    done = true;
    play('startup');
  };
  ['pointerdown', 'keydown'].forEach((type) => window.addEventListener(type, handler, { once: true }));
}
