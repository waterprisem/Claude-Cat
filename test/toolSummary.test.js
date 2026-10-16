const test = require('node:test');
const assert = require('node:assert/strict');
const { toolSummary } = require('../src/main/toolSummary');

test('file tools show the basename only', () => {
  assert.equal(toolSummary('Edit', { file_path: '/a/b/App.tsx' }), 'Editing App.tsx');
  assert.equal(toolSummary('Write', { file_path: '/x/new.js' }), 'Editing new.js');
  assert.equal(toolSummary('MultiEdit', { file_path: 'rel/x.css' }), 'Editing x.css');
  assert.equal(toolSummary('Read', { file_path: '/etc/hosts' }), 'Reading hosts');
});

test('missing input falls back to the verb', () => {
  assert.equal(toolSummary('Edit'), 'Editing');
  assert.equal(toolSummary('Read', null), 'Reading');
  assert.equal(toolSummary('Bash', {}), 'Running a command');
});

test('bash commands are truncated', () => {
  assert.equal(toolSummary('Bash', { command: 'npm test' }), 'Running npm test');
  const long = toolSummary('Bash', { command: 'git log --oneline --graph --decorate --all | head -50' });
  assert.ok(long.startsWith('Running git log'));
  assert.ok(long.endsWith('…'));
  assert.ok(long.length <= 40, long);
  assert.equal(toolSummary('Bash', { command: 'echo a\n\n   echo b' }), 'Running echo a echo b');
});

test('category tools', () => {
  assert.equal(toolSummary('Grep', {}), 'Searching the code');
  assert.equal(toolSummary('Glob', {}), 'Searching the code');
  assert.equal(toolSummary('WebSearch', {}), 'Searching the web');
  assert.equal(toolSummary('WebFetch', {}), 'Searching the web');
  assert.equal(toolSummary('Task', {}), 'Delegating to a helper');
  assert.equal(toolSummary('Agent', {}), 'Delegating to a helper');
  assert.equal(toolSummary('TodoWrite', {}), 'Planning');
});

test('other and MCP tools', () => {
  assert.equal(toolSummary('Skill', {}), 'Using Skill');
  assert.equal(toolSummary('mcp__github__create_issue', {}), 'Using create_issue');
  assert.ok(toolSummary('x'.repeat(200), {}).length <= 40);
  assert.equal(toolSummary(undefined, {}), 'Working');
});

test('long basenames stay under the cap', () => {
  const s = toolSummary('Edit', { file_path: `/a/${'very-long-name-'.repeat(5)}.ts` });
  assert.ok(s.length <= 40, s);
});
