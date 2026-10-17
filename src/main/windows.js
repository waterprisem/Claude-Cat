// The cat window: transparent, always on top, on every Space, never focused.
// Clicks on transparent pixels pass through; the cat can be dragged and resized.
// The window is bigger than the cat to leave room for the hover speech bubble.
// Phase 2-4 shows one cat for the most recently active session.

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { BrowserWindow, ipcMain, nativeImage, screen } = require('electron');
const config = require('./config');
const geometry = require('./geometry');
const { maskFromBitmap, unionMasks, dilate, maskExtent } = require('./hitMask');
const { clip } = require('./text');

const ROOT = path.join(__dirname, '..', '..');
const PROCESSED = path.join(ROOT, 'assets', 'processed');
const MARGIN = 24;
const MASK_GRID = 64;
const BUBBLE = { width: 260, zone: 84 }; // room for the speech bubble beside the cat
const BUBBLE_TEXT_MAX = 120;

function loadFrames() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PROCESSED, 'manifest.json'), 'utf8'));
  const files = { coding: manifest.coding.map((rel) => path.join(PROCESSED, rel)), idle: manifest.idle.map((rel) => path.join(PROCESSED, rel)) };
  const urls = { coding: files.coding.map((f) => pathToFileURL(f).href), idle: files.idle.map((f) => pathToFileURL(f).href) };

  // One combined mask for every frame, so the clickable area does not flicker with the animation.
  const masks = [...files.coding, ...files.idle].map((file) => {
    const img = nativeImage.createFromPath(file);
    const { width, height } = img.getSize();
    return maskFromBitmap(img.toBitmap(), width, height, MASK_GRID);
  });
  const union = unionMasks(masks);
  return { urls, mask: Array.from(dilate(union, MASK_GRID)), extent: maskExtent(union, MASK_GRID) };
}

function workAreas() {
  return screen.getAllDisplays().map((d) => d.workArea);
}

function defaultCatBounds(size) {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - size - MARGIN, y: workArea.y + workArea.height - size - MARGIN, width: size, height: size };
}

function createWindow(bounds) {
  const win = new BrowserWindow({
    ...bounds,
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
    acceptFirstMouse: true, // first click on the inactive window reaches the page
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
  // Click-through by default; the renderer turns it off while the pointer is over the cat.
  win.setIgnoreMouseEvents(true, { forward: true });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, '..', 'renderer', 'cat.html'));
  return win;
}

