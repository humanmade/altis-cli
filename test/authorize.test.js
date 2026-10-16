import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { Authenticator } from '../dist/lib/authorize.js';

const options = exchange => ({
 endpoints: { authorize: 'https://staging.example/wp-login.php?action=oauth2_authorize', exchange },
 key: 'test-client', secret: 'test-secret', port: 0,
 render: (title, message = '') => `${title} ${message}`,
});
async function endpoint(t, handler) {
 const server = http.createServer(handler);
 server.listen(0, '127.0.0.1');
 await once(server, 'listening');
 t.after(() => { server.closeAllConnections(); server.close(); });
 return `http://127.0.0.1:${server.address().port}/api/oauth2/access_token`;
}

test('OAuth login and exchange follow VANTAGE_URL and authentication waits for token persistence', async t => {
 const previous = { VANTAGE_URL: process.env.VANTAGE_URL, VANTAGE_CLIENT_ID: process.env.VANTAGE_CLIENT_ID, VANTAGE_CLIENT_SECRET: process.env.VANTAGE_CLIENT_SECRET };
 process.env.VANTAGE_URL = 'https://staging.example/api/';
 process.env.VANTAGE_CLIENT_ID = 'staging-test-client';
 process.env.VANTAGE_CLIENT_SECRET = 'staging-test-secret';
 t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
 let endpoints;
 t.mock.method(Authenticator.prototype, 'start', function() {
  endpoints = this.options.endpoints;
  assert.equal(this.options.key, 'staging-test-client');
  assert.equal(this.options.secret, 'staging-test-secret');
  return Promise.resolve('synthetic-token');
 });
 const { default: Vantage } = await import('../dist/lib/vantage.js');
 let save;
 let completed = false;
 const saving = new Promise(resolve => { save = resolve; });
 const client = new Vantage({ get() {}, set(key, value) {
  assert.equal(key, 'vantage_token'); assert.equal(value, 'synthetic-token'); return saving;
 } });
 const authenticating = client.authenticate().then(value => { completed = true; return value; });
 await new Promise(resolve => setImmediate(resolve));
 assert.deepEqual(endpoints, {
  authorize: 'https://staging.example/wp-login.php?action=oauth2_authorize',
  exchange: 'https://staging.example/api/oauth2/access_token',
 });
 assert.equal(completed, false);
 save();
 assert.deepEqual(await authenticating, { token: 'synthetic-token' });
});

test('token exchange rejects HTTP errors, invalid JSON, and missing tokens without echoing responses', async t => {
 for (const [status, body, expected] of [
  [401, 'private server response', /HTTP 401/],
  [200, '<html>private server response</html>', /invalid JSON/],
  [200, '{"error":"private server response"}', /did not return an access token/],
  [200, '{"access_token":""}', /did not return an access token/],
 ]) {
  const url = await endpoint(t, (_req, res) => { res.writeHead(status); res.end(body); });
  const auth = new Authenticator(options(url));
  await assert.rejects(auth.exchangeCode('test-code'), error => expected.test(error.message) && !error.message.includes('private server response'));
 }
});

test('callback only displays success after receiving a valid token', async t => {
 let answer;
 const requested = new Promise(resolve => { answer = resolve; });
 let response;
 const url = await endpoint(t, (_req, res) => { response = res; answer(); });
 const auth = new Authenticator(options(url));
 let status, page;
 const result = auth.handleRequest({ url: `/?code=test-code&state=${encodeURIComponent(auth.state)}` }, {
  setHeader() {}, writeHead(value) { status = value; }, end(value) { page = value; },
 });
 await requested;
 assert.equal(page, undefined);
 response.end('{"access_token":"synthetic-token"}');
 assert.equal(await result, 'synthetic-token');
 assert.equal(status, 200);
 assert.match(page, /Authenticated altis-cli!/);
});

test('failed callback rejects the login promise, displays failure, and closes the callback server', async t => {
 const url = await endpoint(t, (_req, res) => { res.writeHead(401); res.end('{}'); });
 const auth = new Authenticator(options(url));
 let browser;
 t.mock.method(auth, 'startAuthorization', async () => {
  browser = fetch(`http://127.0.0.1:${auth.server.address().port}/?code=test-code&state=${encodeURIComponent(auth.state)}`);
  await browser;
 });
 await assert.rejects(auth.start(), /HTTP 401/);
 const response = await browser;
 assert.equal(response.status, 502);
 const page = await response.text();
 assert.match(page, /Authentication failed/);
 assert.doesNotMatch(page, /Authenticated altis-cli!/);
 assert.equal(auth.server.listening, false);
});
