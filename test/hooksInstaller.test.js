const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, uninstall, isInstalled, EVENTS, MARKER } = require('../src/main/hooksInstaller');

function tmpSettings(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-hooks-'));
  const file = path.join(dir, 'settings.json');
  if (content !== undefined) fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  return { dir, file, read: () => JSON.parse(fs.readFileSync(file, 'utf8')), backups: () => fs.readdirSync(dir).filter((f) => f.includes('backup')) };
}

const theirHook = { type: 'command', command: 'echo mine' };
const existing = {
  model: 'opus',
  permissions: { allow: ['Bash(ls)'] },
  hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [theirHook] }], Custom: [{ hooks: [theirHook] }] },
};

test('install keeps unrelated settings and hooks, and backs up first', () => {
  const t = tmpSettings(existing);
  const { backupPath } = install(t.file);
  assert.ok(backupPath && fs.existsSync(backupPath));
  assert.deepEqual(JSON.parse(fs.readFileSync(backupPath, 'utf8')), existing);

  const s = t.read();
  assert.equal(s.model, 'opus');
  assert.deepEqual(s.permissions, existing.permissions);
  assert.deepEqual(s.hooks.Custom, existing.hooks.Custom);
  assert.deepEqual(s.hooks.PreToolUse[0], existing.hooks.PreToolUse[0]);
  for (const event of EVENTS) {
    const ours = s.hooks[event].flatMap((g) => g.hooks).filter((h) => h.command.endsWith(MARKER));
    assert.equal(ours.length, 1, event);
    assert.equal(ours[0].timeout, 5);
    assert.match(ours[0].command, /^curl .*127\.0\.0\.1:47821\/event .*\|\| true # claude-cat$/);
  }
  assert.ok(isInstalled(t.file));
});

test('installing twice does not duplicate entries', () => {
  const t = tmpSettings(existing);
  install(t.file);
  install(t.file);
  const s = t.read();
  for (const event of EVENTS) {
    assert.equal(s.hooks[event].flatMap((g) => g.hooks).filter((h) => h.command.endsWith(MARKER)).length, 1);
  }
});

test('uninstall restores the original content', () => {
  const t = tmpSettings(existing);
  install(t.file);
  uninstall(t.file);
  assert.deepEqual(t.read(), existing);
  assert.ok(!isInstalled(t.file));
  assert.equal(t.backups().length, 2);
});

test('uninstall drops an empty hooks object', () => {
  const t = tmpSettings({ theme: 'dark' });
  install(t.file);
  uninstall(t.file);
  assert.deepEqual(t.read(), { theme: 'dark' });
});

test('missing settings file is created without a backup', () => {
  const t = tmpSettings();
  const { backupPath } = install(t.file);
  assert.equal(backupPath, null);
  assert.ok(isInstalled(t.file));
  assert.deepEqual(uninstall(path.join(t.dir, 'nope.json')), { backupPath: null });
});

test('invalid JSON is left untouched', () => {
  const t = tmpSettings('{ "model": "opus", }');
  assert.throws(() => install(t.file));
  assert.throws(() => uninstall(t.file));
  assert.equal(fs.readFileSync(t.file, 'utf8'), '{ "model": "opus", }');
  assert.equal(t.backups().length, 0);
  assert.ok(!isInstalled(t.file));
});

test('a group mixing their hook and ours keeps theirs', () => {
  const t = tmpSettings({ hooks: { Stop: [{ hooks: [theirHook, { type: 'command', command: `x ${MARKER}` }] }] } });
  uninstall(t.file);
  assert.deepEqual(t.read(), { hooks: { Stop: [{ hooks: [theirHook] }] } });
});
