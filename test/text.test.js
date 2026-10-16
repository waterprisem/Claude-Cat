const test = require('node:test');
const assert = require('node:assert/strict');
const { head } = require('../src/main/text');

test('short text is returned cleaned', () => {
  assert.equal(head('  Hello\n\nworld  '), 'Hello world');
  assert.equal(head(''), '');
  assert.equal(head(undefined), '');
});

test('strips simple markdown', () => {
  assert.equal(head('## Done\n- **Fixed** the `bug` in [App](http://x)'), 'Done Fixed the bug in App');
  assert.equal(head('Before\n```js\nconst x = 1;\n```\nafter'), 'Before after');
});

test('cuts on a word boundary with an ellipsis', () => {
  const text = 'The quick brown fox jumps over the lazy dog and keeps running far away';
  const out = head(text, 30);
  assert.ok(out.length <= 30, out);
  assert.ok(out.endsWith('…'));
  assert.ok(text.startsWith(out.slice(0, -1)));
  assert.ok(!out.slice(0, -1).endsWith(' '));
});

test('hard cut when there is no space', () => {
  const out = head('x'.repeat(50), 20);
  assert.equal(out.length, 20);
  assert.ok(out.endsWith('…'));
});
