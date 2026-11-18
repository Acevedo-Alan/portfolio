// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../js/apps/solitaire/engine.js';

const card = (suit, rank, up = true) => ({ suit, rank, up });
const empty = (overrides = {}) => ({ stock: [], waste: [], foundations: [[], [], [], []], tableau: [[], [], [], [], [], [], []], moves: 0, score: 0, draw: 1, ...overrides });

test('deal builds 7 columns, 24 stock cards and a face-up card on each column', () => {
  const state = engine.deal();
  assert.deepEqual(state.tableau.map((pile) => pile.length), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(state.stock.length, 24);
  assert.ok(state.tableau.every((pile) => pile[pile.length - 1].up && pile.slice(0, -1).every((c) => !c.up)));
  assert.equal(state.score, 0);
});

test('draw three turns over three cards, or what is left', () => {
  const state = engine.deal(Math.random, 3);
  engine.drawFromStock(state);
  assert.equal(state.waste.length, 3);
  assert.equal(state.stock.length, 21);
  const few = empty({ stock: [card('S', 1, false), card('S', 2, false)], draw: 3 });
  engine.drawFromStock(few);
  assert.equal(few.waste.length, 2);
});

test('recycling the waste costs 100 points with draw one, and never goes below zero', () => {
  const state = empty({ waste: [card('S', 5)], score: 150 });
  engine.drawFromStock(state);
  assert.equal(state.score, 50);
  assert.equal(state.stock.length, 1);
  const poor = empty({ waste: [card('S', 5)], score: 30 });
  engine.drawFromStock(poor);
  assert.equal(poor.score, 0);
});

test('scoring: waste to foundation +10, waste to tableau +5, revealing a card +5, foundation back to tableau −15', () => {
  const a = empty({ waste: [card('H', 1)] });
  assert.ok(engine.move(a, { zone: 'waste' }, { zone: 'foundation', index: 0 }));
  assert.equal(a.score, 10);

  const b = empty({ waste: [card('H', 5)], tableau: [[card('S', 6)], [], [], [], [], [], []] });
  assert.ok(engine.move(b, { zone: 'waste' }, { zone: 'tableau', index: 0 }));
  assert.equal(b.score, 5);

  const c = empty({ tableau: [[card('S', 9, false), card('H', 1)], [], [], [], [], [], []] });
  assert.ok(engine.move(c, { zone: 'tableau', index: 0 }, { zone: 'foundation', index: 0 }));
  assert.equal(c.score, 15);                                  // +10 to the foundation, +5 for the card it uncovered

  const d = empty({ foundations: [[card('H', 1), card('H', 2)], [], [], []], tableau: [[card('S', 3)], [], [], [], [], [], []] });
  d.score = 20;
  assert.ok(engine.move(d, { zone: 'foundation', index: 0 }, { zone: 'tableau', index: 0 }));
  assert.equal(d.score, 5);
});

test('illegal moves change nothing', () => {
  const state = empty({ waste: [card('H', 5)], tableau: [[card('H', 6)], [], [], [], [], [], []] });
  assert.equal(engine.move(state, { zone: 'waste' }, { zone: 'tableau', index: 0 }), false);
  assert.equal(state.score, 0);
  assert.equal(state.moves, 0);
});
