// Debug log: one raw (truncated) hook payload per line.

const fs = require('node:fs');
const path = require('node:path');

const MAX_STRING = 2000;
const MAX_FILE = 5 * 1024 * 1024;

function truncate(value) {
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[${value.length} chars]` : value;
  }
  if (Array.isArray(value)) return value.map(truncate);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = truncate(v);
    return out;
  }
  return value;
}

function createEventLog(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    if (fs.statSync(file).size > MAX_FILE) fs.truncateSync(file, 0);
  } catch {
    // no log yet
  }
  return {
    file,
    append(raw) {
      const line = JSON.stringify({ receivedAt: new Date().toISOString(), payload: truncate(raw) });
      fs.appendFile(file, line + '\n', () => {});
    },
  };
}

module.exports = { createEventLog, truncate };
