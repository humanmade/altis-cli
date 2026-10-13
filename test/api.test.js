import assert from 'node:assert/strict';
import test from 'node:test';
import { Response } from 'node-fetch';
import Vantage from '../dist/lib/vantage.js';
import { ApiError, buildQuery } from '../dist/lib/commands/stack/util.js';
import buildsCommand from '../dist/lib/commands/stack/builds.js';

const api = body => { const client = new Vantage({ get: () => undefined }); client.fetch = async () => new Response(body); return client; };

test('API decoding preserves JSON, streaming task IDs, and empty responses', async () => {
	assert.deepEqual(await api('[{"id":"app-dev"}]').request('stack/applications'), [{ id: 'app-dev' }]);
	assert.equal(await api('app-dev/build/123').request('stack/applications/app-dev/builds', { method: 'POST', query: { stream: true } }), 'app-dev/build/123');
	assert.equal(await api('').request('stack/applications/app-dev/variables/app/name', { method: 'DELETE' }), null);
});

test('API failures preserve the WordPress code and HTTP status', async () => {
	const v = api('');
	v.fetch = async () => new Response('{"message":"Forbidden","code":"not-supported"}', { status: 403 });
	await assert.rejects(v.request('stack/applications/app-dev/builds'), error => {
		assert.ok(error instanceof ApiError);
		assert.equal(error.message, 'Forbidden');
		assert.equal(error.code, 'not-supported');
		assert.equal(error.status, 403);
		return true;
	});
	v.fetch = async () => new Response('Bad gateway', { status: 502 });
	await assert.rejects(v.request('stack/applications/app-dev/builds'), /Bad gateway/);
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
	t.mock.method(Vantage.prototype, 'request', async url => {
		requests.push(url);
		return builds;
	});
	const output = t.mock.method(console, 'log', () => {});
	await buildsCommand.handler({ stack: 'example-dev-01', config: { get: () => undefined }, json: true });
	assert.deepEqual(requests, ['stack/applications/example-dev-01/builds']);
	assert.deepEqual(JSON.parse(output.mock.calls[0].arguments[0]), builds);
});

test('log search and status filters use the backend query names and PHP array encoding', async t => {
 const { default: logsCommand } = await import('../dist/lib/commands/stack/logs.js');
 const requests = [];
 t.mock.method(Vantage.prototype, 'fetch', async url => {
  requests.push(new URL(url));
  return new Response('[]');
 });
 t.mock.method(console, 'log', () => {});
 await logsCommand.handler({ stack: 'example-dev', type: 'cron', search: 'failed + retry', status: ['fail', 'success'], config: { get: () => undefined }, json: true });
 assert.equal(requests[0].searchParams.get('search'), 'failed + retry');
 assert.deepEqual(requests[0].searchParams.getAll('status[]'), ['fail', 'success']);
 assert.equal(requests[0].searchParams.has('filterPattern'), false);
});
