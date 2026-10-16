import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import inquirer from 'inquirer';
import { Response } from 'node-fetch';

const directory = process.env.ALTIS_TEST_SOURCE ? '../lib' : '../dist/lib';
const extension = process.env.ALTIS_TEST_SOURCE ? 'ts' : 'js';
const { readProjectContext, resolveProjectApp } = await import(`${directory}/project-context.${extension}`);
const { getStack } = await import(`${directory}/commands/stack/util.${extension}`);
const { default: configure } = await import(`${directory}/commands/index.${extension}`);
const { default: Vantage } = await import(`${directory}/vantage.${extension}`);
const mapping = { instance: 'example', environments: { development: 'example-dev', staging: 'example-stag', production: 'example-prod' } };

function project(t, context = mapping) {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'altis context '));
 fs.writeFileSync(path.join(root, 'composer.json'), JSON.stringify({ extra: { altis: { cli: context } } }));
 const nested = path.join(root, 'content', 'themes');
 fs.mkdirSync(nested, { recursive: true });
 const previous = process.cwd();
 process.chdir(nested);
 t.after(() => { process.chdir(previous); fs.rmSync(root, { recursive: true, force: true }); });
 return root;
}
async function parser() {
 const result = await configure();
 result.exitProcess(false).fail((message, error) => { throw error || new Error(message); });
 return result;
}

test('nested directories discover the nearest Composer context and map environments', async t => {
 const root = project(t);
 assert.equal(readProjectContext().root, fs.realpathSync(root));
 assert.equal(await getStack({ env: 'staging' }), 'example-stag');
 assert.equal(await resolveProjectApp({ app: 'explicit', env: 'production' }), 'explicit');
 assert.equal(await resolveProjectApp({ stack: 'explicit', env: 'unknown' }), 'explicit');
});

test('unknown environments and invalid mappings fail before any API request', async t => {
 const root = project(t);
 await assert.rejects(resolveProjectApp({ env: 'missing' }), /Available environments: development, staging, production/);
 fs.writeFileSync(path.join(root, 'composer.json'), JSON.stringify({ extra: { altis: { cli: { environments: { staging: 123 } } } } }));
 assert.throws(() => readProjectContext(), /must map environment names/);
 assert.equal(await resolveProjectApp({ stack: 'explicit' }), 'explicit');
});

test('the nearest Composer project does not inherit a parent project context', async t => {
 project(t);
 fs.writeFileSync(path.join(process.cwd(), 'composer.json'), '{}');
 assert.equal(readProjectContext(), undefined);
 await assert.rejects(resolveProjectApp({ env: 'staging' }), /nearest composer.json/);
});

test('one environment resolves automatically; multiple environments require a selection in scripts', async t => {
 const root = project(t, { environments: { development: 'example-dev' } });
 assert.equal(await resolveProjectApp({}), 'example-dev');
 fs.writeFileSync(path.join(root, 'composer.json'), JSON.stringify({ extra: { altis: { cli: mapping } } }));
 await assert.rejects(resolveProjectApp({}), /--env/);
});

test('environment picker prompts each time and ignores cached selections', async t => {
 project(t);
 const descriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
 Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
 t.after(() => { if (descriptor) Object.defineProperty(process.stdin, 'isTTY', descriptor); else delete process.stdin.isTTY; });
 const config = { cache: {
  get: () => { throw new Error('Project selections must not be read from cache'); },
  set: async () => { throw new Error('Project selections must not be saved to cache'); },
 } };
 const prompt = t.mock.method(inquirer, 'prompt', async () => ({ environment: 'staging' }));
 assert.equal(await resolveProjectApp({ config }), 'example-stag');
 assert.equal(await resolveProjectApp({ config, env: 'production' }), 'example-prod');
 assert.equal(await resolveProjectApp({ config }), 'example-stag');
 assert.equal(prompt.mock.calls.length, 2);
});

test('Show all apps opens the full app picker from the project menu', async t => {
 project(t);
 const descriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
 Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
 t.after(() => { if (descriptor) Object.defineProperty(process.stdin, 'isTTY', descriptor); else delete process.stdin.isTTY; });
 const apps = ['example-stag', 'other-project-prod'];
 const config = { cache: { get: () => ({ timestamp: Date.now(), stacks: apps }) } };
 const prompt = t.mock.method(inquirer, 'prompt', async question => {
  if (question.name === 'environment') {
   assert.deepEqual(question.choices.at(-1), { name: 'Show all apps', value: null });
   return { environment: null };
  }
  assert.equal(question.name, 'stack');
  assert.deepEqual(question.choices, apps);
  return { stack: 'other-project-prod' };
 });
 assert.equal(await getStack({ config }), 'other-project-prod');
 assert.equal(prompt.mock.calls.length, 2);
});

