const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lastAssistantText, lastAssistantFromJsonl, isAllowedPath } = require('../src/main/transcript');

const assistant = (content, extra = {}) => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content }, ...extra });
const user = (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: text } });

test('finds the last assistant text, skipping bad lines and tool-only entries', () => {
  const data = [
    assistant([{ type: 'text', text: 'old answer' }]),
    user('next'),
    assistant([{ type: 'text', text: 'Part one' }, { type: 'text', text: 'part two' }]),
    '{not json',
    assistant([{ type: 'tool_use', name: 'Bash', input: {} }]),
    assistant([{ type: 'text', text: 'sidechain' }], { isSidechain: true }),
    '',
  ].join('\n');
  assert.equal(lastAssistantFromJsonl(data), 'Part one\npart two');
});

test('string content and no assistant entry', () => {
  assert.equal(lastAssistantFromJsonl(assistant('plain string')), 'plain string');
  assert.equal(lastAssistantFromJsonl(user('hi')), null);
  assert.equal(lastAssistantFromJsonl(''), null);
});

test('only allows .jsonl files under the root', () => {
  const root = path.join(os.homedir(), '.claude');
  assert.ok(isAllowedPath(path.join(root, 'projects', 'x', 'a.jsonl'), root));
  assert.ok(!isAllowedPath(path.join(root, '..', 'secret.jsonl'), root));
  assert.ok(!isAllowedPath('/etc/passwd', root));
  assert.ok(!isAllowedPath('relative/a.jsonl', root));
  assert.ok(!isAllowedPath(path.join(root, 'settings.json'), root));
  assert.ok(!isAllowedPath(null, root));
});

test('reads a real file and returns null on failure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-transcript-'));
  const file = path.join(root, 't.jsonl');
  fs.writeFileSync(file, [user('q'), assistant([{ type: 'text', text: 'All done!' }])].join('\n') + '\n');
  assert.equal(await lastAssistantText(file, { delayMs: 1, root }), 'All done!');
  assert.equal(await lastAssistantText(path.join(root, 'missing.jsonl'), { delayMs: 1, root }), null);
  assert.equal(await lastAssistantText('/etc/hosts', { delayMs: 1, root }), null);
  fs.rmSync(root, { recursive: true });
});
