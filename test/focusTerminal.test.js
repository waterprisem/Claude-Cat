const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePs, terminalFor } = require('../src/main/focusTerminal');

const PS = `
    1     0 ??       /sbin/launchd
93402     1 ??       /System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal
67823 93402 ttys075  login
67824 67823 ttys075  -zsh
70514 67824 ttys075  claude
  500     1 ??       /Applications/Visual Studio Code.app/Contents/MacOS/Electron
  501   500 ??       /Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)
  502   501 ttys003  /bin/zsh
  503   502 ttys003  claude
  600     1 ??       tmux
  601   600 ttys009  claude
`;

test('parsePs reads pid, parent, tty and command with spaces', () => {
  const procs = parsePs(PS);
  assert.deepEqual(procs.get(501), { ppid: 500, tty: '??', comm: '/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)' });
  assert.equal(procs.size, 11);
});

test('terminalFor walks up to the terminal app and keeps the tty', () => {
  const procs = parsePs(PS);
  assert.deepEqual(terminalFor(70514, procs), { appPath: '/System/Applications/Utilities/Terminal.app', tty: '/dev/ttys075' });
  // a helper nested inside another bundle resolves to the outer app
  assert.deepEqual(terminalFor(503, procs), { appPath: '/Applications/Visual Studio Code.app', tty: '/dev/ttys003' });
});

test('terminalFor gives up when there is no app (tmux) or no process', () => {
  const procs = parsePs(PS);
  assert.equal(terminalFor(601, procs), null);
  assert.equal(terminalFor(999, procs), null);
});
