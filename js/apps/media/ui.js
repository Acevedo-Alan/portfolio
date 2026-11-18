/*
 * apps/media/ui.js — the Media Player window ("music"), styled after the
 * Windows Media Player 8/9 era: a navigation sidebar (the portfolio's own
 * sections, WMP-style), a visualizer screen, and a silver control deck with a
 * glass play orb. Audio comes from the live chiptune synth or from real audio
 * files (playback.js picks the engine); visuals from the visualizer registry
 * (visualizers.js). The playlist is the synth tracks plus any file tracks found
 * in music/ (library.js) plus files the visitor opens from their own computer.
 */

import { $, $$, escapeHTML } from '../../core/dom.js';
import * as bus from '../../core/bus.js';
import * as storage from '../../core/storage.js';
import { t, translate } from '../../i18n/i18n.js';
import * as windows from '../../shell/windowManager.js';
import { openBurnWizard } from '../../shell/wizards/burnResume.js';
import { effective } from '../../audio/volume.js';
import { Playback } from './playback.js';
import { availableFileTracks } from './library.js';
import { TRACKS } from './tracks.js';
import { VISUALIZERS } from './visualizers.js';
import { createBeatDetector } from './beat.js';
import { EQ_FREQS, EQ_PRESETS } from './output.js';
import { TASKBAR_H } from '../../core/viewport.js';

const SKINS = ['blue', 'silver', 'green'];
const SKIN_KEY = 'portfolio-mp-skin';
const VIS_KEY = 'portfolio-mp-vis';
const SHUFFLE_KEY = 'portfolio-mp-shuffle';
const REPEAT_KEY = 'portfolio-mp-repeat';
const FX_KEY = 'portfolio-mp-fx';
const KAOSS_KEY = 'portfolio-mp-kaoss';
const CALM = window.matchMedia('(prefers-reduced-motion: reduce)');
const MINI = { w: 380, h: 330 };
const cutoffHz = (v) => 200 * 110 ** (v / 100);     // 0..100 slider → 200 Hz..22 kHz, logarithmic
const BADGE_MS = 2200;
const ERROR_BADGE_MS = 4500;
const VOLUME_STEP = 5;
const IDLE_MS = 2500;                      // full screen: controls hide after this long without input
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|weba)$/i;

// The sidebar doubles as portfolio navigation. `open` = window to open;
// `action: 'burn'` launches the CD-burning wizard that delivers the résumé.
const TABS = [
  { key: 'mp-tab-now' },
  { key: 'mp-tab-library', open: 'proyectos' },
  { key: 'mp-tab-guide', open: 'experiencia' },
  { key: 'mp-tab-burn', action: 'burn' },
];

