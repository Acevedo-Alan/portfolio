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
import { initLang } from './i18n/i18n.js';
import { playStartupOnFirstGesture } from './audio/sounds.js';
import * as windows from './shell/windowManager.js';
import * as desktopIcons from './shell/desktopIcons.js';
import * as startMenu from './shell/startMenu.js';
import * as taskbar from './shell/taskbar.js';
import * as balloon from './shell/balloon.js';
import * as mascot from './shell/mascot.js';

import { mount as mountSysProps } from './apps/sysProps.js';
import { mount as mountDeviceManager } from './apps/deviceManager.js';
import { mount as mountExplorer } from './apps/explorer.js';
import { mount as mountTerminal } from './apps/terminal.js';
import { mount as mountBugSweeper } from './apps/minesweeper/ui.js';
import { mount as mountWinamp } from './apps/winamp/ui.js';
import { mount as mountRecycleBin } from './apps/recycleBin.js';

// App id -> its mount function. Static-content windows (experiencia,
// educacion, contacto) need none.
const MOUNTS = {
  whoami: mountSysProps,
  stack: mountDeviceManager,
  proyectos: mountExplorer,
  terminal: mountTerminal,
  bugsweeper: mountBugSweeper,
  winamp: mountWinamp,
  papelera: mountRecycleBin,
};

// 1. Build the shell (windows, icons, menus, taskbar).
windows.init(APPS);
desktopIcons.init(APPS);
startMenu.init(APPS);
taskbar.init();
balloon.init();

// 2. Set the language (translates the shell and notifies listeners), then
//    mount the apps so their rendered text starts in the right language.
initLang();
APPS.forEach((app) => { if (MOUNTS[app.id]) MOUNTS[app.id](); });

// 3. Start.
playStartupOnFirstGesture();
mascot.init();

// Deep links (e.g. /#contacto) open that window; otherwise start on "about me".
const hash = location.hash.slice(1);
windows.open(windows.has(hash) ? hash : 'whoami', { quiet: true });
