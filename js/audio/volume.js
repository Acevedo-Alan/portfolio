/*
 * audio/volume.js — the master volume and mute state, shared by everything
 * that makes sound: the XP UI sounds (sounds.js), the CD/modem effects
 * (effects.js) and the Media Player's Web Audio master gain (apps/media/ui.js).
 * The tray's volume popup is the only UI that changes it.
 *
 * Emits "volume:changed" with { level, muted, effective }.
 */

import * as bus from '../core/bus.js';
import * as storage from '../core/storage.js';
import { clamp } from '../core/dom.js';

const LEVEL_KEY = 'portfolio-volume';
const MUTE_KEY = 'portfolio-muted';

let level = clamp(Number(storage.get(LEVEL_KEY, '0.8')) || 0, 0, 1);
let muted = storage.get(MUTE_KEY) === '1';

export const getLevel = () => level;
export const isMuted = () => muted;
/** The gain everything should actually use: 0 when muted. */
export const effective = () => (muted ? 0 : level);

function publish() {
  bus.emit('volume:changed', { level, muted, effective: effective() });
}

export function setLevel(value) {
  level = clamp(value, 0, 1);
  storage.set(LEVEL_KEY, String(level));
  publish();
}

export function setMuted(value) {
  muted = value;
  storage.set(MUTE_KEY, value ? '1' : '0');
  publish();
}
