const test = require('node:test');
const assert = require('node:assert/strict');
const { SessionStore } = require('../src/main/sessions');
const { DEFAULTS } = require('../src/main/config');

function setup(readTranscript) {
  let now = 1000;
  const store = new SessionStore({ now: () => now, config: DEFAULTS, readTranscript });
  const changes = [];
  const removed = [];
  store.on('change', (s) => changes.push(`${s.state}: ${s.text}`));
  store.on('remove', (id) => removed.push(id));
  const send = (event, extra = {}) => store.handle({ event, sessionId: 's1', cwd: '/p/app', project: 'app', ...extra });
  return { store, changes, removed, send, advance: (ms) => (now += ms), s: () => store.get('s1') };
}

test('normal turn: start, prompt, tools, stop', () => {
  const t = setup();
  t.send('SessionStart');
  t.send('UserPromptSubmit');
  t.send('PreToolUse', { toolName: 'Edit', toolInput: { file_path: '/p/app/App.tsx' } });
  t.send('PostToolUse', { toolName: 'Edit' });
  t.send('Stop', { lastAssistantMessage: '## Done\nI fixed **the bug**.' });
  assert.deepEqual(t.changes, ['done: ', 'coding: Thinking...', 'coding: Editing App.tsx', 'done: Done I fixed the bug.']);
  assert.equal(t.s().project, 'app');
});

test('unknown session is created by any event', () => {
  const t = setup();
  t.send('PreToolUse', { toolName: 'Read', toolInput: { file_path: '/x/a.md' } });
  assert.equal(t.s().state, 'coding');
  assert.equal(t.s().text, 'Reading a.md');
});

test('permission request and recovery', () => {
  const t = setup();
  t.send('UserPromptSubmit');
  t.send('PermissionRequest', { toolName: 'Bash' });
  assert.equal(t.s().state, 'waiting');
  assert.equal(t.s().text, 'Claude needs your permission to use Bash');
  // Real order: the generic notification arrives seconds after PermissionRequest.
  t.send('Notification', { notificationType: 'permission_prompt', message: 'Claude needs your permission' });
  assert.equal(t.s().state, 'waiting');
  assert.equal(t.s().text, 'Claude needs your permission to use Bash');
  t.send('PostToolUse', { toolName: 'Bash' });
  assert.equal(t.s().state, 'coding');
  assert.equal(t.s().text, 'Thinking...');
});

test('PostToolUseFailure keeps coding with the current text', () => {
  const t = setup();
  t.send('PreToolUse', { toolName: 'Bash', toolInput: { command: 'npm test' } });
  t.send('PostToolUseFailure', { toolName: 'Bash' });
  assert.equal(t.s().state, 'coding');
  assert.equal(t.s().text, 'Running npm test');
});

test('idle_prompt does not overwrite the done text', () => {
  const t = setup();
  t.send('UserPromptSubmit');
  t.send('Stop', { lastAssistantMessage: 'All set.' });
  t.send('Notification', { notificationType: 'idle_prompt', message: 'Claude is waiting for your input' });
  assert.equal(t.s().state, 'done');
  assert.equal(t.s().text, 'All set.');
});

test('permission notification alone still means waiting', () => {
  const t = setup();
  t.send('UserPromptSubmit');
  t.send('Notification', { notificationType: 'permission_prompt', message: 'Claude needs your permission' });
  assert.equal(t.s().state, 'waiting');
  assert.equal(t.s().text, 'Claude needs your permission');
});

test('other notifications mean waiting', () => {
  const t = setup();
  t.send('Notification', { notificationType: 'elicitation_dialog', message: 'Pick one' });
  assert.equal(t.s().state, 'waiting');
  assert.equal(t.s().text, 'Pick one');
});

test('StopFailure and SubagentStop', () => {
  const t = setup();
  t.send('UserPromptSubmit');
  t.send('SubagentStop', { agentId: 'a1' });
  assert.equal(t.s().state, 'coding');
  t.send('StopFailure', { errorType: 'rate_limit' });
  assert.equal(t.s().state, 'waiting');
  assert.equal(t.s().text, 'Stopped (rate limit)');
});

test('SessionEnd removes the session', () => {
  const t = setup();
  t.send('SessionStart');
  t.send('SessionEnd');
  assert.equal(t.s(), undefined);
  assert.deepEqual(t.removed, ['s1']);
  t.send('SessionEnd'); // unknown session: no-op
  assert.deepEqual(t.removed, ['s1']);
});

test('interrupt timeout flips coding to waiting', () => {
  const t = setup();
  t.send('UserPromptSubmit');
  t.advance(DEFAULTS.interruptTimeoutMs - 1);
  t.store.tick();
  assert.equal(t.s().state, 'coding');
  t.advance(1);
  t.store.tick();
  assert.equal(t.s().state, 'waiting');
  assert.equal(t.s().text, 'Stopped?');
});

test('stale sessions are removed', () => {
  const t = setup();
  t.send('SessionStart');
  t.advance(DEFAULTS.staleSessionMs);
  t.store.tick();
  assert.equal(t.s(), undefined);
});

test('Stop without message uses the transcript', async () => {
  const t = setup(async () => 'From transcript');
  t.send('Stop', { transcriptPath: '/x.jsonl' });
  assert.equal(t.s().text, 'Done');
  await new Promise(setImmediate);
  assert.equal(t.s().text, 'From transcript');
});

test('late transcript read is dropped if newer events arrived', async () => {
  let resolve;
  const t = setup(() => new Promise((r) => (resolve = r)));
  t.send('Stop', { transcriptPath: '/x.jsonl' });
  t.send('UserPromptSubmit');
  resolve('Old answer');
  await new Promise(setImmediate);
  assert.equal(t.s().state, 'coding');
  assert.equal(t.s().text, 'Thinking...');
});

test('Esc seen in the transcript flips coding to waiting, and only coding', () => {
  const t = setup();
  t.send('UserPromptSubmit', { transcriptPath: '/home/.claude/x.jsonl' });
  assert.equal(t.s().turn, 1);
  assert.equal(t.s().transcriptPath, '/home/.claude/x.jsonl');
  t.store.interrupted('s1');
  assert.equal(t.s().state, 'waiting');
  assert.equal(t.s().text, 'Interrupted');
  t.send('Stop', { lastAssistantMessage: 'ok' });
  t.store.interrupted('s1');
  assert.equal(t.s().state, 'done');
  t.store.interrupted('nope'); // unknown session: ignored
});

test('subagent events do not replace the transcript path', () => {
  const t = setup();
  t.send('UserPromptSubmit', { transcriptPath: '/home/.claude/main.jsonl' });
  t.send('PreToolUse', { toolName: 'Read', transcriptPath: '/home/.claude/sub.jsonl', agentId: 'a1' });
  assert.equal(t.s().transcriptPath, '/home/.claude/main.jsonl');
});
