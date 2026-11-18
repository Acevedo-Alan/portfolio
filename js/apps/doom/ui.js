/*
 * apps/doom/ui.js — shareware Doom in a window, run by js-dos (DOSBox compiled to WebAssembly).
 *
 * The game lives in an iframe (doom/frame.html), not in this page: js-dos grabs every key on the
 * window it runs in, which would break Esc, typing in other windows and the desktop shortcuts. In
 * its own frame it only hears keys while it has focus, and Esc reaches Doom's menu.
 *
 * Nothing heavy loads until the visitor presses "Start" (this module is lazy too, see main.js).
 * The bundle is doom/doom.jsdos (see doom/README.md); if it isn't there the window says so.
 * Closing the window, Log Off or Turn Off removes the frame, which stops the game and frees its memory.
 * The tray's volume drives the game's volume, and "Full screen" puts the game on the whole screen.
 */

import { $ } from '../../core/dom.js';
import * as bus from '../../core/bus.js';
import * as windows from '../../shell/windowManager.js';
import { effective } from '../../audio/volume.js';
import { t, translate } from '../../i18n/i18n.js';

const BUNDLE = 'doom/doom.jsdos';
const FRAME = 'doom/frame.html';

/**
 * True only if the bundle is really there: some servers answer 200 with the home page for any
 * missing file, so check the first bytes are a zip ("PK") instead of trusting the status.
 */
async function bundleExists() {
  try {
    const response = await fetch(BUNDLE, { headers: { Range: 'bytes=0-3' }, cache: 'no-store' });
    if (!response.ok) return false;
    const head = new Uint8Array(await response.arrayBuffer());
    return head[0] === 0x50 && head[1] === 0x4B;
  } catch (e) {
    return false;                                           // offline or file://
  }
}

export function mount() {
  const root = $('#win-doom .doom-body');
  let frame = null;         // the iframe while the game is running
  let starting = false;

  root.innerHTML = `
    <div class="doom-bar">
      <button type="button" class="btn-xp" id="doom-full" data-i18n="doom-full" disabled></button>
    </div>
    <div class="doom-stage">
      <div class="doom-screen" id="doom-screen" hidden></div>
      <div class="doom-start" id="doom-start">
        <p class="doom-title">DOOM</p>
        <p class="doom-note" id="doom-note" role="status"></p>
        <button type="button" class="btn-xp" id="doom-go" data-i18n="doom-start"></button>
        <p class="doom-keys" data-i18n="doom-keys"></p>
      </div>
    </div>`;
  translate(root);

  const screen = $('#doom-screen', root);
  const startPanel = $('#doom-start', root);
  const note = $('#doom-note', root);
  const go = $('#doom-go', root);
  const fullBtn = $('#doom-full', root);

  const say = (key) => { note.textContent = key ? t(key) : ''; };
  const sendVolume = () => frame && frame.contentWindow && frame.contentWindow.postMessage({ type: 'doom-volume', value: effective() }, location.origin);

  function showStart(messageKey = '') {
    startPanel.hidden = false;
    screen.hidden = true;
    go.disabled = false;
    fullBtn.disabled = true;
    say(messageKey);
  }

  function stop() {
    if (frame) { frame.remove(); frame = null; }      // removing the frame ends the game
    if (document.fullscreenElement === screen) document.exitFullscreen().catch(() => {});
    showStart();
  }

  async function start() {
    if (starting || frame) return;
    starting = true;
    go.disabled = true;
    say('doom-loading');
    try {
      if (!(await bundleExists())) {
        console.warn(`Doom: ${BUNDLE} was not found. See doom/README.md.`);
        showStart('doom-missing');
        return;
      }
      frame = document.createElement('iframe');
      frame.className = 'doom-frame';
      frame.src = FRAME;
      frame.title = 'Doom';
      frame.allow = 'autoplay; fullscreen; keyboard-map';
      frame.addEventListener('load', () => { sendVolume(); frame.focus(); });
      screen.replaceChildren(frame);
      screen.hidden = false;
      startPanel.hidden = true;
      fullBtn.disabled = false;
    } catch (e) {
      console.error('Doom could not start', e);
      stop();
      say('doom-error');
    } finally {
      starting = false;
    }
  }

  // Full screen: the stage that holds the game goes full screen, so the picture scales to the monitor.
  function fullScreen() {
    if (!frame) return;
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    (screen.requestFullscreen ? screen.requestFullscreen() : Promise.reject()).then(() => frame && frame.focus()).catch(() => say('doom-nofull'));
  }

  go.addEventListener('click', start);
  fullBtn.addEventListener('click', fullScreen);
  document.addEventListener('fullscreenchange', () => { if (frame) frame.focus(); });
  window.addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin || !e.data) return;
    if (e.data.type === 'doom-error') { stop(); say('doom-error'); }
    if (e.data.type === 'doom-ready') sendVolume();
  });

  // Clicks inside the frame never reach this page, so bring the window forward when the frame takes focus.
  window.addEventListener('blur', () => {
    if (frame && document.activeElement === frame) windows.focus('doom');
  });

  bus.on('volume:changed', sendVolume);
  bus.on('window:closed', ({ id }) => { if (id === 'doom') stop(); });
  bus.on('power:down', stop);
}