function createCatController(settings) {
  let assets;
  try {
    assets = loadFrames();
  } catch (err) {
    console.warn(`[claude-cat] no processed frames (${err.message}), run \`npm run assets\``);
    return { show() {}, remove() {}, destroy() {} };
  }

  const timing = {
    codingFps: settings.codingFps,
    blinkFps: settings.blinkFps,
    idleHoldMinMs: settings.idleHoldMinMs,
    idleHoldMaxMs: settings.idleHoldMaxMs,
  };
  const sessions = new Map(); // id -> last session snapshot, in order of last change
  const positions = { ...settings.positions }; // project -> bottom-center point
  let size = geometry.stepSize(settings.catSize, 0);
  let win = null;
  let catBounds = null; // the cat's square in screen coordinates
  let layout = null; // { window, cat: offset inside the window, below }
  let ready = false;
  let shownId = null;
  let shownProject = null;
  let drag = null;
  let resizing = null; // { bounds, cursor } while the corner grip is dragged
  let saveTimer = null;

  const snapshot = (s) => ({ id: s.id, state: s.state, text: s.text, project: s.project });
  const fromCat = (event) => win && event.sender === win.webContents;

  function catBoundsFor(project) {
    const saved = positions[project];
    return saved ? geometry.boundsFromBottomCenter(saved, size) : defaultCatBounds(size);
  }

  function sendLayout() {
    if (!win || !ready || !layout) return;
    const { window: w, cat, below } = layout;
    win.webContents.send('cat:layout', { cat: { ...cat, size }, below, width: w.width, height: w.height });
  }

  // Keeps the cat on screen, then fits the window (cat + bubble zone) around it.
  function place(cat) {
    const areas = workAreas();
    catBounds = geometry.clampToWorkAreas(cat, areas);
    layout = geometry.layoutWindow(catBounds, areas.length ? geometry.pickWorkArea(catBounds, areas) : null, BUBBLE);
    sendLayout();
    if (win) win.setBounds(layout.window);
  }


  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      config.save({ catSize: size, positions });
    } catch (err) {
      console.error(`[claude-cat] could not save config: ${err.message}`);
    }
  }

  // Where the cat is now, following the window while it is dragged.
  function catFromWindow() {
    const [x, y] = win.getPosition();
    return { x: x + layout.cat.x, y: y + layout.cat.y, width: size, height: size };
  }

  function rememberPosition() {
    if (catBounds && shownProject) positions[shownProject] = geometry.bottomCenter(catBounds);
  }

  function send(s) {
    shownId = s.id;
    if (win && s.project !== shownProject && !drag && !resizing) place(catBoundsFor(s.project));
    shownProject = s.project;
    if (win && ready) win.webContents.send('cat:state', { state: s.state, text: clip(s.text || '', BUBBLE_TEXT_MAX), project: s.project });
  }

  function ensureWindow(project) {
    if (win) return;
    place(catBoundsFor(project));
    win = createWindow(layout.window);
    shownProject = project;
    ready = false;
    win.once('ready-to-show', () => win && win.showInactive());
    win.on('closed', () => {
      win = null;
      ready = false;
      drag = null;
      resizing = null;
      shownProject = null;
    });
  }

  const handlers = {
    'cat:ready'(event) {
      if (!fromCat(event)) return;
      ready = true;
      win.webContents.send('cat:init', { frames: assets.urls, mask: assets.mask, grid: MASK_GRID, extent: assets.extent, timing });
      sendLayout();
      const latest = [...sessions.values()].pop();
      if (latest) send(latest);
    },
    'cat:interactive'(event, value) {
      if (!fromCat(event) || typeof value !== 'boolean') return;
      win.setIgnoreMouseEvents(!value, { forward: true });
    },
    // Drag: main tracks the real cursor so multiple displays and scaling are handled.
    'cat:drag-start'(event) {
      if (!fromCat(event) || resizing) return;
      const [x, y] = win.getPosition();
      drag = { x, y, cursor: screen.getCursorScreenPoint() };
    },
    'cat:drag-move'(event) {
      if (!fromCat(event) || !drag) return;
      const c = screen.getCursorScreenPoint();
      win.setPosition(Math.round(drag.x + c.x - drag.cursor.x), Math.round(drag.y + c.y - drag.cursor.y));
    },
    'cat:drag-end'(event) {
      if (!fromCat(event) || !drag) return;
      drag = null;
      place(catFromWindow());
      rememberPosition();
      saveNow();
    },
    // Resize: the grip in the bottom-right corner, with the cat's top-left fixed.
    'cat:resize-start'(event) {
      if (!fromCat(event) || drag) return;
      resizing = { bounds: { ...catBounds }, cursor: screen.getCursorScreenPoint() };
    },
    'cat:resize-move'(event) {
      if (!fromCat(event) || !resizing) return;
      const c = screen.getCursorScreenPoint();
      const next = geometry.resizeFromCorner(resizing.bounds, c.x - resizing.cursor.x, c.y - resizing.cursor.y);
      if (next.width === size) return;
      size = next.width;
      place(next);
    },
    'cat:resize-end'(event) {
      if (!fromCat(event) || !resizing) return;
      resizing = null;
      rememberPosition();
      saveNow();
    },
  };
  for (const [channel, fn] of Object.entries(handlers)) ipcMain.on(channel, fn);

  return {
    show(session) {
      sessions.delete(session.id); // re-insert so the Map stays ordered by last change
      sessions.set(session.id, snapshot(session));
      ensureWindow(session.project);
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
      for (const [channel, fn] of Object.entries(handlers)) ipcMain.off(channel, fn);
      if (saveTimer) saveNow();
      if (win) win.destroy();
    },
  };
}

module.exports = { createCatController };
