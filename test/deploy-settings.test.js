import assert from 'node:assert/strict';
import test from 'node:test';
import inquirer from 'inquirer';
import { Response } from 'node-fetch';

const directory = process.env.ALTIS_TEST_SOURCE ? '../lib' : '../dist/lib';
const extension = process.env.ALTIS_TEST_SOURCE ? 'ts' : 'js';
const { default: configure } = await import(`${directory}/commands/index.${extension}`);
const { default: Vantage } = await import(`${directory}/vantage.${extension}`);

async function parser() {
 const result = await configure();
 result.exitProcess(false).fail((message, error) => { throw error || new Error(message); });
 return result;
}

test('autodeploy settings list/get read the deployment field and update only the supplied flag', async t => {
 const requests = [];
 const output = [];
 t.mock.method(console, 'log', value => output.push(value));
 t.mock.method(Vantage.prototype, 'fetch', async (url, options) => {
  requests.push({ url, options });
  return new Response(JSON.stringify({ is_autoupdating: false, ref: 'main' }));
 });
 const config = { get: () => undefined };
 await (await parser()).parseAsync(['app', 'deploy', 'settings', 'list', 'example-prod', '--json'], { config });
 assert.deepEqual(JSON.parse(output.at(-1)), { autodeploy: false, branch: 'main' });
 await (await parser()).parseAsync(['app', 'deploy', 'settings', 'get', 'autodeploy', 'example-prod'], { config });
 assert.equal(output.at(-1), false);
 for (const [value, enabled] of [['true', true], ['false', false], ['1', true], ['0', false], ['YES', true], ['no', false], ['on', true], ['OFF', false]]) {
  await (await parser()).parseAsync(['app', 'deploy', 'settings', 'update', 'autodeploy', value, 'example-prod'], { config });
  assert.equal(requests.at(-1).options.method, 'POST');
  assert.deepEqual(JSON.parse(requests.at(-1).options.body), { is_autoupdating: enabled });
 }
 assert.ok(requests.every(request => request.url === 'stack/applications/example-prod/deployment'));
 await (await parser()).parseAsync(['app', 'deploy', 'settings', 'get', 'autodeploy', 'explicit-app'], { config });
 assert.equal(requests.at(-1).url, 'stack/applications/explicit-app/deployment');
 const before = requests.length;
 await assert.rejects((await parser()).parseAsync(['app', 'deploy', 'settings', 'update'], { config }), /Not enough non-option arguments/);
 await assert.rejects((await parser()).parseAsync(['app', 'deploy', 'settings', 'get', 'unknown', 'example-prod'], { config }));
 await assert.rejects((await parser()).parseAsync(['app', 'deploy', 'settings', 'update', 'autodeploy', 'maybe', 'example-prod'], { config }), /Invalid boolean/);
 assert.equal(requests.length, before);
});

test('autodeploy update reports API errors without claiming success', async t => {
 const output = [];
 t.mock.method(console, 'log', value => output.push(value));
 t.mock.method(Vantage.prototype, 'fetch', async () => new Response('{"message":"Forbidden"}', { status: 403 }));
 await assert.rejects((await parser()).parseAsync(['app', 'deploy', 'settings', 'update', 'autodeploy', 'true', 'example-prod'], { config: { get: () => undefined } }), /Forbidden/);
 assert.deepEqual(output, []);
});


test('deploy with an explicit app still enters the normal build selection', async t => {
 const requests = [];
 const prompt = t.mock.method(inquirer, 'prompt', async question => {
  assert.equal(question.name, 'build');
  return new Promise(() => {}); // Stop before any deployment mutation.
 });
 t.mock.method(console, 'log', () => {});
 t.mock.method(Vantage.prototype, 'fetch', async url => {
  requests.push(url);
  return new Response('[]');
 });
 await (await parser()).parseAsync(['app', 'deploy', 'explicit-app'], { config: { get: () => undefined } });
 await new Promise(resolve => setImmediate(resolve));
 assert.deepEqual(requests, ['stack/applications/explicit-app/builds']);
 assert.equal(prompt.mock.calls.length, 1);
});


test('branch settings read the configured ref and update only that field', async t => {
 const requests = [];
 const output = [];
 t.mock.method(console, 'log', value => output.push(value));
 t.mock.method(Vantage.prototype, 'fetch', async (url, options) => {
  requests.push({ url, options });
  return new Response(JSON.stringify({ is_autoupdating: true, ref: 'main', repository: 123 }));
 });
 const config = { get: () => undefined };
 await (await parser()).parseAsync(['app', 'deploy', 'settings', 'get', 'branch', 'example-prod'], { config });
 assert.equal(output.at(-1), 'main');
 for (const branch of ['staging', 'release/2026.10', '123']) {
  await (await parser()).parseAsync(['app', 'deploy', 'settings', 'update', 'branch', branch, 'example-prod'], { config });
  assert.equal(requests.at(-1).url, 'stack/applications/example-prod/deployment');
  assert.equal(requests.at(-1).options.method, 'POST');
  assert.deepEqual(JSON.parse(requests.at(-1).options.body), { ref: branch });
  assert.equal(output.at(-1), `Deployment branch set to ${branch} for example-prod.`);
 }
 const before = requests.length;
 await assert.rejects((await parser()).parseAsync(['app', 'deploy', 'settings', 'update', 'branch', '   ', 'example-prod'], { config }), /Branch must be a non-empty name/);
 await assert.rejects((await parser()).parseAsync(['app', 'deploy', 'settings', 'update', 'unknown', 'main', 'example-prod'], { config }));
 assert.equal(requests.length, before);
});

test('branch update reports API errors without claiming success', async t => {
 const output = [];
 t.mock.method(console, 'log', value => output.push(value));
 t.mock.method(Vantage.prototype, 'fetch', async () => new Response('{"message":"Forbidden"}', { status: 403 }));
 await assert.rejects((await parser()).parseAsync(['app', 'deploy', 'settings', 'update', 'branch', 'staging', 'example-prod'], { config: { get: () => undefined } }), /Forbidden/);
 assert.deepEqual(output, []);
});
