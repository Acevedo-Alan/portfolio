# Portfolio — Windows XP desktop

Alan Acevedo's portfolio, presented as a Windows XP (Luna) desktop. Plain HTML, CSS and
ES modules: no build step, no dependencies.

## Run it

ES modules don't load from `file://`, so serve the folder over http:

```
npx serve .          # or: python -m http.server 8765
```

Deployed as a static site (Vercel).

## Layout

```
index.html           static shell + each window's content
css/                 one stylesheet per concern (map at the top of css/base.css)
  apps/              one file per app window
js/
  main.js            composition root: wires modules, holds no logic
  core/              dom helpers, viewport, storage, event bus
  i18n/              language state + es.js / en.js dictionaries
  audio/             XP UI sounds + mute switch
  shell/             windowManager, taskbar, startMenu, desktopIcons, balloon, mascot
  apps/              registry.js (what apps exist) + one module per interactive app
    minesweeper/     engine.js (pure rules) + ui.js
    winamp/          tracks.js (data) + chiptune.js (Web Audio synth) + ui.js
  ui/                reusable widgets (tabs)
sounds/              Windows XP sound effects (mp3)
```

## Design rules

- **Single responsibility.** One module per concern; logic (`minesweeper/engine.js`,
  `winamp/tracks.js`) is separate from rendering.
- **Open/closed.** Apps are data in `js/apps/registry.js`; terminal commands are a registry
  (`registerCommand`); Winamp skins are CSS custom-property blocks. Add by adding, not editing.
- **Decoupling.** Modules talk through `core/bus.js` events (`window:opened`, `lang:changed`, …)
  instead of importing each other; dependencies only point downward (no cycles).
- **One source of truth.** The stack lives in `index.html` (Device Manager tree) and the
  terminal's `skills` command reads it; app metadata lives only in the registry.
- **No globals, no inline handlers.** Everything is a module import.

## Adding an app

1. Add an entry to `js/apps/registry.js` (id, icon, title key, size, chrome).
2. Add `<section id="win-<id>">` to `index.html`, and an icon symbol to the SVG sprite.
3. Add `box-<id>` (title) and `tip-<id>` (mascot tip) to `js/i18n/es.js` and `en.js`.
4. If it's interactive, write `js/apps/<id>.js` exporting `mount()` and map it in `js/main.js`.
