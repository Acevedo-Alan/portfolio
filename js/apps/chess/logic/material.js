/*
 * logic/material.js — what each side has captured and who is ahead. Pure functions over
 * ChessGame.history(), so they are easy to test.
 */

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * @param {{color:string, captured:string|null}[]} moves
 * @returns {{ w: string[], b: string[] }} the pieces captured BY white and BY black, biggest first
 */
export function capturedBy(moves) {
  const got = { w: [], b: [] };
  moves.forEach((move) => { if (move.captured) got[move.color].push(move.captured); });
  const byValue = (a, b) => VALUE[b] - VALUE[a];
  got.w.sort(byValue);
  got.b.sort(byValue);
  return got;
}

/** Points white is ahead by (negative when black is ahead). */
export function balance(got) {
  const total = (list) => list.reduce((sum, piece) => sum + VALUE[piece], 0);
  return total(got.w) - total(got.b);
}
