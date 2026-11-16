/*
 * apps/minesweeper/ui.js — Bug Sweeper's window. Renders the board from the
 * engine's state and translates clicks / keys into engine calls.
 *
 * Controls: click reveals; right-click, the "flag mode" toggle (for touch) or
 * the F key marks a bug; arrow keys move between cells (roving tabindex).
 * Winning unlocks a clean-code snippet.
 */

import { $ } from '../../core/dom.js';
import * as bus from '../../core/bus.js';
import { t, translate } from '../../i18n/i18n.js';
import { play } from '../../audio/sounds.js';
import { createGame, reveal, toggleFlag, bugsLeft, isFinished, STATUS } from './engine.js';

const ROWS = 9;
const COLS = 9;
const BUGS = 10;
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
    <div class="ms-frame">
      <div class="ms-head">
        <output class="ms-lcd" id="ms-bugs" data-i18n-label="ms-bugs-left"></output>
        <button type="button" class="ms-face" id="ms-face" data-i18n-label="ms-new"></button>
        <output class="ms-lcd" id="ms-time" data-i18n-label="ms-time"></output>
      </div>
      <div class="ms-grid" id="ms-grid" role="grid" data-i18n-label="ms-board"></div>
    </div>
    <div class="ms-tools"><button type="button" class="btn-xp" id="ms-flag" aria-pressed="false" data-i18n="ms-flag-mode"></button></div>
    <p class="ms-hint" data-i18n="ms-hint"></p>
    <p class="ms-msg" id="ms-msg" role="status"></p>
    <pre class="ms-code" id="ms-code" hidden><code></code></pre>`;
  $('#ms-code code').textContent = REWARD;
  translate(root);

  const grid = $('#ms-grid');
  const face = $('#ms-face');
  const flagToggle = $('#ms-flag');
  let game;
  let flagMode = false;
  let timer = null;
  let seconds = 0;
  let focusIndex = 0;

  // ---------- Board ----------

  grid.style.gridTemplateColumns = `repeat(${COLS}, 28px)`;
  const cellButtons = [];
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
    $('#ms-bugs').textContent = String(Math.max(bugsLeft(game), 0)).padStart(3, '0');
    $('#ms-time').textContent = String(Math.min(seconds, 999)).padStart(3, '0');
    face.textContent = FACES[game.status];

    const msg = $('#ms-msg');
    msg.className = 'ms-msg' + (game.status === STATUS.WON ? ' won' : game.status === STATUS.LOST ? ' lost' : '');
    msg.textContent = game.status === STATUS.WON ? t('ms-won') : game.status === STATUS.LOST ? t('ms-lost') : '';
    $('#ms-code').hidden = game.status !== STATUS.WON;
  }

  // ---------- Game flow ----------

  function stopTimer() { clearInterval(timer); timer = null; }

  function newGame() {
    stopTimer();
    seconds = 0;
    game = createGame({ rows: ROWS, cols: COLS, bugs: BUGS });
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
  flagToggle.addEventListener('click', () => {
    flagMode = !flagMode;
    flagToggle.setAttribute('aria-pressed', String(flagMode));
  });

  bus.on('lang:changed', () => { if (game) render(); });
  bus.on('window:closed', ({ id }) => { if (id === 'bugsweeper') newGame(); });   // a fresh board next time

  newGame();
}
