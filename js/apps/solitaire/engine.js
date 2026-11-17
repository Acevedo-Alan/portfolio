/*
 * apps/solitaire/engine.js — Klondike rules, no DOM. State is plain data so it can be
 * tested in Node (tests/solitaire.test.mjs).
 *
 *   state = { stock, waste, foundations: [4 piles], tableau: [7 piles], moves }
 *   card  = { suit: 'S'|'H'|'D'|'C', rank: 1..13, up: boolean }
 *
 * A "place" names where cards come from or go to:
 *   { zone: 'waste' }                          the top waste card
 *   { zone: 'foundation', index: 0..3 }        the top card of that foundation
 *   { zone: 'tableau', index: 0..6, count? }   the top `count` (default 1) cards of that pile
 * Every move function returns true when it changed the state, false when the move is illegal.
 */

export const SUITS = ['S', 'H', 'D', 'C'];
export const isRed = (card) => card.suit === 'H' || card.suit === 'D';

export function newDeck() {
  return SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, i) => ({ suit, rank: i + 1, up: false })));
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

export function deal(random = Math.random) {
  const deck = shuffle(newDeck(), random);
  const tableau = Array.from({ length: 7 }, (_, col) => {
    const pile = deck.splice(0, col + 1);
    pile[pile.length - 1].up = true;
    return pile;
  });
  return { stock: deck, waste: [], foundations: [[], [], [], []], tableau, moves: 0 };
}

const top = (pile) => pile[pile.length - 1];

// ---------- Rules ----------

export const canGoToFoundation = (card, pile) => (pile.length === 0
  ? card.rank === 1
  : top(pile).suit === card.suit && card.rank === top(pile).rank + 1);

export const canGoToTableau = (card, pile) => (pile.length === 0
  ? card.rank === 13
  : isRed(top(pile)) !== isRed(card) && card.rank === top(pile).rank - 1);

export const isWon = (state) => state.foundations.every((pile) => pile.length === 13);

// ---------- Reading a place ----------

/** The cards a `from` place would pick up (a view into the state, not a copy). */
function picked(state, from) {
  if (from.zone === 'waste') return state.waste.length ? [top(state.waste)] : [];
  if (from.zone === 'foundation') { const pile = state.foundations[from.index]; return pile.length ? [top(pile)] : []; }
  const pile = state.tableau[from.index];
  const count = from.count || 1;
  const cards = pile.slice(pile.length - count);
  return cards.length === count && cards.every((c) => c.up) && runIsValid(cards) ? cards : [];
}

/** A tableau run moves together only if it descends in rank, alternating colors. */
const runIsValid = (cards) => cards.every((c, i) => i === 0 || (isRed(c) !== isRed(cards[i - 1]) && c.rank === cards[i - 1].rank - 1));

function take(state, from, count) {
  if (from.zone === 'waste') return state.waste.splice(-1, 1);
  if (from.zone === 'foundation') return state.foundations[from.index].splice(-1, 1);
  const pile = state.tableau[from.index];
  const taken = pile.splice(pile.length - count, count);
  if (pile.length) top(pile).up = true;                   // reveal the card that was underneath
  return taken;
}

// ---------- Moves ----------

/** Turns a stock card onto the waste; with an empty stock, recycles the waste (face down). */
export function drawFromStock(state) {
  if (state.stock.length) {
    const card = state.stock.pop();
    card.up = true;
    state.waste.push(card);
  } else if (state.waste.length) {
    state.stock = state.waste.reverse().map((card) => ({ ...card, up: false }));
    state.waste = [];
  } else {
    return false;
  }
  state.moves++;
  return true;
}

export function move(state, from, to) {
  const cards = picked(state, from);
  if (!cards.length) return false;
  const count = cards.length;
  if (to.zone === 'foundation') {
    if (count !== 1 || !canGoToFoundation(cards[0], state.foundations[to.index])) return false;
    if (from.zone === 'foundation' && from.index === to.index) return false;
    state.foundations[to.index].push(...take(state, from, 1));
  } else if (to.zone === 'tableau') {
    if (from.zone === 'tableau' && from.index === to.index) return false;
    if (!canGoToTableau(cards[0], state.tableau[to.index])) return false;
    state.tableau[to.index].push(...take(state, from, count));
  } else {
    return false;
  }
  state.moves++;
  return true;
}

/** Double-click: the foundation that would take this card, or -1. */
export function foundationFor(state, from) {
  const cards = picked(state, from);
  if (cards.length !== 1) return -1;
  return state.foundations.findIndex((pile) => canGoToFoundation(cards[0], pile));
}

export function autoToFoundation(state, from) {
  const index = foundationFor(state, from);
  return index >= 0 && move(state, from, { zone: 'foundation', index });
}
