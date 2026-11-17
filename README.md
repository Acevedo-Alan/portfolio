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
  audio/             volume.js (master volume/mute), sounds.js (XP UI sounds), effects.js (CD-drive + modem synth)
  shell/             windowManager, taskbar, tray, startMenu, desktopIcons, contextMenu,
                     appearance (wallpaper, theme, user picture), welcome, modal, balloon, mascot
    wizards/         burnResume.js (CD-burning wizard), dialup.js (contact-as-dial-up wizard)
  apps/              registry.js (what apps exist) + one module per interactive app
    minesweeper/     engine.js (pure rules) + ui.js
    media/           tracks.js (synth data) + chiptune.js (Web Audio synth) + filePlayer.js (audio files)
                     + playback.js (picks the engine) + output.js (shared volume/analyser)
                     + library.js (file tracks) + visualizers.js (registry) + ui.js
    displayProps.js  wallpaper + color theme dialog
  ui/                reusable widgets (tabs)
sounds/              Windows XP sound effects (mp3)
imgs/xp-icons/       31 Windows XP icons (96px, transparent), one per app and UI piece; js/core/dom.js
                     icon() turns a name like "briefcase" into <img src="imgs/xp-icons/briefcase.png">
imgs/xp-tiles/       the 16 XP user-account pictures (128px), used for the Start menu portrait,
                     the welcome screen and the Display Properties "Account" tab
music/               (optional) real audio for the player, listed in js/apps/media/library.js
resume/              (optional) put Alan-Acevedo-CV.pdf here; the "Burn Resume" wizard downloads it
```

## Résumé download

The player's **Burn Resume** tab runs a fake CD-burning wizard and then downloads
`resume/Alan-Acevedo-CV.pdf`. If that file isn't published, the wizard says so and points to the
Contact window instead. To publish it, add the PDF at that path (see `RESUME_URL` in
`js/shell/wizards/burnResume.js`).

## Contact form

There is no backend. The tray's network icon opens a dial-up-style wizard whose "Connect" step
builds a `mailto:` link, so the message is sent from the visitor's own mail client; nothing is
sent to any server.

## Design rules

- **Single responsibility.** One module per concern; logic (`minesweeper/engine.js`,
  `media/tracks.js`) is separate from rendering.
- **Open/closed.** Apps are data in `js/apps/registry.js`; terminal commands are a registry
  (`registerCommand`); player skins are CSS custom-property blocks and visualizations are a registry. Add by adding, not editing.
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

## Real audio in the player

The player plays its built-in chiptune tracks, and also real audio files:

- Add a file under `music/` and list it in `js/apps/media/library.js`. It appears in the playlist
  only if the file exists. **Only publish audio you have the rights to**: everything in `music/` is
  served to every visitor of the deployed site.
- Visitors can also use **Open file…** to play a file from their own computer. It plays locally;
  nothing is uploaded or hosted.

## Welcome screen

The first visit of each browser session shows the XP log-on screen; clicking the user name plays the
startup chime and loads the desktop. It is shown by `html.welcome-pending` (set by the boot guard in
`index.html`), runs from `js/shell/welcome.js`, and is skipped with `?skip` in the URL.

## Assets

The XP user pictures in `imgs/xp-tiles/`, the icons in `imgs/xp-icons/` and the sounds in `sounds/` come from
Windows XP, so they are Microsoft's. The icons are from *Windows XP High Resolution Icon Pack* by
March Mountain Productions (a 1024px recreation of the originals). They are fine for a personal nostalgia project; if the site is ever more than that, replace
them with assets you have the rights to.
