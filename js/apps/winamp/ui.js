/*
 * apps/winamp/ui.js — the Winamp-style player window: LCD time + title, a
 * spectrum visualizer, transport controls, volume, a playlist, and three
 * swappable skins (CSS custom-property sets in css/apps/winamp.css).
 */

import { $, $$, escapeHTML } from '../../core/dom.js';
import * as bus from '../../core/bus.js';
import * as storage from '../../core/storage.js';
import { t, translate } from '../../i18n/i18n.js';
import { Chiptune } from './chiptune.js';
import { TRACKS } from './tracks.js';

const SKINS = ['classic', 'luna', 'sunset'];
const SKIN_KEY = 'portfolio-wa-skin';
const BARS = 24;

const formatTime = (seconds) => {
  const s = Math.floor(seconds);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

export function mount() {
  const root = $('#win-winamp .wa-body');
  const player = new Chiptune();
  let index = 0;
  let frame = null;

  const storedSkin = storage.get(SKIN_KEY);
  let skin = SKINS.includes(storedSkin) ? storedSkin : SKINS[0];

  root.innerHTML = `
    <div class="wa" data-skin="${skin}">
      <div class="wa-display">
        <div class="wa-top">
          <span class="wa-time" id="wa-time">00:00</span>
          <div class="wa-title" id="wa-title"><span></span></div>
        </div>
        <canvas class="wa-vis" id="wa-vis" width="320" height="58" aria-hidden="true"></canvas>
      </div>
      <div class="wa-controls">
        <button type="button" class="wa-btn" data-act="prev" data-i18n-label="wa-prev">|◀</button>
        <button type="button" class="wa-btn" data-act="play" aria-pressed="false" data-i18n-label="wa-play">▶</button>
        <button type="button" class="wa-btn" data-act="pause" data-i18n-label="wa-pause">❚❚</button>
        <button type="button" class="wa-btn" data-act="stop" data-i18n-label="wa-stop">■</button>
        <button type="button" class="wa-btn" data-act="next" data-i18n-label="wa-next">▶|</button>
        <input type="range" class="wa-vol" min="0" max="100" value="70" data-i18n-label="wa-volume">
        <button type="button" class="wa-btn wa-skin" data-act="skin" data-i18n-label="wa-skin">skin</button>
      </div>
      <ol class="wa-list" data-i18n-label="wa-playlist">
        ${TRACKS.map((track, i) => `<li><button type="button" data-track="${i}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span>${escapeHTML(track.name)}</span></button></li>`).join('')}
      </ol>
      <p class="wa-note" data-i18n="wa-note"></p>
    </div>`;
  translate(root);

  const wa = $('.wa', root);
  const canvas = $('#wa-vis', root);
  const g = canvas.getContext('2d');
  const playButton = $('[data-act="play"]', root);

  // ---------- Display ----------

  function updateTitle() {
    const title = $('#wa-title', root);
    const text = player.track ? `${String(index + 1).padStart(2, '0')}. ${TRACKS[index].name}` : t('wa-stopped');
    $('span', title).textContent = text;
    title.classList.remove('scroll');
    requestAnimationFrame(() => title.classList.toggle('scroll', $('span', title).scrollWidth > title.clientWidth));
    $$('.wa-list li', root).forEach((li, i) => li.classList.toggle('current', player.track !== null && i === index));
    playButton.setAttribute('aria-pressed', String(player.playing));
  }

  function drawFrame() {
    $('#wa-time', root).textContent = formatTime(player.elapsed);
    const data = new Uint8Array(player.analyser.frequencyBinCount);
    player.analyser.getByteFrequencyData(data);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = getComputedStyle(wa).getPropertyValue('--wa-lcd').trim();
    const barWidth = canvas.width / BARS;
    const usable = Math.floor(data.length * 0.6);
    for (let i = 0; i < BARS; i++) {
      const value = data[Math.floor((i * usable) / BARS)] / 255;
      const h = Math.max(2, value * canvas.height);
      g.fillRect(i * barWidth + 1, canvas.height - h, barWidth - 2, h);
    }
    frame = player.playing ? requestAnimationFrame(drawFrame) : null;
  }

  function clearVisualizer() {
    cancelAnimationFrame(frame);
    frame = null;
    g.clearRect(0, 0, canvas.width, canvas.height);
    $('#wa-time', root).textContent = formatTime(player.elapsed);
  }

  // ---------- Transport ----------

  async function playIndex(i) {
    index = (i + TRACKS.length) % TRACKS.length;
    await player.play(TRACKS[index]);
    updateTitle();
    if (!frame) frame = requestAnimationFrame(drawFrame);
  }

  const actions = {
    play: () => playIndex(index),
    pause: async () => { await player.pause(); clearVisualizer(); updateTitle(); },
    stop: () => { player.stop(); clearVisualizer(); $('#wa-time', root).textContent = '00:00'; updateTitle(); },
    prev: () => playIndex(index - 1),
    next: () => playIndex(index + 1),
    skin: () => {
      skin = SKINS[(SKINS.indexOf(skin) + 1) % SKINS.length];
      wa.dataset.skin = skin;
      storage.set(SKIN_KEY, skin);
    },
  };

  root.addEventListener('click', (e) => {
    const control = e.target.closest('[data-act]');
    if (control) { actions[control.dataset.act](); return; }
    const row = e.target.closest('[data-track]');
    if (row) playIndex(Number(row.dataset.track));
  });
  $('.wa-vol', root).addEventListener('input', (e) => player.setVolume(Number(e.target.value) / 100));

  bus.on('lang:changed', updateTitle);
  bus.on('window:closed', ({ id }) => { if (id === 'winamp') actions.stop(); });   // closing the player stops the music

  updateTitle();
}
