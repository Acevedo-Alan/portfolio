# Stockfish (vendored)

`stockfish.js` and `stockfish.wasm` are **Stockfish.js 17.1, lite single-threaded build**, taken
unmodified from the npm package `stockfish@17.1.0` (files `src/stockfish-17.1-lite-single-03e3232.js`
and `.wasm`, renamed so the script finds its `.wasm` next to it).

- Project: https://github.com/nmrugg/stockfish.js (based on https://github.com/official-stockfish/Stockfish)
- License: GNU GPLv3, full text in `COPYING.txt`. Source code is available at the links above.
- Used by `js/apps/chess/logic/Engine.js` inside a Web Worker. It must be served from the same
  origin as the page (a Worker cannot start from a CDN), which is why it lives in this repo.
- The single-threaded build needs no special headers (no SharedArrayBuffer), so it works on plain Vercel hosting.
