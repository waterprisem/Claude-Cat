// The cat window: transparent, always on top, on every Space, never focused.
// Phase 2 shows one cat for the most recently active session.

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { BrowserWindow, ipcMain, screen } = require('electron');

const ROOT = path.join(__dirname, '..', '..');
const PROCESSED = path.join(ROOT, 'assets', 'processed');
const MARGIN = 24;

function loadFrameUrls() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PROCESSED, 'manifest.json'), 'utf8'));
  const urls = (list) => list.map((rel) => pathToFileURL(path.join(PROCESSED, rel)).href);
  return { coding: urls(manifest.coding), idle: urls(manifest.idle) };
}

function defaultPosition(size) {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - size - MARGIN, y: workArea.y + workArea.height - size - MARGIN };
}

function createWindow(size) {
  const { x, y } = defaultPosition(size);
  const win = new BrowserWindow({
    x,
    y,
    width: size,
    height: size,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    roundedCorners: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false, // never becomes key, so never steals keyboard focus
    type: 'panel', // non-activating panel: floats over fullscreen apps
    alwaysOnTop: true,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  // skipTransformProcessType: the app is already Dock-less; transforming would flash a Dock icon.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, '..', 'renderer', 'cat.html'));
  return win;
}

function createCatController(config) {
  let frames;
  try {
    frames = loadFrameUrls();
  } catch (err) {
    console.warn(`[claude-cat] no processed frames (${err.message}), run \`npm run assets\``);
    return { show() {}, remove() {}, destroy() {} };
  }

  const timing = {
    codingFps: config.codingFps,
    blinkFps: config.blinkFps,
    idleHoldMinMs: config.idleHoldMinMs,
    idleHoldMaxMs: config.idleHoldMaxMs,
  };
  const sessions = new Map(); // id -> last session snapshot, in order of last change
  let win = null;
  let ready = false;
  let shownId = null;

  const snapshot = (s) => ({ id: s.id, state: s.state, text: s.text, project: s.project });

  function send(s) {
    shownId = s.id;
    if (win && ready) win.webContents.send('cat:state', { state: s.state, text: s.text, project: s.project });
  }

  function ensureWindow() {
    if (win) return;
    win = createWindow(config.catSize);
    ready = false;
    win.once('ready-to-show', () => win && win.showInactive());
    win.on('closed', () => {
      win = null;
      ready = false;
    });
  }

  function onReady(event) {
    if (!win || event.sender !== win.webContents) return;
    ready = true;
    win.webContents.send('cat:init', { frames, timing });
    const latest = [...sessions.values()].pop();
    if (latest) send(latest);
  }
  ipcMain.on('cat:ready', onReady);

  return {
    show(session) {
      sessions.delete(session.id); // re-insert so the Map stays ordered by last change
      sessions.set(session.id, snapshot(session));
      ensureWindow();
      send(session);
    },
    remove(id) {
      sessions.delete(id);
      const latest = [...sessions.values()].pop();
      if (latest) {
        if (id === shownId) send(latest);
      } else if (win) {
        win.destroy();
        shownId = null;
      }
    },
    destroy() {
      ipcMain.off('cat:ready', onReady);
      if (win) win.destroy();
    },
  };
}

module.exports = { createCatController };
