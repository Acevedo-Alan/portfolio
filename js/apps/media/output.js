/*
 * apps/media/output.js — the player's shared audio output: one AudioContext
 * and the signal chain every playback engine (the chiptune synth and the
 * audio-file player) feeds, so volume, effects and the visualizers work the
 * same no matter what is playing:
 *
 *   master (volume) → 10-band EQ → low-pass filter ─┬─ dry ────────────┐
 *                                                   ├─ echo (delay) ───┼→ analyser → speakers
 *                                                   └─ reverb (convolver)┘
 *
 * Two volume layers multiply into the master gain:
 *   volume  the player's own slider
 *   scale   the global master volume from the tray (audio/volume.js)
 */

export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  rock: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5],
  pop: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
  bass: [8, 7, 5, 2, 0, 0, 0, 0, 0, 0],
  treble: [0, 0, 0, 0, 0, 1, 3, 5, 7, 8],
  vocal: [-3, -2, -1, 2, 4, 4, 3, 1, 0, -1],
};
const FILTER_OPEN = 22000;

export class AudioOutput {
  #ctx = null;
  #master = null;
  #analyser = null;
  #eq = [];
  #filter = null;
  #echo = null;           // { send, feedback }
  #reverb = null;         // { send }
  #volume = 0.7;
  #scale = 1;
  #pending = { eq: EQ_PRESETS.flat.slice(), reverb: 0, echo: 0, filter: FILTER_OPEN };

  get ctx() { this.#ensure(); return this.#ctx; }
  get master() { this.#ensure(); return this.#master; }
  get analyser() { this.#ensure(); return this.#analyser; }

  setVolume(volume) {
    this.#volume = volume;
    this.#apply();
  }

  setMaster(scale) {
    this.#scale = scale;
    this.#apply();
  }

  // ---------- Effects (stored first, so they can be set before the context exists) ----------

  /** Sets one EQ band, in dB (-12..12). */
  setBand(i, db) {
    this.#pending.eq[i] = db;
    if (this.#eq[i]) this.#eq[i].gain.value = db;
  }

  setBands(list) { list.forEach((db, i) => this.setBand(i, db)); }
  get bands() { return this.#pending.eq.slice(); }

  /** Low-pass cutoff in Hz; null opens the filter completely. */
  setFilter(hz) {
    this.#pending.filter = hz === null ? FILTER_OPEN : hz;
    if (this.#filter) this.#filter.frequency.setTargetAtTime(this.#pending.filter, this.#ctx.currentTime, 0.03);
  }

  /** 0..1 amount of reverb. */
  setReverb(amount) {
    this.#pending.reverb = amount;
    if (this.#reverb) this.#reverb.send.gain.value = amount;
  }

  /** 0..1 amount of echo. */
  setEcho(amount) {
    this.#pending.echo = amount;
    if (this.#echo) this.#echo.send.gain.value = amount;
  }

  #apply() {
    if (this.#master) this.#master.gain.value = this.#volume * this.#scale;
  }

  #impulse(seconds) {
    const rate = this.#ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.#ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.6;
    }
    return buffer;
  }

  #ensure() {
    if (this.#ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = this.#ctx = new AudioContextClass();
    this.#master = ctx.createGain();

    this.#eq = EQ_FREQS.map((freq, i) => {
      const band = ctx.createBiquadFilter();
      band.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
      band.frequency.value = freq;
      band.Q.value = 1.4;
      band.gain.value = this.#pending.eq[i];
      return band;
    });
    this.#filter = ctx.createBiquadFilter();
    this.#filter.type = 'lowpass';
    this.#filter.Q.value = 4;                    // a little resonance: the filter sweep is audible
    this.#filter.frequency.value = this.#pending.filter;
    this.#master.connect(this.#eq[0]);
    this.#eq.reduce((from, to) => { from.connect(to); return to; });
    this.#eq[this.#eq.length - 1].connect(this.#filter);

    const mix = ctx.createGain();
    this.#filter.connect(mix);                   // dry

    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.28;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const echoSend = ctx.createGain();
    echoSend.gain.value = this.#pending.echo;
    this.#filter.connect(echoSend).connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(mix);
    this.#echo = { send: echoSend, feedback };

    const convolver = ctx.createConvolver();
    convolver.buffer = this.#impulse(1.8);
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = this.#pending.reverb;
    this.#filter.connect(reverbSend).connect(convolver).connect(mix);
    this.#reverb = { send: reverbSend };

    this.#analyser = ctx.createAnalyser();
    this.#analyser.fftSize = 512;               // 256 frequency bins + 512 time-domain samples: enough for smooth curves
    this.#analyser.smoothingTimeConstant = 0.82;
    mix.connect(this.#analyser);
    this.#analyser.connect(ctx.destination);
    this.#apply();
  }
}
