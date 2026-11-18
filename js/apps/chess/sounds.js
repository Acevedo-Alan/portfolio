/*
 * apps/chess/sounds.js — the sounds of the game, played through Web Audio so a heavy piece can
 * sound lower than a pawn (the same recording at a different speed). Files are in sounds/chess/.
 * Follows the master volume and mute from the tray. The window creates one when it opens and
 * calls dispose() when it closes, which releases the audio context.
 *
 * Which file means what (change here to remap):
 *   move, capture, check, promotion  the game events
 *   blunder   a very bad move        mistake   a bad move        missed   a forced mate was missed
 */

import * as bus from '../../core/bus.js';
import { effective } from '../../audio/volume.js';

const FILES = ['move', 'capture', 'check', 'promotion', 'blunder', 'mistake', 'missed'];

/** Playback speed by piece: small pieces click high, big ones thud low. */
const PITCH = { p: 1.14, n: 1.06, b: 0.99, r: 0.9, q: 0.83, k: 0.75 };

export class ChessSounds {
  #ctx = null;
  #out = null;
  #buffers = new Map();
  #off = null;
  #noise = null;            // a short burst of noise, the "tap" of the knock

  constructor() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.#ctx = new AudioContextClass();
      this.#out = this.#ctx.createGain();
      this.#out.gain.value = effective();
      this.#out.connect(this.#ctx.destination);
      const length = Math.floor(this.#ctx.sampleRate * 0.05);
      this.#noise = this.#ctx.createBuffer(1, length, this.#ctx.sampleRate);
      const data = this.#noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      this.#off = bus.on('volume:changed', () => { if (this.#out) this.#out.gain.value = effective(); });
    } catch (e) { this.#ctx = null; }                        // no audio: the game stays silent
  }

  /** Downloads and decodes every sound; a missing file just stays silent. */
  async load() {
    if (!this.#ctx) return;
    await Promise.all(FILES.map(async (name) => {
      try {
        const response = await fetch(`sounds/chess/${name}.mp3`);
        if (!response.ok) return;
        const buffer = await this.#ctx.decodeAudioData(await response.arrayBuffer());
        this.#buffers.set(name, buffer);
      } catch (e) { /* ignore: that sound won't play */ }
    }));
  }

  /** Puts the listener where the camera is, so sounds come from the side of the board they happen on. */
  setListener({ position, forward, up }) {
    if (!this.#ctx) return;
    const l = this.#ctx.listener;
    if (l.positionX) {
      l.positionX.value = position[0]; l.positionY.value = position[1]; l.positionZ.value = position[2];
      l.forwardX.value = forward[0]; l.forwardY.value = forward[1]; l.forwardZ.value = forward[2];
      l.upX.value = up[0]; l.upY.value = up[1]; l.upZ.value = up[2];
    } else if (l.setPosition) {
      l.setPosition(...position);
      l.setOrientation(...forward, ...up);
    }
  }

  /** A wooden knock: a short low thump that falls in pitch, plus a click of filtered noise. Heavier pieces knock lower. */
  #knock(destination, pitch, strength) {
    const ctx = this.#ctx;
    const now = ctx.currentTime;
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(300 * pitch, now);
    thump.frequency.exponentialRampToValueAtTime(110 * pitch, now + 0.08);
    thumpGain.gain.setValueAtTime(0.32 * strength, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    thump.connect(thumpGain).connect(destination);
    thump.start(now);
    thump.stop(now + 0.12);
    const tap = ctx.createBufferSource();
    const band = ctx.createBiquadFilter();
    const tapGain = ctx.createGain();
    tap.buffer = this.#noise;
    band.type = 'bandpass';
    band.frequency.value = 1700 * pitch;
    band.Q.value = 0.9;
    tapGain.gain.value = 0.22 * strength;
    tap.connect(band).connect(tapGain).connect(destination);
    tap.start(now);
  }

  /**
   * @param {string} name one of FILES
   * @param {{ piece?: string, gain?: number, at?: number[] }} [options] `piece` ('p','n','b','r','q','k') sets the
   *        pitch; `at` ([x, y, z] on the board) places the sound in space, heard from the listener (see setListener)
   */
  play(name, { piece, gain = 1, at } = {}) {
    const buffer = this.#buffers.get(name);
    if (!this.#ctx || !buffer || effective() === 0) return;
    const ctx = this.#ctx;
    ctx.resume();
    const pitch = piece ? PITCH[piece] || 1 : 1;
    const level = ctx.createGain();
    level.gain.value = gain;
    let destination = level;
    let panner = null;
    if (at) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 6;
      panner.rolloffFactor = 0.6;
      if (panner.positionX) { panner.positionX.value = at[0]; panner.positionY.value = at[1] + 0.3; panner.positionZ.value = at[2]; }
      else panner.setPosition(at[0], at[1] + 0.3, at[2]);
      level.connect(panner).connect(this.#out);
      level.gain.value = gain * 1.5;                       // makes up for the distance to the camera
    } else {
      level.connect(this.#out);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch * (0.97 + Math.random() * 0.06);
    source.connect(destination);
    source.onended = () => { source.disconnect(); level.disconnect(); if (panner) panner.disconnect(); };
    source.start();
    if (name === 'move' || name === 'capture') this.#knock(destination, pitch, name === 'capture' ? 1.3 : 1);
  }

  dispose() {
    if (this.#off) this.#off();
    this.#off = null;
    this.#buffers.clear();
    if (this.#ctx) { this.#ctx.close().catch(() => {}); this.#ctx = null; }
    this.#out = null;
  }
}
