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
 *   bass/mid/treble  band levels 0..1; hit = a beat landed this frame; pulse = 1 on a beat, decaying (see beat.js)
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

// ---------- Color helpers ----------

let colorProbe = null;
/** Any CSS color (the skin gives hex) → [r, g, b] 0..255. */
function rgbOf(css) {
  colorProbe = colorProbe || document.createElement('canvas').getContext('2d');
  colorProbe.fillStyle = '#000';
  colorProbe.fillStyle = css;
  const v = colorProbe.fillStyle;                       // normalized to #rrggbb (or rgba(...) with alpha)
  if (v[0] === '#') return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  return v.match(/[\d.]+/g).slice(0, 3).map(Number);
}

const lerp = (a, b, u) => a + (b - a) * u;

// ---------- Spectrogram: frequency against time, scrolling left ----------

function createSpectrogram() {
  const SCROLL = 2;                                     // px the picture moves per frame
  let off = null;
  let og = null;
  let lut = null;
  let lutKey = '';

  function heatTable(palette) {
    const key = palette.a + palette.b + palette.c;
    if (key === lutKey) return;
    lutKey = key;
    const stops = [[3, 8, 28], rgbOf(palette.b).map((v) => v * 0.55), rgbOf(palette.b), rgbOf(palette.a), rgbOf(palette.c)];
    lut = Array.from({ length: 256 }, (_, i) => {
      const x = (i / 255) * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(x));
      const c = stops[k].map((v, ch) => Math.round(lerp(v, stops[k + 1][ch], x - k)));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    });
  }

  function surface(w, h) {
    const W = Math.max(2, Math.round(w));
    const H = Math.max(2, Math.round(h));
    if (off && off.width === W && off.height === H) return;
    off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    og = off.getContext('2d');
    og.fillStyle = '#03081C';
    og.fillRect(0, 0, W, H);
  }

  return {
    reset() { if (og) { og.fillStyle = '#03081C'; og.fillRect(0, 0, off.width, off.height); } },
    draw(g, w, h, { freq, palette }) {
      surface(w, h);
      heatTable(palette);
      const W = off.width;
      const H = off.height;
      og.globalCompositeOperation = 'copy';
      og.drawImage(off, -SCROLL, 0);                    // slide the whole picture left
      og.globalCompositeOperation = 'source-over';
      const usable = Math.floor(freq.length * 0.75);
      const ROW = 2;
      for (let y = 0; y < H; y += ROW) {
        const t = 1 - y / H;                            // low frequencies at the bottom
        const bin = Math.min(usable - 1, Math.floor(t ** 1.8 * usable));
        og.fillStyle = lut[freq[bin]];
        og.fillRect(W - SCROLL, y, SCROLL, ROW);
      }
      g.globalCompositeOperation = 'source-over';
      g.imageSmoothingEnabled = true;
      g.drawImage(off, 0, 0, w, h);
    },
  };
}

// ---------- Tunnel / plasma fragment shader driven by bass, mids, treble and the beat ----------

const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
const FRAG = `
precision mediump float;
uniform vec2 r; uniform float t, bass, mid, treb, beat; uniform vec2 m; uniform vec3 ca, cb, cc;
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * r) / r.y;
  p += (m - 0.5) * vec2(0.35, -0.35);
  float a = atan(p.y, p.x);
  float d = length(p);
  float tun = 1.0 / (d + 0.16 + 0.10 * bass);
  vec2 uv = vec2(a / 3.14159 * 3.0 + t * 0.10, tun + t * (0.35 + bass * 0.9));
  float v = sin(uv.x * 4.0 + sin(uv.y * 3.0 + mid * 6.0))
          + sin(uv.y * 6.0 - t)
          + sin((p.x + p.y) * 8.0 + t * 2.0 + treb * 8.0);
  v = v * 0.25 + 0.5;
  vec3 col = mix(cb * 0.35, ca, smoothstep(0.15, 0.7, v));
  col = mix(col, cc, smoothstep(0.78, 1.0, v + beat * 0.35));
  col *= smoothstep(0.0, 0.32, d) * (0.65 + 0.9 * bass + 0.6 * beat);
  gl_FragColor = vec4(col, 1.0);
}`;

