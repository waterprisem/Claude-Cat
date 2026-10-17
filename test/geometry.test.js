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

test('layoutWindow puts the bubble zone above the cat, centered', () => {
  const cat = { x: 600, y: 500, width: 128, height: 128 };
  const l = g.layoutWindow(cat, main);
  assert.deepEqual(l.window, { x: 534, y: 416, width: 260, height: 212 });
  assert.deepEqual(l.cat, { x: 66, y: 84 });
  assert.equal(l.below, false);
});

test('layoutWindow flips the zone below near the top of the screen', () => {
  const l = g.layoutWindow({ x: 600, y: 60, width: 128, height: 128 }, main);
  assert.equal(l.below, true);
  assert.deepEqual(l.window, { x: 534, y: 60, width: 260, height: 212 });
  assert.deepEqual(l.cat, { x: 66, y: 0 });
});

test('layoutWindow shifts the window sideways to stay on screen', () => {
  const left = g.layoutWindow({ x: 0, y: 500, width: 64, height: 64 }, main);
  assert.equal(left.window.x, 0);
  assert.deepEqual(left.cat, { x: 0, y: 84 });
  const right = g.layoutWindow({ x: 1312, y: 500, width: 128, height: 128 }, main);
  assert.equal(right.window.x, 1440 - 260);
  assert.equal(right.window.x + right.cat.x, 1312);
  // A cat wider than the minimum sets the window width.
  assert.equal(g.layoutWindow({ x: 600, y: 500, width: 256, height: 256 }, main, { width: 200 }).window.width, 256);
});

test('pickWorkArea prefers overlap, then distance', () => {
  assert.equal(g.pickWorkArea({ x: 1500, y: 10, width: 10, height: 10 }, [main, right]), right);
  assert.equal(g.pickWorkArea({ x: -900, y: 10, width: 10, height: 10 }, [main, right]), main);
});

test('resizeFromCorner keeps the top-left and snaps the size', () => {
  const b = { x: 100, y: 100, width: 128, height: 128 };
  assert.deepEqual(g.resizeFromCorner(b, 32, 32), { x: 100, y: 100, width: 160, height: 160 });
  assert.equal(g.resizeFromCorner(b, 10, 0).width, 128); // a small move snaps back
  assert.equal(g.resizeFromCorner(b, -500, -500).width, 64);
  assert.equal(g.resizeFromCorner(b, 500, 500).width, 256);
});

test('staggerSpot keeps a free spot and steps left, then up, around occupied ones', () => {
  const b = { x: 1288, y: 747, width: 128, height: 128 };
  assert.deepEqual(g.staggerSpot(b, [], main), b);
  assert.deepEqual(g.staggerSpot(b, [b], main), { ...b, x: 1148 });
  const row = [b, { ...b, x: 1148 }];
  assert.deepEqual(g.staggerSpot(b, row, main), { ...b, x: 1008 });
  // A full row moves up one row.
  const narrow = { x: 0, y: 0, width: 300, height: 875 };
  const c = { x: 100, y: 600, width: 128, height: 128 };
  assert.deepEqual(g.staggerSpot(c, [c], narrow), { ...c, y: 460 });
});
