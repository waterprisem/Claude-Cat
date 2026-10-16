// Install/remove claude-cat hook entries in ~/.claude/settings.json.
// Backs up the file first and only ever touches entries ending in "# claude-cat".

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULTS } = require('./config');

const MARKER = '# claude-cat';
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

const EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Notification',
  'Stop',
  'StopFailure',
  'SubagentStop',
  'SessionEnd',
];

function hookCommand(port = DEFAULTS.port) {
  return (
    `curl -s -m 1 --connect-timeout 0.3 -X POST -H 'Content-Type: application/json' ` +
    `--data-binary @- http://127.0.0.1:${port}/event >/dev/null 2>&1 || true ${MARKER}`
  );
}

const isOurs = (hook) => hook && typeof hook.command === 'string' && hook.command.trimEnd().endsWith(MARKER);

// Returns null if the file does not exist. Throws if it exists but is not a JSON object.
function readSettings(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('settings.json is not a JSON object');
  return data;
}

function backup(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = `${file}.claude-cat-backup-${stamp}`;
  fs.copyFileSync(file, dest, fs.constants.COPYFILE_EXCL);
  return dest;
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.claude-cat-tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

// Removes our entries in place, dropping anything left empty.
function stripOurs(settings) {
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return;
  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue;
    hooks[event] = hooks[event]
      .map((group) => {
        if (!group || !Array.isArray(group.hooks) || !group.hooks.some(isOurs)) return group;
        return { ...group, hooks: group.hooks.filter((h) => !isOurs(h)) };
      })
      .filter((group) => !group || !Array.isArray(group.hooks) || group.hooks.length > 0);
    if (hooks[event].length === 0) delete hooks[event];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
}

function isInstalled(file = SETTINGS_PATH) {
  try {
    const settings = readSettings(file);
    const hooks = settings && settings.hooks;
    if (!hooks || typeof hooks !== 'object') return false;
    return EVENTS.every(
      (event) => Array.isArray(hooks[event]) && hooks[event].some((g) => g && Array.isArray(g.hooks) && g.hooks.some(isOurs))
    );
  } catch {
    return false;
  }
}

// Returns { backupPath } (null if there was no file to back up).
function install(file = SETTINGS_PATH, { port = DEFAULTS.port } = {}) {
  const settings = readSettings(file) || {};
  const backupPath = fs.existsSync(file) ? backup(file) : null;
  stripOurs(settings);
  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) settings.hooks = {};
  const command = hookCommand(port);
  for (const event of EVENTS) {
    if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
    settings.hooks[event].push({ hooks: [{ type: 'command', command, timeout: 5 }] });
  }
  writeAtomic(file, settings);
  return { backupPath };
}

function uninstall(file = SETTINGS_PATH) {
  const settings = readSettings(file);
  if (!settings) return { backupPath: null };
  const backupPath = backup(file);
  stripOurs(settings);
  writeAtomic(file, settings);
  return { backupPath };
}

module.exports = { install, uninstall, isInstalled, hookCommand, EVENTS, MARKER, SETTINGS_PATH };
