const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const config = require('../src/main/config');

function tmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-config-'));
  const file = path.join(dir, 'config.json');
  if (content !== undefined) fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}

test('load merges overrides of the right type and cleans positions', () => {
  const file = tmpFile({
    port: 5000,
    debugLog: 'yes',
    catSize: 160,
    positions: { app: { x: 10, y: 20 }, bad: { x: 'a', y: 1 }, worse: null, inf: { x: Infinity, y: 0 } },
  });
  const c = config.load(file);
  assert.equal(c.port, 5000);
  assert.equal(c.debugLog, false);
  assert.equal(c.catSize, 160);
  assert.deepEqual(c.positions, { app: { x: 10, y: 20 } });
});

test('load falls back to defaults for missing or broken files', () => {
  assert.equal(config.load(tmpFile()).port, config.DEFAULTS.port);
  assert.deepEqual(config.load(tmpFile('{nope')).positions, {});
});

test('save merges size and positions and keeps other keys', () => {
  const file = tmpFile({ port: 5000, custom: 'keep me', catSize: 128 });
  assert.equal(config.save({ catSize: 192, positions: { app: { x: 1, y: 2 } }, port: 1 }, file), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
    port: 5000,
    custom: 'keep me',
    catSize: 192,
    positions: { app: { x: 1, y: 2 } },
  });
});

test('save creates a missing file and leaves broken JSON alone', () => {
  const missing = tmpFile();
  assert.equal(config.save({ catSize: 64 }, missing), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(missing, 'utf8')), { catSize: 64 });

  const broken = tmpFile('{nope');
  assert.equal(config.save({ catSize: 64 }, broken), false);
  assert.equal(fs.readFileSync(broken, 'utf8'), '{nope');
});
