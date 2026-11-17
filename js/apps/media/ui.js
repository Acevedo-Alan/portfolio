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

const SKINS = ['blue', 'silver', 'green'];
const SKIN_KEY = 'portfolio-mp-skin';
const VIS_KEY = 'portfolio-mp-vis';
const BADGE_MS = 2200;

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

  root.innerHTML = `
    <div class="mp">
      <nav class="mp-side" data-i18n-label="mp-nav">
        ${TABS.map((tab) => `<button type="button" class="mp-tab${tab.open || tab.action ? '' : ' active'}" ${tab.open ? `data-open="${tab.open}"` : tab.action ? `data-action="${tab.action}"` : 'aria-current="page"'} data-i18n="${tab.key}"></button>`).join('')}
        <div class="mp-side-tools">
          <button type="button" class="mp-mini" data-act="vis" data-i18n-label="mp-vis">${ICONS.vis}</button>
          <button type="button" class="mp-mini" data-act="skin" data-i18n-label="mp-skin">${ICONS.skin}</button>
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
        <div class="mp-tracks">
          <div class="mp-list-head" aria-hidden="true"><span data-i18n="mp-col-n"></span><span data-i18n="mp-col-title"></span><span data-i18n="mp-col-bpm"></span></div>
          <ol class="mp-list" data-i18n-label="mp-playlist"></ol>
          <div class="mp-tracks-foot">
            <button type="button" class="mp-open" data-act="open-file" data-i18n="mp-open-file"></button>
            <input type="file" id="mp-file" accept="audio/*" hidden>
          </div>
        </div>
        <div class="mp-deck">
          <div class="mp-seek" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-i18n-label="mp-progress"><i></i></div>
          <div class="mp-ctrls">
            <button type="button" class="mp-round" data-act="stop" data-i18n-label="mp-stop">${ICONS.stop}</button>
            <button type="button" class="mp-round" data-act="prev" data-i18n-label="mp-prev">${ICONS.prev}</button>
            <button type="button" class="mp-play" data-act="toggle" data-i18n-label="mp-play">${ICONS.play}</button>
            <button type="button" class="mp-round" data-act="next" data-i18n-label="mp-next">${ICONS.next}</button>
            <label class="mp-vol-wrap">${ICONS.speaker}<input type="range" class="mp-vol" min="0" max="100" value="70" data-i18n-label="mp-volume"></label>
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
  screen.addEventListener('pointermove', track);
  screen.addEventListener('pointerdown', (e) => { track(e); pointer.down = true; screen.setPointerCapture(e.pointerId); });
  const release = () => { pointer.down = false; };
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
    if (size.w) renderer.draw(g, size.w, size.h, { freq, wave, palette, pointer, dt, time: (now - started) / 1000 });
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
  }

  // ---------- Playlist ----------

  const trackLabel = (item) => (item.artist ? `${item.artist} – ${item.name}` : item.name);

  function renderList() {
    $('.mp-list', root).innerHTML = tracks
      .map((item, i) => `<li><button type="button" data-track="${i}"><span>${String(i + 1).padStart(2, '0')}</span><span>${escapeHTML(trackLabel(item))}</span><span>${item.bpm ? item.bpm + ' BPM' : '—'}</span></button></li>`)
      .join('');
  }

  // ---------- Readouts ----------

  function updateReadouts() {
    $('#mp-time', root).textContent = formatTime(player.elapsed);
    const pct = Math.round(player.progress * 100);
    const seek = $('.mp-seek', root);
    $('i', seek).style.width = pct + '%';
    seek.setAttribute('aria-valuenow', String(pct));
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
  }

  function flashBadge() {
    const badge = $('#mp-badge', root);
    badge.textContent = `${t(VISUALIZERS[visIndex].labelKey)} · ${t('mp-drag-hint')}`;
    badge.classList.add('show');
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => badge.classList.remove('show'), BADGE_MS);
  }

  // ---------- Transport ----------

  async function playIndex(i) {
    index = (i + tracks.length) % tracks.length;
    await player.play(tracks[index]);
    renderer.reset();
    sync();
    startLoop();
  }

  const actions = {
    toggle: () => (player.playing ? actions.pause() : playIndex(index)),
    pause: async () => { await player.pause(); stopLoop(); sync(); },
    stop: () => { player.stop(); stopLoop(); renderer.reset(); paintIdle(); sync(); },
    prev: () => playIndex(index - 1),
    next: () => playIndex(index + 1),
    'open-file': () => $('#mp-file', root).click(),
    skin: () => {
      skin = cycle(SKINS, skin);
      win.dataset.skin = skin;
      storage.set(SKIN_KEY, skin);
      readPalette();
      if (!frameId) paintIdle();
    },
    vis: () => {
      visIndex = (visIndex + 1) % VISUALIZERS.length;
      renderer = VISUALIZERS[visIndex].create();
      storage.set(VIS_KEY, VISUALIZERS[visIndex].id);
      flashBadge();
    },
  };

  root.addEventListener('click', (e) => {
    const control = e.target.closest('[data-act]');
    if (control) { actions[control.dataset.act](); return; }
    const track = e.target.closest('[data-track]');
    if (track) { playIndex(Number(track.dataset.track)); return; }
    const tab = e.target.closest('[data-open]');
    if (tab) { windows.open(tab.dataset.open); return; }
    if (e.target.closest('[data-action="burn"]')) openBurnWizard();
  });
  $('.mp-vol', root).addEventListener('input', (e) => player.setVolume(Number(e.target.value) / 100));

  // A file the visitor picks plays straight from their computer (an object URL): nothing is uploaded or hosted.
  $('#mp-file', root).addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    tracks.push({ name: file.name.replace(/\.[^.]+$/, ''), src: URL.createObjectURL(file), local: true });
    renderList();
    playIndex(tracks.length - 1);
    e.target.value = '';
  });
  availableFileTracks().then((found) => {          // files published in music/ appear in the playlist
    if (!found.length) return;
    tracks.push(...found);
    renderList();
    sync();
  });
  player.onEnded = () => playIndex(index + 1);      // a finished file moves on to the next track

  player.setMaster(effective());
  bus.on('volume:changed', ({ effective: scale }) => player.setMaster(scale));   // the tray's volume drives the Web Audio master gain
  bus.on('lang:changed', sync);
  bus.on('window:closed', ({ id }) => { if (id === 'music') actions.stop(); });
  bus.on('power:down', () => actions.stop());                                      // Log Off / Turn Off silence the player

  readPalette();
  renderList();
  sync();
}
