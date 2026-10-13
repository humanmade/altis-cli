import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

const extension = process.env.ALTIS_TEST_SOURCE ? 'ts' : 'js';
const directory = process.env.ALTIS_TEST_SOURCE ? '../lib' : '../dist/lib';

test('API URLs retain relative paths, authentication and stream query values', async t => {
	const requests = [];
	const server = http.createServer((req, res) => {
		requests.push({ url: req.url, authorization: req.headers.authorization });
		if (req.url.startsWith('/stream-log')) {
			res.writeHead(200, { 'Content-Type': 'text/event-stream' });
			res.write('data: connected\n\n');
		} else {
			res.end('[]');
		}
	});
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	t.after(() => { server.closeAllConnections(); server.close(); });
	const base = `http://127.0.0.1:${server.address().port}`;
	process.env.VANTAGE_URL = `${base}/api/`;
	const { default: Vantage } = await import(`${directory}/vantage.${extension}`);
	const vantage = new Vantage({ get: key => key === 'vantage_token' ? 'test-token' : undefined });
	await vantage.requestRaw('stack/applications');
	await vantage.requestRaw('/api/stack/instances');
	await vantage.requestRaw('stack/applications/app-dev/logs/cron', { query: { search: 'a+b & c', status: ['fail', 'success'] } });
	const stream = await vantage.getLogStream({ id: 'example-dev', log: 'example-dev/php' });
	try {
		await once(stream, 'data');
	} finally {
		stream.destroy();
	}
	assert.deepEqual(requests.slice(0, 3).map(req => req.url), ['/api/stack/applications', '/api/stack/instances', '/api/stack/applications/app-dev/logs/cron?search=a%2Bb+%26+c&status%5B%5D=fail&status%5B%5D=success']);
	assert.ok(requests.every(req => req.authorization === 'Bearer test-token'));
	const streamURL = new URL(requests[3].url, base);
	assert.equal(streamURL.pathname, '/stream-log');
	assert.deepEqual(Object.fromEntries(streamURL.searchParams), { id: 'example-dev', log: 'example-dev/php' });
});

test('backup query retains false and zero options', async () => {
	const { startBackup } = await import(`${directory}/commands/stack/sync-local/util.${extension}`);
	let requested;
	await startBackup({ requestRaw: async (url, options) => {
		requested = { url, options };
		return { ok: true, text: async () => ' task-id ' };
	} }, 'example-dev', { database: 0, uploads: false });
	const url = new URL(requested.url, 'https://example.com/api/');
	url.search = new URLSearchParams(requested.options.query).toString();
	assert.equal(url.pathname, '/api/stack/applications/example-dev/backups');
	assert.equal(url.searchParams.get('database'), '0');
	assert.equal(url.searchParams.get('uploads'), 'false');
	assert.equal(url.searchParams.get('stream'), 'true');
	assert.equal(requested.options.method, 'POST');
});
