// Pure animation timing, shared by the renderer (globalThis.CatAnimation) and tests (module.exports).

(function (root) {
  // waiting and done look identical: both idle.
  function modeFor(state) {
    return state === 'coding' ? 'coding' : 'idle';
  }

  // Returns the frame to draw at `step`, how long to hold it, and the following step.
  // coding: loop every frame at codingFps.
  // idle: hold frame 0 for a random idleHoldMinMs..idleHoldMaxMs, then play the rest once at blinkFps.
  function nextStep(mode, step, { count, timing, random = Math.random }) {
    if (count <= 0) return { frame: 0, delayMs: 1000, next: 0 };
    step = step % count;
    if (mode === 'coding') {
      return { frame: step, delayMs: 1000 / timing.codingFps, next: (step + 1) % count };
    }
    if (step === 0) {
      const span = timing.idleHoldMaxMs - timing.idleHoldMinMs;
      return { frame: 0, delayMs: timing.idleHoldMinMs + random() * span, next: count > 1 ? 1 : 0 };
    }
    return { frame: step, delayMs: 1000 / timing.blinkFps, next: (step + 1) % count };
  }

  const api = { modeFor, nextStep };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CatAnimation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