const svg = (inner, size = 24) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true" focusable="false">${inner}</svg>`;
const ICONS = {
  play: svg('<path d="M8 5v14l11-7z"/>'),
  pause: svg('<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
  prev: svg('<path d="M6 5h2.5v14H6zM20 5v14L9 12z"/>'),
  next: svg('<path d="M15.5 5H18v14h-2.5zM4 5l11 7-11 7z"/>'),
  speaker: svg('<path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  vis: svg('<path d="M4 20V10h3v10zM10.5 20V4h3v16zM17 20v-7h3v7z"/>', 18),
  shuffle: svg('<path d="M3 7h3c5 0 6 10 11 10h3M3 17h3c1.5 0 2.600-.7 3.500-1.800M13.500 8.800C14.400 7.700 15.500 7 17 7h3M17.500 4.500L20 7l-2.500 2.500M17.500 14.500L20 17l-2.500 2.500" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', 18),
  repeat: svg('<path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', 18),
  fx: svg('<path d="M5 3v18M12 3v18M19 3v18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="2.5" y="13" width="5" height="3.4" rx="1"/><rect x="9.5" y="6" width="5" height="3.4" rx="1"/><rect x="16.5" y="10" width="5" height="3.4" rx="1"/>', 18),
  kaoss: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3.5v17M3.5 12h17" stroke="currentColor" stroke-width="1.2"/><circle cx="15.5" cy="8.5" r="2.4"/>', 18),
  mini: svg('<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="12" y="12" width="7" height="6" rx="1"/>', 18),
  full: svg('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', 18),
  left: svg('<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>', 18),
  right: svg('<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>', 18),
  unfull: svg('<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>', 18),
  skin: svg('<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1.6"/><circle cx="14.5" cy="9" r="1.6"/><circle cx="15" cy="14.5" r="1.6"/>', 18),
};

const formatTime = (seconds) => {
  const s = Math.floor(seconds);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

const cycle = (list, current) => list[(list.indexOf(current) + 1) % list.length];

export function mount() {
  const root = $('#win-music .mp-body');
  const player = new Playback();
  const tracks = [...TRACKS];                   // synth tracks first; file tracks are appended when found

  const storedSkin = storage.get(SKIN_KEY);
  let skin = SKINS.includes(storedSkin) ? storedSkin : SKINS[0];
  const storedVis = VISUALIZERS.findIndex((v) => v.id === storage.get(VIS_KEY));
  let visIndex = storedVis >= 0 ? storedVis : 0;
  let renderer = VISUALIZERS[visIndex].create();
  let index = 0;
  let shuffle = storage.get(SHUFFLE_KEY) === '1';
  let repeat = storage.get(REPEAT_KEY) === '1';       // repeat = replay the current track when it ends
  const savedFx = storage.getJSON(FX_KEY, {}) || {};
  const fx = {
    eq: Array.isArray(savedFx.eq) && savedFx.eq.length === EQ_FREQS.length ? savedFx.eq.map(Number) : EQ_PRESETS.flat.slice(),
    preset: typeof savedFx.preset === 'string' ? savedFx.preset : 'flat',
    reverb: Number(savedFx.reverb) || 0,
    echo: Number(savedFx.echo) || 0,
    rate: Number(savedFx.rate) || 100,               // percent
    keep: !!savedFx.keep,
    cutoff: Number.isFinite(Number(savedFx.cutoff)) && savedFx.cutoff !== undefined ? Number(savedFx.cutoff) : 100,
  };
  let kaoss = storage.get(KAOSS_KEY) === '1';
  let fxOpen = false;
  const beats = createBeatDetector();
  let miniSaved = null;
  let playTicket = 0;                                  // the newest play request wins when clicks overlap

  root.innerHTML = `
    <div class="mp">
      <nav class="mp-side" data-i18n-label="mp-nav">
        ${TABS.map((tab) => `<button type="button" class="mp-tab${tab.open || tab.action ? '' : ' active'}" ${tab.open ? `data-open="${tab.open}"` : tab.action ? `data-action="${tab.action}"` : 'aria-current="page"'} data-i18n="${tab.key}"></button>`).join('')}
        <div class="mp-side-tools">
          <button type="button" class="mp-mini" data-act="vis" data-i18n-label="mp-vis">${ICONS.vis}</button>
          <button type="button" class="mp-mini" data-act="skin" data-i18n-label="mp-skin">${ICONS.skin}</button>
          <button type="button" class="mp-mini" data-act="fx" aria-pressed="false" data-i18n-label="mp-fx">${ICONS.fx}</button>
          <button type="button" class="mp-mini" data-act="kaoss" aria-pressed="${kaoss}" data-i18n-label="mp-kaoss">${ICONS.kaoss}</button>
          <button type="button" class="mp-mini" data-act="mini" aria-pressed="false" data-i18n-label="mp-mini">${ICONS.mini}</button>
          <button type="button" class="mp-mini" data-act="full" aria-pressed="false" data-i18n-label="mp-full">${ICONS.full}</button>
        </div>
      </nav>
      <div class="mp-stage">
        <div class="mp-screen">
          <canvas class="mp-canvas" aria-hidden="true"></canvas>
          <span class="mp-badge" id="mp-badge" aria-hidden="true"></span>
        </div>
        <div class="mp-info" role="status">
          <div>
            <h3 class="mp-title" id="mp-title"></h3>
            <p class="mp-sub" id="mp-sub"></p>
          </div>
          <span class="mp-time" id="mp-time">00:00</span>
        </div>
        <div class="mp-fx" hidden>
          <div class="mp-fx-nav">
            <button type="button" class="mp-arrow" data-act="fx-prev" data-i18n-label="mp-fx-prev">&#9664;</button>
            <span class="mp-fx-name" id="mp-fx-name" aria-live="polite"></span>
            <button type="button" class="mp-arrow" data-act="fx-next" data-i18n-label="mp-fx-next">&#9654;</button>
          </div>
          <fieldset class="mp-fs" data-page="mp-speed-title">
            <legend data-i18n="mp-speed-title"></legend>
            <label class="mp-row"><span data-i18n="mp-speed"></span><input type="range" id="mp-speed" min="50" max="200" step="1"><output id="mp-speed-out"></output></label>
            <label class="mp-check"><input type="checkbox" id="mp-keep"><span data-i18n="mp-keep"></span></label>
          </fieldset>
          <fieldset class="mp-fs" data-page="mp-eq" hidden>
            <legend data-i18n="mp-eq"></legend>
            <div class="mp-row">
              <span id="mp-preset-lbl" data-i18n="mp-preset-label"></span>
              <div class="mp-combo" id="mp-combo">
                <button type="button" class="mp-select mp-combo-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="mp-preset-lbl mp-combo-val"><span id="mp-combo-val"></span></button>
                <ul class="mp-combo-list" role="listbox" aria-labelledby="mp-preset-lbl" hidden>
                  ${[...Object.keys(EQ_PRESETS), 'custom'].map((name) => `<li role="option" data-value="${name}" data-i18n="mp-eq-${name}"></li>`).join('')}
                </ul>
                <select id="mp-preset" hidden>
                  ${[...Object.keys(EQ_PRESETS), 'custom'].map((name) => `<option value="${name}"></option>`).join('')}
                </select>
              </div>
            </div>
            <div class="mp-eq-wrap">
              <div class="mp-eq-scale" aria-hidden="true"><span>+12 dB</span><span>0</span><span>&minus;12 dB</span></div>
              <div class="mp-eq">
                ${EQ_FREQS.map((f, i) => `<label><input type="range" class="mp-band" orient="vertical" data-band="${i}" min="-12" max="12" step="1" aria-label="${f >= 1000 ? f / 1000 + ' kHz' : f + ' Hz'}"><span>${f >= 1000 ? f / 1000 + 'k' : f}</span></label>`).join('')}
              </div>
            </div>
          </fieldset>
          <fieldset class="mp-fs" data-page="mp-fx-title" hidden>
            <legend data-i18n="mp-fx-title"></legend>
            <label class="mp-row"><span data-i18n="mp-reverb"></span><input type="range" id="mp-reverb" min="0" max="100"></label>
            <label class="mp-row"><span data-i18n="mp-echo"></span><input type="range" id="mp-echo" min="0" max="100"></label>
            <label class="mp-row"><span data-i18n="mp-cutoff"></span><input type="range" id="mp-cutoff" min="0" max="100"></label>
            <button type="button" class="mp-open mp-reset" data-act="fx-reset" data-i18n="mp-reset"></button>
          </fieldset>
        </div>
        <div class="mp-tracks">
          <div class="mp-list-head" aria-hidden="true"><span data-i18n="mp-col-n"></span><span data-i18n="mp-col-title"></span><span data-i18n="mp-col-bpm"></span></div>
          <ol class="mp-list" data-i18n-label="mp-playlist"></ol>
          <div class="mp-tracks-foot">
            <button type="button" class="mp-open" data-act="open-file" data-i18n="mp-open-file"></button>
            <input type="file" id="mp-file" accept="audio/*" multiple hidden>
          </div>
        </div>
        <div class="mp-deck">
          <div class="mp-seek" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-i18n-label="mp-progress"><i></i></div>
          <div class="mp-ctrls">
            <button type="button" class="mp-toggle" data-act="shuffle" aria-pressed="${shuffle}" data-i18n-label="mp-shuffle">${ICONS.shuffle}</button>
            <button type="button" class="mp-round" data-act="stop"data-i18n-label="mp-stop">${ICONS.stop}</button>
            <button type="button" class="mp-round" data-act="prev" data-i18n-label="mp-prev">${ICONS.prev}</button>
            <button type="button" class="mp-play" data-act="toggle" data-i18n-label="mp-play">${ICONS.play}</button>
            <button type="button" class="mp-round" data-act="next" data-i18n-label="mp-next">${ICONS.next}</button>
            <button type="button" class="mp-toggle" data-act="repeat" aria-pressed="${repeat}" data-i18n-label="mp-repeat">${ICONS.repeat}</button>
            <label class="mp-vol-wrap">${ICONS.speaker}<input type="range" class="mp-vol" min="0" max="100" value="70" data-i18n-label="mp-volume"></label>
            <span class="mp-fs-only">
              <button type="button" class="mp-toggle" data-act="vis-prev" data-i18n-label="mp-vis-prev">${ICONS.left}</button>
              <button type="button" class="mp-toggle" data-act="vis" data-i18n-label="mp-vis-next">${ICONS.right}</button>
              <button type="button" class="mp-toggle" data-act="full" data-i18n-label="mp-full-exit">${ICONS.unfull}</button>
            </span>
          </div>
        </div>
      </div>
    </div>`;
  translate(root);

  const mp = $('.mp', root);
  const win = $('#win-music');
  win.dataset.skin = skin;                       // skins are CSS custom-property sets scoped to the window
  const screen = $('.mp-screen', root);
  const canvas = $('.mp-canvas', root);
  const g = canvas.getContext('2d');
  const toggleBtn = $('[data-act="toggle"]', root);
  let size = { w: 0, h: 0 };
  let freq = null;
  let wave = null;
  let frameId = null;
  let last = 0;
  let started = 0;
  let badgeTimer = null;
  let palette = { a: '#4FC3FF', b: '#2B6BFF', c: '#BFE8FF' };
  const pointer = { x: 0, y: 0, vx: 0, vy: 0, active: false, down: false };   // cursor over the screen, in canvas px

  // ---------- Canvas ----------

  function readPalette() {
    const style = getComputedStyle(mp);
    palette = ['a', 'b', 'c'].reduce((acc, k) => ({ ...acc, [k]: style.getPropertyValue(`--mp-vis-${k}`).trim() }), {});
  }

  function paintIdle() {
    if (!size.w) return;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#050E2C';
    g.fillRect(0, 0, size.w, size.h);
    g.strokeStyle = palette.a;
    g.globalAlpha = 0.35;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, size.h / 2);
    g.lineTo(size.w, size.h / 2);
    g.stroke();
    g.globalAlpha = 1;
  }

  function resize() {
    const rect = screen.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = { w: rect.width, h: rect.height };
    if (!frameId) paintIdle();
  }
  new ResizeObserver(resize).observe(screen);

  // Click and drag on the screen to distort the visualization (like WMP's Alchemy).
  const track = (e) => {
    const rect = screen.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pointer.vx = pointer.active ? x - pointer.x : 0;
    pointer.vy = pointer.active ? y - pointer.y : 0;
    pointer.x = x;
    pointer.y = y;
    pointer.active = true;
  };
  // A canvas looks like an image to the browser: stop it starting a native image drag or a "save image" menu mid-gesture.
  screen.addEventListener('dragstart', (e) => e.preventDefault());
  screen.addEventListener('contextmenu', (e) => e.preventDefault());
  screen.addEventListener('pointermove', track);
  screen.addEventListener('pointerdown', (e) => { track(e); pointer.down = true; screen.setPointerCapture(e.pointerId); });
  const release = () => { if (pointer.down && kaoss) kaossRelease(); pointer.down = false; };
  screen.addEventListener('pointerup', release);
  screen.addEventListener('pointercancel', release);
  screen.addEventListener('pointerleave', () => { if (!pointer.down) pointer.active = false; });

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
    last = now;
    if (!freq) {
      freq = new Uint8Array(player.analyser.frequencyBinCount);
      wave = new Uint8Array(player.analyser.fftSize);
    }
    player.analyser.getByteFrequencyData(freq);
    player.analyser.getByteTimeDomainData(wave);
    const beat = beats.update(freq, dt);
    mp.style.setProperty('--mp-beat', CALM.matches ? '0' : beat.pulse.toFixed(3));      // the screen glow and the play orb pulse with the beat
    if (kaoss && pointer.down) kaossTouch(now);
    if (size.w) {
      renderer.draw(g, size.w, size.h, { freq, wave, palette, pointer, dt, time: (now - started) / 1000, ...beat });
      if (kaoss && pointer.down) paintCrosshair();
    }
    pointer.vx *= 0.8;
    pointer.vy *= 0.8;
    updateReadouts();
    frameId = player.playing ? requestAnimationFrame(frame) : null;
  }

  function startLoop() {
    if (frameId) return;
    last = performance.now();
    started = started || last;
    frameId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    cancelAnimationFrame(frameId);
    frameId = null;
    beats.reset();
    mp.style.setProperty('--mp-beat', '0');
  }

  // ---------- Kaoss pad: while dragging on the screen, X sweeps a low-pass filter and Y bends the pitch ----------

  let kaossBadgeAt = 0;
  function kaossTouch(now) {
    const x = Math.min(1, Math.max(0, pointer.x / size.w));
    const y = Math.min(1, Math.max(0, 1 - pointer.y / size.h));
    const hz = 200 * 110 ** x;
    const rate = 0.5 * 4 ** y;                                   // 0.5x (bottom) .. 2x (top)
    player.fx.setFilter(x > 0.985 ? null : hz);
    player.setRate(rate, false);
    if (now - kaossBadgeAt > 120) {
      kaossBadgeAt = now;
      showBadge(`Kaoss · ${x > 0.985 ? '∞' : Math.round(hz) + ' Hz'} · ${rate.toFixed(2)}×`, 700);
    }
  }

  function kaossRelease() {                                      // springs back to whatever the panel says
    applyFx();
  }

  function paintCrosshair() {
    g.save();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = palette.c;
    g.globalAlpha = 0.7;
    g.lineWidth = 1;
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(pointer.x, 0); g.lineTo(pointer.x, size.h);
    g.moveTo(0, pointer.y); g.lineTo(size.w, pointer.y);
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.arc(pointer.x, pointer.y, 9, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  // ---------- Playlist ----------

  const trackLabel = (item) => (item.artist ? `${item.artist} – ${item.name}` : item.name);

  function renderList() {
    $('.mp-list', root).innerHTML = tracks
      .map((item, i) => `<li draggable="true" data-i="${i}"><button type="button" data-track="${i}"><span>${String(i + 1).padStart(2, '0')}</span><span>${escapeHTML(trackLabel(item))}</span><span>${item.bpm ? item.bpm + ' BPM' : '—'}</span></button></li>`)
      .join('');
  }

  // ---------- Readouts ----------

  function updateReadouts() {
    $('#mp-time', root).textContent = formatTime(player.elapsed);
    const pct = Math.round(player.progress * 100);
    const seek = $('.mp-seek', root);
    $('i', seek).style.width = pct + '%';
    seek.setAttribute('aria-valuenow', String(pct));
    seek.classList.toggle('seekable', player.seekable);
  }

  // Media Session: the OS media widget and the keyboard's media keys (play/pause, next, previous, stop) drive this player.
  const session = 'mediaSession' in navigator ? navigator.mediaSession : null;
  let sessionLabel = null;
  function syncSession() {
    if (!session) return;
    const item = player.track ? tracks[index] : null;
    const label = item ? trackLabel(item) : null;
    if (label !== sessionLabel) {
      sessionLabel = label;
      session.metadata = item && window.MediaMetadata ? new MediaMetadata({ title: item.name, artist: item.artist || 'Media Player', album: 'Portfolio' }) : null;
    }
    session.playbackState = !item ? 'none' : player.playing ? 'playing' : 'paused';
  }

  function sync() {
    $('#mp-title', root).textContent = player.track ? `${String(index + 1).padStart(2, '0')}. ${trackLabel(tracks[index])}` : t('mp-stopped');
    $('#mp-sub', root).textContent = player.track && player.track.src ? t('mp-sub-file') : t('mp-sub');
    $$('.mp-list li', root).forEach((li, i) => li.classList.toggle('current', player.track !== null && i === index));
    toggleBtn.innerHTML = player.playing ? ICONS.pause : ICONS.play;
    toggleBtn.classList.toggle('playing', player.playing);
    toggleBtn.setAttribute('data-i18n-label', player.playing ? 'mp-pause' : 'mp-play');
    translate(toggleBtn.parentElement);
    updateReadouts();
    syncSession();
  }

  function showBadge(text, ms = BADGE_MS) {
    const badge = $('#mp-badge', root);
    badge.textContent = text;
    badge.classList.add('show');
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => badge.classList.remove('show'), ms);
  }

  const flashBadge = () => showBadge(`${t(VISUALIZERS[visIndex].labelKey)} · ${t('mp-drag-hint')}`);

  /** Something went wrong with playback: stop cleanly and say why on the screen. */
  function fail(key) {
    player.stop();
    stopLoop();
    renderer.reset();
    paintIdle();
    sync();
    showBadge(t(key), ERROR_BADGE_MS);
  }

  // ---------- Transport ----------

  async function playIndex(i) {
    index = (i + tracks.length) % tracks.length;
    const ticket = ++playTicket;
    try {
      await player.play(tracks[index]);
    } catch (e) {
      if (ticket !== playTicket || e.name === 'AbortError') return;     // superseded by a newer click, or interrupted by pause/stop
      fail(e.name === 'NotAllowedError' ? 'mp-err-blocked' : 'mp-err-play');
      return;
    }
    if (ticket !== playTicket) return;
    renderer.reset();
    sync();
    startLoop();
  }

  /** The track after the current one: a random other track when shuffling. */
  function nextIndex() {
    if (!shuffle || tracks.length < 2) return index + 1;
    return (index + 1 + Math.floor(Math.random() * (tracks.length - 1))) % tracks.length;
  }

  function setToggle(act, value, key) {
    storage.set(key, value ? '1' : '0');
    $(`[data-act="${act}"]`, root).setAttribute('aria-pressed', String(value));
  }

  function stepVis(step) {
    visIndex = (visIndex + step + VISUALIZERS.length) % VISUALIZERS.length;
    renderer = VISUALIZERS[visIndex].create();
    storage.set(VIS_KEY, VISUALIZERS[visIndex].id);
    flashBadge();
  }

  const actions = {
    toggle: () => (player.playing ? actions.pause() : playIndex(index)),
    pause: async () => { await player.pause(); stopLoop(); sync(); },
    shuffle: () => { shuffle = !shuffle; setToggle('shuffle', shuffle, SHUFFLE_KEY); },
    repeat: () => { repeat = !repeat; setToggle('repeat', repeat, REPEAT_KEY); },
    stop: () => { playTicket++; player.stop(); stopLoop(); renderer.reset(); paintIdle(); sync(); },
    prev: () => playIndex(index - 1),
    next: () => playIndex(nextIndex()),
    'open-file': () => $('#mp-file', root).click(),
    skin: () => {
      skin = cycle(SKINS, skin);
      win.dataset.skin = skin;
      storage.set(SKIN_KEY, skin);
      readPalette();
      if (!frameId) paintIdle();
    },
    fx: () => setFxOpen(!fxOpen),
    kaoss: () => {
      kaoss = !kaoss;
      storage.set(KAOSS_KEY, kaoss ? '1' : '0');
      $('[data-act="kaoss"]', root).setAttribute('aria-pressed', String(kaoss));
      screen.classList.toggle('kaoss', kaoss);
      if (kaoss) showBadge(t('mp-kaoss-hint'), 3200);
      else applyFx();
    },
    mini: () => toggleMini(),
    full: async () => {
      if (!fsSupported || win.classList.contains('mini')) return;
      try {
        if (fsElement()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else await (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
      } catch (e) { /* refused (no user gesture, or blocked by the browser): stay windowed */ }
    },
    'fx-prev': () => showFxPage(fxPage - 1),
    'fx-next': () => showFxPage(fxPage + 1),
    'fx-reset': () => {
      Object.assign(fx, { eq: EQ_PRESETS.flat.slice(), preset: 'flat', reverb: 0, echo: 0, rate: 100, keep: false, cutoff: 100 });
      applyFx();
      paintFx();
      saveFx();
    },
    vis: () => stepVis(1),
    'vis-prev': () => stepVis(-1),
  };

  // ---------- Speed, EQ and effects ----------

  const speed = $('#mp-speed', root);
  const keep = $('#mp-keep', root);
  const preset = $('#mp-preset', root);
  const bands = $$('.mp-band', root);
  const reverb = $('#mp-reverb', root);
  const echo = $('#mp-echo', root);
  const cutoff = $('#mp-cutoff', root);

  function applyFx() {
    player.fx.setBands(fx.eq);
    player.fx.setReverb(fx.reverb / 100 * 0.9);
    player.fx.setEcho(fx.echo / 100 * 0.7);
    player.fx.setFilter(fx.cutoff >= 100 ? null : cutoffHz(fx.cutoff));
    player.setRate(fx.rate / 100, fx.keep);
  }

  // Preset dropdown: the browser's own <select> menu can't look like Windows, so this is a button + list; the hidden <select> holds the value.
  const combo = $('#mp-combo', root);
  const comboBtn = $('.mp-combo-btn', combo);
  const comboList = $('.mp-combo-list', combo);
  const presetNames = [...preset.options].map((o) => o.value);
  function syncPreset() {
    $('#mp-combo-val', root).textContent = t(`mp-eq-${preset.value}`);
    $$('li', comboList).forEach((li) => li.setAttribute('aria-selected', String(li.dataset.value === preset.value)));
  }
  function setComboOpen(open) {
    comboList.hidden = !open;
    comboBtn.setAttribute('aria-expanded', String(open));
  }
  function choosePreset(value) {
    if (value === preset.value) return;
    preset.value = value;
    preset.dispatchEvent(new Event('change'));
    syncPreset();
  }
  comboBtn.addEventListener('click', () => setComboOpen(comboList.hidden));
  comboList.addEventListener('mousedown', (e) => e.preventDefault());          // keep focus on the button so the click lands before the list closes
  comboList.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-value]');
    if (!li) return;
    choosePreset(li.dataset.value);
    setComboOpen(false);
    comboBtn.focus();
  });
  combo.addEventListener('focusout', (e) => { if (!combo.contains(e.relatedTarget)) setComboOpen(false); });
  comboBtn.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (step) {
      e.preventDefault();
      e.stopPropagation();                                                      // the player's own arrows (tracks, volume) stay out of it
      choosePreset(presetNames[Math.min(presetNames.length - 1, Math.max(0, presetNames.indexOf(preset.value) + step))]);
    } else if (e.key === 'Escape' && !comboList.hidden) {
      e.stopPropagation();
      setComboOpen(false);
    }
  });

  function paintFx() {
    speed.value = String(fx.rate);
    $('#mp-speed-out', root).textContent = (fx.rate / 100).toFixed(2) + '×';
    keep.checked = fx.keep;
    preset.value = fx.preset;
    syncPreset();
    bands.forEach((band, i) => { band.value = String(fx.eq[i]); });
    reverb.value = String(fx.reverb);
    echo.value = String(fx.echo);
    cutoff.value = String(fx.cutoff);
  }

  const saveFx = () => storage.setJSON(FX_KEY, fx);

  // The enhancements panel shows one page at a time (speed, equalizer, effects), switched with the < > arrows.
  const fxPages = $$('.mp-fs[data-page]', root);
  let fxPage = 0;
  function showFxPage(i) {
    fxPage = (i + fxPages.length) % fxPages.length;
    fxPages.forEach((page, n) => { page.hidden = n !== fxPage; });
    $('#mp-fx-name', root).textContent = t(fxPages[fxPage].dataset.page);
  }
  showFxPage(0);

  function setFxOpen(open) {
    fxOpen = open;
    if (open) { showFxPage(fxPage); syncPreset(); }                // refresh the page title (the language may have changed)
    mp.classList.toggle('fx-open', open);
    $('.mp-fx', root).hidden = !open;
    $('[data-act="fx"]', root).setAttribute('aria-pressed', String(open));
  }

  speed.addEventListener('input', () => { fx.rate = Number(speed.value); applyFx(); paintFx(); saveFx(); });
  keep.addEventListener('change', () => { fx.keep = keep.checked; applyFx(); saveFx(); });
  reverb.addEventListener('input', () => { fx.reverb = Number(reverb.value); applyFx(); saveFx(); });
  echo.addEventListener('input', () => { fx.echo = Number(echo.value); applyFx(); saveFx(); });
  cutoff.addEventListener('input', () => { fx.cutoff = Number(cutoff.value); applyFx(); saveFx(); });
  preset.addEventListener('change', () => {
    fx.preset = preset.value;
    if (EQ_PRESETS[fx.preset]) fx.eq = EQ_PRESETS[fx.preset].slice();
    applyFx(); paintFx(); saveFx();
  });
  bands.forEach((band) => band.addEventListener('input', () => {
    fx.eq[Number(band.dataset.band)] = Number(band.value);
    fx.preset = 'custom';
    preset.value = 'custom';
    syncPreset();
    applyFx(); saveFx();
  }));

  // ---------- Mini player: the same window shrunk next to the tray ----------

  function toggleMini() {
    if (win.classList.contains('maxi')) return;
    const entering = !win.classList.contains('mini');
    if (entering) {
      miniSaved = { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height };
      win.classList.add('mini');
      win.style.width = MINI.w + 'px';
      win.style.height = MINI.h + 'px';
      win.style.left = Math.max(8, window.innerWidth - MINI.w - 12) + 'px';
      win.style.top = Math.max(8, window.innerHeight - TASKBAR_H - MINI.h - 8) + 'px';
    } else exitMini();
    $('[data-act="mini"]', root).setAttribute('aria-pressed', String(entering));
  }

  function exitMini() {
    if (!win.classList.contains('mini')) return;
    win.classList.remove('mini');
    if (miniSaved) Object.assign(win.style, miniSaved);
    miniSaved = null;
    $('[data-act="mini"]', root).setAttribute('aria-pressed', 'false');
  }

  // ---------- Playlist reordering: drag a row, or Alt+↑/↓ on a focused one ----------

  const listEl = $('.mp-list', root);
  let dragFrom = -1;

  function moveTrack(from, to) {                    // `to` is the insertion slot (0..length) in the list as it is now
    if (from < 0 || from >= tracks.length) return;
    const slot = Math.max(0, Math.min(tracks.length, to));
    if (slot === from || slot === from + 1) return;
    const current = tracks[index];
    const [item] = tracks.splice(from, 1);
    tracks.splice(slot > from ? slot - 1 : slot, 0, item);
    index = tracks.indexOf(current);
    renderList();
    sync();
  }

  const clearDrop = () => $$('.drop-before, .drop-after', listEl).forEach((li) => li.classList.remove('drop-before', 'drop-after'));
  listEl.addEventListener('dragstart', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    dragFrom = Number(li.dataset.i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragFrom));
    li.classList.add('dragging');
  });
  listEl.addEventListener('dragover', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li || dragFrom < 0) return;
    e.preventDefault();
    const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
    clearDrop();
    li.classList.add(after ? 'drop-after' : 'drop-before');
  });
  listEl.addEventListener('drop', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li || dragFrom < 0) return;
    e.preventDefault();
    const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
    moveTrack(dragFrom, Number(li.dataset.i) + (after ? 1 : 0));
    dragFrom = -1;
  });
  listEl.addEventListener('dragend', () => { dragFrom = -1; clearDrop(); $$('.dragging', listEl).forEach((li) => li.classList.remove('dragging')); });
  listEl.addEventListener('keydown', (e) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    e.preventDefault();
    const from = Number(li.dataset.i);
    moveTrack(from, e.key === 'ArrowUp' ? from - 1 : from + 2);
    const moved = e.key === 'ArrowUp' ? from - 1 : from + 1;
    if (moved >= 0 && moved < tracks.length) $(`[data-i="${moved}"] button`, listEl)?.focus();
  });

  root.addEventListener('click', (e) => {
    const control = e.target.closest('[data-act]');
    if (control) { actions[control.dataset.act](); return; }
    const track = e.target.closest('[data-track]');
    if (track) { playIndex(Number(track.dataset.track)); return; }
    const tab = e.target.closest('[data-open]');
    if (tab) { windows.open(tab.dataset.open); return; }
    if (e.target.closest('[data-action="burn"]')) openBurnWizard();
  });
  $$('.mp-mini', root).forEach((btn) => btn.addEventListener('pointerenter', () => btn.removeAttribute('title')));   // the CSS tooltip replaces the native one
  const volume = $('.mp-vol', root);
  volume.addEventListener('input', (e) => player.setVolume(Number(e.target.value) / 100));

  // Click or drag the progress bar to jump within a file track (the synth loops, so it has nothing to seek).
  const seekBar = $('.mp-seek', root);
  const seekTo = (e) => {
    const rect = seekBar.getBoundingClientRect();
    player.seek((e.clientX - rect.left) / rect.width);
    updateReadouts();
  };
  let seeking = false;
  seekBar.addEventListener('pointerdown', (e) => {
    if (!player.seekable) return;
    seeking = true;
    seekBar.setPointerCapture(e.pointerId);
    seekTo(e);
  });
  seekBar.addEventListener('pointermove', (e) => { if (seeking) seekTo(e); });
  const endSeek = () => { seeking = false; };
  seekBar.addEventListener('pointerup', endSeek);
  seekBar.addEventListener('pointercancel', endSeek);

  // ---------- Full screen: the visualizer fills the display; the controls fade after a moment without input ----------

  const stage = $('.mp-stage', root);
  const deck = $('.mp-deck', root);
  const fsSupported = !!(stage.requestFullscreen || stage.webkitRequestFullscreen);
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  let idleTimer = 0;
  function wake() {                                    // show the controls, then hide them again after IDLE_MS (unless the pointer is on them)
    stage.classList.remove('idle');
    clearTimeout(idleTimer);
    if (fsElement() !== stage) return;
    idleTimer = setTimeout(() => (deck.matches(':hover') ? wake() : stage.classList.add('idle')), IDLE_MS);
  }
  function onFullscreenChange() {
    const on = fsElement() === stage;
    stage.classList.toggle('full', on);
    $$('.mp-mini[data-act="full"]', root).forEach((btn) => btn.setAttribute('aria-pressed', String(on)));
    wake();
  }
  if (!fsSupported) $$('[data-act="full"]', root).forEach((btn) => { btn.hidden = true; });
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  ['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach((type) => stage.addEventListener(type, wake, { passive: true }));
  screen.addEventListener('dblclick', () => { if (!kaoss) actions.full(); });

  // ---------- Drop audio files from the computer onto the window ----------

  const isAudio = (file) => file.type.startsWith('audio/') || AUDIO_EXT.test(file.name);
  /** Adds audio files to the playlist (object URLs: nothing is uploaded) and plays the first one added. */
  function addLocalFiles(files) {
    const audio = [...files].filter(isAudio);
    if (!audio.length) { if (files.length) showBadge(t('mp-err-file'), ERROR_BADGE_MS); return; }
    const first = tracks.length;
    audio.forEach((file) => tracks.push({ name: file.name.replace(/\.[^.]+$/, ''), src: URL.createObjectURL(file), local: true }));
    renderList();
    playIndex(first);
  }
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  let dropping = false;
  const setDropping = (on) => {
    if (on === dropping) return;
    dropping = on;
    mp.classList.toggle('dropping', on);
    if (on) showBadge(t('mp-drop'), 60000);
    else $('#mp-badge', root).classList.remove('show');
  };
  win.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropping(true); });
  win.addEventListener('dragleave', (e) => { if (!win.contains(e.relatedTarget)) setDropping(false); });
  win.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDropping(false);
    addLocalFiles(e.dataTransfer.files);
  });

  if (session) {
    const handlers = {
      play: () => { if (!player.playing) playIndex(index); },
      pause: () => { if (player.playing) actions.pause(); },
      previoustrack: actions.prev,
      nexttrack: actions.next,
      stop: actions.stop,
    };
    Object.entries(handlers).forEach(([name, fn]) => { try { session.setActionHandler(name, fn); } catch (e) { /* this browser doesn't support that action */ } });
  }

  // Keyboard, only while focus is inside the player: Space play/pause, arrows for tracks and volume.
  win.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); actions.full(); return; }   // Alt+Enter: full screen, as in WMP
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;     // a focused button keeps its own activation
    if (e.target === volume && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return; // the slider's own arrows
    const bump = (delta) => {
      volume.value = String(Math.min(100, Math.max(0, Number(volume.value) + delta)));
      volume.dispatchEvent(new Event('input'));
    };
    const keys = {
      ' ': actions.toggle,
      ArrowRight: actions.next,
      ArrowLeft: actions.prev,
      ArrowUp: () => bump(VOLUME_STEP),
      ArrowDown: () => bump(-VOLUME_STEP),
    };
    const handler = keys[e.key];
    if (!handler) return;
    e.preventDefault();
    handler();
  });

  // A file the visitor picks plays straight from their computer (an object URL): nothing is uploaded or hosted.
  $('#mp-file', root).addEventListener('change', (e) => {
    addLocalFiles(e.target.files);
    e.target.value = '';
  });
  availableFileTracks().then((found) => {          // files published in music/ appear in the playlist
    if (!found.length) return;
    tracks.push(...found);
    renderList();
    sync();
  });
  player.onEnded = () => playIndex(repeat ? index : nextIndex());   // a finished file repeats or moves on
  player.onError = () => fail('mp-err-play');

  player.setMaster(effective());
  bus.on('volume:changed', ({ effective: scale }) => player.setMaster(scale));   // the tray's volume drives the Web Audio master gain
  bus.on('lang:changed', sync);
  bus.on('window:closed', ({ id }) => { if (id === 'music') { actions.stop(); exitMini(); if (fsElement() === stage) actions.full(); } });
  bus.on('power:down', () => actions.stop());                                      // Log Off / Turn Off silence the player

  readPalette();
  renderList();
  paintFx();
  applyFx();
  screen.classList.toggle('kaoss', kaoss);
  sync();
}
