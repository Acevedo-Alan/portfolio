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
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 r; uniform float t, bass, mid, treb, beat; uniform vec2 m; uniform vec3 ca, cb, cc;
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * r) / r.y;
  p += (m - 0.5) * vec2(0.35, -0.35);
  float a = atan(p.y, p.x);
  float d = length(p);
  float tun = 1.0 / (d + 0.16 + 0.10 * bass);
  float z = tun + t * (0.35 + bass * 0.9);
  // The angle only ever enters through sin() with a whole-number multiplier, so atan's jump at -pi/pi never shows as a seam.
  float v = sin(a * 6.0 + t * 0.6 + sin(z * 3.0 + mid * 6.0))
          + sin(z * 6.0 - t)
          + sin((p.x + p.y) * 8.0 + t * 2.0 + treb * 8.0);
  v = v * 0.25 + 0.5;
  vec3 col = mix(cb * 0.35, ca, smoothstep(0.15, 0.7, v));
  col = mix(col, cc, smoothstep(0.78, 1.0, v + beat * 0.35));
  // Fine, sharp detail over the soft colour: thin rings moving down the tunnel and thin spokes (also whole-number multiples of the angle).
  float ring = smoothstep(0.42, 0.5, abs(fract(z * 1.2) - 0.5));
  float spoke = pow(abs(sin(a * 12.0 - t * 0.25)), 48.0);
  float depth = smoothstep(0.06, 0.45, d);
  col += cc * (ring * 0.45 + spoke * 0.3) * depth;
  col *= smoothstep(0.0, 0.32, d) * (0.5 + 0.6 * bass + 0.4 * beat);
  col = 1.0 - exp(-col * 1.15);                                     // soft tone mapping: bright areas roll off instead of burning to white
  gl_FragColor = vec4(col, 1.0);
}`;

/** One full-canvas WebGL program, created lazily on first use. render() returns the GL canvas, or null when WebGL isn't available. */
function glLayer(fragSource, names) {
  let gl = null;
  let canvas = null;
  let uniforms = null;
  let failed = false;

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
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one oversized triangle covers the screen
      const loc = gl.getAttribLocation(program, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
    } catch (e) {
      console.warn('Shader visualizer unavailable:', e.message);
      failed = true;
    }
  }

  return {
    render(W, H, setUniforms) {
      if (!gl && !failed) init();
      if (failed) return null;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      gl.viewport(0, 0, W, H);
      setUniforms(gl, uniforms);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return canvas;
    },
  };
}

/** The palette's three colours as 0..1 RGB triples, recomputed only when the skin changes. */
function paletteRGB() {
  let key = '';
  let rgb = null;
  return (palette) => {
    const k = palette.a + palette.b + palette.c;
    if (k !== key) { key = k; rgb = [palette.a, palette.b, palette.c].map((c) => rgbOf(c).map((v) => v / 255)); }
    return rgb;
  };
}

function webglMissing(g, w, h, palette) {                // no WebGL: say so instead of a black screen
  fade(g, w, h, 1);
  g.fillStyle = palette.c;
  g.font = '12px Tahoma, sans-serif';
  g.textAlign = 'center';
  g.fillText('WebGL no disponible / WebGL unavailable', w / 2, h / 2);
}

function createShader() {
  const layer = glLayer(FRAG, ['r', 't', 'bass', 'mid', 'treb', 'beat', 'm', 'ca', 'cb', 'cc']);
  const colors = paletteRGB();

  return {
    reset() {},
    draw(g, w, h, { palette, pointer, time, bass, mid, treble, pulse }) {
      const rgb = colors(palette);
      const out = layer.render(g.canvas.width, g.canvas.height, (gl, u) => {
        gl.uniform2f(u.r, g.canvas.width, g.canvas.height);
        gl.uniform1f(u.t, time);
        gl.uniform1f(u.bass, bass);
        gl.uniform1f(u.mid, mid);
        gl.uniform1f(u.treb, treble);
        gl.uniform1f(u.beat, pulse);
        gl.uniform2f(u.m, pointer.active ? pointer.x / w : 0.5, pointer.active ? pointer.y / h : 0.5);
        gl.uniform3fv(u.ca, rgb[0]);
        gl.uniform3fv(u.cb, rgb[1]);
        gl.uniform3fv(u.cc, rgb[2]);
      });
      if (!out) { webglMissing(g, w, h, palette); return; }
      g.globalCompositeOperation = 'source-over';
      g.drawImage(out, 0, 0, w, h);
    },
  };
}

/**
 * A persistent "phosphor" layer: opaque black, drawn additively, and redrawn every frame a little larger, rotated and dimmed,
 * so bright marks stream outward into a tunnel. age() returns its context in CSS pixels; show() paints the screen from it.
 */
function phosphorTrail() {
  let canvas = null;
  let copy = null;
  let tg = null;
  let cg = null;

  return {
    clear() { if (tg) { tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalAlpha = 1; tg.fillStyle = '#000'; tg.fillRect(0, 0, canvas.width, canvas.height); } },
    age(W, H, w, h, zoom, rotation, keep, tint) {
      if (!canvas) {
        canvas = document.createElement('canvas');
        copy = document.createElement('canvas');
        tg = canvas.getContext('2d');
        cg = copy.getContext('2d');
      }
      if (canvas.width !== W || canvas.height !== H) { canvas.width = copy.width = W; canvas.height = copy.height = H; }
      cg.globalCompositeOperation = 'copy';
      cg.setTransform(1, 0, 0, 1, 0, 0);
      cg.drawImage(canvas, 0, 0);
      tg.setTransform(1, 0, 0, 1, 0, 0);
      tg.globalCompositeOperation = 'source-over';
      tg.globalAlpha = 1;
      tg.fillStyle = '#000';
      tg.fillRect(0, 0, W, H);
      tg.setTransform(W / w, 0, 0, H / h, 0, 0);
      tg.translate(w / 2, h / 2);
      tg.rotate(rotation);
      tg.scale(zoom, zoom);
      tg.globalAlpha = keep;
      tg.drawImage(copy, -w / 2, -h / 2, w, h);
      tg.globalAlpha = 1;
      tg.setTransform(W / w, 0, 0, H / h, 0, 0);
      if (tint) {                                       // multiply each generation by a slightly blue colour: the older, the deeper the indigo
        tg.globalCompositeOperation = 'multiply';
        tg.fillStyle = tint;
        tg.fillRect(0, 0, w, h);
        tg.globalCompositeOperation = 'source-over';
      }
      return tg;
    },
    /** Dark screen, whatever `before` paints (a graticule), then the trail added on top. */
    show(g, w, h, before, blend = 'lighter') {
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.fillStyle = 'rgb(5, 14, 44)';
      g.fillRect(0, 0, w, h);
      if (before) before(g);
      g.globalCompositeOperation = blend;
      g.drawImage(canvas, 0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    },
  };
}

// ---------- Cymatics: Chladni figures seen through a bent, four-dimensional space ----------
//
// A vibrating plate with sand settles on the lines where cos(n*pi*x)cos(m*pi*y) - cos(m*pi*x)cos(n*pi*y) = 0.
//  - Modes: the two strongest peaks of the log-grouped spectrum pick whole-number n and m, but only on a beat (or a big
//    shift of the dominant pitch) and never more often than every few seconds; between changes n and m glide, so the
//    lines split, bend and close into the next figure. Mids make the line width vibrate, treble thickens the grain.
//  - Space: the plane is bent by a soft circular inversion (the figure folds toward the centre and spreads at the rim)
//    plus a fisheye, then evaluated as a slice of a 4D wave: z and w drift with time and bass, and the (x,z) and (y,w)
//    planes rotate, so rings are born, merge and vanish instead of merely sliding.
//  - Two layers (base, and a scaled counter-rotating one) are added together: the interference is a live moire.
//  - Hits split the red and blue channels by 2-3 px and flush the halo with thin-film violet/magenta; the cyan/white core stays clean.
//  - Feedback: each frame is redrawn 1% larger, turned a hair, and dimmed, so earlier frames form a tunnel behind the plate.

const CHLADNI = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 r, zw, rot;
uniform float t, n, m, chaos, bass, mid, treb, beat, ab, spin;
uniform vec3 ca, cc;
const float PI = 3.14159265;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float f(vec2 q, float a, float b) { return cos(a * PI * q.x) * cos(b * PI * q.y) - cos(b * PI * q.x) * cos(a * PI * q.y); }

// A slice of a 4D standing wave: (x,z) and (y,w) rotate into each other, with z and w as the hidden coordinates.
float field(vec2 q) {
  float c1 = cos(rot.x), s1 = sin(rot.x), c2 = cos(rot.y), s2 = sin(rot.y);
  vec2 xy = vec2(c1 * q.x - s1 * zw.x, c2 * q.y - s2 * zw.y);
  vec2 hid = vec2(s1 * q.x + c1 * zw.x, s2 * q.y + c2 * zw.y);
  return f(xy, n, m) + 0.55 * f(hid, n, m);
}

// Non-Euclidean bend: a soft circle inversion about a slowly wandering centre (finite at the centre), then a fisheye.
vec2 warp(vec2 p) {
  p += 0.22 * vec2(sin(t * 0.13), cos(t * 0.17));
  float d2 = dot(p, p);
  vec2 inv = p / (d2 + 0.45) * 1.6;
  vec2 q = mix(p, inv, 0.6 + 0.15 * sin(t * 0.11));
  return q * (1.0 + 0.18 * d2);
}

vec2 turn(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

// x = line strength, y = halo, z = distance to the nearest node line, w = how much of the line belongs to the deeper layer
vec4 sampleAt(vec2 p) {
  float k = 17.0 - 6.0 * beat - 5.0 * mid * (0.5 + 0.5 * sin(t * 9.0));          // mids make the line width breathe
  float v1 = field(warp(turn(p, -spin * 0.35)));
  float v2 = field(warp(turn(p, spin) * 1.06));
  float a1 = exp(-abs(v1) * k);
  float a2 = 0.65 * exp(-abs(v2) * k * 1.1);
  float line = a1 + a2 - a1 * a2;                                                   // soft union: crossings brighten but never pile up past 1
  float halo = (exp(-abs(v1) * 3.2) + 0.6 * exp(-abs(v2) * 3.2)) * 0.14;
  return vec4(line, halo, min(abs(v1), abs(v2)), a2 / (a1 + a2 + 0.001));
}

vec3 tint(vec4 s) {
  vec3 iri = 0.5 + 0.5 * cos(6.28318 * (vec3(0.85, 0.15, 0.55) + s.z * 0.6 + t * 0.03));   // thin-film palette, leaning violet/magenta
  vec3 indigo = vec3(0.38, 0.30, 0.95);                                              // the deeper layer sinks toward indigo so the planes separate
  vec3 halo = mix(mix(ca, indigo, s.w * 0.6), iri, clamp(beat, 0.0, 1.0) * 0.85);
  vec3 core = mix(mix(ca, cc, clamp(s.x, 0.0, 1.0)), indigo, s.w * 0.55);
  vec3 col = halo * s.y * (1.0 + 2.0 * beat) + core * s.x * (0.75 + 0.6 * bass);
  float sand = hash(floor(gl_FragCoord.xy * 0.5) + floor(t * 24.0));
  col += cc * step(0.93 - 0.09 * treb - 0.06 * chaos, sand) * exp(-s.z * 5.0) * 0.7;      // grain: denser with treble and while the figure re-forms
  return col;
}

void main() {
  vec2 u = (gl_FragCoord.xy - 0.5 * r) / r.y * 2.0;
  u += 0.012 * chaos * vec2(sin(t * 31.0 + u.y * 17.0), cos(t * 27.0 + u.x * 17.0));
  vec4 s = sampleAt(u);
  vec3 col;
  if (ab > 0.01) {                                                                   // drum hit: red and blue slide apart by a few pixels
    float o = ab / r.y * 2.0;
    col = vec3(tint(sampleAt(u + vec2(o, 0.0))).r, tint(s).g, tint(sampleAt(u - vec2(o, 0.0))).b);
  } else {
    col = tint(s);
  }
  col *= mix(1.0, smoothstep(2.2, 0.4, length(u)), 0.85);                            // lit from the centre, dark at the rim
  gl_FragColor = vec4(1.0 - exp(-col * 1.1), 1.0);
}`;

