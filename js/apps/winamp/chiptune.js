/*
 * apps/winamp/chiptune.js — a tiny Web Audio synthesizer + step sequencer.
 * Plays a track from tracks.js with square/triangle oscillators, a sine kick
 * and a noise hi-hat, scheduled a little ahead of the audio clock so timing
 * stays tight. Exposes an AnalyserNode for the visualizer.
 *
 * Audio only starts from an explicit play() call (a click), which satisfies
 * browser autoplay rules.
 */

import { notesAt } from './tracks.js';

const LOOKAHEAD_S = 0.15;   // how far ahead of the clock notes are scheduled
const TICK_MS = 30;         // how often the scheduler runs

const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);

export class Chiptune {
  #ctx = null;
  #master = null;
  #analyser = null;
  #session = null;          // per-play gain node: disconnecting it cuts queued notes on stop
  #noise = null;
  #timer = null;
  #track = null;
  #step = 0;
  #nextTime = 0;
  #startedAt = 0;
  #volume = 0.7;

  get playing() { return this.#timer !== null; }
  get track() { return this.#track; }
  get analyser() { this.#ensure(); return this.#analyser; }
  /** Seconds played of the current track (frozen while paused). */
  get elapsed() { return this.#ctx && this.#track ? Math.max(0, this.#ctx.currentTime - this.#startedAt) : 0; }

  setVolume(volume) {
    this.#volume = volume;
    if (this.#master) this.#master.gain.value = volume;
  }

  async play(track) {
    this.#ensure();
    if (track !== this.#track) this.#begin(track);
    await this.#ctx.resume();
    if (!this.#timer) this.#timer = setInterval(() => this.#tick(), TICK_MS);
  }

  async pause() {
    clearInterval(this.#timer);
    this.#timer = null;
    if (this.#ctx) await this.#ctx.suspend();
  }

  stop() {
    clearInterval(this.#timer);
    this.#timer = null;
    this.#track = null;
    if (this.#session) { this.#session.disconnect(); this.#session = null; }
    if (this.#ctx) this.#ctx.suspend();
  }

  // ---------- Setup ----------

  #ensure() {
    if (this.#ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.#ctx = new AudioContextClass();
    this.#master = this.#ctx.createGain();
    this.#master.gain.value = this.#volume;
    this.#analyser = this.#ctx.createAnalyser();
    this.#analyser.fftSize = 128;
    this.#analyser.smoothingTimeConstant = 0.8;
    this.#master.connect(this.#analyser);
    this.#analyser.connect(this.#ctx.destination);

    const length = Math.floor(this.#ctx.sampleRate * 0.1);
    this.#noise = this.#ctx.createBuffer(1, length, this.#ctx.sampleRate);
    const data = this.#noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  #begin(track) {
    if (this.#session) this.#session.disconnect();
    this.#session = this.#ctx.createGain();
    this.#session.connect(this.#master);
    this.#track = track;
    this.#step = 0;
    this.#nextTime = this.#ctx.currentTime + 0.05;
    this.#startedAt = this.#ctx.currentTime;
  }

  // ---------- Scheduling ----------

  #tick() {
    const stepSeconds = 60 / this.#track.bpm / 4;        // one sixteenth note
    while (this.#nextTime < this.#ctx.currentTime + LOOKAHEAD_S) {
      this.#scheduleStep(this.#step, this.#nextTime, stepSeconds);
      this.#nextTime += stepSeconds;
      this.#step++;
    }
  }

  #scheduleStep(step, time, stepSeconds) {
    const { lead, bass, drum } = notesAt(this.#track, step);
    if (lead !== null) this.#tone(this.#track.leadWave, lead, time, stepSeconds * 1.8, 0.07);
    if (bass !== null) this.#tone(this.#track.bassWave, bass, time, stepSeconds * 3.6, 0.12);
    if (drum === 'kick') this.#kick(time);
    else if (drum === 'hat') this.#hat(time);
  }

  // ---------- Voices ----------

  #tone(wave, midi, time, duration, volume) {
    const osc = this.#ctx.createOscillator();
    const gain = this.#ctx.createGain();
    osc.type = wave;
    osc.frequency.value = midiToHz(midi);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain).connect(this.#session);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  #kick(time) {
    const osc = this.#ctx.createOscillator();
    const gain = this.#ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.connect(gain).connect(this.#session);
    osc.start(time);
    osc.stop(time + 0.16);
  }

  #hat(time) {
    const source = this.#ctx.createBufferSource();
    const filter = this.#ctx.createBiquadFilter();
    const gain = this.#ctx.createGain();
    source.buffer = this.#noise;
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    gain.gain.setValueAtTime(0.06, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    source.connect(filter).connect(gain).connect(this.#session);
    source.start(time, 0, 0.06);
  }
}
