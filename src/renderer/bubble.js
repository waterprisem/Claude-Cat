// Speech bubble text rules. Shared by the renderer (globalThis.CatBubble) and tests.

(function (root) {
  const FALLBACK = {
    coding: 'Thinking...',
    waiting: 'Claude needs your attention',
    done: 'Ready for your next prompt',
  };

  // Hover text for a state; empty text falls back to something sensible.
  function bubbleText(state, text) {
    const clean = typeof text === 'string' ? text.trim() : '';
    if (clean) return clean;
    return FALLBACK[state] || FALLBACK.done;
  }

  // Longest word-boundary prefix (plus an ellipsis) for which fits() is true.
  // fits(candidate) measures the rendered text; the full text is tried first.
  function fitText(text, fits) {
    if (fits(text)) return text;
    const words = text.split(' ');
    let lo = 1;
    let hi = words.length - 1;
    let best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const candidate = words.slice(0, mid).join(' ').replace(/[\s.,;:!?…-]+$/, '') + '…';
      if (fits(candidate)) {
        best = candidate;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best || words[0].replace(/[\s.,;:!?…-]+$/, '') + '…';
  }

  const api = { bubbleText, fitText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CatBubble = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
