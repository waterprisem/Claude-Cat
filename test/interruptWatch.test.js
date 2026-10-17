const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createInterruptWatcher, hasInterrupt } = require('../src/main/interruptWatch');

const line = (obj) => JSON.stringify(obj) + '\n';
const userText = (text, extra = {}) => line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, ...extra });
const assistant = (text) => line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });

function setup(initial = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-int-'));
  const file = path.join(root, 'session.jsonl');
  if (initial !== null) fs.writeFileSync(file, initial);
  const hits = [];
  const w = createInterruptWatcher({ intervalMs: 60000, root, onInterrupt: (id) => hits.push(id) });
  return { root, file, hits, w };
}

test('hasInterrupt matches only main-thread user text entries', () => {
  assert.equal(hasInterrupt([userText('[Request interrupted by user]').trim()]), true);
  assert.equal(hasInterrupt([userText('[Request interrupted by user for tool use]').trim()]), true);
  assert.equal(hasInterrupt([userText('[Request interrupted by user]', { isSidechain: true }).trim()]), false);
  assert.equal(hasInterrupt([assistant('[Request interrupted by user]').trim()]), false);
  const toolResult = line({ type: 'user', message: { content: [{ type: 'tool_result', content: '[Request interrupted by user]' }] } });
  assert.equal(hasInterrupt([toolResult.trim()]), false);
  assert.equal(hasInterrupt(['{broken', '']), false);
});

test('reports an interrupt appended after watching starts', () => {
  const { file, hits, w } = setup(assistant('hello'));
  w.watch('s1', file, 1);
  w.poll();
  assert.deepEqual(hits, []);
  fs.appendFileSync(file, assistant('working') + userText('[Request interrupted by user]'));
  w.poll();
  assert.deepEqual(hits, ['s1']);
  assert.equal(w.watching('s1'), false);
  w.stop();
});

test('ignores interrupts written before watching started', () => {
  const { file, hits, w } = setup(userText('[Request interrupted by user]'));
  w.watch('s1', file, 1);
  fs.appendFileSync(file, assistant('more'));
  w.poll();
  assert.deepEqual(hits, []);
  w.stop();
});

test('handles a line split across two polls', () => {
  const { file, hits, w } = setup('');
  w.watch('s1', file, 1);
  const entry = userText('[Request interrupted by user]');
  fs.appendFileSync(file, entry.slice(0, 20));
  w.poll();
  fs.appendFileSync(file, entry.slice(20));
  w.poll();
  assert.deepEqual(hits, ['s1']);
  w.stop();
});

test('a new turn restarts from the current end of the file', () => {
  const { file, hits, w } = setup('');
  w.watch('s1', file, 1);
  fs.appendFileSync(file, userText('[Request interrupted by user]'));
  w.watch('s1', file, 2); // new prompt before the poll: the old Esc belongs to the last turn
  w.poll();
  assert.deepEqual(hits, []);
  w.stop();
});

test('refuses files outside the allowed root and missing files are fine', () => {
  const { hits, w, root } = setup(null);
  w.watch('s1', '/etc/passwd.jsonl', 1);
  assert.equal(w.watching('s1'), false);
  const later = path.join(root, 'later.jsonl');
  w.watch('s2', later, 1);
  w.poll();
  fs.writeFileSync(later, userText('[Request interrupted by user]'));
  w.poll();
  assert.deepEqual(hits, ['s2']);
  w.stop();
});
