// Run with: node --test tests/chess.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { judge, winChance } from '../js/apps/chess/logic/judge.js';
import { horseOutline } from '../js/apps/chess/render/horse.js';

test('winChance is 50 for an equal position and grows with the score', () => {
  assert.ok(Math.abs(winChance(0) - 50) < 0.001);
  assert.ok(winChance(300) > winChance(100));
  assert.ok(winChance(-300) < 50);
});

test('judge: dropping a queen from an equal position is a blunder, a tiny slip is nothing', () => {
  assert.equal(judge({ cp: 20, mate: null }, { cp: 900, mate: null }), 'blunder');
  assert.equal(judge({ cp: 20, mate: null }, { cp: -10, mate: null }), null);
});

test('judge: mistakes and inaccuracies sit between', () => {
  assert.equal(judge({ cp: 50, mate: null }, { cp: 300, mate: null }), 'mistake');
  assert.equal(judge({ cp: 50, mate: null }, { cp: 150, mate: null }), 'inaccuracy');
});

test('judge: a move that changes nothing when already lost is not a blunder', () => {
  assert.equal(judge({ cp: -900, mate: null }, { cp: 1000, mate: null }), null);
});

test('judge: missing a forced mate is reported, keeping it is not', () => {
  assert.equal(judge({ cp: 9998, mate: 2 }, { cp: -100, mate: null }), 'missedMate');
  assert.equal(judge({ cp: 9998, mate: 2 }, { cp: -9999, mate: -1 }), null);
});

test('judge: no analysis, no verdict', () => {
  assert.equal(judge(null, { cp: 0, mate: null }), null);
});

test('the knight outline is a closed shape with the ear as its highest point', () => {
  const points = horseOutline();
  assert.ok(points.length > 20);
  const top = points.reduce((best, p) => (p[1] > best[1] ? p : best));
  assert.ok(top[1] > 1 && top[0] > 0);                  // the ear tip, toward the front
  assert.ok(points.every(([x, y]) => Math.abs(x) < 0.6 && y >= 0.15 && y < 1.2));
});

import { capturedBy, balance } from '../js/apps/chess/logic/material.js';

test('capturedBy lists each side\'s captures, biggest first, and balance says who is ahead', () => {
  const got = capturedBy([
    { color: 'w', captured: 'p' }, { color: 'b', captured: null }, { color: 'w', captured: 'q' }, { color: 'b', captured: 'n' },
  ]);
  assert.deepEqual(got.w, ['q', 'p']);
  assert.deepEqual(got.b, ['n']);
  assert.equal(balance(got), 7);                         // 9 + 1 - 3
  assert.equal(balance(capturedBy([])), 0);
});
