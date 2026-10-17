const test = require('node:test');
const assert = require('node:assert/strict');
const { bubbleText, fitText } = require('../src/renderer/bubble');

test('bubbleText uses the text, or a fallback per state', () => {
  assert.equal(bubbleText('coding', 'Editing App.tsx'), 'Editing App.tsx');
  assert.equal(bubbleText('coding', ''), 'Thinking...');
  assert.equal(bubbleText('waiting', '  '), 'Claude needs your attention');
  assert.equal(bubbleText('done', undefined), 'Ready for your next prompt');
  assert.equal(bubbleText('weird', null), 'Ready for your next prompt');
});

test('fitText keeps text that fits', () => {
  assert.equal(fitText('short text', () => true), 'short text');
});

test('fitText cuts on a word boundary with an ellipsis', () => {
  const fits = (s) => s.length <= 20;
  const out = fitText('The quick brown fox jumps over the lazy dog', fits);
  assert.equal(out, 'The quick brown fox…');
  assert.ok(fits(out));
});

test('fitText drops trailing punctuation before the ellipsis', () => {
  assert.equal(fitText('Done, then more words here', (s) => s.length <= 8), 'Done…');
});

test('fitText falls back to the first word when nothing fits', () => {
  assert.equal(fitText('Supercalifragilistic word', () => false), 'Supercalifragilistic…');
});
