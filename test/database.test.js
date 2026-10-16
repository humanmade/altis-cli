import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { access, readFile, stat } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { Response } from 'node-fetch';
import { createDatabaseTunnel, launchMysql, mysqlConfig, sequelConfig, withConnectionFile } from '../dist/lib/database.js';

const handshake = { RequestedClientActions: [{ ActionType: 'SessionType', ActionParameters: {
  SessionType: 'Port', Properties: { type: 'LocalPortForwarding' },
} }] };
class Session extends EventEmitter {
  closed = 0;
  writeRaw() {}
  sendHandshakeResponse() {}
  close() { this.closed++; this.emit('disconnect'); }
}
function apiFixture(record = { id: 123, aws_ssm_session_id: 'aws-session', stream_url: 'wss://example.test', token: 'secret' }) {
  const calls = [];
  return {
    calls,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return options.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response(JSON.stringify(record));
    },
  };
}
function sessionFactory() {
  const session = new Session();
  queueMicrotask(() => {
    session.emit('handshake', handshake);
    session.emit('handshakeComplete');
  });
  return session;
}
async function unusedPort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('Vantage tunnel uses the AWS ID for transport and Vantage ID for cleanup exactly once', async () => {
  const api = apiFixture();
  const port = await unusedPort();
  const tunnel = await createDatabaseTunnel(api, 'example-app', port, (url, id, token) => {
    assert.equal(url, 'wss://example.test');
    assert.equal(id, 'aws-session');
    assert.equal(token, 'secret');
    return sessionFactory();
  });
  assert.deepEqual(JSON.parse(api.calls[0].options.body), { local_port: port });
  assert.equal(api.calls[0].url, 'stack/applications/example-app/database/sessions');
  await tunnel.close();
  await tunnel.close();
  assert.equal(api.calls.length, 2);
  assert.equal(api.calls[1].options.method, 'DELETE');
  assert.equal(api.calls[1].url, 'stack/applications/example-app/database/sessions/123');
});

test('invalid connection data triggers remote cleanup without exposing the token', async () => {
  const api = apiFixture({ id: 123, aws_ssm_session_id: 'aws-session', stream_url: 'https://invalid.test', token: 'secret' });
  await assert.rejects(createDatabaseTunnel(api, 'example-app', 3306, sessionFactory), error => !error.message.includes('secret'));
  assert.equal(api.calls.at(-1).options.method, 'DELETE');
});

test('a session constructor failure triggers remote cleanup', async () => {
  const api = apiFixture();
  await assert.rejects(createDatabaseTunnel(api, 'example-app', 3306, () => { throw new Error('failed'); }), /failed/);
  assert.equal(api.calls.at(-1).options.method, 'DELETE');
});

test('bind failure terminates the remote session', async t => {
  const occupied = net.createServer();
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  t.after(() => occupied.close());
  const api = apiFixture();
  await assert.rejects(createDatabaseTunnel(api, 'example-app', occupied.address().port, sessionFactory), { code: 'EADDRINUSE' });
  assert.equal(api.calls.filter(call => call.options.method === 'DELETE').length, 1);
});

test('disconnect before handshake fails promptly and terminates the remote session', async () => {
  const api = apiFixture();
  await assert.rejects(createDatabaseTunnel(api, 'example-app', 3306, () => {
    const session = new Session();
    queueMicrotask(() => session.emit('disconnect', 'Connection lost'));
    return session;
  }), /Connection lost/);
  assert.equal(api.calls.at(-1).options.method, 'DELETE');
});

test('connection files are private and removed after success and failure', async () => {
  for (const fail of [false, true]) {
    let filename;
    const operation = withConnectionFile('client.cnf', 'password=secret', async file => {
      filename = file;
      assert.equal((await stat(file)).mode & 0o777, 0o600);
      assert.equal((await stat(path.dirname(file))).mode & 0o777, 0o700);
      assert.equal(await readFile(file, 'utf8'), 'password=secret');
      if (fail) throw new Error('launch failed');
    });
    if (fail) await assert.rejects(operation, /launch failed/);
    else await operation;
    await assert.rejects(access(filename));
    await assert.rejects(access(path.dirname(filename)));
  }
});

test('mysql options quote credentials and force TCP to the loopback tunnel', () => {
  const config = mysqlConfig({ username: 'admin', password: 'a"\\b\n!include /tmp/other', database: 'wordpress' }, 3307);
  assert.match(config, /host="127\.0\.0\.1"/);
  assert.match(config, /port="3307"/);
  assert.match(config, /protocol="TCP"/);
  assert.ok(config.includes('password="a\\"\\\\b\\n!include /tmp/other"'));
  assert.ok(!config.includes('\n!include'));
});

test('Sequel connection uses loopback with XML-escaped credentials and no SSH settings', () => {
  const config = sequelConfig({ username: 'a&b', password: '<secret>"', database: 'wordpress' }, 3307, 'example-prod');
  assert.ok(config.includes('<key>host</key><string>127.0.0.1</string>'));
  assert.ok(config.includes('<key>port</key><integer>3307</integer>'));
  assert.ok(config.includes('a&amp;b'));
  assert.ok(config.includes('&lt;secret&gt;&quot;'));
  assert.ok(!config.includes('ssh_host'));
});

test('mysql launch inherits the terminal and never passes credentials in argv or environment', async () => {
  const calls = [];
  let closed = 0;
  await launchMysql('/tmp/private/client.cnf', { port: 3307, done: new Promise(() => {}), close: async () => { closed++; } }, (...args) => {
    calls.push(args);
    const child = new EventEmitter();
    child.exitCode = null; child.signalCode = null;
    child.kill = () => assert.fail('a finished client should not be killed');
    queueMicrotask(() => { child.exitCode = 0; child.emit('exit', 0, null); });
    return child;
  });
  assert.deepEqual(calls, [['mysql', ['--defaults-file=/tmp/private/client.cnf', '--protocol=TCP', '--host=127.0.0.1', '--port=3307'], { stdio: 'inherit' }]]);
  assert.equal(closed, 1);
});

test('missing mysql client reports an actionable error and closes the tunnel', async () => {
  let closed = 0;
  await assert.rejects(launchMysql('/tmp/private/client.cnf', {
    port: 3307, done: new Promise(() => {}), close: async () => { closed++; },
  }, () => {
    const child = new EventEmitter();
    child.exitCode = null; child.signalCode = null;
    child.kill = () => {};
    queueMicrotask(() => child.emit('error', Object.assign(new Error(), { code: 'ENOENT' })));
    return child;
  }), /mysql client is not installed/);
  assert.equal(closed, 1);
});
