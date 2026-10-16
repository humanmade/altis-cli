import assert from 'node:assert/strict';
import test from 'node:test';
import { Response } from 'node-fetch';
const directory = process.env.ALTIS_TEST_SOURCE ? '../lib' : '../dist/lib';
const extension = process.env.ALTIS_TEST_SOURCE ? 'ts' : 'js';
const { default: Vantage } = await import(`${directory}/vantage.${extension}`);
const { default: deploy } = await import(`${directory}/commands/stack/deploy.${extension}`);

for (const force of [undefined, false, true]) {
	test(`deploy only sends force when explicitly enabled: ${force}`, { timeout: 2000 }, async t => {
		const requests = [];
		t.mock.method(Vantage.prototype, 'fetch', async (url, options) => {
			requests.push({ url: new URL(url), options });
			return new Response('deploy-task');
		});
		let started;
		const streaming = new Promise(resolve => { started = resolve; });
		t.mock.method(Vantage.prototype, 'getLogStream', () => {
			started();
			// Leave log streaming inert; this test exercises the deploy request.
			return new Promise(() => {});
		});
		t.mock.method(console, 'log', () => {});
		deploy.handler({ stack: 'example-dev', build: 'build-1', force, config: { get: () => undefined } });
		await streaming;
		assert.equal(requests.length, 1);
		const { url, options } = requests[0];
		assert.equal(url.pathname, '/api/stack/applications/example-dev/deploys');
		assert.equal(options.method, 'POST');
		assert.equal(url.searchParams.get('stream'), 'true');
		assert.equal(url.searchParams.get('build'), 'build-1');
		assert.equal(url.searchParams.has('force'), force === true);
		if (force) assert.equal(url.searchParams.get('force'), 'true');
	});
}
