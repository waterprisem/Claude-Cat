// All cat windows: one per Claude Code session. Loads the art once, routes IPC to the
// cat that sent it, places new cats, and saves positions (per project) and size (global).

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ipcMain, nativeImage, screen } = require('electron');
const config = require('./config');
const geometry = require('./geometry');
const { maskFromBitmap, unionMasks, dilate, maskExtent } = require('./hitMask');
const { createCat, workAreas } = require('./catWindow');

const ROOT = path.join(__dirname, '..', '..');
const PROCESSED = path.join(ROOT, 'assets', 'processed');
const MARGIN = 24;
const MASK_GRID = 64;
const CHANNELS = ['cat:ready', 'cat:interactive', 'cat:drag-start', 'cat:drag-move', 'cat:drag-end', 'cat:resize-start', 'cat:resize-move', 'cat:resize-end'];

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

function defaultCatBounds(size) {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - size - MARGIN, y: workArea.y + workArea.height - size - MARGIN, width: size, height: size };
}

function createCatController(settings) {
  let assets;
  try {
    assets = loadFrames();
  } catch (err) {
    console.warn(`[claude-cat] no processed frames (${err.message}), run \`npm run assets\``);
    return { show() {}, remove() {}, destroy() {} };
  }

  const init = {
    frames: assets.urls,
    mask: assets.mask,
    grid: MASK_GRID,
    extent: assets.extent,
    timing: {
      codingFps: settings.codingFps,
      blinkFps: settings.blinkFps,
      idleHoldMinMs: settings.idleHoldMinMs,
      idleHoldMaxMs: settings.idleHoldMaxMs,
    },
  };
  const cats = new Map(); // session id -> { cat, project }
  const positions = { ...settings.positions }; // project -> bottom-center point
  let size = geometry.stepSize(settings.catSize, 0);

  function saveNow() {
    try {
      config.save({ catSize: size, positions });
    } catch (err) {
      console.error(`[claude-cat] could not save config: ${err.message}`);
    }
  }

  // The project's saved spot (or the default corner), moved aside if another cat is there.
  function startBounds(project) {
    const saved = positions[project];
    const wanted = saved ? geometry.boundsFromBottomCenter(saved, size) : defaultCatBounds(size);
    const areas = workAreas();
    const onScreen = geometry.clampToWorkAreas(wanted, areas);
    const occupied = [...cats.values()].map((c) => c.cat.bounds());
    return geometry.staggerSpot(onScreen, occupied, areas.length ? geometry.pickWorkArea(onScreen, areas) : null);
  }

  function create(id, project) {
    const entry = { project, cat: null };
    entry.cat = createCat({
      init,
      size,
      catBounds: startBounds(project),
      onMoved(bounds) {
        positions[entry.project] = geometry.bottomCenter(bounds);
        saveNow();
      },
      onResize(next) {
        size = next;
        for (const other of cats.values()) if (other !== entry) other.cat.setSize(size);
      },
      onResized: saveNow,
      onClosed() {
        if (cats.get(id) === entry) cats.delete(id);
      },
    });
    cats.set(id, entry);
    return entry;
  }

  function route(channel) {
    return (event, value) => {
      for (const { cat } of cats.values()) {
        if (cat.owns(event.sender)) return cat.handle(channel, value);
      }
    };
  }
  const handlers = Object.fromEntries(CHANNELS.map((channel) => [channel, route(channel)]));
  for (const [channel, fn] of Object.entries(handlers)) ipcMain.on(channel, fn);

  return {
    show(session) {
      const entry = cats.get(session.id) || create(session.id, session.project);
      entry.project = session.project;
      entry.cat.setState(session);
    },
    remove(id) {
      const entry = cats.get(id);
      if (!entry) return;
      cats.delete(id);
      entry.cat.destroy();
    },
    has: (id) => cats.has(id),
    destroy() {
      for (const [channel, fn] of Object.entries(handlers)) ipcMain.off(channel, fn);
      for (const { cat } of cats.values()) cat.destroy();
      cats.clear();
    },
  };
}

module.exports = { createCatController };
