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

function overlap(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function centerDistance(a, b) {
  return Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2));
}

// Moves bounds fully inside the work area it overlaps most (or the nearest one).
function clampToWorkAreas(b, areas) {
  if (!areas.length) return { ...b };
  let best = areas[0];
  for (const a of areas) {
    const o = overlap(b, a);
    const bestO = overlap(b, best);
    if (o > bestO || (o === bestO && o === 0 && centerDistance(b, a) < centerDistance(b, best))) best = a;
  }
  const clamp = (v, lo, hi) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));
  return {
    ...b,
    x: clamp(b.x, best.x, best.x + best.width - b.width),
    y: clamp(b.y, best.y, best.y + best.height - b.height),
  };
}

module.exports = { SIZE_LIMITS, stepSize, bottomCenter, boundsFromBottomCenter, resizeAnchored, clampToWorkAreas };
