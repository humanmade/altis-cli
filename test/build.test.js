import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('compiled executable finds package metadata at its new location', () => {
	const binUrl = new URL('dist/bin/altis-cli.js', root);
	const result = spawnSync(process.execPath, [binUrl.pathname, '--version'], {
		env: { ...process.env, NO_UPDATE_NOTIFIER: '1' }, encoding: 'utf8', timeout: 10000,
	});
	assert.equal(result.status, 0, result.stderr);
	const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
	assert.equal(result.stdout.trim(), pkg.version);
	assert.ok(readFileSync(new URL(pkg.bin['altis-cli'], root), 'utf8').startsWith('#!/usr/bin/env node'));
});

test('OAuth stylesheet is copied beside the compiled API client', () => {
	assert.equal(readFileSync(new URL('dist/lib/success.css', root), 'utf8'), readFileSync(new URL('lib/success.css', root), 'utf8'));
	assert.ok(existsSync(new URL('dist/lib/commands/stack/sync-local/index.js', root)));
});
