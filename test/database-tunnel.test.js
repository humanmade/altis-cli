import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import net from 'node:net';
import test from 'node:test';
import { forwardSession, parseSession } from '../dist/lib/database-tunnel.js';
import command from '../dist/lib/commands/stack/database/tunnel.js';

class Session extends EventEmitter {
  writes = [];
  closed = 0;
  responses = [];
  writeRaw(data) { this.writes.push(Buffer.from(data)); this.emit('written'); }
  sendHandshakeResponse(data) { this.responses.push(data); }
  close() { this.closed++; this.emit('disconnect'); }
}
const handshake = { RequestedClientActions: [{ ActionType: 'SessionType', ActionParameters: {
  SessionType: 'Port', Properties: { type: 'LocalPortForwarding' },
} }] };
async function start(t, port = 0) {
  const session = new Session();
  const forwarding = forwardSession(session, port);
  t.after(() => forwarding.close());
  session.emit('handshake', handshake);
  const listening = once(forwarding.server, 'listening');
  session.emit('handshakeComplete', {});
  await listening;
  return { session, ...forwarding };
}
async function connect(t, server) {
  const socket = net.connect(server.address().port, '127.0.0.1');
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  return socket;
}

test('validates session input without echoing credentials in errors', () => {
  const valid = { id: 'session', token: 'secret', stream_url: 'wss://example.com/session' };
  assert.deepEqual(parseSession(JSON.stringify(valid)), valid);
  for (const input of ['secret', 'null', '{}', JSON.stringify({ ...valid, token: '' }),
    JSON.stringify({ ...valid, stream_url: 'https://example.com' })]) {
    assert.throws(() => parseSession(input), error => !error.message.includes('secret'));
  }
});

test('published SSM reports missing port support before requesting a session or opening a socket', async () => {
  await assert.rejects(command.handler({ config: {}, port: 3306 }), /socket support/);
});

test('validates local port before requesting a session', async () => {
  for (const port of [0, -1, 65536, 1.5, NaN]) {
    await assert.rejects(command.handler({ config: {}, port }), /--port/);
  }
});

test('round-trips binary payloads larger than the old 8KB buffer and buffers the greeting', async t => {
  const { session, server, done } = await start(t);
  const greeting = Buffer.from([0, 255, 128, 1, 0]);
  session.emit('rawOutput', greeting);
  const socket = await connect(t, server);
  const received = [];
  let bytes = 0;
  const payload = Buffer.alloc(128 * 1024);
  for (let i = 0; i < payload.length; i++) payload[i] = i % 256;
  const all = new Promise(resolve => socket.on('data', data => {
    received.push(data); bytes += data.length;
    if (bytes === greeting.length + payload.length) resolve();
  }));
  session.emit('rawOutput', payload);
  await all;
  assert.deepEqual(Buffer.concat(received), Buffer.concat([greeting, payload]));
  const written = once(session, 'written');
  socket.write(payload);
  await written;
  // TCP may split the input; wait until all chunks have reached SSM.
  while (Buffer.concat(session.writes).length < payload.length) await once(session, 'written');
  assert.deepEqual(Buffer.concat(session.writes), payload);
  socket.destroy();
  await done;
  assert.equal(session.closed, 1);
});

test('rejects a second client without sharing the database stream', async t => {
  const { session, server, done } = await start(t);
  const first = await connect(t, server);
  const second = await connect(t, server);
  await once(second, 'close');
  assert.equal(first.destroyed, false);
  assert.equal(session.closed, 0);
  first.destroy();
  await done;
});

test('pauses local writes until SSM resumes', async t => {
  const { session, server, done } = await start(t);
  const socket = await connect(t, server);
  session.emit('pause');
  socket.write('query');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(session.writes.length, 0);
  const written = once(session, 'written');
  session.emit('resume');
  await written;
  assert.equal(Buffer.concat(session.writes).toString(), 'query');
  socket.destroy();
  await done;
});

test('bind failure rejects and closes the SSM session', async t => {
  const occupied = net.createServer();
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  t.after(() => occupied.close());
  const session = new Session();
  const forwarding = forwardSession(session, occupied.address().port);
  const rejected = assert.rejects(forwarding.done, { code: 'EADDRINUSE' });
  session.emit('handshake', handshake);
  session.emit('handshakeComplete', {});
  await rejected;
  assert.equal(session.closed, 1);
});

test('unsupported actions fail handshake and release process listeners', async () => {
  const count = process.listenerCount('SIGINT');
  const session = new Session();
  const { done } = forwardSession(session, 0);
  const rejected = assert.rejects(done, /Unsupported/);
  session.emit('handshake', { RequestedClientActions: [...handshake.RequestedClientActions, { ActionType: 'KMSEncryption' }] });
  await rejected;
  assert.equal(session.responses[0].ProcessedClientActions[1].ActionStatus, 3);
  assert.equal(session.closed, 1);
  assert.equal(process.listenerCount('SIGINT'), count);
});

test('stops if output exceeds buffer limit before a client connects', async () => {
  const session = new Session();
  const { done } = forwardSession(session, 0);
  const rejected = assert.rejects(done, /buffer limit/);
  session.emit('rawOutput', Buffer.alloc(16 * 1024 * 1024 + 1));
  await rejected;
  assert.equal(session.closed, 1);
});

test('remote disconnect closes the local listener and client', async t => {
  const { session, server, done } = await start(t);
  const socket = await connect(t, server);
  const closed = once(socket, 'close');
  const rejected = assert.rejects(done, /lost connection/);
  session.emit('disconnect', 'lost connection');
  await rejected;
  await closed;
  assert.equal(server.listening, false);
});
