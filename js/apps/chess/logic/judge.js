/*
 * logic/judge.js — decides whether a move was a mistake, comparing the engine's judgment of the
 * position before the move with its judgment of the position after it.
 * Pure functions, no DOM and no engine: easy to test.
 *
 * It uses "winning chances" (the same curve lichess uses) instead of raw centipawns, so giving
 * away a pawn when you are already lost is not called a blunder, but dropping a queen is.
 */

/** Winning chances for the side the score is for, from 0 to 100. */
export function winChance(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1500, Math.min(1500, cp)))) - 1);
}

/**
 * @param {{cp:number, mate:number|null}} before analysis of the position the player moved from (their side to move)
 * @param {{cp:number, mate:number|null}} after  analysis of the position after the move (the opponent's side to move)
 * @returns {'blunder'|'mistake'|'inaccuracy'|'missedMate'|null}
 */
export function judge(before, after) {
  if (!before || !after) return null;
  const mine = -after.cp;                                   // the same position, seen by the player who moved
  const hadMate = before.mate !== null && before.mate > 0;
  const stillMate = after.mate !== null && after.mate < 0;  // the opponent is the one getting mated
  if (hadMate && !stillMate) return 'missedMate';
  const loss = winChance(before.cp) - winChance(mine);
  if (loss >= 30) return 'blunder';
  if (loss >= 20) return 'mistake';
  if (loss >= 10) return 'inaccuracy';
  return null;
}
