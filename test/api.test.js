import assert from 'node:assert/strict';
import test from 'node:test';
import { Response } from 'node-fetch';
import Vantage from '../dist/lib/vantage.js';
import { fetchJSON, ApiError, buildQuery } from '../dist/lib/commands/stack/util.js';
import buildsCommand from '../dist/lib/commands/stack/builds.js';

const api = body => ({ fetch: async () => new Response(body) });

test('API decoding preserves JSON, streaming task IDs, and empty responses', async () => {
	assert.deepEqual(await fetchJSON(api('[{"id":"app-dev"}]'), 'stack/applications'), [{ id: 'app-dev' }]);
	assert.equal(await fetchJSON(api('app-dev/build/123'), 'builds?stream=true'), 'app-dev/build/123');
	assert.equal(await fetchJSON(api(''), 'delete'), null);
});

test('API failures preserve the WordPress code and HTTP status', async () => {
	const v = { fetch: async () => new Response('{"message":"Forbidden","code":"not-supported"}', { status: 403 }) };
	await assert.rejects(fetchJSON(v, 'builds'), error => {
		assert.ok(error instanceof ApiError);
		assert.equal(error.message, 'Forbidden');
		assert.equal(error.code, 'not-supported');
		assert.equal(error.status, 403);
		return true;
	});
	await assert.rejects(fetchJSON({ fetch: async () => new Response('Bad gateway', { status: 502 }) }, 'builds'), /Bad gateway/);
});

test('query encoding retains array filters, nested filters, and zero values', () => {
	const query = new URLSearchParams(buildQuery({ status: ['fail', 'success'], filter: { path: '/test' }, limit: 0, ignored: false }).slice(1));
	assert.deepEqual(query.getAll('status'), ['fail', 'success']);
	assert.equal(query.get('filter[path]'), '/test');
	assert.equal(query.get('limit'), '0');
	assert.equal(query.has('ignored'), false);
});

test('compiled builds handler preserves API JSON output and endpoint', async t => {
	const builds = [{ id: 'build-1', status: 'succeeded', date: '2026-10-12', source_version: '1234567890' }];
	const requests = [];
	t.mock.method(Vantage.prototype, 'fetch', async url => {
		requests.push(url);
		return new Response(JSON.stringify(builds));
	});
	const output = t.mock.method(console, 'log', () => {});
	await buildsCommand.handler({ stack: 'example-dev-01', config: { get: () => undefined }, json: true });
	assert.deepEqual(requests, ['stack/applications/example-dev-01/builds']);
	assert.deepEqual(JSON.parse(output.mock.calls[0].arguments[0]), builds);
});
