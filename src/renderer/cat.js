// Draws the cat sprite, runs the animation, and handles hover, drag, resize and click-through.

const { modeFor, nextStep } = window.CatAnimation;
const { hitMask } = window.CatHit;

const canvas = document.getElementById('cat');
const ctx = canvas.getContext('2d');
const controls = document.getElementById('controls');
const plus = document.getElementById('plus');
const minus = document.getElementById('minus');

let frames = null; // { coding: ImageBitmap[], idle: ImageBitmap[] }
let timing = null;
let mode = 'idle';
let step = 0;
let current = null; // bitmap on screen
let timer = null;
let hit = null; // { mask, grid }
let limits = null;

async function loadFrames(urls) {
  return Promise.all(
    urls.map(async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      return createImageBitmap(img);
    })
  );
}

function draw(bitmap) {
  current = bitmap;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bitmap) ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
}

function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.imageSmoothingQuality = 'high';
  draw(current);
}

function tick() {
  const set = frames[mode];
  const r = nextStep(mode, step, { count: set.length, timing });
  draw(set[r.frame]);
  step = r.next;
  timer = setTimeout(tick, r.delayMs);
}

function restart() {
  clearTimeout(timer);
  step = 0;
  if (frames) tick();
}

window.cat.onInit(async (init) => {
  timing = init.timing;
  hit = { mask: init.mask, grid: init.grid };
  limits = init.limits;
  updateButtons();
  frames = { coding: await loadFrames(init.frames.coding), idle: await loadFrames(init.frames.idle) };
  fitCanvas();
  restart();
});

window.cat.onState(({ state }) => {
  const next = modeFor(state);
  if (next === mode) return; // e.g. a new tool while already coding: keep the loop going
  mode = next;
  restart();
});

// --- Hover, click-through ---------------------------------------------------
// The window ignores the mouse except while the pointer is over the cat, the
// visible +/- buttons, or during a drag. Moves are still forwarded to us.

const HIDE_DELAY_MS = 400;
let hovered = false;
let hideTimer = null;
let interactive = false;
let press = null;

function setInteractive(value) {
  if (value === interactive) return;
  interactive = value;
  window.cat.setInteractive(value);
}

function setHovered(value) {
  hovered = value;
  document.body.classList.toggle('hover', value);
}

function overCat(x, y) {
  return hit !== null && hitMask(hit.mask, hit.grid, x, y, window.innerWidth, window.innerHeight);
}

function overControls(x, y) {
  if (!hovered) return false;
  const r = controls.getBoundingClientRect();
  return x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2;
}

function onPointer(x, y) {
  const cat = overCat(x, y);
  const ctl = overControls(x, y);
  if (cat || ctl) {
    clearTimeout(hideTimer);
    hideTimer = null;
    if (!hovered) setHovered(true);
  } else if (hovered && !hideTimer && !press) {
    hideTimer = setTimeout(() => {
      hideTimer = null;
      setHovered(false);
    }, HIDE_DELAY_MS);
  }
  setInteractive(press !== null || cat || ctl);
}

document.addEventListener('mousemove', (e) => onPointer(e.clientX, e.clientY));
document.addEventListener('mouseleave', () => {
  if (!press) onPointer(-1, -1);
});

// --- Drag (under 3px of movement counts as a click) -------------------------

const DRAG_THRESHOLD = 3;

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !overCat(e.clientX, e.clientY)) return;
  press = { x: e.screenX, y: e.screenY, dragging: false };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!press) return;
  if (!press.dragging) {
    if (Math.hypot(e.screenX - press.x, e.screenY - press.y) < DRAG_THRESHOLD) return;
    press.dragging = true;
    window.cat.dragStart();
  }
  window.cat.dragMove();
});

function endPress(e) {
  if (press && press.dragging) window.cat.dragEnd();
  press = null;
  onPointer(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', endPress);
canvas.addEventListener('pointercancel', endPress);

// --- Resize buttons ----------------------------------------------------------

function updateButtons() {
  if (!limits) return;
  plus.disabled = window.innerWidth >= limits.max;
  minus.disabled = window.innerWidth <= limits.min;
}

plus.addEventListener('click', () => window.cat.resize(1));
minus.addEventListener('click', () => window.cat.resize(-1));

window.addEventListener('resize', () => {
  fitCanvas();
  updateButtons();
});
window.cat.ready();
