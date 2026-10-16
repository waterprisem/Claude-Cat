// App lifecycle: single instance, no Dock icon, tray menu.

const fs = require('node:fs');
const path = require('node:path');
const { app, Menu, Tray, nativeImage } = require('electron');

const TRAY_ICON = path.join(__dirname, '..', '..', 'assets', 'processed', 'tray.png');

let tray = null; // module-level so it is not garbage-collected

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    if (app.dock) app.dock.hide();
    createTray();
  });

  // Stay alive with no windows; quitting happens from the tray.
  app.on('window-all-closed', () => {});
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
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Claude Cat', enabled: false },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
}
