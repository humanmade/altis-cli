import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getStack } from '../dist/lib/commands/stack/util.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helpCommand = path.join(root, 'test-support/help-command.js');
const commands = [
	['info'], ['backup'], ['backups'], ['build'], ['builds'], ['deploy'], ['deploys'],
	['variables'], ['domains'], ['ip-list'], ['ua-blocklist'], ['tasks'], ['build-cache'],
	['database-tables'], ['uploads-prefixes'], ['sites'], ['packages'], ['logs'], ['php-logs'],
	['import', 'database', 'example-dev'], ['sync-local', 'all', 'example-dev'],
	['sync-local', 'database', 'example-dev'], ['sync-local', 'uploads', 'example-dev'],
	['xray', 'list-traces'], ['xray', 'trace', 'trace-id'], ['xray', 'trace-file', 'trace.json'],
	['db-conn'], ['ssh'], ['scp', 'app:/tmp/file', './file'],
];

test('application resolver retains the existing stack argument', async () => {
	assert.equal(await getStack({ stack: 'example-dev-01' }), 'example-dev-01');
});

test('existing commands still render help through app and stack', () => {
	for (const scope of ['app', 'stack']) {
		for (const command of commands) {
			const result = spawnSync(process.execPath, [helpCommand, scope, ...command, '--help'], { cwd: root, encoding: 'utf8' });
			assert.equal(result.status, 0, `${scope} ${command.join(' ')}: ${result.stderr}`);
			assert.match(result.stdout, new RegExp(`${scope} ${command[0]}`));
		}
	}
});

test('instance commands keep their existing positional interface', () => {
	for (const args of [[], ['info', 'example-dev'], ['access', 'list', 'example-dev'], ['maintenance', 'set', 'example-dev'], ['reports', 'example-dev']]) {
		const result = spawnSync(process.execPath, [helpCommand, 'instance', ...args, '--help'], { cwd: root, encoding: 'utf8' });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /instance \[group\] \[action\] \[id\] \[value\]/);
	}
});
