// Notices Esc presses. Claude Code sends no hook event for them, but it writes a
// "[Request interrupted by user…]" entry to the session transcript. While a session
// is coding we poll its transcript and read only what was appended.

const fs = require('node:fs');
const { StringDecoder } = require('node:string_decoder');
const { isAllowedPath } = require('./transcript');

const MARKER = '[Request interrupted by user';
const MAX_READ = 256 * 1024;

function userTexts(entry) {
  const content = entry.message && entry.message.content;
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  return content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text);
}

// True if any line is a main-thread user entry whose text starts with the marker.
// Tool results that merely contain the marker do not count.
function hasInterrupt(lines) {
  for (const line of lines) {
    if (!line.includes(MARKER)) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || entry.type !== 'user' || entry.isSidechain) continue;
    if (userTexts(entry).some((t) => t.startsWith(MARKER))) return true;
  }
  return false;
}

// watch(id, file, turn): start watching from the file's current end. Calling it again
// with the same file and turn is a no-op; a new turn (new prompt) starts over.
function createInterruptWatcher({ intervalMs = 1000, onInterrupt, root } = {}) {
  const watched = new Map(); // id -> { file, turn, offset, rest, decoder }
  let timer = null;

  function unwatch(id) {
    watched.delete(id);
    if (watched.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function watch(id, file, turn) {
    const w = watched.get(id);
    if (w && w.file === file && w.turn === turn) return;
    if (!isAllowedPath(file, root)) return unwatch(id);
    let offset = 0;
    try {
      offset = fs.statSync(file).size;
    } catch {
      // not written yet: read it from the start once it appears
    }
    watched.set(id, { file, turn, offset, rest: '', decoder: new StringDecoder('utf8') });
    if (!timer) {
      timer = setInterval(poll, intervalMs);
      if (timer.unref) timer.unref();
    }
  }

  function readAppended(w) {
    let size;
    try {
      size = fs.statSync(w.file).size;
    } catch {
      return null;
    }
    if (size < w.offset) {
      // rewritten or truncated: start again from the new end
      w.offset = size;
      w.rest = '';
      return null;
    }
    if (size === w.offset) return null;
    let start = w.offset;
    if (size - start > MAX_READ) {
      start = size - MAX_READ;
      w.rest = '';
      w.decoder = new StringDecoder('utf8');
    }
    const buf = Buffer.alloc(size - start);
    const fd = fs.openSync(w.file, 'r');
    try {
      fs.readSync(fd, buf, 0, buf.length, start);
    } finally {
      fs.closeSync(fd);
    }
    w.offset = size;
    return w.decoder.write(buf);
  }

  function check(id, w) {
    let chunk;
    try {
      chunk = readAppended(w);
    } catch {
      return;
    }
    if (chunk === null) return;
    const lines = (w.rest + chunk).split('\n');
    w.rest = lines.pop();
    if (w.rest.length > MAX_READ) w.rest = '';
    if (hasInterrupt(lines)) {
      unwatch(id);
      onInterrupt(id);
    }
  }

  function poll() {
    for (const [id, w] of [...watched]) check(id, w);
  }

  function stop() {
    watched.clear();
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { watch, unwatch, poll, stop, watching: (id) => watched.has(id) };
}

module.exports = { createInterruptWatcher, hasInterrupt };
