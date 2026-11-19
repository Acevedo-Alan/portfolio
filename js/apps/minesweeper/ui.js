/*
 * apps/minesweeper/ui.js — Bug Sweeper's window. Renders the board from the
 * engine's state and translates clicks / keys into engine calls.
 *
 * Controls: click reveals; right-click, the "flag mode" toggle (for touch) or
 * the F key marks a bug; arrow keys move between cells (roving tabindex).
 * Winning unlocks a clean-code snippet.
 */

import { $, $$ } from '../../core/dom.js';
import * as bus from '../../core/bus.js';
import { t, translate } from '../../i18n/i18n.js';
import { isMobile, desktopSize } from '../../core/viewport.js';
import { play } from '../../audio/sounds.js';
import { createGame, reveal, toggleFlag, bugsLeft, isFinished, STATUS } from './engine.js';

const LEVELS = {
  beginner: { rows: 9, cols: 9, bugs: 10, label: 'ms-lvl-beginner' },
  intermediate: { rows: 16, cols: 16, bugs: 40, label: 'ms-lvl-intermediate' },
  expert: { rows: 16, cols: 30, bugs: 99, label: 'ms-lvl-expert' },
};
const FACES = { [STATUS.READY]: '🙂', [STATUS.PLAYING]: '🙂', [STATUS.WON]: '😎', [STATUS.LOST]: '😵' };

// Shown on a win. A generic clean-code example (sealed result types).
const REWARD = `sealed interface Result<T> permits Ok, Err {}
record Ok<T>(T value) implements Result<T> {}
record Err<T>(String reason) implements Result<T> {}

// Expected failures are values, not exceptions.
String message = switch (pay(order)) {
    case Ok<Receipt> ok   -> "Paid: " + ok.value().id();
    case Err<Receipt> err -> "Declined: " + err.reason();
};`;

