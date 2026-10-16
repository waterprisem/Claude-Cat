const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitize } = require('../src/main/payload');

const base = { hook_event_name: 'PreToolUse', session_id: 'abc-123', cwd: '/Users/me/my-app' };

test('keeps known fields and derives the project', () => {
  const evt = sanitize({
    ...base,
    tool_name: 'Bash',
    tool_input: { command: 'ls', secret: 'x', content: 'big file' },
    unknown: 'dropped',
  });
  assert.equal(evt.event, 'PreToolUse');
  assert.equal(evt.sessionId, 'abc-123');
  assert.equal(evt.project, 'my-app');
  assert.deepEqual(evt.toolInput, { command: 'ls' });
  assert.equal(evt.unknown, undefined);
});

test('rejects bad shapes and ids', () => {
  assert.equal(sanitize(null), null);
  assert.equal(sanitize([]), null);
  assert.equal(sanitize('x'), null);
  assert.equal(sanitize({ ...base, session_id: '../etc' }), null);
  assert.equal(sanitize({ ...base, session_id: 'x'.repeat(129) }), null);
  assert.equal(sanitize({ ...base, session_id: 42 }), null);
  assert.equal(sanitize({ ...base, hook_event_name: 'Pre Tool' }), null);
  assert.equal(sanitize({ session_id: 'a' }), null);
});

test('ignores wrong types and caps long strings', () => {
  const evt = sanitize({ ...base, cwd: 5, message: ['x'], last_assistant_message: 'y'.repeat(10000), tool_input: 'nope' });
  assert.equal(evt.cwd, undefined);
  assert.equal(evt.project, 'unknown');
  assert.equal(evt.message, undefined);
  assert.equal(evt.lastAssistantMessage.length, 4000);
  assert.equal(evt.toolInput, undefined);
});
