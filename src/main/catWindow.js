// One cat window: transparent, always on top, on every Space, never focused.
// Clicks on transparent pixels pass through; the cat can be dragged and resized.
// The window is bigger than the cat to leave room for the hover speech bubble.

const path = require('node:path');
const { BrowserWindow, screen } = require('electron');
const geometry = require('./geometry');
const { clip } = require('./text');

const BUBBLE = { width: 260, zone: 84 }; // room for the speech bubble beside the cat
const BUBBLE_TEXT_MAX = 120;

function workAreas() {
  return screen.getAllDisplays().map((d) => d.workArea);
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

// init: the cat:init payload (frames, mask, timing), shared by all cats.
// onMoved(cat) after a drag or resize; onResize(size) while the grip is dragged;
// onResized() when it is let go; onClosed() if the window goes away.
function createCat({ init, catBounds: startBounds, size: startSize, onMoved, onResize, onResized, onClosed }) {
  let size = startSize;
  let catBounds = null; // the cat's square in screen coordinates
  let layout = null; // { window, cat: offset inside the window, below }
  let ready = false;
  let drag = null;
  let resizing = null; // { bounds, cursor } while the corner grip is dragged
  let state = null; // last state sent (or to send once ready)
  let win = null;

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

  // Where the cat is now, following the window while it is dragged.
  function catFromWindow() {
    const [x, y] = win.getPosition();
    return { x: x + layout.cat.x, y: y + layout.cat.y, width: size, height: size };
  }

  function sendState() {
    if (win && ready && state) win.webContents.send('cat:state', state);
  }

  place(startBounds);
  win = createWindow(layout.window);
  win.once('ready-to-show', () => win && win.showInactive());
  win.on('closed', () => {
    win = null;
    onClosed();
  });

  const handlers = {
    'cat:ready'() {
      ready = true;
      win.webContents.send('cat:init', init);
      sendLayout();
      sendState();
    },
    'cat:interactive'(value) {
      if (typeof value === 'boolean') win.setIgnoreMouseEvents(!value, { forward: true });
    },
    // Drag: main tracks the real cursor so multiple displays and scaling are handled.
    'cat:drag-start'() {
      if (resizing) return;
      const [x, y] = win.getPosition();
      drag = { x, y, cursor: screen.getCursorScreenPoint() };
    },
    'cat:drag-move'() {
      if (!drag) return;
      const c = screen.getCursorScreenPoint();
      win.setPosition(Math.round(drag.x + c.x - drag.cursor.x), Math.round(drag.y + c.y - drag.cursor.y));
    },
    'cat:drag-end'() {
      if (!drag) return;
      drag = null;
      place(catFromWindow());
      onMoved(catBounds);
    },
    // Resize: the grip in the bottom-right corner, with the cat's top-left fixed.
    'cat:resize-start'() {
      if (drag) return;
      resizing = { bounds: { ...catBounds }, cursor: screen.getCursorScreenPoint() };
    },
    'cat:resize-move'() {
      if (!resizing) return;
      const c = screen.getCursorScreenPoint();
      const next = geometry.resizeFromCorner(resizing.bounds, c.x - resizing.cursor.x, c.y - resizing.cursor.y);
      if (next.width === size) return;
      size = next.width;
      place(next);
      onResize(size);
    },
    'cat:resize-end'() {
      if (!resizing) return;
      resizing = null;
      onMoved(catBounds);
      onResized();
    },
  };

  return {
    owns: (webContents) => win !== null && webContents === win.webContents,
    handle(channel, value) {
      if (win && handlers[channel]) handlers[channel](value);
    },
    setState(s) {
      state = { state: s.state, text: clip(s.text || '', BUBBLE_TEXT_MAX), project: s.project };
      sendState();
    },
    // Another cat was resized: follow it, anchored on this cat's bottom-center.
    setSize(next) {
      if (next === size || resizing) return;
      size = next;
      place(geometry.resizeAnchored(catBounds, size));
    },
    bounds: () => ({ ...catBounds }),
    busy: () => drag !== null || resizing !== null,
    destroy() {
      if (win) win.destroy();
    },
  };
}

module.exports = { createCat, workAreas, BUBBLE };
