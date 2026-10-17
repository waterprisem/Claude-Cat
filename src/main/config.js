// All tunable constants in one place, overridable by config.json.
// config.json also stores the cat size and per-project positions the app saves.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeJsonAtomic } = require('./fsUtil');

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
  catSize: 128,
  codingFps: 6,
  blinkFps: 14,
  idleHoldMinMs: 3000,
  idleHoldMaxMs: 7000,
});

const SAVED_KEYS = ['catSize', 'positions'];

// { project: { x, y } } with finite numbers only; anything else is dropped.
function cleanPositions(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [project, p] of Object.entries(value)) {
    if (project.length > 256 || !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    out[project] = { x: p.x, y: p.y };
  }
  return out;
}

// Returns DEFAULTS merged with config.json, plus `positions`. Unknown keys and wrong types are ignored.
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
  config.positions = cleanPositions(overrides && overrides.positions);
  return config;
}

// Merges catSize/positions into config.json, keeping every other key. Leaves a broken file alone.
function save(patch, file = configPath) {
  let current = {};
  try {
    current = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[claude-cat] not saving, config.json is unreadable: ${err.message}`);
      return false;
    }
  }
  if (!current || typeof current !== 'object' || Array.isArray(current)) return false;
  for (const key of SAVED_KEYS) if (key in patch) current[key] = patch[key];
  writeJsonAtomic(file, current);
  return true;
}

module.exports = { DEFAULTS, dataDir, configPath, load, save };
