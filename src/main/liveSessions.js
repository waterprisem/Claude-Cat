// Claude Code sessions that are open right now, read once at startup so cats come back
// without waiting for the next hook event. Claude Code keeps one small JSON file per
// running session in ~/.claude/sessions/<pid>.json. The files are untrusted input:
// every field is validated, and a session only counts if its process is still alive.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SESSION_ID } = require('./payload');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const MAX_FILE_BYTES = 64 * 1024;
const MAX_FILES = 200;

function processAlive(pid) {
  try {
    process.kill(pid, 0); // signal 0: existence check only
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

// Validated record from one session file, or null.
function parseSessionFile(name, text) {
  const m = /^(\d{1,10})\.json$/.exec(name);
  if (!m) return null;
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object') return null;
  const pid = Number(m[1]);
  if (d.pid !== pid || typeof d.sessionId !== 'string' || !SESSION_ID.test(d.sessionId)) return null;
  if (typeof d.cwd !== 'string' || !path.isAbsolute(d.cwd) || d.cwd.length > 1024) return null;
  return { pid, sessionId: d.sessionId, cwd: d.cwd, busy: d.status === 'busy' };
}

// The session's transcript: ~/.claude/projects/<any>/<sessionId>.jsonl
function findTranscript(sessionId, projectsDir) {
  let dirs;
  try {
    dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const file = path.join(projectsDir, dir.name, `${sessionId}.jsonl`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function readLiveSessions({ root = CLAUDE_DIR, isAlive = processAlive } = {}) {
  const dir = path.join(root, 'sessions');
  let names;
  try {
    names = fs.readdirSync(dir).slice(0, MAX_FILES);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    let text;
    try {
      const file = path.join(dir, name);
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const s = parseSessionFile(name, text);
    if (!s || !isAlive(s.pid)) continue;
    out.push({ ...s, project: path.basename(s.cwd) || s.cwd, transcriptPath: findTranscript(s.sessionId, path.join(root, 'projects')) });
  }
  return out;
}

module.exports = { readLiveSessions, parseSessionFile };
