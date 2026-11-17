/*
 * apps/media/visualizers.js — the player's canvas visualizations, as a
 * registry. Each entry is { id, labelKey, create() }; create() returns a
 * renderer { draw(g, w, h, frame), reset() } that keeps its own state. To add
 * a visualization, add an entry; nothing else changes.
 *
 * `frame` = { freq: Uint8Array, wave: Uint8Array, palette: { a, b, c }, pointer, dt, time }
 *   freq     frequency magnitudes 0-255 (low -> high)
 *   wave     time-domain samples 0-255 (128 = silence)
 *   palette  three CSS colors from the current skin
 *   pointer  { x, y, vx, vy, active, down } in canvas pixels: the visitor's cursor over
 *            the screen. Dragging distorts every visualization (see each draw())
 *   dt/time  seconds since the previous frame / since the renderer started
 */

const TAU = Math.PI * 2;

/** Strokes a smooth curve through points using quadratic midpoints. */
function curve(g, pts) {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  }
  g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}

/** Smooth 0..1 falloff around `center` with the given spread (a gaussian bump). */
const bump = (distance, spread) => Math.exp(-(distance * distance) / (2 * spread * spread));

const average = (arr, from, to) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += arr[i];
  return sum / (to - from) / 255;
};

function fade(g, w, h, alpha) {
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = `rgba(5, 14, 44, ${alpha})`;
  g.fillRect(0, 0, w, h);
}

// ---------- Bars and Waves: smooth glassy bars under a flowing wave ----------

function createBarsAndWaves() {
  const BARS = 28;
  const heights = new Array(BARS).fill(0);
  const peaks = new Array(BARS).fill(0);

  return {
    reset() { heights.fill(0); peaks.fill(0); },
    draw(g, w, h, { freq, wave, palette, pointer, dt }) {
      fade(g, w, h, 0.32);
      const usable = Math.floor(freq.length * 0.55);
      const slot = w / BARS;
      const floor = h * 0.9;

      const fill = g.createLinearGradient(0, floor, 0, h * 0.25);
      fill.addColorStop(0, palette.b);
      fill.addColorStop(1, palette.a);

      for (let i = 0; i < BARS; i++) {
        const from = Math.floor((i * usable) / BARS);
        let target = average(freq, from, Math.max(from + 1, Math.floor(((i + 1) * usable) / BARS)));
        if (pointer.active) {                                                       // the cursor lifts the bars it passes over
          const pull = bump(i * slot + slot / 2 - pointer.x, 70);
          target = pointer.down ? Math.max(target, pull * (1 - pointer.y / h)) : target + pull * 0.15;
        }
        heights[i] += (target - heights[i]) * Math.min(1, dt * 12);                 // ease toward the signal
        peaks[i] = Math.max(heights[i], peaks[i] - dt * 0.5);                       // peak cap falls slowly
        const barH = Math.max(3, heights[i] * (floor - h * 0.15));
        const x = i * slot + slot * 0.18;
        const bw = slot * 0.64;

        g.fillStyle = fill;
        g.beginPath();
        g.roundRect(x, floor - barH, bw, barH, bw / 2);
        g.fill();
        g.fillStyle = 'rgba(255, 255, 255, 0.35)';               // glassy highlight
        g.beginPath();
        g.roundRect(x + bw * 0.18, floor - barH + 2, bw * 0.22, Math.max(2, barH - 4), bw / 4);
        g.fill();
        g.fillStyle = palette.c;
        g.beginPath();
        g.arc(x + bw / 2, floor - peaks[i] * (floor - h * 0.15) - 6, bw * 0.28, 0, TAU);
        g.fill();
      }

      // flowing wave over the bars
      const step = Math.max(1, Math.floor(wave.length / 48));
      const pts = [];
      for (let i = 0; i < wave.length; i += step) {
        const x = (i / (wave.length - 1)) * w;
        let y = h * 0.32 + ((wave[i] - 128) / 128) * h * 0.3;
        if (pointer.active) y += (pointer.y - y) * bump(x - pointer.x, 80) * (pointer.down ? 0.85 : 0.12);   // drag to bend the wave
        pts.push({ x, y });
      }
      g.lineCap = 'round';
      g.shadowColor = palette.c;
      g.shadowBlur = 14;
      g.strokeStyle = palette.c;
      g.lineWidth = 2.5;
      curve(g, pts);
      g.stroke();
      g.shadowBlur = 0;
      g.globalAlpha = 0.35;
      g.lineWidth = 6;
      g.strokeStyle = palette.a;
      curve(g, pts.map((p) => ({ x: p.x, y: p.y + 5 })));
      g.stroke();
      g.globalAlpha = 1;
    },
  };
}

