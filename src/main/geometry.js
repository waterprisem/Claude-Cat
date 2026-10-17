// Window geometry helpers. Pure: no Electron.

const SIZE_LIMITS = Object.freeze({ min: 64, max: 256, step: 16 });

// Next size in direction dir (-1, 0 or +1), snapped to the step and clamped.
function stepSize(size, dir, { min, max, step } = SIZE_LIMITS) {
  const base = Number.isFinite(size) ? Math.round(size / step) * step : min;
  return Math.min(max, Math.max(min, base + dir * step));
}

function bottomCenter(b) {
  return { x: b.x + b.width / 2, y: b.y + b.height };
}

function boundsFromBottomCenter(p, size) {
  return { x: Math.round(p.x - size / 2), y: Math.round(p.y - size), width: size, height: size };
}

// New square bounds of `size` with the same bottom-center: the cat grows upward and outward.
function resizeAnchored(b, size) {
  return boundsFromBottomCenter(bottomCenter(b), size);
}

// Dragging the bottom-right corner by (dx, dy): the top-left stays put and the size
// follows the average of both directions, snapped to the step and clamped.
function resizeFromCorner(b, dx, dy, limits = SIZE_LIMITS) {
  const size = stepSize(b.width + (dx + dy) / 2, 0, limits);
  return { x: b.x, y: b.y, width: size, height: size };
}

function overlap(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function centerDistance(a, b) {
  return Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2));
}

// The work area that bounds overlap most, or the nearest one if they overlap none.
function pickWorkArea(b, areas) {
  let best = areas[0];
  for (const a of areas) {
    const o = overlap(b, a);
    const bestO = overlap(b, best);
    if (o > bestO || (o === bestO && o === 0 && centerDistance(b, a) < centerDistance(b, best))) best = a;
  }
  return best;
}

const clamp = (v, lo, hi) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));

// Moves bounds fully inside the work area it overlaps most (or the nearest one).
function clampToWorkAreas(b, areas) {
  if (!areas.length) return { ...b };
  const best = pickWorkArea(b, areas);
  return {
    ...b,
    x: clamp(b.x, best.x, best.x + best.width - b.width),
    y: clamp(b.y, best.y, best.y + best.height - b.height),
  };
}

// First spot for a new cat that overlaps none of the occupied ones: the wanted spot,
// then leftward along its row, then the rows above. Stays inside the area.
function staggerSpot(b, occupied, area, gap = 12) {
  const free = (c) => !occupied.some((o) => overlap(c, o) > 0);
  if (free(b)) return { ...b };
  const minX = area ? area.x : -Infinity;
  const minY = area ? area.y : -Infinity;
  for (let row = 0; b.y - row * (b.height + gap) >= minY; row++) {
    const y = b.y - row * (b.height + gap);
    for (let x = b.x; x >= minX; x -= b.width + gap) {
      const c = { ...b, x, y };
      if (free(c)) return c;
    }
    if (row > 1000) break;
  }
  return { ...b }; // the screen is full of cats: overlap
}

// Window around the cat with room for the speech bubble: above the cat, or below it
// when there is no room above. Centered on the cat, then shifted to stay on screen.
// Returns the window bounds, the cat's offset inside it, and where the bubble goes.
function layoutWindow(cat, area, { width: minWidth = 260, zone = 84 } = {}) {
  const width = Math.max(cat.width, minWidth);
  const height = cat.height + zone;
  const below = area ? cat.y - zone < area.y : false;
  let x = Math.round(cat.x + cat.width / 2 - width / 2);
  if (area) x = clamp(x, area.x, area.x + area.width - width);
  const y = below ? cat.y : cat.y - zone;
  return { window: { x, y, width, height }, cat: { x: cat.x - x, y: cat.y - y }, below };
}

module.exports = { SIZE_LIMITS, stepSize, bottomCenter, boundsFromBottomCenter, resizeAnchored, resizeFromCorner, staggerSpot, pickWorkArea, clampToWorkAreas, layoutWindow };