function createCymatics() {
  const layer = glLayer(CHLADNI, ['r', 't', 'n', 'm', 'chaos', 'bass', 'mid', 'treb', 'beat', 'ab', 'spin', 'zw', 'rot', 'ca', 'cc']);
  const colors = paletteRGB();
  const trail = phosphorTrail();
  const BANDS = 32;
  const COOLDOWN = 3.5;                                  // seconds between figure changes
  let n = 3;
  let m = 5;
  let targetN = 3;
  let targetM = 5;
  let shake = 0;
  let candidate = '';
  let held = 0;
  let sinceChange = 10;
  let armed = false;                                     // a beat has landed since the last change
  let bassSlow = 0;
  let z = 0;
  let w4 = 0;
  let planeA = 0;
  let planeB = 0;
  let spin = 0;

  /** The two strongest peaks of the spectrum grouped by octave-like (logarithmic) bands, as 0..1 positions. */
  function peaks(freq) {
    const usable = Math.floor(freq.length * 0.45);
    const edges = Array.from({ length: BANDS + 1 }, (_, i) => Math.max(1, Math.round(usable ** (i / BANDS))));
    const energy = [];
    for (let i = 0; i < BANDS; i++) {
      const from = edges[i];
      const to = Math.max(from + 1, edges[i + 1]);
      energy.push(average(freq, from, to));
    }
    let first = 0;
    for (let i = 1; i < BANDS; i++) if (energy[i] > energy[first]) first = i;
    let second = -1;
    for (let i = 0; i < BANDS; i++) if (Math.abs(i - first) >= 3 && (second < 0 || energy[i] > energy[second])) second = i;
    return { first: first / (BANDS - 1), second: second / (BANDS - 1), level: energy[first] };
  }

  return {
    reset() { shake = 0; candidate = ''; held = 0; armed = false; trail.clear(); },
    draw(g, w, h, { freq, palette, dt, time, bass, mid, treble, pulse, hit }) {
      sinceChange += dt;
      if (hit) armed = true;

      // Which figure? Only when the pitch has settled on a new pair, a beat has landed, and the cooldown is over.
      const found = peaks(freq);
      if (found.level > 0.12) {
        const wantN = 2 + Math.round(found.first * 6);                       // modes 2..8 and 3..10
        let wantM = 3 + Math.round(found.second * 7);
        if (wantM === wantN) wantM += 1;
        const key = wantN + ',' + wantM;
        held = key === candidate ? held + dt : 0;
        candidate = key;
        const shift = Math.abs(wantN - targetN) + Math.abs(wantM - targetM);
        if (shift > 0 && held > 0.22 && sinceChange > COOLDOWN && (armed || shift >= 4)) {
          shake = Math.min(1, 0.35 + shift * 0.08);
          targetN = wantN;
          targetM = wantM;
          sinceChange = 0;
          armed = false;
        }
      }
      const ease = 1 - Math.exp(-dt * 1.4);
      n += (targetN - n) * ease;                                             // the geometry glides: lines split, bend and close again
      m += (targetM - m) * ease;
      shake = Math.max(0, shake - dt * 0.6);
      const chaos = Math.min(1, shake + treble * 0.4);

      // Slow state (camera/geometry) is smoothed hard; only brightness and the colour split follow the instant values.
      bassSlow += (bass - bassSlow) * (1 - Math.exp(-dt * 1.2));
      z += dt * (0.10 + bassSlow * 0.35);
      w4 += dt * (0.08 + bassSlow * 0.30);
      planeA += dt * (0.05 + mid * 0.05);
      planeB += dt * 0.04;
      spin += dt * (0.03 + treble * 0.12);

      const rgb = colors(palette);
      const out = layer.render(g.canvas.width, g.canvas.height, (gl, u) => {
        gl.uniform2f(u.r, g.canvas.width, g.canvas.height);
        gl.uniform1f(u.t, time);
        gl.uniform1f(u.n, n);
        gl.uniform1f(u.m, m);
        gl.uniform1f(u.chaos, chaos);
        gl.uniform1f(u.bass, bass);
        gl.uniform1f(u.mid, mid);
        gl.uniform1f(u.treb, treble);
        gl.uniform1f(u.beat, pulse);
        gl.uniform1f(u.ab, 2.5 * pulse);                                      // red/blue split, in pixels
        gl.uniform1f(u.spin, spin);
        gl.uniform2f(u.zw, 0.7 * Math.sin(z) + bassSlow * 0.5, 0.7 * Math.cos(w4));
        gl.uniform2f(u.rot, planeA, planeB);
        gl.uniform3fv(u.ca, rgb[0]);
        gl.uniform3fv(u.cc, rgb[2]);
      });
      if (!out) { webglMissing(g, w, h, palette); return; }

      const tg = trail.age(g.canvas.width, g.canvas.height, w, h, 1.01, 0.003, 0.9, 'rgb(236, 228, 255)');   // history streams outward behind the plate, sinking toward indigo
      trail.show(g, w, h, null, 'screen');                                    // 'screen' compresses stacked light softly instead of clipping it to white
      g.globalCompositeOperation = 'screen';
      g.drawImage(out, 0, 0, w, h);                                           // the live frame at full strength...
      g.globalCompositeOperation = 'source-over';
      tg.globalCompositeOperation = 'screen';
      tg.globalAlpha = 0.2;
      tg.drawImage(out, 0, 0, w, h);                                          // ...and a dimmer copy that becomes the next frames' tunnel
      tg.globalAlpha = 1;
      tg.globalCompositeOperation = 'source-over';
    },
  };
}

