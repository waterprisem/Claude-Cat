// Downscale the 1080px source frames to 512px for the renderer.
// Uses macOS's built-in `sips`, so there are no npm dependencies.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'assets', 'source');
const OUT_DIR = path.join(ROOT, 'assets', 'processed');
const FRAME_SIZE = 512;
const TRAY_SIZE = 22;
const EXPECTED = { coding: 3, idle: 8 };

function sips(args) {
  return execFileSync('sips', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function hasAlpha(file) {
  return /hasAlpha:\s*yes/.test(sips(['-g', 'hasAlpha', file]));
}

function resize(src, dst, size) {
  sips(['-Z', String(size), src, '--out', dst]);
}

function listFrames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.png$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function processSet(name) {
  const srcDir = path.join(SOURCE_DIR, name);
  const outDir = path.join(OUT_DIR, name);
  const files = listFrames(srcDir);
  if (files.length === 0) {
    console.error(`error: no PNG frames in ${path.relative(ROOT, srcDir)}`);
    process.exit(1);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const outputs = [];
  files.forEach((file, i) => {
    const src = path.join(srcDir, file);
    const outName = `${String(i + 1).padStart(2, '0')}.png`;
    if (!hasAlpha(src)) console.warn(`warning: ${name}/${file} has no alpha channel`);
    resize(src, path.join(outDir, outName), FRAME_SIZE);
    outputs.push(`${name}/${outName}`);
  });

  const expected = EXPECTED[name];
  const note = files.length === expected ? 'ok' : `WARNING: expected ${expected}`;
  console.log(`${name}: ${files.length} frames (${note})`);
  return { files: outputs, sources: files };
}

// App icon for Finder (.icns via the built-in iconutil). Not loaded by the renderer.
function makeIcon(src) {
  const iconset = path.join(OUT_DIR, 'icon.iconset');
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    resize(src, path.join(iconset, `icon_${size}x${size}.png`), size);
    resize(src, path.join(iconset, `icon_${size}x${size}@2x.png`), size * 2);
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(OUT_DIR, 'icon.icns')]);
  fs.rmSync(iconset, { recursive: true, force: true });
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const coding = processSet('coding');
  const idle = processSet('idle');

  const traySrc = path.join(SOURCE_DIR, 'idle', idle.sources[0]);
  resize(traySrc, path.join(OUT_DIR, 'tray.png'), TRAY_SIZE);
  resize(traySrc, path.join(OUT_DIR, 'tray@2x.png'), TRAY_SIZE * 2);
  makeIcon(traySrc);

  const manifest = { size: FRAME_SIZE, coding: coding.files, idle: idle.files };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`wrote ${path.relative(ROOT, OUT_DIR)}/ (${FRAME_SIZE}px frames, tray and app icons, manifest.json)`);
}

main();
