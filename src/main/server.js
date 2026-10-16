// Localhost HTTP receiver for hook events. Answers first, works afterwards.

const http = require('node:http');

const HOST = '127.0.0.1';
const MAX_BODY = 2 * 1024 * 1024;

function allowedHost(header, port) {
  return header === `127.0.0.1:${port}` || header === `localhost:${port}`;
}

function reply(res, status) {
  res.writeHead(status, { 'Content-Length': '0', Connection: 'close' });
  res.end();
}

// onEvent(raw) receives the parsed JSON payload (untrusted). Resolves with the server once listening.
function start({ port, onEvent }) {
  const server = http.createServer((req, res) => {
    const actualPort = server.address().port;
    if (req.method !== 'POST' || req.url !== '/event') return reply(res, 404);
    if (!allowedHost(req.headers.host, actualPort)) return reply(res, 403);
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return reply(res, 415);

    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (chunk) => {
      if (tooBig) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        tooBig = true;
        chunks.length = 0;
        reply(res, 413);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooBig) return;
      reply(res, 200);
      const body = Buffer.concat(chunks).toString('utf8');
      setImmediate(() => {
        let raw;
        try {
          raw = JSON.parse(body);
        } catch {
          return;
        }
        try {
          onEvent(raw);
        } catch (err) {
          console.error('[claude-cat] event handler failed:', err);
        }
      });
    });
    req.on('error', () => {});
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

module.exports = { start, HOST, MAX_BODY };
