// Coarse opacity mask of the sprite, used to decide where clicks belong to the cat. Pure: no Electron.

// buf: BGRA/RGBA pixels (alpha is byte 3 either way). Returns grid*grid cells, 1 = some pixel above threshold.
function maskFromBitmap(buf, w, h, grid, threshold = 32) {
  const mask = new Uint8Array(grid * grid);
  for (let y = 0; y < h; y++) {
    const row = Math.floor((y * grid) / h) * grid;
    for (let x = 0; x < w; x++) {
      if (buf[(y * w + x) * 4 + 3] > threshold) mask[row + Math.floor((x * grid) / w)] = 1;
    }
  }
  return mask;
}

function unionMasks(masks) {
  const out = new Uint8Array(masks[0].length);
  for (const m of masks) for (let i = 0; i < m.length; i++) out[i] |= m[i];
  return out;
}

// Grows the mask by one cell in all 8 directions so edges are easy to grab.
function dilate(mask, grid) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      if (!mask[y * grid + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < grid && ny < grid) out[ny * grid + nx] = 1;
        }
      }
    }
  }
  return out;
}

// Where the drawing sits inside its square, as fractions of the side:
// top, bottom and left of the art, and its outermost bottom-right point (for the resize grip).
function maskExtent(mask, grid) {
  let top = grid;
  let bottom = -1;
  let left = grid;
  let corner = null;
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      if (!mask[y * grid + x]) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      if (!corner || x + y > corner.x + corner.y || (x + y === corner.x + corner.y && y > corner.y)) corner = { x, y };
    }
  }
  if (!corner) return null;
  return { top: top / grid, bottom: (bottom + 1) / grid, left: left / grid, corner: { x: (corner.x + 1) / grid, y: (corner.y + 1) / grid } };
}

module.exports = { maskFromBitmap, unionMasks, dilate, maskExtent };
