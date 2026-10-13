import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

async function interrupt(t, command, url, marker, signal) {
 const child = spawn(process.execPath, [fileURLToPath(new URL('../test-support/log-tail-child.js', import.meta.url)), command, url], { env: process.env });
 t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
 let output = '';
 let errors = '';
 child.stderr.on('data', data => { errors += data; });
 const exit = once(child, 'close');
 await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.stdout.on('data', data => { output += data; if (output.includes(marker)) resolve(); });
  exit.then(() => reject(new Error(`Exited before ${marker}: ${errors}`)));
 });
 child.kill(signal);
 const [code, receivedSignal] = await exit;
 assert.equal(receivedSignal, null, errors);
 assert.equal(code, signal === 'SIGINT' ? 130 : 143, errors);
 if (marker !== 'WAITING') assert.match(output, /CLOSED/, 'The stream must be destroyed before exiting');
}

for (const command of ['logs', 'php-logs']) {
 test(`${command} tail closes the live stream on SIGINT despite another signal handler`, { timeout: 10000 }, async t => {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('event: log\ndata: {"message":"example"}\n\n'); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await interrupt(t, command, `http://127.0.0.1:${server.address().port}`, 'READY', 'SIGINT');
 });
 test(`${command} tail stops while connecting`, { timeout: 10000 }, t => interrupt(t, command, 'pending', 'WAITING', 'SIGINT'));
}

test('tail stops on SIGTERM while waiting to reconnect', { timeout: 10000 }, async t => {
 const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('data: example\n\n'); });
 server.listen(0, '127.0.0.1');
 await once(server, 'listening');
 t.after(() => { server.closeAllConnections(); server.close(); });
 await interrupt(t, 'logs', `http://127.0.0.1:${server.address().port}`, 'RETRY', 'SIGTERM');
});
