# Doom bundle

The Doom window (`js/apps/doom/ui.js`) runs `doom/doom.jsdos`.

## What's inside

A js-dos bundle (a zip) made from the official **shareware** release of Doom 1.9 (`doom19s.zip`, episode 1 only,
which id Software allows to be redistributed freely):

- `DOOM.EXE`, `DOOM1.WAD`, `README.TXT`, `HELPME.TXT` — straight from the release
- `DEFAULT.CFG` — Doom's default settings (keys, Sound Blaster at 220/7/1)
- `.jsdos/dosbox.conf` — DOSBox settings; its `[autoexec]` mounts the bundle and runs `DOOM.EXE`

`DOOM1.WAD` must be 4,196,020 bytes. Never put the retail, registered or Doom II WADs here: they are not redistributable.

## Rebuilding it

1. Download `doom19s.zip` (e.g. from the idgames archive) and unzip it. It contains `DOOMS_19.1` and `DOOMS_19.2`.
2. Join them (`copy /b DOOMS_19.1+DOOMS_19.2 DOOMS_19.EXE`): that is an LHA self-extracting archive.
   Extract it with 7-Zip, `lha`, or `tar -xf DOOMS_19.EXE` (Windows' bsdtar reads it).
3. Zip `DOOM.EXE`, `DOOM1.WAD`, the two text files, a `DEFAULT.CFG` and `.jsdos/dosbox.conf` as above.

## Notes

- js-dos (DOSBox) is GPL-licensed. Check its licence terms before publishing the site.
- The game runs in `doom/frame.html` (an iframe of the Doom window), because js-dos grabs every key on the
  page it runs in. The runtime is loaded from jsDelivr at a pinned version (`CDN` in that file and the two
  tags above it), so the site needs a connection to run Doom. To serve it yourself, copy `dist/` of the
  `js-dos` npm package into `doom/js-dos/` and point those three URLs at it.
- The bundle is keyboard-only (`use_mouse 0` in `DEFAULT.CFG`, `autolock=false`): mouse capture made the view spin.