test('app and legacy stack commands route --env to the API and explicit IDs override it', async t => {
 project(t);
 const requests = [];
 t.mock.method(Vantage.prototype, 'fetch', async url => { requests.push(url); return new Response('[]'); });
 t.mock.method(console, 'log', () => {});
 for (const scope of ['app', 'stack']) {
  await (await parser()).parseAsync([scope, 'builds', '--env', 'staging', '--json'], { config: { get: () => undefined } });
 }
 await (await parser()).parseAsync(['app', 'builds', 'explicit-dev', '--env', 'production', '--json'], { config: { get: () => undefined } });
 assert.deepEqual(requests, ['stack/applications/example-stag/builds', 'stack/applications/example-stag/builds', 'stack/applications/explicit-dev/builds']);
});

test('imports resolve the omitted target from --env while preserving an explicit source', async t => {
 project(t);
 const requests = [];
 t.mock.method(Vantage.prototype, 'fetch', async (url, options) => {
  requests.push({ url, options });
  return options?.method === 'POST' ? new Response('{"message":"fixture stop"}', { status: 403 }) : new Response('[]');
 });
 await assert.rejects((await parser()).parseAsync(['app', 'import', 'database', '--env', 'staging', '--from', 'source-prod'], { config: { get: () => undefined } }), /fixture stop/);
 assert.equal(requests[1].url, 'stack/applications/example-stag/import-database?stream=true');
 assert.equal(JSON.parse(requests[1].options.body).from_application, 'source-prod');
});

test('instance commands use Composer instance context when the positional ID is omitted', async t => {
 project(t);
 const requests = [];
 t.mock.method(Vantage.prototype, 'fetch', async url => { requests.push(url); return new Response('[]'); });
 t.mock.method(console, 'log', () => {});
 await (await parser()).parseAsync(['instance', 'reports', '--json'], { config: { get: () => undefined } });
 assert.deepEqual(requests, ['stack/instances/example/reports']);
});

test('local sync accepts --env without a positional app and keeps dry runs local', async t => {
 project(t);
 t.mock.method(console, 'log', () => {});
 const fetch = t.mock.method(Vantage.prototype, 'fetch', async () => { throw new Error('unexpected API request'); });
 await (await parser()).parseAsync(['app', 'sync-local', 'database', '--env', 'staging', '--dry-run-search-replace'], { config: { get: () => undefined } });
 assert.equal(fetch.mock.calls.length, 0);
});

test('native/compiled help ignores malformed project configuration', t => {
 const root = project(t);
 fs.writeFileSync(path.join(root, 'composer.json'), '{invalid');
 const entry = fileURLToPath(new URL(process.env.ALTIS_TEST_SOURCE ? '../bin/altis-cli.ts' : '../dist/bin/altis-cli.js', import.meta.url));
 const result = spawnSync(process.execPath, [entry, 'app', 'logs', '--env', 'staging', '--help'], { encoding: 'utf8', env: { ...process.env, NO_UPDATE_NOTIFIER: '1' } });
 assert.equal(result.status, 0, result.stderr);
 assert.match(result.stdout, /--env/);
});


test('PHP logs use the same environment resolver as the general logs command', async t => {
 project(t);
 const requests = [];
 t.mock.method(Vantage.prototype, 'fetch', async url => { requests.push(url); return new Response('[]'); });
 t.mock.method(console, 'log', () => {});
 await (await parser()).parseAsync(['app', 'php-logs', '--env', 'staging'], { config: { get: () => undefined } });
 assert.deepEqual(requests, ['stack/applications/example-stag/logs/php']);
});

test('instance context can be inferred from an environment application', async t => {
 project(t, { environments: { staging: 'example-stag' } });
 const requests = [];
 t.mock.method(Vantage.prototype, 'fetch', async url => {
  requests.push(url);
  return new Response(JSON.stringify(url.startsWith('stack/applications/') ? { 'altis-instance': 'inferred-example' } : { id: 'inferred-example' }));
 });
 t.mock.method(console, 'log', () => {});
 await (await parser()).parseAsync(['instance', 'info', '--env', 'staging', '--json'], { config: { get: () => undefined } });
 assert.deepEqual(requests, ['stack/applications/example-stag', 'stack/instances/inferred-example']);
});
