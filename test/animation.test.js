const test = require('node:test');
const assert = require('node:assert/strict');
const { modeFor, nextStep } = require('../src/renderer/animation');
const { DEFAULTS: timing } = require('../src/main/config');

function run(mode, count, steps, random = () => 0.5) {
  const out = [];
  let step = 0;
  for (let i = 0; i < steps; i++) {
    const r = nextStep(mode, step, { count, timing, random });
    out.push(r);
    step = r.next;
  }
  return out;
}

test('modeFor', () => {
  assert.equal(modeFor('coding'), 'coding');
  assert.equal(modeFor('waiting'), 'idle');
  assert.equal(modeFor('done'), 'idle');
});

test('coding loops all frames at codingFps', () => {
  const out = run('coding', 3, 7);
  assert.deepEqual(out.map((r) => r.frame), [0, 1, 2, 0, 1, 2, 0]);
  for (const r of out) assert.equal(r.delayMs, 1000 / timing.codingFps);
});

test('idle hold stays within the configured range', () => {
  assert.equal(nextStep('idle', 0, { count: 8, timing, random: () => 0 }).delayMs, timing.idleHoldMinMs);
  const high = nextStep('idle', 0, { count: 8, timing, random: () => 0.999999 }).delayMs;
  assert.ok(high < timing.idleHoldMaxMs && high > timing.idleHoldMaxMs - 1);
});

test('idle blinks frames 1..7 once at blinkFps, then rests', () => {
  const out = run('idle', 8, 10);
  assert.deepEqual(out.map((r) => r.frame), [0, 1, 2, 3, 4, 5, 6, 7, 0, 1]);
  assert.equal(out[0].delayMs, (timing.idleHoldMinMs + timing.idleHoldMaxMs) / 2);
  for (const r of out.slice(1, 8)) assert.equal(r.delayMs, 1000 / timing.blinkFps);
});

test('out-of-range steps and empty sets are safe', () => {
  assert.equal(nextStep('coding', 5, { count: 3, timing }).frame, 2);
  assert.deepEqual(nextStep('idle', 0, { count: 0, timing }), { frame: 0, delayMs: 1000, next: 0 });
  assert.equal(nextStep('idle', 0, { count: 1, timing, random: () => 0 }).next, 0);
});
