// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../js/apps/solitaire/engine.js';

const card = (suit, rank, up = true) => ({ suit, rank, up });
const table = (piles = [], overrides = {}) => ({
  tableau: [...piles, ...Array.from({ length: 10 - piles.length }, () => [])],
  stock: [], completed: [], suits: 1, moves: 0, score: engine.START_SCORE, ...overrides,
});
const king2ace = (suit) => Array.from({ length: 13 }, (_, i) => card(suit, 13 - i));

test('deal: 10 columns (4x6, 6x5), last card face up, 5 stock deals, 104 cards, score 500', () => {
  for (const suits of [1, 2, 4]) {
    const state = engine.deal(Math.random, suits);
    assert.deepEqual(state.tableau.map((p) => p.length), [6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
    assert.ok(state.tableau.every((p) => p.at(-1).up && p.slice(0, -1).every((c) => !c.up)));
    assert.deepEqual(state.stock.map((d) => d.length), [10, 10, 10, 10, 10]);
    assert.equal(state.tableau.flat().length + state.stock.flat().length, 104);
    assert.equal(state.score, 500);
    assert.equal(new Set(state.tableau.flat().concat(state.stock.flat()).map((c) => c.suit)).size, suits);
  }
});

test('difficulty decides the suits: 8 sets of spades / 4+4 spades and hearts / 2 of each suit', () => {
  assert.deepEqual(engine.suitSets(1), Array(8).fill('S'));
  assert.deepEqual(engine.suitSets(2), ['S', 'S', 'S', 'S', 'H', 'H', 'H', 'H']);
  assert.deepEqual(engine.suitSets(4), ['S', 'S', 'H', 'H', 'D', 'D', 'C', 'C']);
});

test('a card goes on a card one rank higher, of any suit', () => {
  const state = table([[card('S', 7)], [card('H', 6)]]);
  assert.equal(engine.move(state, { col: 1, position: 0 }, 0).ok, true);
  assert.equal(state.tableau[0].length, 2);
  assert.equal(state.score, 499);
  assert.equal(state.moves, 1);
});

test('a wrong rank is refused and changes nothing', () => {
  const state = table([[card('S', 9)], [card('S', 6)]]);
  assert.equal(engine.move(state, { col: 1, position: 0 }, 0).ok, false);
  assert.equal(state.score, 500);
  assert.equal(state.tableau[1].length, 1);
});

test('only a same-suit descending run can be picked up', () => {
  const pile = [card('S', 9), card('S', 8), card('H', 7), card('H', 6)];
  assert.equal(engine.isRun(pile, 2), true);         // 7♥ 6♥
  assert.equal(engine.isRun(pile, 1), false);        // 8♠ 7♥ mixes suits
  assert.equal(engine.isRun([card('S', 5, false), card('S', 4)], 0), false);   // face-down
});

test('a block moves together onto a higher card', () => {
  const state = table([[card('D', 9)], [card('H', 8), card('H', 7), card('H', 6)]]);
  assert.equal(engine.move(state, { col: 1, position: 0 }, 0).ok, true);
  assert.equal(state.tableau[0].length, 4);
});

test('an empty column accepts any card or run', () => {
  const state = table([[card('S', 3), card('S', 2)]]);
  assert.equal(engine.move(state, { col: 0, position: 0 }, 5).ok, true);
  assert.equal(state.tableau[5].length, 2);
});

test('moving a card turns over the one beneath', () => {
  const state = table([[card('S', 12, false), card('S', 4)], [card('H', 5)]]);
  engine.move(state, { col: 0, position: 1 }, 1);
  assert.equal(state.tableau[0][0].up, true);
});

test('completing K..A of one suit removes it, scores +100 and flips the card below', () => {
  const run = king2ace('S');
  const state = table([[card('H', 2, false), ...run.slice(0, 12)], [card('S', 1)]]);
  const result = engine.move(state, { col: 1, position: 0 }, 0);
  assert.equal(result.completed, true);
  assert.equal(state.tableau[0].length, 1);
  assert.equal(state.tableau[0][0].up, true);
  assert.deepEqual(state.completed, ['S']);
  assert.equal(state.score, 500 - 1 + 100);
});

test('a K..A run of mixed suits is not removed', () => {
  const run = king2ace('S');
  run[5] = card('H', run[5].rank);
  const state = table([run.slice(0, 12), [card('S', 1)]]);
  engine.move(state, { col: 1, position: 0 }, 0);
  assert.equal(state.completed.length, 0);
  assert.equal(state.tableau[0].length, 13);
});

test('deal10 puts a face-up card on every column', () => {
  const state = engine.deal(Math.random, 1);
  const result = engine.deal10(state);
  assert.equal(result.ok, true);
  assert.equal(state.stock.length, 4);
  assert.deepEqual(state.tableau.map((p) => p.length), [7, 7, 7, 7, 6, 6, 6, 6, 6, 6]);
  assert.ok(state.tableau.every((p) => p.at(-1).up));
});

test('deal10 is refused while any column is empty, and with no stock', () => {
  const state = engine.deal(Math.random, 1);
  state.tableau[3] = [];
  assert.deepEqual(engine.deal10(state), { ok: false, reason: 'empty-column' });
  assert.equal(state.stock.length, 5);
  const none = table([[card('S', 1)], [card('S', 1)], [card('S', 1)], [card('S', 1)], [card('S', 1)], [card('S', 1)], [card('S', 1)], [card('S', 1)], [card('S', 1)], [card('S', 1)]]);
  assert.deepEqual(engine.deal10(none), { ok: false, reason: 'no-stock' });
});

test('winning takes all 8 completed runs', () => {
  assert.equal(engine.isWon(table([], { completed: Array(8).fill('S') })), true);
  assert.equal(engine.isWon(table([], { completed: Array(7).fill('S') })), false);
});

test('hints list legal moves and prefer same suit / uncovering a card', () => {
  const state = table([[card('D', 2, false), card('S', 6)], [card('S', 7)], [card('H', 7)]]);
  const found = engine.hints(state);
  assert.ok(found.length >= 2);
  assert.deepEqual(found[0].from, { col: 0, position: 1 });
  assert.equal(found[0].to, 1);                         // same suit and uncovers a card
  assert.ok(found.every((h) => engine.canDrop(state, h.from, h.to)));
});

test('hint order: same-suit stacking, then uncovering, then empty columns; never a whole column to an empty one', () => {
  const state = table([
    [card('D', 2, false), card('C', 5)],        // 0: 5♣ uncovers a card
    [card('S', 6)],                              // 1
    [card('H', 6)],                              // 2
    [card('S', 5)],                              // 3: 5♠ stacks on 6♠ (same suit)
  ]);
  const found = engine.hints(state);
  assert.deepEqual(found[0].from, { col: 3, position: 0 });
  assert.equal(found[0].to, 1);
  assert.ok(found.every((h) => !(h.from.position === 0 && state.tableau[h.to].length === 0)));
  const toEmpty = found.findIndex((h) => state.tableau[h.to].length === 0);
  const uncover = found.findIndex((h) => h.from.col === 0);
  assert.ok(uncover < toEmpty);
});

test('move and deal10 report the runs they completed', () => {
  const run = king2ace('S');
  const state = table([run.slice(0, 12), [card('S', 1)]]);
  const result = engine.move(state, { col: 1, position: 0 }, 0);
  assert.deepEqual(result.runs, [{ col: 0, suit: 'S' }]);
});

test('no hints on a dead position', () => {
  const state = table([[card('S', 9)], [card('S', 5)]]);
  assert.deepEqual(engine.hints(state).filter((h) => state.tableau[h.to].length), []);
});
