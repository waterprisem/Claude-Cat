// Draws the cat sprite, runs the animation, and handles hover, the speech bubble,
// drag, resize and click-through.

const { modeFor, nextStep } = window.CatAnimation;
const { hitMask } = window.CatHit;
const { bubbleText, fitText } = window.CatBubble;

const canvas = document.getElementById('cat');
const ctx = canvas.getContext('2d');
const grip = document.getElementById('grip');
const bubble = document.getElementById('bubble');
const bubbleProject = document.getElementById('project');
const bubbleTextEl = document.getElementById('text');

let frames = null; // { coding: ImageBitmap[], idle: ImageBitmap[] }
let timing = null;
let mode = 'idle';
let step = 0;
let current = null; // bitmap on screen
let timer = null;
let hit = null; // { mask, grid }
// Where the drawing sits in its square (fractions); the art has wide empty margins.
let extent = { top: 0.12, bottom: 0.85, corner: { x: 0.8, y: 0.85 } };
let layout = null; // { cat: { x, y, size }, below, width, height }, from main
let session = { state: 'done', text: '', project: '' };

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
  if (!layout) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(layout.cat.size * dpr);
  canvas.height = Math.round(layout.cat.size * dpr);
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
  if (init.extent) extent = init.extent;
  if (layout) applyLayout();
  frames = { coding: await loadFrames(init.frames.coding), idle: await loadFrames(init.frames.idle) };
  fitCanvas();
  restart();
});

window.cat.onState((next) => {
  session = next;
  renderBubble();
  setMode(modeFor(next.state));
});

function setMode(next) {
  if (next === mode) return; // e.g. a new tool while already coding: keep the loop going
  mode = next;
  restart();
}

// --- Layout --------------------------------------------------------------------
// The window holds the cat's square plus a zone above (or below) it for the bubble.

const GRIP = 16;

function px(el, props) {
  for (const [k, v] of Object.entries(props)) el.style[k] = `${Math.round(v)}px`;
}

window.cat.onLayout((next) => {
  layout = next;
  applyLayout();
});

function applyLayout() {
  const { x, y, size } = layout.cat;
  px(canvas, { left: x, top: y, width: size, height: size });
  // Just off the drawing's bottom-right point, kept inside the cat's square.
  const gx = Math.min(x + extent.corner.x * size - GRIP / 3, x + size - GRIP);
  const gy = Math.min(y + extent.corner.y * size - GRIP / 3, y + size - GRIP);
  px(grip, { left: gx, top: gy });
  bubble.classList.toggle('below', layout.below);
  fitCanvas();
  renderBubble();
}

// --- Speech bubble -------------------------------------------------------------

const LINE_HEIGHT = 16;
const MAX_LINES = 2;
const TAIL = 6; // gap for the tail between bubble and cat
const EDGE = 2;

function renderBubble() {
  if (!layout) return;
  bubbleProject.textContent = session.project || '';
  // Measure at the left edge so the full max-width is available.
  bubble.style.left = '0px';
  bubble.style.top = '0px';
  bubble.style.bottom = 'auto';
  const fits = (candidate) => {
    bubbleTextEl.textContent = candidate;
    return bubbleTextEl.scrollHeight <= LINE_HEIGHT * MAX_LINES + 1;
  };
  bubbleTextEl.textContent = fitText(bubbleText(session.state, session.text), fits);

  const { x, y, size } = layout.cat;
  const w = bubble.offsetWidth;
  const center = x + size / 2;
  const left = Math.min(Math.max(center - w / 2, EDGE), layout.width - w - EDGE);
  bubble.style.left = `${Math.round(left)}px`;
  bubble.style.setProperty('--tail', `${Math.round(Math.min(Math.max(center - left, 12), w - 12))}px`);
  // Pin the edge facing the cat, so longer text grows away from it.
  if (layout.below) {
    bubble.style.top = `${Math.round(y + size * extent.bottom + TAIL)}px`;
  } else {
    bubble.style.top = 'auto';
    bubble.style.bottom = `${Math.round(layout.height - (y + size * extent.top) + TAIL)}px`;
  }
  bubble.classList.add('ready');
}

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
  if (hit === null || !layout) return false;
  const { x: cx, y: cy, size } = layout.cat;
  return hitMask(hit.mask, hit.grid, x - cx, y - cy, size, size);
}

function within(el, x, y) {
  const r = el.getBoundingClientRect();
  return x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2;
}

// The grip and the bubble only count while they are shown.
function overControls(x, y) {
  return hovered && (within(grip, x, y) || within(bubble, x, y));
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

// --- Resize grip (main follows the real cursor, like dragging) ---------------

grip.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  press = { resizing: true };
  grip.setPointerCapture(e.pointerId);
  document.body.classList.add('resizing');
  window.cat.resizeStart();
});

grip.addEventListener('pointermove', () => {
  if (press && press.resizing) window.cat.resizeMove();
});

function endResize(e) {
  if (!press || !press.resizing) return;
  window.cat.resizeEnd();
  press = null;
  document.body.classList.remove('resizing');
  onPointer(e.clientX, e.clientY);
}
grip.addEventListener('pointerup', endResize);
grip.addEventListener('pointercancel', endResize);

// Moving to a display with a different scale changes devicePixelRatio.
window.addEventListener('resize', fitCanvas);
window.cat.ready();
