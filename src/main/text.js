// Short, plain-text heads of longer messages.

function plain(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [label](url) -> label
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+\.|>)\s+/gm, '') // headings, bullets, quotes
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// At most `max` characters, cut on a word boundary with an ellipsis. No markdown handling.
function clip(text, max) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const base = space > max * 0.5 ? cut.slice(0, space) : cut;
  return base.replace(/[\s.,;:!?-]+$/, '') + '…';
}

// First `max` characters of a message as plain text.
function head(text, max = 120) {
  if (typeof text !== 'string') return '';
  return clip(plain(text), max);
}

module.exports = { head, clip, plain };
