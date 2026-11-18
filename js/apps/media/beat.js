/*
 * apps/media/beat.js — a small beat detector over the analyser's spectrum.
 * It tracks the energy of the low end against its own recent average (about a
 * second of history) and calls it a beat when the energy jumps well above that
 * average and the variance says the level is not just noisy. `pulse` jumps to 1
 * on a beat and decays, so anything can be driven by it (glow, scale, flashes).
 *
 *   const beats = createBeatDetector();
 *   const { hit, pulse, bass, mid, treble } = beats.update(freq, dt);
 */

const HISTORY = 60;          // frames of memory (~1 s at 60 fps)
const MIN_GAP_S = 0.24;      // never faster than ~250 BPM
const DECAY_PER_S = 5;

const band = (arr, from, to) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += arr[i];
  return sum / (to - from) / 255;
};

export function createBeatDetector() {
  const history = [];
  let sinceBeat = 1;
  let pulse = 0;

  return {
    reset() { history.length = 0; pulse = 0; sinceBeat = 1; },

    update(freq, dt) {
      const n = freq.length;
      const bass = band(freq, 0, Math.max(2, Math.floor(n * 0.03)));          // roughly 0-350 Hz
      const mid = band(freq, Math.floor(n * 0.03), Math.floor(n * 0.2));
      const treble = band(freq, Math.floor(n * 0.2), Math.floor(n * 0.6));

      let mean = 0;
      for (const v of history) mean += v;
      mean = history.length ? mean / history.length : 0;
      let variance = 0;
      for (const v of history) variance += (v - mean) ** 2;
      variance = history.length ? variance / history.length : 0;
      const threshold = Math.max(0.12, (-15 * variance + 1.45) * mean);       // the classic adaptive threshold

      sinceBeat += dt;
      const hit = history.length > 10 && bass > threshold && bass > 0.35 && sinceBeat > MIN_GAP_S;
      if (hit) { pulse = 1; sinceBeat = 0; }
      else pulse = Math.max(0, pulse - dt * DECAY_PER_S);

      history.push(bass);
      if (history.length > HISTORY) history.shift();
      return { hit, pulse, bass, mid, treble };
    },
  };
}
