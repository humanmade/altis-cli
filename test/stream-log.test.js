import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { streamLog } from '../dist/lib/commands/stack/util.js';

async function captureStream(t, id = 'build-id') {
 const stream = new EventEmitter();
 stream.destroy = () => stream.emit('close');
 t.after(() => stream.destroy());
 t.mock.timers.enable({ apis: ['setInterval'] });
 let output = '';
 let status = '';
 t.mock.method(process.stdout, 'write', chunk => { output += chunk; return true; });
 t.mock.method(process.stderr, 'write', chunk => { status += chunk; return true; });
 const done = streamLog({ getLogStream: async () => stream }, 'example-dev-01', id);
 await Promise.resolve();
 return {
  stream, done,
  output: () => output,
  frame: () => { status = ''; t.mock.timers.tick(34); return status; },
  finish: (type, data = '') => { status = ''; stream.emit('data', { type, data }); return status; },
 };
}

test('build output changes Connecting to Streaming even without an open event', async t => {
 const log = await captureStream(t);
 assert.match(log.frame(), /Connecting…/);
 log.stream.emit('data', { type: 'log', data: JSON.stringify({ level: 'debug', message: 'Now using node' }) });
 assert.match(log.frame(), /Streaming logs…/);
 assert.match(log.output(), /→ Now using node/);
 log.finish('complete');
 await log.done;
});

test('connection and retry events display the current connection state', async t => {
 const log = await captureStream(t);
 log.stream.emit('open');
 assert.match(log.frame(), /Streaming logs…/);
 log.stream.emit('retry');
 assert.match(log.frame(), /Reconnecting…/);
 log.stream.emit('reconnect');
 assert.match(log.frame(), /Streaming logs…/);
 log.stream.emit('data', { type: 'log', data: JSON.stringify({ level: 'info', message: 'Uploading artifacts' }) });
 assert.match(log.frame(), /Uploading artifacts/);
 log.finish('complete');
 await log.done;
});

for (const type of ['complete', 'fail']) {
 test(`${type} flushes pending logs and removes the status bar`, async t => {
  const log = await captureStream(t);
  log.stream.emit('open');
  log.frame();
  log.stream.emit('data', { type: 'log', data: JSON.stringify({ level: 'debug', message: 'Final build output' }) });
  const settled = type === 'fail' ? assert.rejects(log.done, /Build failed/) : log.done;
  const final = log.finish(type, JSON.stringify({ message: 'Build failed', level: 'error' }));
  await settled;
  assert.match(log.output(), /Final build output/);
  assert.match(final, type === 'fail' ? /Failed\./ : /Complete!/);
  assert.doesNotMatch(final, /Streaming logs|Connecting|\[/);
  assert.equal(log.frame(), '', 'Rendering must stop after completion');
 });
}

for (const type of ['complete', 'fail']) {
 test(`CodeBuild wrapped ${type} is handled as a terminal event`, async t => {
  const log = await captureStream(t, '/aws/codebuild/example-dev-01:123');
  const marker = { type, data: type === 'fail' ? { level: 'error', message: 'Build failed' } : [], message_id: 1 };
  const settled = type === 'fail' ? assert.rejects(log.done, /Build failed/) : log.done;
  const final = log.finish('log', JSON.stringify({ level: 'debug', message: JSON.stringify(marker) }));
  await settled;
  assert.match(final, type === 'fail' ? /Failed\./ : /Complete!/);
  assert.doesNotMatch(log.output(), /"message_id"/);
  assert.equal(log.frame(), '');
 });
}

for (const id of ['build-id', '/aws/codebuild/example-dev-01:123']) {
 test(`ordinary JSON cannot end task ${id}`, async t => {
  const marker = { type: 'complete', data: [], message_id: 1 };
  const log = await captureStream(t, id);
  const messages = id === 'build-id' ? [JSON.stringify(marker)] : [
   'ordinary output', '{invalid json',
   JSON.stringify({ type: 'complete', data: [] }),
   JSON.stringify({ ...marker, message_id: 0 }),
   JSON.stringify({ ...marker, data: ['ordinary payload'] }),
  ];
  for (const message of messages) {
   log.finish('log', JSON.stringify({ level: 'debug', message }));
   assert.match(log.frame(), /Streaming logs…/);
   assert.ok(log.output().includes(message));
  }
  log.finish('complete');
  await log.done;
 });
}

const run = promisify(execFile);
for (const type of ['complete', 'fail']) {
 test(`build command exits on wrapped CodeBuild ${type} over SSE`, { timeout: 10000 }, async t => {
  const marker = { type, data: type === 'fail' ? { level: 'error', message: 'Build failed' } : [], message_id: 1 };
  const server = http.createServer((req, res) => {
   res.writeHead(200, { 'Content-Type': 'text/event-stream' });
   res.write(`event: log\ndata: ${JSON.stringify({ level: 'debug', message: JSON.stringify(marker) })}\n\n`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = new URL('../dist/lib/commands/stack/build.js', import.meta.url).href;
  const script = `
   const { default: build } = await import(${JSON.stringify(url)});
   await build.handler({ stack: 'example-dev-01', resume: '/aws/codebuild/example-dev-01:123', config: { get: key => key === 'vantage_token' ? 'test-token' : undefined } });
   console.log('BUILD_DONE');
  `;
  const child = run(process.execPath, ['--input-type=module', '--eval', script], {
   env: { ...process.env, VANTAGE_URL: `http://127.0.0.1:${server.address().port}/api/` }, timeout: 5000,
  });
  if (type === 'complete') {
   const result = await child;
   assert.match(result.stdout, /BUILD_DONE/);
   assert.match(result.stderr, /Complete!/);
   assert.doesNotMatch(result.stdout, /"message_id"/);
  } else {
   await assert.rejects(child, error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Build failed/);
    assert.doesNotMatch(error.stdout, /BUILD_DONE/);
    return true;
   });
  }
 });
}
