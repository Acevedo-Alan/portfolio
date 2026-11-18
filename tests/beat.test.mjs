import test from 'node:test';
import assert from 'node:assert/strict';
import { createBeatDetector } from '../js/apps/media/beat.js';

// A kick every 0.5 s (120 BPM) at 60 fps: loud low bins on the kick frame, quiet otherwise.
function run(seconds, bpmPeriod) {
  const beats = createBeatDetector();
  const hits = [];
  const dt = 1 / 60;
  for (let f = 0; f < seconds * 60; f++) {
    const t = f * dt;
    const onKick = (t % bpmPeriod) < dt * 3;
    const freq = new Uint8Array(256).fill(20);
    if (onKick) for (let i = 0; i < 8; i++) freq[i] = 250;
    else for (let i = 0; i < 8; i++) freq[i] = 60;
    if (beats.update(freq, dt).hit) hits.push(t);
  }
  return hits;
}

test('detects a steady kick without double triggers', () => {
  const hits = run(8, 0.5);
  assert.ok(hits.length >= 10 && hits.length <= 16, `got ${hits.length}`);
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i] - hits[i - 1] >= 0.24);
});

test('silence never beats', () => {
  const beats = createBeatDetector();
  for (let f = 0; f < 300; f++) assert.equal(beats.update(new Uint8Array(256), 1 / 60).hit, false);
});