// ---------- Alchemy: bass-driven particles that bloom from the center ----------

function createAlchemy() {
  const MAX = 360;
  let particles = [];

  return {
    reset() { particles = []; },
    draw(g, w, h, { freq, palette, pointer, dt, time }) {
      fade(g, w, h, 0.18);
      const bass = average(freq, 0, 8);
      const mid = average(freq, 8, 40);
      const cx = w / 2;
      const cy = h / 2;

      const spawn = Math.floor(2 + bass * 14);
      for (let i = 0; i < spawn && particles.length < MAX; i++) {
        const angle = Math.random() * TAU;
        const speed = 40 + bass * 220 + Math.random() * 60;
        particles.push({
          x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 1, decay: 0.45 + Math.random() * 0.5, size: 2 + bass * 7 * Math.random() + mid * 3,
          hue: (time * 45 + Math.random() * 70) % 360,
        });
      }

      if (pointer.active && pointer.down) {                       // holding the button also emits from the cursor
        for (let i = 0; i < 5 && particles.length < MAX; i++) {
          const angle = Math.random() * TAU;
          const speed = 30 + Math.random() * 90;
          particles.push({ x: pointer.x, y: pointer.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, decay: 0.6 + Math.random() * 0.5, size: 2 + Math.random() * 4, hue: (time * 45 + 180 + Math.random() * 60) % 360 });
        }
      }

      g.globalCompositeOperation = 'lighter';
      particles = particles.filter((p) => p.life > 0);
      for (const p of particles) {
        if (pointer.active) {
          const dx = pointer.x - p.x;
          const dy = pointer.y - p.y;
          const dist = Math.hypot(dx, dy) + 1;
          if (pointer.down) {                                     // gravity well
            const pull = Math.min(1600, 4e6 / (dist * dist + 900));
            p.vx += (dx / dist) * pull * dt;
            p.vy += (dy / dist) * pull * dt;
          } else {                                                // a moving cursor stirs the cloud
            const stir = bump(dist, 70) * 6;
            p.vx += pointer.vx * stir;
            p.vy += pointer.vy * stir;
          }
        }
        p.life -= p.decay * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - 0.6 * dt;
        p.vy *= 1 - 0.6 * dt;
        const r = Math.max(0.1, p.size * p.life);
        const glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
        glow.addColorStop(0, `hsla(${p.hue}, 95%, 65%, ${p.life * 0.9})`);
        glow.addColorStop(1, `hsla(${p.hue}, 95%, 55%, 0)`);
        g.fillStyle = glow;
        g.beginPath();
        g.arc(p.x, p.y, r * 3, 0, TAU);
        g.fill();
      }

      // pulsing core ring tinted by the skin
      g.strokeStyle = palette.c;
      g.globalAlpha = 0.5;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, 14 + bass * 40, 0, TAU);
      g.stroke();
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    },
  };
}

// ---------- Oscilloscope: a glowing trace on a faint graticule ----------

function createScope() {
  return {
    reset() {},
    draw(g, w, h, { wave, palette, pointer }) {
      fade(g, w, h, 0.4);
      g.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 1; i < 8; i++) { g.moveTo((w / 8) * i, 0); g.lineTo((w / 8) * i, h); }
      for (let i = 1; i < 4; i++) { g.moveTo(0, (h / 4) * i); g.lineTo(w, (h / 4) * i); }
      g.stroke();

      const step = Math.max(1, Math.floor(wave.length / 96));
      const pts = [];
      for (let i = 0; i < wave.length; i += step) {
        const x = (i / (wave.length - 1)) * w;
        let y = h / 2 + ((wave[i] - 128) / 128) * h * 0.46;
        if (pointer.active) y += (pointer.y - y) * bump(x - pointer.x, 60) * (pointer.down ? 0.9 : 0.1);   // drag to pull the trace
        pts.push({ x, y });
      }
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.shadowColor = palette.a;
      g.shadowBlur = 18;
      g.strokeStyle = palette.a;
      g.lineWidth = 4;
      curve(g, pts);
      g.stroke();
      g.shadowBlur = 0;
      g.strokeStyle = palette.c;
      g.lineWidth = 1.6;
      curve(g, pts);
      g.stroke();
    },
  };
}

export const VISUALIZERS = [
  { id: 'bars', labelKey: 'mp-vis-bars', create: createBarsAndWaves },
  { id: 'alchemy', labelKey: 'mp-vis-alchemy', create: createAlchemy },
  { id: 'scope', labelKey: 'mp-vis-scope', create: createScope },
];
