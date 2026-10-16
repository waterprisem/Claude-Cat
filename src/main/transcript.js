// Fallback: last assistant text from a transcript JSONL, used only when Stop
// lacks last_assistant_message.

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const TAIL_BYTES = 256 * 1024;
const CLAUDE_DIR = path.join(os.homedir(), '.claude');

function isAllowedPath(p, root = CLAUDE_DIR) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || !p.endsWith('.jsonl')) return false;
  const resolved = path.resolve(p);
  return resolved.startsWith(root + path.sep);
}

async function readTail(file) {
  const handle = await fs.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    await handle.read(buf, 0, buf.length, start);
    return buf.toString('utf8');
  } finally {
    await handle.close();
  }
}

function textOf(entry) {
  if (!entry || entry.type !== 'assistant' || !entry.message) return null;
  const content = entry.message.content;
  if (typeof content === 'string') return content.trim() || null;
  if (!Array.isArray(content)) return null;
  const text = content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
  return text || null;
}

// Pure parser, exported for tests.
function lastAssistantFromJsonl(data) {
  const lines = data.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // partial first line of the tail, or a bad line
    }
    if (entry.isSidechain) continue;
    const text = textOf(entry);
    if (text) return text;
  }
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits `delayMs` (transcript may not be flushed yet), tries, retries once.
async function lastAssistantText(file, { delayMs = 300, root = CLAUDE_DIR } = {}) {
  if (!isAllowedPath(file, root)) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    await sleep(delayMs * (attempt + 1));
    try {
      const text = lastAssistantFromJsonl(await readTail(file));
      if (text) return text;
    } catch {
      // missing or unreadable; retry once
    }
  }
  return null;
}

module.exports = { lastAssistantText, lastAssistantFromJsonl, isAllowedPath };
