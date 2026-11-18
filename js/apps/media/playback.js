/*
 * apps/media/playback.js — one playback surface over two engines. A track
 * with a `src` is played by FilePlayer; any other track is synthesized by
 * Chiptune. Only one engine plays at a time; switching stops the other.
 * The UI talks to this class and never to an engine directly.
 */

import { AudioOutput } from './output.js';
import { Chiptune } from './chiptune.js';
import { FilePlayer } from './filePlayer.js';

export class Playback {
  #out = new AudioOutput();
  #synth = new Chiptune(this.#out);
  #files = new FilePlayer(this.#out);
  #active = this.#synth;

  get playing() { return this.#active.playing; }
  get track() { return this.#active.track; }
  get elapsed() { return this.#active.elapsed; }
  get progress() { return this.#active.progress; }
  get analyser() { return this.#out.analyser; }
  /** Only file tracks can be seeked; the synth loops forever. */
  get seekable() { return this.#active === this.#files && this.#files.seekable; }

  /** Called when a file track reaches its end (synth tracks loop forever). */
  set onEnded(handler) { this.#files.onEnded = handler; }

  /** Called when a file fails to load or decode. */
  set onError(handler) { this.#files.onError = handler; }

  /** Jumps to `fraction` (0..1) of the current file track; ignored for synth tracks. */
  seek(fraction) { if (this.seekable) this.#files.seek(fraction); }

  setVolume(volume) { this.#out.setVolume(volume); }

  /** The signal chain (EQ, filter, reverb, echo): see output.js. */
  get fx() { return this.#out; }

  /** Speed multiplier for both engines; `keepPitch` changes the tempo without changing the key. */
  setRate(rate, keepPitch = false) {
    this.#synth.setRate(rate, keepPitch);
    this.#files.setRate(rate, keepPitch);
  }

  setMaster(scale) { this.#out.setMaster(scale); }

  async play(track) {
    const engine = track.src ? this.#files : this.#synth;
    if (engine !== this.#active) {
      this.#active.stop();
      this.#active = engine;
    }
    await engine.play(track);
  }

  pause() { return this.#active.pause(); }
  stop() { this.#active.stop(); }
}
