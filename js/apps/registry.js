/*
 * apps/registry.js — the single source of truth for what apps exist.
 *
 * Pure data, no imports. The desktop icons, Start menu, taskbar, window
 * manager and terminal all read this list, so adding an app means adding an
 * entry here, a <section id="win-<id>"> in index.html, and (for interactive
 * apps) a module registered in js/main.js. Nothing else changes.
 *
 *   id       matches #win-<id> and doubles as the terminal command
 *   icon     symbol id in the SVG sprite (index.html)
 *   title    i18n key for the window title / icon label
 *   w, h     default window size in px
 *   chrome   'normal' (min/max/close + resizable), 'fixed' (min/close),
 *            'dialog' (close only)
 *   noAddr   omit the Explorer-style address bar
 *   nav      add Back / Forward / Up buttons to the address bar
 */

export const APPS = [
  { id: 'whoami',      icon: 'i-user',   title: 'box-whoami',      w: 480, h: 580, chrome: 'dialog', noAddr: true },
  { id: 'stack',       icon: 'i-gear',   title: 'box-stack',       w: 560, h: 460 },
  { id: 'experiencia', icon: 'i-case',   title: 'box-experiencia', w: 660, h: 560 },
  { id: 'proyectos',   icon: 'i-folder', title: 'box-proyectos',   w: 780, h: 560, nav: true },
  { id: 'educacion',   icon: 'i-cap',    title: 'box-educacion',   w: 460, h: 280 },
  { id: 'contacto',    icon: 'i-mail',   title: 'box-contacto',    w: 460, h: 290 },
  { id: 'terminal',    icon: 'i-term',   title: 'app-terminal',    w: 600, h: 380, noAddr: true },
  { id: 'bugsweeper',  icon: 'i-bug',    title: 'box-bugsweeper',  w: 330, h: 520, chrome: 'fixed', noAddr: true },
  { id: 'winamp',      icon: 'i-amp',    title: 'box-winamp',      w: 360, h: 410, chrome: 'fixed', noAddr: true },
  { id: 'papelera',    icon: 'i-bin',    title: 'box-papelera',    w: 660, h: 380 },
];

export const findApp = (id) => APPS.find((app) => app.id === id);
