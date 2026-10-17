// Pointer-over-cat test against the coarse mask. Shared by the renderer (globalThis.CatHit) and tests.

(function (root) {
  // x, y: pointer position in CSS px inside a w*h window.
  function hitMask(mask, grid, x, y, w, h) {
    if (!mask || !(w > 0) || !(h > 0) || x < 0 || y < 0 || x >= w || y >= h) return false;
    const cx = Math.floor((x / w) * grid);
    const cy = Math.floor((y / h) * grid);
    return mask[cy * grid + cx] === 1;
  }

  const api = { hitMask };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CatHit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
