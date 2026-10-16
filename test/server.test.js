const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const server = require('../src/main/server');

function request(port, { method = 'POST', path = '/event', host, type = 'application/json', body = '{}' } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': type };
    if (host !== undefined) headers.Host = host;
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('server', async (t) => {
  const events = [];
  const srv = await server.start({ port: 0, onEvent: (raw) => events.push(raw) });
  const port = srv.address().port;
  t.after(() => srv.close());

  assert.equal(srv.address().address, '127.0.0.1');

  await t.test('accepts an event with 200 and an empty body', async () => {
    const res = await request(port, { body: JSON.stringify({ hook_event_name: 'Stop', session_id: 'a' }) });
    assert.equal(res.status, 200);
    assert.equal(res.body, '');
    await new Promise(setImmediate);
    assert.deepEqual(events.at(-1), { hook_event_name: 'Stop', session_id: 'a' });
  });

  await t.test('rejects wrong path, method, host and content type', async () => {
    assert.equal((await request(port, { path: '/' })).status, 404);
    assert.equal((await request(port, { method: 'GET', body: '' })).status, 404);
    assert.equal((await request(port, { host: `evil.example:${port}` })).status, 403);
    assert.equal((await request(port, { type: 'text/plain' })).status, 415);
    assert.equal((await request(port, { host: `localhost:${port}` })).status, 200);
  });

  await t.test('invalid JSON is answered and ignored', async () => {
    const before = events.length;
    assert.equal((await request(port, { body: '{nope' })).status, 200);
    await new Promise(setImmediate);
    assert.equal(events.length, before);
  });

  await t.test('rejects oversized bodies', async () => {
    const before = events.length;
    const res = await request(port, { body: 'x'.repeat(server.MAX_BODY + 1) }).catch((err) => ({ status: err.code }));
    assert.ok(res.status === 413 || res.status === 'ECONNRESET' || res.status === 'EPIPE', String(res.status));
    await new Promise(setImmediate);
    assert.equal(events.length, before);
  });
});