export function mount() {
  const root = $('#win-bugsweeper .ms-body');
  root.innerHTML = `
    <div class="ms-menubar" role="menubar">
      <div class="ms-menu"><button type="button" class="ms-menu-btn" role="menuitem" aria-haspopup="menu" aria-expanded="false" data-i18n="ms-menu-game"></button>
        <ul class="ctx-menu ms-drop" role="menu" hidden>
          <li><button type="button" class="ctx-item" role="menuitem" data-act="new"><span data-i18n="ms-new"></span></button></li>
          <li class="ms-drop-sep" role="separator"></li>
          ${Object.entries(LEVELS).map(([key, lv]) => `<li><button type="button" class="ctx-item" role="menuitemradio" data-level="${key}"><span class="ctx-check"></span><span data-i18n="${lv.label}"></span></button></li>`).join('')}
          <li class="ms-drop-sep" role="separator"></li>
          <li><button type="button" class="ctx-item" role="menuitemcheckbox" data-act="flag"><span class="ctx-check"></span><span data-i18n="ms-flag-mode"></span></button></li>
        </ul></div>
      <div class="ms-menu"><button type="button" class="ms-menu-btn" role="menuitem" aria-haspopup="menu" aria-expanded="false" data-i18n="ms-menu-help"></button>
        <ul class="ctx-menu ms-drop" role="menu" hidden>
          <li><button type="button" class="ctx-item" role="menuitem" data-act="hint"><span data-i18n="ms-menu-how"></span></button></li>
        </ul></div>
    </div>
    <div class="ms-stage">
    <div class="ms-frame">
      <div class="ms-head">
        <output class="ms-lcd" id="ms-bugs" data-i18n-label="ms-bugs-left"></output>
        <button type="button" class="ms-face" id="ms-face" data-i18n-label="ms-new"></button>
        <output class="ms-lcd" id="ms-time" data-i18n-label="ms-time"></output>
      </div>
      <div class="ms-grid" id="ms-grid" role="grid" data-i18n-label="ms-board"></div>
    </div>
    <pre class="ms-code" id="ms-code" hidden><code></code></pre>
    </div>
    <p class="ms-status" id="ms-msg" role="status"></p>`;
  $('#ms-code code').textContent = REWARD;
  translate(root);

  const grid = $('#ms-grid');
  const face = $('#ms-face');
  const win = $('#win-bugsweeper');
  const body = root;
  let level = 'beginner';
  let hintShown = false;
  let ROWS = LEVELS[level].rows;
  let COLS = LEVELS[level].cols;
  let game;
  let flagMode = false;
  let timer = null;
  let seconds = 0;
  let focusIndex = 0;

  // ---------- Board ----------

  let cellButtons = [];
  function buildBoard() {
    ({ rows: ROWS, cols: COLS } = LEVELS[level]);
    grid.replaceChildren();
    cellButtons = [];
    grid.style.gridTemplateColumns = `repeat(${COLS}, 28px)`;
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement('div');
      row.setAttribute('role', 'row');
      row.style.display = 'contents';
      for (let c = 0; c < COLS; c++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ms-cell';
        btn.setAttribute('role', 'gridcell');
        btn.dataset.index = String(r * COLS + c);
        row.appendChild(btn);
        cellButtons.push(btn);
      }
      grid.appendChild(row);
    }
  }

  /** Sizes the window to hug the board (menu bar + board + status bar), within the screen. */
  function fit() {
    if (win.hidden || isMobile()) return;
    const stage = $('.ms-stage', body);
    const needW = stage.scrollWidth;
    const needH = $('.ms-menubar', body).offsetHeight + stage.scrollHeight + $('#ms-msg').offsetHeight;
    const { w, h } = desktopSize();
    win.style.width = Math.min(needW + (win.offsetWidth - body.clientWidth), w - 8) + 'px';
    win.style.height = Math.min(needH + (win.offsetHeight - body.clientHeight), h - 8) + 'px';
  }

  const cellState = (cell, lostAndBug) => {
    if (cell.flagged) return t('ms-s-flag');
    if (!cell.open && !lostAndBug) return t('ms-s-hidden');
    if (cell.bug) return t('ms-s-bug');
    return cell.adjacent ? t('ms-s-n', { n: cell.adjacent }) : t('ms-s-empty');
  };

  function render() {
    const lost = game.status === STATUS.LOST;
    game.cells.forEach((cell, i) => {
      const btn = cellButtons[i];
      const showBug = cell.bug && (cell.open || (lost && !cell.flagged));
      const open = cell.open || showBug;
      btn.className = 'ms-cell' + (open ? ' open' : '') + (i === game.exploded ? ' boom' : '');
      btn.textContent = cell.flagged ? '🚩' : showBug ? '🐞' : open && cell.adjacent ? String(cell.adjacent) : '';
      if (open && !cell.bug && cell.adjacent) btn.dataset.n = String(cell.adjacent); else delete btn.dataset.n;
      btn.tabIndex = i === focusIndex ? 0 : -1;
      btn.setAttribute('aria-label', t('ms-cell', { r: Math.floor(i / COLS) + 1, c: (i % COLS) + 1, s: cellState(cell, showBug) }));
    });
    root.classList.toggle('flag-mode', flagMode);
    $('#ms-bugs').textContent = String(Math.max(bugsLeft(game), 0)).padStart(3, '0');
    $('#ms-time').textContent = String(Math.min(seconds, 999)).padStart(3, '0');
    face.textContent = FACES[game.status];

    const msg = $('#ms-msg');
    msg.className = 'ms-status' + (game.status === STATUS.WON ? ' won' : game.status === STATUS.LOST ? ' lost' : '');
    msg.textContent = game.status === STATUS.WON ? t('ms-won') : game.status === STATUS.LOST ? t('ms-lost') : '';
    $('#ms-code').hidden = game.status !== STATUS.WON;
    if (!msg.textContent && hintShown) msg.textContent = t('ms-hint');
    fit();
  }

  // ---------- Game flow ----------

  function stopTimer() { clearInterval(timer); timer = null; }

  function newGame() {
    stopTimer();
    seconds = 0;
    hintShown = false;
    focusIndex = 0;
    game = createGame({ rows: ROWS, cols: COLS, bugs: LEVELS[level].bugs });
    render();
  }

  function afterMove(previousStatus) {
    if (previousStatus === STATUS.READY && game.status === STATUS.PLAYING && !timer) {
      timer = setInterval(() => { seconds++; $('#ms-time').textContent = String(Math.min(seconds, 999)).padStart(3, '0'); }, 1000);
    }
    if (isFinished(game)) {
      stopTimer();
      play(game.status === STATUS.WON ? 'ding' : 'error');
    }
    render();
  }

  function act(index, forceFlag = false) {
    const before = game.status;
    if (forceFlag || flagMode) toggleFlag(game, index); else reveal(game, index);
    afterMove(before);
  }

  // ---------- Input ----------

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.ms-cell');
    if (!btn) return;
    focusIndex = Number(btn.dataset.index);
    act(focusIndex);
  });
  grid.addEventListener('contextmenu', (e) => {
    const btn = e.target.closest('.ms-cell');
    if (!btn) return;
    e.preventDefault();
    focusIndex = Number(btn.dataset.index);
    act(focusIndex, true);
  });
  grid.addEventListener('keydown', (e) => {
    const btn = e.target.closest('.ms-cell');
    if (!btn) return;
    const i = Number(btn.dataset.index);
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const moves = {
      ArrowLeft: col > 0 ? i - 1 : i, ArrowRight: col < COLS - 1 ? i + 1 : i,
      ArrowUp: row > 0 ? i - COLS : i, ArrowDown: row < ROWS - 1 ? i + COLS : i,
    };
    if (e.key in moves) {
      e.preventDefault();
      focusIndex = moves[e.key];
      render();
      cellButtons[focusIndex].focus();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      act(i, true);
      cellButtons[i].focus();
    }
  });

  face.addEventListener('click', newGame);

  // ---------- Menu bar ----------

  const drops = $$('.ms-drop', root);
  const closeMenus = () => {
    drops.forEach((d) => { d.hidden = true; });
    $$('.ms-menu-btn', root).forEach((b) => b.setAttribute('aria-expanded', 'false'));
  };
  const syncMenu = () => {
    $$('[data-level]', root).forEach((b) => {
      $('.ctx-check', b).textContent = b.dataset.level === level ? '●' : '';
      b.setAttribute('aria-checked', String(b.dataset.level === level));
    });
    const flagItem = $('[data-act="flag"]', root);
    $('.ctx-check', flagItem).textContent = flagMode ? '✓' : '';
    flagItem.setAttribute('aria-checked', String(flagMode));
  };
  $$('.ms-menu-btn', root).forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const drop = btn.nextElementSibling;
    const open = drop.hidden;
    closeMenus();
    drop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }));
  $('.ms-menubar', root).addEventListener('click', (e) => {
    const item = e.target.closest('.ctx-item');
    if (!item) return;
    closeMenus();
    if (item.dataset.level) { level = item.dataset.level; buildBoard(); newGame(); }
    else if (item.dataset.act === 'new') newGame();
    else if (item.dataset.act === 'flag') { flagMode = !flagMode; render(); }
    else if (item.dataset.act === 'hint') { hintShown = true; render(); }
    syncMenu();
  });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.ms-menu')) closeMenus(); });
  win.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

  bus.on('lang:changed', () => { if (game) render(); });
  bus.on('window:closed', ({ id }) => { if (id === 'bugsweeper') newGame(); });   // a fresh board next time

  buildBoard();
  newGame();
  syncMenu();
}
