// Draws the cat sprite on a canvas and runs the animation for the current state.

const { modeFor, nextStep } = window.CatAnimation;

const canvas = document.getElementById('cat');
const ctx = canvas.getContext('2d');

let frames = null; // { coding: ImageBitmap[], idle: ImageBitmap[] }
let timing = null;
let mode = 'idle';
let step = 0;
let current = null; // bitmap on screen
let timer = null;

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

window.addEventListener('resize', fitCanvas);
window.cat.ready();
