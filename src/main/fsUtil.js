// Small file helpers shared by config and the hooks installer.

const fs = require('node:fs');
const path = require('node:path');

// Write JSON via a temp file and rename, so a crash never leaves a half-written file.
function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.claude-cat-tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

module.exports = { writeJsonAtomic };
