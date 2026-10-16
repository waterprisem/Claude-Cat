// All tunable constants in one place, overridable by config.json.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = path.join(os.homedir(), 'Library', 'Application Support', 'claude-cat');
const configPath = path.join(dataDir, 'config.json');

const DEFAULTS = Object.freeze({
  port: 47821,
  interruptTimeoutMs: 120 * 1000, // coding with no events -> "Stopped?"
  staleSessionMs: 6 * 60 * 60 * 1000, // no events at all -> remove session
  tickIntervalMs: 5 * 1000,
  transcriptDelayMs: 300,
  debugLog: false, // events.log holds full prompts and replies; opt in via config.json
  maxTextLength: 500,
});

// Returns DEFAULTS merged with config.json. Unknown keys and wrong types are ignored.
function load(file = configPath) {
  let overrides = {};
  try {
    overrides = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[claude-cat] ignoring bad config.json: ${err.message}`);
  }
  const config = { ...DEFAULTS };
  if (overrides && typeof overrides === 'object') {
    for (const key of Object.keys(DEFAULTS)) {
      if (typeof overrides[key] === typeof DEFAULTS[key]) config[key] = overrides[key];
    }
  }
  return config;
}

module.exports = { DEFAULTS, dataDir, configPath, load };