function createShader() {
  let gl = null;
  let program = null;
  let uniforms = null;
  let canvas = null;
  let failed = false;
  let rgb = null;
  let rgbKey = '';

  function init() {
    canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) { failed = true; return; }
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    try {
      program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    } catch (e) {
      console.warn('Shader visualizer unavailable:', e.message);
      failed = true;
      return;
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one oversized triangle covers the screen
    const loc = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    uniforms = Object.fromEntries(['r', 't', 'bass', 'mid', 'treb', 'beat', 'm', 'ca', 'cb', 'cc'].map((n) => [n, gl.getUniformLocation(program, n)]));
  }

  return {
    reset() {},
    draw(g, w, h, { palette, pointer, time, bass, mid, treble, pulse }) {
      if (!gl && !failed) init();
      if (failed) {                                     // no WebGL: say so instead of a black screen
        fade(g, w, h, 1);
        g.fillStyle = palette.c;
        g.font = '12px Tahoma, sans-serif';
        g.textAlign = 'center';
        g.fillText('WebGL no disponible / WebGL unavailable', w / 2, h / 2);
        return;
      }
      const W = g.canvas.width;
      const H = g.canvas.height;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const key = palette.a + palette.b + palette.c;
      if (key !== rgbKey) { rgbKey = key; rgb = [palette.a, palette.b, palette.c].map((c) => rgbOf(c).map((v) => v / 255)); }
      gl.viewport(0, 0, W, H);
      gl.uniform2f(uniforms.r, W, H);
      gl.uniform1f(uniforms.t, time);
      gl.uniform1f(uniforms.bass, bass);
      gl.uniform1f(uniforms.mid, mid);
      gl.uniform1f(uniforms.treb, treble);
      gl.uniform1f(uniforms.beat, pulse);
      gl.uniform2f(uniforms.m, pointer.active ? pointer.x / w : 0.5, pointer.active ? pointer.y / h : 0.5);
      gl.uniform3fv(uniforms.ca, rgb[0]);
      gl.uniform3fv(uniforms.cb, rgb[1]);
      gl.uniform3fv(uniforms.cc, rgb[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      g.globalCompositeOperation = 'source-over';
      g.drawImage(canvas, 0, 0, w, h);
    },
  };
}

// ---------- Auto: MilkDrop-style preset cycling, changing on the beat ----------

function createAuto() {
  const presets = [createAlchemy(), createShader(), createBarsAndWaves(), createSpectrogram(), createScope()];
  let current = 0;
  let beats = 0;
  let since = 0;
  let veil = 0;                                         // a dark flash that hides the cut between presets

  const next = () => {
    current = (current + 1) % presets.length;
    presets[current].reset();
    beats = 0;
    since = 0;
    veil = 1;
  };

  return {
    reset() { presets.forEach((p) => p.reset()); beats = 0; since = 0; veil = 0; },
    draw(g, w, h, frame) {
      since += frame.dt;
      if (frame.hit) beats++;
      if (beats >= 16 || since > 24) next();            // every 16 beats (4 bars), or 24 s on quiet music
      presets[current].draw(g, w, h, frame);
      if (veil > 0) {
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = `rgba(5, 14, 44, ${veil})`;
        g.fillRect(0, 0, w, h);
        veil = Math.max(0, veil - frame.dt * 2.2);
      }
    },
  };
}

export const VISUALIZERS = [
  { id: 'bars', labelKey: 'mp-vis-bars', create: createBarsAndWaves },
  { id: 'alchemy', labelKey: 'mp-vis-alchemy', create: createAlchemy },
  { id: 'scope', labelKey: 'mp-vis-scope', create: createScope },
  { id: 'spectrogram', labelKey: 'mp-vis-spectrogram', create: createSpectrogram },
  { id: 'shader', labelKey: 'mp-vis-shader', create: createShader },
  { id: 'auto', labelKey: 'mp-vis-auto', create: createAuto },
];
