/*
 * audio/sounds.js — the Windows XP UI sounds (files in /sounds). Honors the
 * master volume and mute state from audio/volume.js. Browsers block audio
 * until the visitor interacts, so the startup chime waits for the first click
 * or keypress.
 */

import { effective } from './volume.js';

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
  shutdown: 'shutdown.wav',
  logoff: 'logoff.wav',
  critical: 'critical-stop.wav',
};

const cache = {};

export function play(name) {
  const volume = effective();
  if (volume === 0 || !FILES[name]) return;
  try {
    let audio = cache[name];
    if (!audio) {
      audio = cache[name] = new Audio('sounds/' + encodeURIComponent(FILES[name]));
      audio.preload = 'auto';
    }
    audio.volume = volume;
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
