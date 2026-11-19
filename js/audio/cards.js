/*
 * audio/cards.js — tiny synthesized sounds for the card game (no audio files), made with Web Audio:
 *
 *   slide     a short filtered-noise swish: a card sliding onto a column
 *   thud      a low thump: an illegal move
 *   arpeggio  a rising four-note arpeggio: a finished run
 *   pop       a soft burst: a firework exploding
 *
 * Everything follows the master volume and mute from audio/volume.js. The AudioContext is created
 * on the first call (which always comes from a click or key press, so browsers allow it).
 */

import { effective } from './volume.js';

let ctx = null;
let noise = null;

function ensure() {
  if (ctx) return true;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;
  ctx = new AudioContextClass();
  const length = Math.floor(ctx.sampleRate * 0.5);
  noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return true;
}

/** Runs `build(now, out)` with an output gain at the master volume; silent when muted. */
function voice(build) {
  const volume = effective();
  if (volume === 0 || !ensure()) return;
  try {
    ctx.resume();
    const out = ctx.createGain();
    out.gain.value = volume;
    out.connect(ctx.destination);
    build(ctx.currentTime, out);
  } catch (e) { /* audio unavailable: stay silent */ }
}

function envelope(out, now, peak, attack, release) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
  gain.connect(out);
  return gain;
}

export function slide() {
  voice((now, out) => {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2600, now);
    filter.frequency.exponentialRampToValueAtTime(900, now + 0.09);
    filter.Q.value = 0.9;
    source.connect(filter).connect(envelope(out, now, 0.35, 0.008, 0.08));
    source.start(now, Math.random() * 0.3, 0.12);
  });
}

export function thud() {
  voice((now, out) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.16);
    osc.connect(envelope(out, now, 0.7, 0.005, 0.18));
    osc.start(now);
    osc.stop(now + 0.25);
  });
}

export function arpeggio() {
  voice((now, out) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {      // C5 E5 G5 C6
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(envelope(out, now + i * 0.075, 0.35, 0.01, 0.22));
      osc.start(now + i * 0.075);
      osc.stop(now + i * 0.075 + 0.3);
    });
  });
}

export function pop() {
  voice((now, out) => {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.25);
    source.connect(filter).connect(envelope(out, now, 0.45, 0.004, 0.22));
    source.start(now, Math.random() * 0.2, 0.3);
  });
}

/** A short victory fanfare: a rising C-major arpeggio over two octaves that ends on a held chord. */
export function fanfare() {
  voice((now, out) => {
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(envelope(out, now + i * 0.09, 0.3, 0.01, 0.25));
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.35);
    });
    [1046.5, 1318.5, 1568].forEach((freq) => {                // the held chord
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(envelope(out, now + 0.6, 0.22, 0.02, 0.9));
      osc.start(now + 0.6);
      osc.stop(now + 1.6);
    });
  });
}
