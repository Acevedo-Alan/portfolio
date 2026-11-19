/*
 * apps/solitaire/engine.js — Spider Solitaire rules (Windows XP's), no DOM. State is plain data so it
 * can be tested in Node (tests/solitaire.test.mjs).
 *
 *   state = { tableau: [10 piles], stock: [deals of 10 cards], completed: [suits], suits, moves, score }
 *   card  = { suit: 'S'|'H'|'D'|'C', rank: 1..13, up: boolean }
 *
 * Difficulty is the number of suits (1, 2 or 4); the 104 cards are 8 sets of 13 spread over them.
 * Rules:
 *   - a card (or block) can be dropped on a card exactly one rank higher, of any suit;
 *   - only a descending run of ONE suit can be picked up together;
 *   - an empty column takes any card or valid run;
 *   - dealing puts one face-up card on every column and is refused while a column is empty;
 *   - 13 cards K..A of one suit in a row leave the table (+100) and the card under them turns over;
 *   - score starts at 500, every move costs 1 (Undo too).
 * `move` and `deal10` return { ok: true, ... } or { ok: false, reason }.
 */

export const SUITS = ['S', 'H', 'D', 'C'];
export const START_SCORE = 500;
export const COLUMNS = 10;
export const isRed = (card) => card.suit === 'H' || card.suit === 'D';

/** The suit of each of the 8 sets for a difficulty (1, 2 or 4 suits). */
export function suitSets(suits) {
  const per = 8 / suits;
  return Array.from({ length: 8 }, (_, i) => SUITS[Math.floor(i / per)]);
}

export function newDeck(suits = 1) {
  return suitSets(suits).flatMap((suit) => Array.from({ length: 13 }, (_, i) => ({ suit, rank: i + 1, up: false })));
}

/** Fisher–Yates; `random` is injectable for tests. */
export function shuffle(cards, random = Math.random) {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** 10 columns (four of 6 cards, six of 5; only the last face up) and 5 stock deals of 10. */
export function deal(random = Math.random, suits = 1) {
  const deck = shuffle(newDeck(suits), random);
  const tableau = Array.from({ length: COLUMNS }, (_, col) => deck.splice(0, col < 4 ? 6 : 5));
  tableau.forEach((pile) => { pile[pile.length - 1].up = true; });
  const stock = Array.from({ length: 5 }, () => deck.splice(0, COLUMNS));
  return { tableau, stock, completed: [], suits, moves: 0, score: START_SCORE };
}

export const isWon = (state) => state.completed.length === 8;

/** True when cards from `position` to the end of the column form a pick-up-able run. */
export function isRun(pile, position) {
  const cards = pile.slice(position);
  return cards.length > 0 && cards.every((c, i) => c.up && (i === 0 || (c.suit === cards[i - 1].suit && c.rank === cards[i - 1].rank - 1)));
}

/** Can the run starting at `from.position` of column `from.col` be dropped on column `to`? */
export function canDrop(state, from, to) {
  if (from.col === to) return false;
  const source = state.tableau[from.col];
  if (!isRun(source, from.position)) return false;
  const target = state.tableau[to];
  if (!target.length) return true;
  const top = target[target.length - 1];
  return top.up && top.rank === source[from.position].rank + 1;
}

/** Turns over the card exposed at the end of a column, and removes a finished K..A run. Returns the run's suit, or null. */
function settle(state, col) {
  const pile = state.tableau[col];
  let removed = null;
  if (pile.length >= 13) {
    const tail = pile.slice(-13);
    if (tail[0].rank === 13 && isRun(tail, 0)) {
      pile.splice(-13);
      state.completed.push(tail[0].suit);
      state.score += 100;
      removed = tail[0].suit;
    }
  }
  if (pile.length && !pile[pile.length - 1].up) pile[pile.length - 1].up = true;
  return removed;
}

export function move(state, from, to) {
  if (!canDrop(state, from, to)) return { ok: false, reason: 'illegal' };
  const cards = state.tableau[from.col].splice(from.position);
  state.tableau[to].push(...cards);
  state.moves++;
  state.score -= 1;
  const runs = [];
  settle(state, from.col);
  const suit = settle(state, to);
  if (suit) runs.push({ col: to, suit });
  return { ok: true, completed: runs.length > 0, runs };
}

/** Deals one face-up card to each column from the stock. */
export function deal10(state) {
  if (!state.stock.length) return { ok: false, reason: 'no-stock' };
  if (state.tableau.some((pile) => !pile.length)) return { ok: false, reason: 'empty-column' };
  const row = state.stock.pop();
  row.forEach((card, col) => { state.tableau[col].push({ ...card, up: true }); });
  const runs = [];
  state.tableau.forEach((_, col) => { const suit = settle(state, col); if (suit) runs.push({ col, suit }); });
  return { ok: true, completed: runs.length > 0, runs };
}

/** Undo's price: one point (the caller restores the snapshot first). */
export function chargeUndo(state) {
  state.score -= 1;
}

/**
 * Every legal move, best first, in three tiers: (1) stacking on a card of the same suit (building a run),
 * (2) uncovering a face-down card, (3) anything else, with moves into an empty column last. Moving a whole
 * column onto an empty one is never suggested (it only swaps columns, and would loop forever).
 */
export function hints(state) {
  const found = [];
  state.tableau.forEach((pile, col) => {
    for (let position = 0; position < pile.length; position++) {
      if (!isRun(pile, position)) continue;
      state.tableau.forEach((target, to) => {
        if (!canDrop(state, { col, position }, to)) return;
        const top = target[target.length - 1];
        const card = pile[position];
        if (!top && position === 0) return;
        const uncovers = position > 0 && !pile[position - 1].up;
        let tier = 1;
        if (top && top.suit === card.suit) tier = 3;
        else if (uncovers) tier = 2;
        else if (!top) tier = 0;
        // within a tier: uncovering, then emptying a column, then longer blocks
        const value = tier * 100 + (uncovers ? 20 : 0) + (position === 0 ? 10 : 0) + Math.min(pile.length - position, 9);
        found.push({ from: { col, position }, to, value });
      });
    }
  });
  return found.sort((a, b) => b.value - a.value);
}

export const canDeal = (state) => state.stock.length > 0 && state.tableau.every((pile) => pile.length > 0);
