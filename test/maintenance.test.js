import assert from 'node:assert/strict';
import test from 'node:test';
import { Response } from 'node-fetch';
const directory = process.env.ALTIS_TEST_SOURCE ? '../lib' : '../dist/lib';
const extension = process.env.ALTIS_TEST_SOURCE ? 'ts' : 'js';
const { default: Vantage } = await import(`${directory}/vantage.${extension}`);
const { default: instance } = await import(`${directory}/commands/instance/index.${extension}`);

const response = { id: 'example', name: 'Example', contacts: [{ email: 'ops@example.com' }, { email: 'support@example.com' }], window: {}, account_managers: [] };
const setArgs = contact => ({ group: 'maintenance', action: 'set', id: 'example', contact, config: { get: () => undefined }, json: true });

for (const contacts of [response.contacts, []]) {
	test(`maintenance set appends a contact while preserving ${contacts.length} existing contacts`, async t => {
		const requests = [];
		const current = { ...response, contacts };
		const updated = { ...current, contacts: [...contacts, { email: 'new@example.com' }] };
		t.mock.method(Vantage.prototype, 'fetch', async (url, options) => {
			requests.push({ url, options });
			return new Response(JSON.stringify(options.method === 'PATCH' ? updated : current));
		});
		const output = t.mock.method(console, 'log', () => {});
		await instance.handler(setArgs(' new@example.com '));
		assert.equal(requests.length, 2);
		for (const request of requests) assert.match(request.url, /\/api\/stack\/instances\/example\/maintenance$/);
		assert.equal(requests[0].options.method, undefined);
		assert.equal(requests[0].options.body, undefined);
		assert.equal(requests[1].options.method, 'PATCH');
		assert.equal(requests[1].options.headers['Content-Type'], 'application/json');
		assert.deepEqual(JSON.parse(requests[1].options.body), { contacts: updated.contacts });
		assert.deepEqual(JSON.parse(output.mock.calls[0].arguments[0]), updated);
	});
}

for (const email of ['ops@example.com', ' OPS@EXAMPLE.COM ']) {
	test(`maintenance set leaves an existing contact unchanged: ${email}`, async t => {
		const fetch = t.mock.method(Vantage.prototype, 'fetch', async () => new Response(JSON.stringify(response)));
		const output = t.mock.method(console, 'log', () => {});
		await instance.handler(setArgs(email));
		assert.equal(fetch.mock.calls.length, 1);
		assert.equal(fetch.mock.calls[0].arguments[1].method, undefined);
		assert.deepEqual(JSON.parse(output.mock.calls[0].arguments[0]), response);
	});
}

for (const contact of [undefined, '   ']) {
	test(`maintenance set rejects a missing contact without sending a request: ${JSON.stringify(contact)}`, async t => {
		const fetch = t.mock.method(Vantage.prototype, 'fetch', () => { throw new Error('unexpected request'); });
		await assert.rejects(instance.handler(setArgs(contact)), /--contact <email> is required/);
		assert.equal(fetch.mock.calls.length, 0);
	});
}

test('maintenance set does not update contacts if reading the existing list fails', async t => {
	const fetch = t.mock.method(Vantage.prototype, 'fetch', async () => new Response('{"message":"Forbidden","code":"forbidden"}', { status: 403 }));
	await assert.rejects(instance.handler(setArgs('new@example.com')), /Forbidden/);
	assert.equal(fetch.mock.calls.length, 1);
	assert.equal(fetch.mock.calls[0].arguments[1].method, undefined);
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
