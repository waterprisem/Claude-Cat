// Clicking a cat brings its Claude Code session's terminal to the front.
// The session's process id comes from ~/.claude/sessions/ (see liveSessions.js); the
// terminal app is the first .app found walking up its parent processes. Terminal and
// iTerm2 can also select the exact tab by its tty (macOS asks once for permission);
// any other app is just brought forward. Nothing from a hook payload is ever run.

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const TIMEOUT_MS = 3000;
const MAX_DEPTH = 32;
const TTY = /^\/dev\/ttys\d{1,4}$/;

// Tab selection scripts. The tty is passed as an argument, never spliced into the script.
const SCRIPTS = {
  'Terminal.app': [
    'on run argv',
    'set target to item 1 of argv',
    'tell application "Terminal"',
    'repeat with w in windows',
    'repeat with t in tabs of w',
    'if tty of t is target then',
    'set miniaturized of w to false',
    'set selected of t to true',
    'set index of w to 1',
    'activate',
    'return "ok"',
    'end if',
    'end repeat',
    'end repeat',
    'end tell',
    'return "missing"',
    'end run',
  ],
  'iTerm.app': [
    'on run argv',
    'set target to item 1 of argv',
    'tell application "iTerm2"',
    'repeat with w in windows',
    'repeat with t in tabs of w',
    'repeat with s in sessions of t',
    'if tty of s is target then',
    'select w',
    'tell t to select',
    'tell s to select',
    'activate',
    'return "ok"',
    'end if',
    'end repeat',
    'end repeat',
    'end repeat',
    'end tell',
    'return "missing"',
    'end run',
  ],
};

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

// `ps -axo pid=,ppid=,tty=,comm=` output -> Map pid -> { ppid, tty, comm }
function parsePs(text) {
  const procs = new Map();
  for (const line of String(text).split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line);
    if (m) procs.set(Number(m[1]), { ppid: Number(m[2]), tty: m[3], comm: m[4].trim() });
  }
  return procs;
}

// { appPath, tty } for the process, or null when no app is found (e.g. under tmux).
function terminalFor(pid, procs) {
  const self = procs.get(pid);
  if (!self) return null;
  const tty = /^ttys\d{1,4}$/.test(self.tty) ? `/dev/${self.tty}` : null;
  let p = self;
  for (let i = 0; p && i < MAX_DEPTH; i++) {
    const m = /^(\/.+?\.app)\/Contents\//.exec(p.comm); // outermost bundle in the path
    if (m) return { appPath: m[1], tty };
    if (p.ppid <= 1) break;
    p = procs.get(p.ppid);
  }
  return null;
}

async function focusProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return 'no-process';
  const found = terminalFor(pid, parsePs(await run('ps', ['-axo', 'pid=,ppid=,tty=,comm='])));
  if (!found || !fs.existsSync(found.appPath)) return 'no-app';
  const script = SCRIPTS[path.basename(found.appPath)];
  if (script && found.tty && TTY.test(found.tty)) {
    try {
      const args = script.flatMap((line) => ['-e', line]);
      if ((await run('osascript', [...args, found.tty])).trim() === 'ok') return 'tab';
    } catch {
      // permission declined or the app's scripting failed: just bring it forward
    }
  }
  await run('open', ['-a', found.appPath]);
  return 'app';
}

module.exports = { focusProcess, parsePs, terminalFor };
