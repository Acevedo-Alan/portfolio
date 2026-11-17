/*
 * apps/media/output.js — the player's shared audio output: one AudioContext,
 * a master gain and an analyser. Both playback engines (the chiptune synth
 * and the audio-file player) connect to it, so volume and the visualizers
 * work the same no matter what is playing.
 *
 * Two volume layers multiply into the master gain:
 *   volume  the player's own slider
 *   scale   the global master volume from the tray (audio/volume.js)
 */

export class AudioOutput {
  #ctx = null;
  #master = null;
  #analyser = null;
  #volume = 0.7;
  #scale = 1;

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

  #apply() {
    if (this.#master) this.#master.gain.value = this.#volume * this.#scale;
  }

  #ensure() {
    if (this.#ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.#ctx = new AudioContextClass();
    this.#master = this.#ctx.createGain();
    this.#analyser = this.#ctx.createAnalyser();
    this.#analyser.fftSize = 512;               // 256 frequency bins + 512 time-domain samples: enough for smooth curves
    this.#analyser.smoothingTimeConstant = 0.82;
    this.#master.connect(this.#analyser);
    this.#analyser.connect(this.#ctx.destination);
    this.#apply();
  }
}