// ---------- XY oscilloscope: the waveform against delayed copies of itself, drawn like a CRT phosphor beam ----------
//
// x = the signal, y = the signal a few hundred microseconds later, z = later still. Pure harmonies close into steady
// loops; noisy or percussive sound tangles. Like a real scope, the beam is bright where it moves slowly and nearly
// vanishes on long jumps (alpha ~ 1 / distance). Each segment is drawn twice, additively: a wide faint halo and a thin
// white-hot core. Older frames live on a separate trail buffer that drifts outward (zoom + a hair of rotation) while
// fading, so the knot streams into an endless tunnel. Drums throw off sparks; dragging turns the knot.

function createLissajous() {
  const DELAY = 90;                                     // samples between the three copies
  const LEVELS = 8;                                     // beam brightness is bucketed so each pass is a handful of strokes, not a thousand
  const sparks = [];
  const trail = phosphorTrail();
  let yaw = 0.6;
  let gain = 2;

  /** A barely-there CRT graticule: 8x6 divisions, centre axes with a tick at every fifth of a division. */
  function graticule(g, w, h, palette) {
    g.strokeStyle = palette.c;
    g.lineWidth = 1;
    g.globalAlpha = 0.05;
    g.beginPath();
    for (let i = 1; i < 8; i++) { g.moveTo((w / 8) * i, 0); g.lineTo((w / 8) * i, h); }
    for (let i = 1; i < 6; i++) { g.moveTo(0, (h / 6) * i); g.lineTo(w, (h / 6) * i); }
    g.stroke();
    g.globalAlpha = 0.12;
    g.beginPath();
    g.moveTo(w / 2, 0); g.lineTo(w / 2, h);
    g.moveTo(0, h / 2); g.lineTo(w, h / 2);
    for (let i = -40; i <= 40; i++) {
      const tx = w / 2 + (i * w) / 40;
      const ty = h / 2 + (i * h) / 30;
      g.moveTo(tx, h / 2 - 3); g.lineTo(tx, h / 2 + 3);
      g.moveTo(w / 2 - 3, ty); g.lineTo(w / 2 + 3, ty);
    }
    g.stroke();
    g.globalAlpha = 1;
  }

  return {
    reset() { sparks.length = 0; trail.clear(); },
    draw(g, w, h, { wave, palette, pointer, dt, time, hit, mid }) {
      const count = wave.length - 2 * DELAY;
      if (count < 32) return;

      const tg = trail.age(g.canvas.width, g.canvas.height, w, h, 1.005, 0.0012 + mid * 0.0012, 0.84);

      // Project this frame's samples to 2D.
      let peak = 0.02;
      for (let i = 0; i < count; i += 4) peak = Math.max(peak, Math.abs(wave[i] - 128) / 128);
      gain += (Math.min(6, 0.8 / peak) - gain) * Math.min(1, dt * 2);       // quiet music still fills the screen
      yaw += dt * (0.2 + mid * 0.8);
      let pitch = 0.4 + Math.sin(time * 0.23) * 0.3;
      if (pointer.down) { yaw += pointer.vx * 0.01; pitch += pointer.vy * 0.01; }
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const scale = Math.min(w, h) * 0.3;
      const points = [];
      for (let i = 0; i < count; i += 2) {
        const x = ((wave[i] - 128) / 128) * gain;
        const y = ((wave[i + DELAY] - 128) / 128) * gain;
        const zz = ((wave[i + 2 * DELAY] - 128) / 128) * gain;
        const x1 = x * cy + zz * sy;
        const z1 = -x * sy + zz * cy;
        const y2 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        const depth = 2.4 / (2.4 - Math.max(-1.6, Math.min(1.5, z2)));      // nearer parts are bigger
        points.push({ x: w / 2 + x1 * scale * depth * 1.5, y: h / 2 + y2 * scale * depth });
      }

      // The beam: brightness ~ 1 / segment length, in LEVELS buckets, halo pass then core pass, both additive.
      const k = scale * 0.035;
      const buckets = Array.from({ length: LEVELS }, () => new Path2D());
      for (let i = 1; i < points.length; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const alpha = Math.min(1, k / (Math.hypot(p1.x - p0.x, p1.y - p0.y) + 0.001));
        if (alpha < 0.04) continue;                                          // a long jump: the beam is gone
        const path = buckets[Math.min(LEVELS - 1, Math.floor(alpha * LEVELS))];
        path.moveTo(p0.x, p0.y);
        path.lineTo(p1.x, p1.y);
      }
      tg.globalCompositeOperation = 'lighter';
      tg.lineCap = 'round';
      tg.lineJoin = 'round';
      [{ width: 5, color: palette.a, strength: 0.15 }, { width: 1, color: palette.c, strength: 0.9 }].forEach((pass) => {
        tg.lineWidth = pass.width;
        tg.strokeStyle = pass.color;
        buckets.forEach((path, level) => {
          tg.globalAlpha = pass.strength * ((level + 1) / LEVELS);
          tg.stroke(path);
        });
      });

      if (hit) {                                                            // a drum hit throws sparks from random points of the trace
        for (let i = 0; i < 40 && sparks.length < 260; i++) {
          const from = points[Math.floor(Math.random() * points.length)];
          const angle = Math.random() * TAU;
          const speed = 40 + Math.random() * 160;
          sparks.push({ x: from.x, y: from.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1 });
        }
      }
      tg.fillStyle = palette.c;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const spark = sparks[i];
        spark.life -= dt * 1.4;
        if (spark.life <= 0) { sparks.splice(i, 1); continue; }
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vx *= 0.97;
        spark.vy *= 0.97;
        tg.globalAlpha = spark.life;
        tg.beginPath();
        tg.arc(spark.x, spark.y, 1.6 * spark.life + 0.4, 0, TAU);
        tg.fill();
      }
      tg.globalAlpha = 1;
      tg.globalCompositeOperation = 'source-over';

      trail.show(g, w, h, (screen) => graticule(screen, w, h, palette));
    },
  };
}

// ---------- Auto: MilkDrop-style preset cycling, changing on the beat ----------

function createAuto() {
  const presets = [createAlchemy(), createShader(), createCymatics(), createBarsAndWaves(), createLissajous(), createSpectrogram(), createScope()];
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
  { id: 'cymatics', labelKey: 'mp-vis-cymatics', create: createCymatics },
  { id: 'lissajous', labelKey: 'mp-vis-lissajous', create: createLissajous },
  { id: 'auto', labelKey: 'mp-vis-auto', create: createAuto },
];
