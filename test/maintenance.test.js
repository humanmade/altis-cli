import assert from 'node:assert/strict';
import test from 'node:test';
import { Response } from 'node-fetch';
const directory = process.env.ALTIS_TEST_SOURCE ? '../lib' : '../dist/lib';
const extension = process.env.ALTIS_TEST_SOURCE ? 'ts' : 'js';
const { default: Vantage } = await import(`${directory}/vantage.${extension}`);
const { default: instance } = await import(`${directory}/commands/instance/index.${extension}`);

const response = { id: 'example', name: 'Example', contacts: [{ email: 'ops@example.com' }], window: {}, account_managers: [] };

test('maintenance set sends the backend contacts payload through the typed client', async t => {
	const requests = [];
	t.mock.method(Vantage.prototype, 'fetch', async (url, options) => {
		requests.push({ url, options });
		return new Response(JSON.stringify(response));
	});
	const output = t.mock.method(console, 'log', () => {});
	await instance.handler({ group: 'maintenance', action: 'set', id: 'example', contact: 'ops@example.com', config: { get: () => undefined }, json: true });
	assert.match(requests[0].url, /\/api\/stack\/instances\/example\/maintenance$/);
	assert.equal(requests[0].options.method, 'PATCH');
	assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
	assert.deepEqual(JSON.parse(requests[0].options.body), { contacts: [{ email: 'ops@example.com' }] });
	assert.deepEqual(JSON.parse(output.mock.calls[0].arguments[0]), response);
});

test('maintenance set rejects a missing contact without sending a request', async t => {
	const fetch = t.mock.method(Vantage.prototype, 'fetch', () => { throw new Error('unexpected request'); });
	await assert.rejects(instance.handler({ group: 'maintenance', action: 'set', id: 'example', config: { get: () => undefined } }), /--contact <email> is required/);
	assert.equal(fetch.mock.calls.length, 0);
});

test('maintenance get retains the returned contacts and window', async t => {
	const requests = [];
	t.mock.method(Vantage.prototype, 'fetch', async (url, options) => {
		requests.push({ url, options });
		return new Response(JSON.stringify(response));
	});
	const output = t.mock.method(console, 'log', () => {});
	await instance.handler({ group: 'maintenance', action: 'get', id: 'example', config: { get: () => undefined }, json: true });
	assert.equal(requests[0].options.body, undefined);
	assert.equal(requests[0].options.method, undefined);
	assert.deepEqual(JSON.parse(output.mock.calls[0].arguments[0]), response);
});
