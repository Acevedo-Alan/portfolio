/*
 * apps/media/filePlayer.js — plays a real audio file (MP3, OGG, WAV, …)
 * through the shared AudioOutput, so the visualizers, the player's volume
 * slider and the tray's master volume all work on it exactly as they do on
 * the synth tracks. Same surface as Chiptune: play / pause / stop, playing,
 * track, elapsed, progress.
 */

export class FilePlayer {
  #out;
  #audio = null;
  #source = null;
  #track = null;

  /** Called when a track plays to its end. */
  onEnded = () => {};

  constructor(output) {
    this.#out = output;
  }

  get playing() { return !!this.#audio && !this.#audio.paused && !this.#audio.ended; }
  get track() { return this.#track; }
  get elapsed() { return this.#audio ? this.#audio.currentTime : 0; }
  get progress() {
    const duration = this.#audio ? this.#audio.duration : 0;
    return duration && Number.isFinite(duration) ? this.#audio.currentTime / duration : 0;
  }

  async play(track) {
    if (track !== this.#track) this.#load(track);
    await this.#out.ctx.resume();
    await this.#audio.play();
  }

  async pause() {
    if (this.#audio) this.#audio.pause();
  }

  stop() {
    if (this.#audio) { this.#audio.pause(); this.#audio.currentTime = 0; }
    if (this.#source) { this.#source.disconnect(); this.#source = null; }
    this.#audio = null;
    this.#track = null;
  }

  #load(track) {
    this.stop();
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = track.src;
    this.#source = this.#out.ctx.createMediaElementSource(audio);
    this.#source.connect(this.#out.master);
    audio.addEventListener('ended', () => this.onEnded());
    this.#audio = audio;
    this.#track = track;
  }
}
