/*
 * apps/registry.js — the single source of truth for what apps exist.
 *
 * Pure data, no imports. The desktop icons, Start menu, taskbar, window
 * manager and terminal all read this list, so adding an app means adding an
 * entry here, a <section id="win-<id>"> in index.html, and (for interactive
 * apps) a module registered in js/main.js. Nothing else changes.
 *
 *   id       matches #win-<id> and doubles as the terminal command
 *   icon     XP icon name: imgs/xp-icons/<icon>.png (or an "i-…" symbol in the SVG sprite)
 *   title    i18n key for the window title / icon label
 *   w, h     default window size in px
 *   chrome   'normal' (min/max/close + resizable), 'fixed' (min/close),
 *            'skin' (min/close, non-rectangular media-player shape),
 *            'dialog' (close only)
 *   noAddr   omit the Explorer-style address bar
 *   nav      add Back / Forward / Up buttons to the address bar
 *   aliases  extra terminal command names that open the app
 *   desktop  false = no desktop icon (still in the Start menu and terminal)
 *   group    'portfolio' | 'tools' | 'extras', used to arrange icons by type
 */

export const APPS = [
  { id: 'whoami',      icon: 'user-accounts',    title: 'box-whoami',      w: 480, h: 580, chrome: 'dialog', noAddr: true, group: 'portfolio' },
  { id: 'stack',       icon: 'computer-management',    title: 'box-stack',       w: 560, h: 460, group: 'portfolio' },
  { id: 'experiencia', icon: 'briefcase',    title: 'box-experiencia', w: 660, h: 560, group: 'portfolio' },
  { id: 'proyectos',   icon: 'my-documents',  title: 'box-proyectos',   w: 780, h: 560, nav: true, group: 'portfolio' },
  { id: 'educacion',   icon: 'certificate',     title: 'box-educacion',   w: 460, h: 280, group: 'portfolio' },
  { id: 'contacto',    icon: 'email',    title: 'box-contacto',    w: 460, h: 290, group: 'portfolio' },
  { id: 'terminal',    icon: 'command-prompt',    title: 'app-terminal',    w: 600, h: 380, noAddr: true, group: 'tools' },
  { id: 'bugsweeper',  icon: 'minesweeper',     title: 'box-bugsweeper',  w: 330, h: 520, chrome: 'fixed', noAddr: true, group: 'extras' },
  { id: 'music',       icon: 'windows-media-player-10',   title: 'box-music',       w: 780, h: 580, chrome: 'skin', noAddr: true, aliases: ['player', 'winamp'], group: 'extras' },
  { id: 'papelera',    icon: 'recycle-bin-full',     title: 'box-papelera',    w: 660, h: 380, group: 'tools' },
  { id: 'display',     icon: 'display-properties', title: 'box-display',     w: 420, h: 540, chrome: 'dialog', noAddr: true, desktop: false, aliases: ['properties'], group: 'tools' },
];

/** Order used by "Arrange Icons By → Type". */
export const GROUP_ORDER = ['portfolio', 'tools', 'extras'];

export const findApp = (id) => APPS.find((app) => app.id === id);
