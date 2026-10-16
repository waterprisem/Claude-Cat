// App lifecycle: single instance, no Dock icon, tray menu, event pipeline.

const fs = require('node:fs');
const path = require('node:path');
const { app, Menu, Tray, nativeImage, shell } = require('electron');
const config = require('./config');
const { createEventLog } = require('./eventLog');
const hooksInstaller = require('./hooksInstaller');
const { sanitize } = require('./payload');
const server = require('./server');
const { SessionStore } = require('./sessions');
const { head } = require('./text');
const { lastAssistantText } = require('./transcript');

const TRAY_ICON = path.join(__dirname, '..', '..', 'assets', 'processed', 'tray.png');

let tray = null; // module-level so it is not garbage-collected
let settings = config.DEFAULTS;
let serverStatus = 'Starting…';
let lastMessage = null; // shown in the tray after install/remove

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    if (app.dock) app.dock.hide();
    settings = config.load();
    createTray();
    startPipeline();
  });

  // Stay alive with no windows; quitting happens from the tray.
  app.on('window-all-closed', () => {});
}

function startPipeline() {
  const eventLog = settings.debugLog ? createEventLog(path.join(config.dataDir, 'events.log')) : null;
  const store = new SessionStore({
    config: settings,
    readTranscript: (file) => lastAssistantText(file, { delayMs: settings.transcriptDelayMs }),
  });

  store.on('change', (s) => console.log(`[${s.project}] ${s.state}: ${head(s.text, 120) || '...'}`));
  store.on('remove', (id) => console.log(`[claude-cat] session ended: ${id}`));
  setInterval(() => store.tick(), settings.tickIntervalMs).unref();

  server
    .start({
      port: settings.port,
      onEvent(raw) {
        if (eventLog) eventLog.append(raw);
        const evt = sanitize(raw);
        if (evt) store.handle(evt);
      },
    })
    .then(() => {
      serverStatus = `Listening on ${settings.port}`;
      console.log(`[claude-cat] listening on 127.0.0.1:${settings.port}`);
    })
    .catch((err) => {
      serverStatus = err.code === 'EADDRINUSE' ? `Port ${settings.port} in use` : 'Server failed to start';
      console.error(`[claude-cat] ${serverStatus}: ${err.message}`);
    })
    .finally(updateMenu);
}

function createTray() {
  if (fs.existsSync(TRAY_ICON)) {
    tray = new Tray(nativeImage.createFromPath(TRAY_ICON));
  } else {
    console.warn('[claude-cat] tray icon missing, run `npm run assets`');
    tray = new Tray(nativeImage.createEmpty());
    tray.setTitle('Cat');
  }
  tray.setToolTip('Claude Cat');
  updateMenu();
}

function runHooksAction(action) {
  try {
    const { backupPath } =
      action === 'install' ? hooksInstaller.install(undefined, { port: settings.port }) : hooksInstaller.uninstall();
    lastMessage = action === 'install' ? 'Hooks installed. Restart Claude Code sessions.' : 'Hooks removed.';
    console.log(`[claude-cat] ${lastMessage}${backupPath ? ` Backup: ${backupPath}` : ''}`);
  } catch (err) {
    lastMessage = `Could not ${action} hooks: ${err.message}`;
    console.error(`[claude-cat] ${lastMessage}`);
  }
  updateMenu();
}

function updateMenu() {
  if (!tray) return;
  const installed = hooksInstaller.isInstalled();
  const logFile = path.join(config.dataDir, 'events.log');
  const items = [
    { label: 'Claude Cat', enabled: false },
    { label: `Hooks: ${installed ? 'installed' : 'not installed'}`, enabled: false },
    { label: serverStatus, enabled: false },
  ];
  if (lastMessage) items.push({ label: head(lastMessage, 60), enabled: false });
  items.push(
    { type: 'separator' },
    installed
      ? { label: 'Remove hooks', click: () => runHooksAction('uninstall') }
      : { label: 'Install hooks', click: () => runHooksAction('install') },
    { label: 'Open event log', enabled: settings.debugLog, click: () => shell.openPath(logFile) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  );
  tray.setContextMenu(Menu.buildFromTemplate(items));
}
