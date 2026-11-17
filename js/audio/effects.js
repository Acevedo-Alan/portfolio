/*
 * audio/effects.js — two synthesized ambience effects for the wizards, made
 * with Web Audio (no audio files):
 *
 *   cdHum(seconds)      a CD-ROM drive spinning up, whirring and seeking
 *   modemDial(seconds)  DTMF dial tones followed by a dial-up handshake
 *
 * Both return { stop() }. They go through one output gain that follows the
 * master volume (audio/volume.js), so the tray's volume and mute apply.
 */

import * as bus from '../core/bus.js';
import { effective } from './volume.js';

let ctx = null;
let out = null;
let noise = null;

function ensure() {
  if (ctx) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  ctx = new AudioContextClass();
  out = ctx.createGain();
  out.gain.value = effective();
  out.connect(ctx.destination);
  const length = ctx.sampleRate * 2;
  noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  bus.on('volume:changed', ({ effective: gain }) => { out.gain.value = gain; });
}

/** Common lifecycle: a gain node for one effect, a fade-out stop, and a cleanup list. */
function session(volume) {
  ensure();
  ctx.resume();
  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.connect(out);
  const sources = [];
  return {
    gain,
    add(source) { sources.push(source); return source; },
    stop() {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.25);
      sources.forEach((s) => { try { s.stop(now + 0.3); } catch (e) { /* already stopped */ } });
    },
  };
}

export function cdHum(seconds) {
  const s = session(0.0001);
  const now = ctx.currentTime;
  s.gain.gain.linearRampToValueAtTime(0.22, now + 0.5);
  s.gain.gain.setValueAtTime(0.22, now + seconds - 0.6);
  s.gain.gain.linearRampToValueAtTime(0, now + seconds);

  // motor: a low saw that spins up, through a low-pass
  const motor = s.add(ctx.createOscillator());
  const lowpass = ctx.createBiquadFilter();
  motor.type = 'sawtooth';
  motor.frequency.setValueAtTime(40, now);
  motor.frequency.exponentialRampToValueAtTime(118, now + 1.6);
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 380;
  motor.connect(lowpass).connect(s.gain);
  motor.start(now);
  motor.stop(now + seconds);

  // disc whir: band-passed noise that rises with the spin
  const whir = s.add(ctx.createBufferSource());
  const band = ctx.createBiquadFilter();
  const whirGain = ctx.createGain();
  whir.buffer = noise;
  whir.loop = true;
  band.type = 'bandpass';
  band.frequency.setValueAtTime(600, now);
  band.frequency.exponentialRampToValueAtTime(2200, now + 1.8);
  whirGain.gain.value = 0.35;
  whir.connect(band).connect(whirGain).connect(s.gain);
  whir.start(now);
  whir.stop(now + seconds);

  // laser seek ticks at irregular intervals
  for (let t = 1.2; t < seconds - 0.5; t += 0.5 + Math.random() * 0.9) {
    const tick = s.add(ctx.createOscillator());
    const tickGain = ctx.createGain();
    tick.type = 'square';
    tick.frequency.value = 180 + Math.random() * 120;
    tickGain.gain.setValueAtTime(0.0001, now + t);
    tickGain.gain.linearRampToValueAtTime(0.5, now + t + 0.004);
    tickGain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.05);
    tick.connect(tickGain).connect(s.gain);
    tick.start(now + t);
    tick.stop(now + t + 0.06);
  }
  return { stop: s.stop };
}

const DTMF = {
  1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336],
  6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], 0: [941, 1336],
};

export function modemDial(seconds) {
  const s = session(0.0001);
  const now = ctx.currentTime;
  s.gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
  s.gain.gain.setValueAtTime(0.12, now + seconds - 0.4);
  s.gain.gain.linearRampToValueAtTime(0, now + seconds);

  // dial a number
  let t = 0.2;
  [5, 5, 5, 0, 1, 2, 3].forEach((digit) => {
    DTMF[digit].forEach((freq) => {
      const osc = s.add(ctx.createOscillator());
      osc.frequency.value = freq;
      osc.connect(s.gain);
      osc.start(now + t);
      osc.stop(now + t + 0.09);
    });
    t += 0.15;
  });

  // handshake: a steady carrier, then a warbling squeal over static
  const carrier = s.add(ctx.createOscillator());
  carrier.frequency.setValueAtTime(2100, now + t + 0.3);
  carrier.connect(s.gain);
  carrier.start(now + t + 0.3);
  carrier.stop(now + t + 1.3);

  const squeal = s.add(ctx.createOscillator());
  squeal.type = 'square';
  squeal.connect(s.gain);
  for (let step = t + 1.4; step < seconds - 0.4; step += 0.06) {
    squeal.frequency.setValueAtTime(1200 + Math.floor(Math.random() * 5) * 300, now + step);
  }
  squeal.start(now + t + 1.4);
  squeal.stop(now + seconds);

  const hiss = s.add(ctx.createBufferSource());
  const hissGain = ctx.createGain();
  hiss.buffer = noise;
  hiss.loop = true;
  hissGain.gain.value = 0.5;
  hiss.connect(hissGain).connect(s.gain);
  hiss.start(now + t + 1.4);
  hiss.stop(now + seconds);
  return { stop: s.stop };
}
