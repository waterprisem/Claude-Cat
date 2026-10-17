const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readLiveSessions, parseSessionFile } = require('../src/main/liveSessions');

const record = (pid, extra = {}) => JSON.stringify({ pid, sessionId: 'abc-123', cwd: '/Users/me/app', status: 'idle', ...extra });

test('parseSessionFile validates every field', () => {
  assert.deepEqual(parseSessionFile('42.json', record(42, { status: 'busy' })), { pid: 42, sessionId: 'abc-123', cwd: '/Users/me/app', busy: true });
  assert.equal(parseSessionFile('42.json', record(43)), null); // pid must match the file name
  assert.equal(parseSessionFile('x.json', record(42)), null);
  assert.equal(parseSessionFile('42.json', record(42, { sessionId: '../etc' })), null);
  assert.equal(parseSessionFile('42.json', record(42, { cwd: 'relative/path' })), null);
  assert.equal(parseSessionFile('42.json', '{broken'), null);
});

test('readLiveSessions keeps live processes and finds the transcript', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-live-'));
  fs.mkdirSync(path.join(root, 'sessions'));
  fs.mkdirSync(path.join(root, 'projects', '-Users-me-app'), { recursive: true });
  const transcript = path.join(root, 'projects', '-Users-me-app', 'abc-123.jsonl');
  fs.writeFileSync(transcript, '');
  fs.writeFileSync(path.join(root, 'sessions', '42.json'), record(42));
  fs.writeFileSync(path.join(root, 'sessions', '99.json'), record(99, { sessionId: 'dead' }));
  fs.writeFileSync(path.join(root, 'sessions', 'notes.txt'), 'hi');
  const live = readLiveSessions({ root, isAlive: (pid) => pid === 42 });
  assert.deepEqual(live, [{ pid: 42, sessionId: 'abc-123', cwd: '/Users/me/app', busy: false, project: 'app', transcriptPath: transcript }]);
  assert.deepEqual(readLiveSessions({ root: path.join(root, 'missing') }), []);
});
