// Builds dist/Claude Cat-darwin-<arch>/Claude Cat.app for this Mac.
// Processes the art first, packages with @electron/packager, then ad-hoc signs the
// bundle (Apple Silicon will not run an app whose signature no longer matches).

const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { packager } = require('@electron/packager');

const ROOT = path.join(__dirname, '..');

async function main() {
  execFileSync(process.execPath, [path.join(__dirname, 'process-assets.js')], { stdio: 'inherit' });

  const [outDir] = await packager({
    dir: ROOT,
    out: path.join(ROOT, 'dist'),
    name: 'Claude Cat',
    platform: 'darwin',
    arch: process.arch,
    appBundleId: 'local.claude-cat',
    icon: path.join(ROOT, 'assets', 'processed', 'icon.icns'),
    // Menu-bar-only app: no Dock icon, not even for a moment at launch.
    extendInfo: {
      LSUIElement: true,
      // Shown by macOS the first time a click asks Terminal or iTerm2 to switch tabs.
      NSAppleEventsUsageDescription: 'Claude Cat brings the terminal tab of the session you clicked to the front.',
    },
    asar: true,
    overwrite: true,
    // Never ship the 1080px originals, tests, build scripts or notes.
    ignore: [/^\/assets\/source(\/|$)/, /^\/test(\/|$)/, /^\/scripts(\/|$)/, /^\/dist(\/|$)/, /^\/[^/]+\.md$/, /^\/\.git/],
  });

  const appPath = path.join(outDir, 'Claude Cat.app');
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  console.log(`built ${path.relative(ROOT, appPath)}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
