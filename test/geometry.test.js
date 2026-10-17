const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../src/main/geometry');

test('stepSize snaps, steps and clamps', () => {
  assert.equal(g.stepSize(128, 1), 144);
  assert.equal(g.stepSize(128, -1), 112);
  assert.equal(g.stepSize(256, 1), 256);
  assert.equal(g.stepSize(64, -1), 64);
  assert.equal(g.stepSize(130, 0), 128);
  assert.equal(g.stepSize(9999, 0), 256);
  assert.equal(g.stepSize(NaN, 0), 64);
});

test('resizeAnchored keeps the bottom-center fixed', () => {
  const b = { x: 100, y: 100, width: 128, height: 128 };
  const r = g.resizeAnchored(b, 160);
  assert.deepEqual(g.bottomCenter(r), g.bottomCenter(b));
  assert.deepEqual(r, { x: 84, y: 68, width: 160, height: 160 });
});

test('bottomCenter round-trips', () => {
  const b = g.boundsFromBottomCenter({ x: 500, y: 800 }, 128);
  assert.deepEqual(b, { x: 436, y: 672, width: 128, height: 128 });
  assert.deepEqual(g.bottomCenter(b), { x: 500, y: 800 });
});

const main = { x: 0, y: 25, width: 1440, height: 875 };
const right = { x: 1440, y: 0, width: 1920, height: 1080 };

test('clampToWorkAreas keeps bounds inside the most-overlapping area', () => {
  assert.deepEqual(g.clampToWorkAreas({ x: 100, y: 100, width: 128, height: 128 }, [main]), { x: 100, y: 100, width: 128, height: 128 });
  assert.deepEqual(g.clampToWorkAreas({ x: -50, y: 0, width: 128, height: 128 }, [main]), { x: 0, y: 25, width: 128, height: 128 });
  assert.deepEqual(g.clampToWorkAreas({ x: 1400, y: 850, width: 128, height: 128 }, [main]), { x: 1312, y: 772, width: 128, height: 128 });
  // Straddling two displays: goes to the one with more overlap.
  assert.equal(g.clampToWorkAreas({ x: 1400, y: 500, width: 128, height: 128 }, [main, right]).x, 1440);
});

test('clampToWorkAreas brings a lost window to the nearest display', () => {
  const lost = { x: 5000, y: 300, width: 128, height: 128 };
  assert.deepEqual(g.clampToWorkAreas(lost, [main, right]), { x: 3232, y: 300, width: 128, height: 128 });
  assert.deepEqual(g.clampToWorkAreas(lost, []), lost);
});
