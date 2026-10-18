const test = require('node:test');
const assert = require('node:assert/strict');
const { maskFromBitmap, unionMasks, dilate, maskExtent } = require('../src/main/hitMask');
const { hitMask } = require('../src/renderer/hit');

// w*h RGBA buffer, opaque where fn(x, y) is true.
function bitmap(w, h, fn) {
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fn(x, y)) buf[(y * w + x) * 4 + 3] = 255;
  return buf;
}

test('maskFromBitmap marks cells containing opaque pixels', () => {
  const buf = bitmap(8, 8, (x, y) => x >= 4 && y < 4); // top-right quadrant
  assert.deepEqual(Array.from(maskFromBitmap(buf, 8, 8, 2)), [0, 1, 0, 0]);
});

test('alpha at or below the threshold is transparent', () => {
  const buf = Buffer.alloc(4 * 4 * 4);
  buf[3] = 32;
  buf[7] = 33;
  assert.deepEqual(Array.from(maskFromBitmap(buf, 4, 4, 4)).slice(0, 2), [0, 1]);
});

test('unionMasks and dilate', () => {
  const a = Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0, 0]);
  const b = Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(Array.from(unionMasks([a, b])), [1, 0, 0, 0, 0, 0, 0, 0, 1]);
  const center = Uint8Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0]);
  assert.deepEqual(Array.from(dilate(center, 3)), [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(Array.from(dilate(a, 3)), [1, 1, 0, 1, 1, 0, 0, 0, 0]);
});

test('hitMask maps window coordinates onto the grid', () => {
  const mask = [0, 1, 0, 0]; // 2x2, top-right cell
  assert.equal(hitMask(mask, 2, 100, 10, 128, 128), true);
  assert.equal(hitMask(mask, 2, 10, 10, 128, 128), false);
  assert.equal(hitMask(mask, 2, 100, 100, 128, 128), false);
  assert.equal(hitMask(mask, 2, -1, 10, 128, 128), false);
  assert.equal(hitMask(mask, 2, 128, 10, 128, 128), false);
  assert.equal(hitMask(null, 2, 100, 10, 128, 128), false);
  assert.equal(hitMask(mask, 2, 100, 10, 0, 0), false);
});

test('maskExtent finds the top, bottom, left and bottom-right point of the art', () => {
  // 4x4 grid: cells (1,0), (0,2), (2,2), (3,1)
  const mask = new Uint8Array(16);
  for (const [x, y] of [[1, 0], [0, 2], [2, 2], [3, 1]]) mask[y * 4 + x] = 1;
  assert.deepEqual(maskExtent(mask, 4), { top: 0, bottom: 0.75, left: 0, corner: { x: 0.75, y: 0.75 } });
  assert.equal(maskExtent(new Uint8Array(16), 4), null);
});
