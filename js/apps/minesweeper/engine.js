/*
 * apps/minesweeper/engine.js — Bug Sweeper's rules, with no DOM and no
 * globals, so it can be tested in isolation. ("Mines" are "bugs".)
 *
 * A game is a plain object; the functions below mutate it. Cells are indexed
 * row-major: index = row * cols + col. The first reveal is always safe
 * because bugs are planted after it, never on the clicked cell.
 */

export const STATUS = Object.freeze({ READY: 'ready', PLAYING: 'playing', WON: 'won', LOST: 'lost' });

export function createGame({ rows = 9, cols = 9, bugs = 10, random = Math.random } = {}) {
  return {
    rows,
    cols,
    bugs,
    random,
    status: STATUS.READY,
    flags: 0,
    openCount: 0,
    exploded: -1,
    cells: Array.from({ length: rows * cols }, () => ({ bug: false, adjacent: 0, open: false, flagged: false })),
  };
}

export const isFinished = (game) => game.status === STATUS.WON || game.status === STATUS.LOST;
export const bugsLeft = (game) => game.bugs - game.flags;

export function neighbors(game, index) {
  const row = Math.floor(index / game.cols);
  const col = index % game.cols;
  const result = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < game.rows && c >= 0 && c < game.cols) result.push(r * game.cols + c);
    }
  }
  return result;
}

function plantBugs(game, safeIndex) {
  const candidates = game.cells.map((_, i) => i).filter((i) => i !== safeIndex);
  for (let placed = 0; placed < game.bugs; placed++) {
    const pick = Math.floor(game.random() * candidates.length);
    game.cells[candidates.splice(pick, 1)[0]].bug = true;
  }
  game.cells.forEach((cell, i) => {
    cell.adjacent = neighbors(game, i).filter((n) => game.cells[n].bug).length;
  });
}

/** Opens a cell (flood-filling empty regions). No-op on flagged/open cells or finished games. */
export function reveal(game, index) {
  const cell = game.cells[index];
  if (isFinished(game) || cell.open || cell.flagged) return;

  if (game.status === STATUS.READY) {
    plantBugs(game, index);
    game.status = STATUS.PLAYING;
  }

  if (cell.bug) {
    cell.open = true;
    game.exploded = index;
    game.status = STATUS.LOST;
    return;
  }

  const stack = [index];
  while (stack.length) {
    const i = stack.pop();
    const current = game.cells[i];
    if (current.open || current.flagged) continue;
    current.open = true;
    game.openCount++;
    if (current.adjacent === 0) stack.push(...neighbors(game, i));
  }

  if (game.openCount === game.cells.length - game.bugs) {
    game.status = STATUS.WON;
    game.cells.forEach((c) => { if (c.bug) c.flagged = true; });
    game.flags = game.bugs;
  }
}

/** Toggles the flag on a closed cell. */
export function toggleFlag(game, index) {
  const cell = game.cells[index];
  if (isFinished(game) || cell.open) return;
  cell.flagged = !cell.flagged;
  game.flags += cell.flagged ? 1 : -1;
}
