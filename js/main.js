/*
 * main.js — the composition root. Wires the modules together in dependency
 * order and holds no logic of its own.
 *
 *   core/      DOM helpers, viewport, storage, event bus
 *   i18n/      language state + dictionaries
 *   audio/     XP UI sounds
 *   shell/     window manager, taskbar, Start menu, desktop icons, balloon, mascot
 *   apps/      one module per interactive window (registry.js lists them all)
 *
 * To add an app: add it to apps/registry.js, add its <section id="win-<id>">
 * to index.html, and (if interactive) map it to a mount() below.
 */

import { APPS } from './apps/registry.js';
import * as bus from './core/bus.js';
import { initLang } from './i18n/i18n.js';
import { playStartupOnFirstGesture } from './audio/sounds.js';
import * as motion from './shell/motion.js';
import * as windows from './shell/windowManager.js';
import * as desktopIcons from './shell/desktopIcons.js';
import * as startMenu from './shell/startMenu.js';
import * as taskbar from './shell/taskbar.js';
import * as tray from './shell/tray.js';
import * as power from './shell/power.js';
import * as contextMenu from './shell/contextMenu.js';
import * as appearance from './shell/appearance.js';
import * as welcome from './shell/welcome.js';
import * as bsod from './shell/bsod.js';
import * as balloon from './shell/balloon.js';
import * as mascot from './shell/mascot.js';
import * as mascotTips from './shell/mascotTips.js';
import * as keyboard from './shell/keyboard.js';

import { mount as mountSysProps } from './apps/sysProps.js';
import { mount as mountDeviceManager } from './apps/deviceManager.js';
import { mount as mountExplorer } from './apps/explorer.js';
import { mount as mountTerminal } from './apps/terminal.js';
import { mount as mountNotepad } from './apps/notepad.js';
import { mount as mountRecycleBin } from './apps/recycleBin.js';
import { mount as mountDisplayProps } from './apps/displayProps.js';

// App id -> its mount function. Static-content windows (experiencia,
// educacion, contacto) need none.
const MOUNTS = {
  whoami: mountSysProps,
  stack: mountDeviceManager,
  proyectos: mountExplorer,
  terminal: mountTerminal,
  readme: mountNotepad,
  papelera: mountRecycleBin,
  display: mountDisplayProps,
};

// The games and the media player are the heaviest code, so they download and mount the first
// time their window opens instead of at startup.
const LAZY = {
  bugsweeper: () => import('./apps/minesweeper/ui.js'),
  solitaire: () => import('./apps/solitaire/ui.js'),
  music: () => import('./apps/media/ui.js'),
};
const loading = new Set();
bus.on('window:opened', async ({ id }) => {
  if (!LAZY[id] || loading.has(id)) return;
  loading.add(id);
  try {
    (await LAZY[id]()).mount();
  } catch (e) {
    loading.delete(id);                     // offline mid-session: opening it again retries
    console.error('Could not load', id, e);
  }
});

// 1. Build the shell (windows, icons, menus, taskbar, tray).
appearance.init();
motion.init();
windows.init(APPS);
desktopIcons.init(APPS);
startMenu.init(APPS);
taskbar.init();
tray.init();
power.init();
contextMenu.init();
bsod.initKonami();
keyboard.init();
balloon.init();

// 2. Set the language (translates the shell and notifies listeners), then
//    mount the apps so their rendered text starts in the right language.
initLang();
APPS.forEach((app) => { if (MOUNTS[app.id]) MOUNTS[app.id](); });

// 3. Start. The welcome screen (first visit of a session) waits for a click on the user name and plays
//    the startup chime itself; otherwise the chime waits for the first click or keypress.
const welcomed = await welcome.run();
if (!welcomed) playStartupOnFirstGesture();
motion.desktopFadeIn();
mascot.init();
mascotTips.init();

// Deep links (e.g. /#contacto) open that window; otherwise start on "about me".
const hash = location.hash.slice(1);
windows.open(windows.has(hash) ? hash : 'whoami', { quiet: true });

// Everything is wired: tell the boot guard in index.html not to show the fallback.
document.documentElement.classList.add('app-ready');
document.documentElement.classList.remove('app-failed');

// Offline support: cache the site so it opens without a connection (see sw.js).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* optional: the site works without it */ });
}
