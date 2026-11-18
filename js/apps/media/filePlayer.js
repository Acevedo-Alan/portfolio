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
  #rate = 1;
  #keepPitch = false;

  /** Called when a track plays to its end. */
  onEnded = () => {};
  /** Called when the audio element reports a load or decode failure. */
  onError = () => {};

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

  /** True once the file's length is known, i.e. jumping to a position makes sense. */
  get seekable() {
    return !!this.#audio && Number.isFinite(this.#audio.duration) && this.#audio.duration > 0;
  }

  /** Playback speed; with keepPitch false the pitch follows the speed, like a record. */
  setRate(rate, keepPitch) {
    this.#rate = rate;
    this.#keepPitch = keepPitch;
    if (this.#audio) this.#applyRate(this.#audio);
  }

  #applyRate(audio) {
    audio.playbackRate = this.#rate;
    audio.preservesPitch = this.#keepPitch;
    audio.mozPreservesPitch = this.#keepPitch;
    audio.webkitPreservesPitch = this.#keepPitch;
  }

  /** Jumps to `fraction` (0..1) of the track. */
  seek(fraction) {
    if (!this.seekable) return;
    this.#audio.currentTime = Math.min(Math.max(fraction, 0), 1) * this.#audio.duration;
  }

  async play(track) {
    if (track !== this.#track) this.#load(track);
    const audio = this.#audio;
    await this.#out.ctx.resume();
    if (audio !== this.#audio) return;           // stopped or replaced while resuming: nothing to play any more
    await audio.play();
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
    this.#applyRate(audio);
    this.#source = this.#out.ctx.createMediaElementSource(audio);
    this.#source.connect(this.#out.master);
    audio.addEventListener('ended', () => this.onEnded());
    audio.addEventListener('error', () => { if (audio === this.#audio) this.onError(); });
    this.#audio = audio;
    this.#track = track;
  }
}
