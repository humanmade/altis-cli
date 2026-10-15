import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';

const repo = fileURLToPath(new URL('../', import.meta.url));
// Only source and runtime dependencies are available here: native execution
// must work before a build, including from a checkout path containing spaces.
const fixture = mkdtempSync(path.join(tmpdir(), 'altis native source '));
for (const source of ['bin', 'lib', 'package.json']) {
	cpSync(path.join(repo, source), path.join(fixture, source), { recursive: true });
}
symlinkSync(path.join(repo, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
const entry = path.join(fixture, 'bin', 'altis-cli.ts');
const pkg = JSON.parse(readFileSync(path.join(fixture, 'package.json'), 'utf8'));
after(() => rmSync(fixture, { recursive: true, force: true }));

function run(args, executable = entry) {
	const result = spawnSync(process.execPath, [executable, ...args], {
		cwd: fixture,
		env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
		encoding: 'utf8', timeout: 10000,
	});
	assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
	assert.equal(existsSync(path.join(fixture, 'dist')), false);
	return result.stdout;
}

test('native source executable reads package metadata without a build', () => {
	assert.equal(run(['--version']).trim(), pkg.version);
	assert.equal(run(['-v']).trim(), pkg.version);
});

test('native command discovery imports existing commands and nested namespaces', () => {
	assert.match(run(['--help']), /Commands:/);
	for (const scope of ['app', 'stack']) {
		for (const action of ['tunnel', 'cli', 'sequel']) {
			assert.match(run([scope, 'database', action, '--help']), new RegExp(`database ${action}`));
		}
		assert.match(run([scope, 'variables', '--help']), /variables <action> \[stack\]/);
		assert.match(run([scope, 'sync-local', 'database', 'example-dev', '--help']), /database/);
		assert.match(run([scope, 'xray', 'list-traces', '--help']), /list-traces/);
	}
});

test('native source executable works through a symlink', () => {
	const link = path.join(fixture, 'altis-cli');
	symlinkSync(entry, link);
	assert.equal(run(['--version'], link).trim(), pkg.version);
});

test('native API errors retain status and code using erasable TypeScript', () => {
	const url = pathToFileURL(path.join(fixture, 'lib/commands/stack/util.ts')).href;
	const source = `import { ApiError } from ${JSON.stringify(url)};
		const error = new ApiError('Forbidden', 403, 'forbidden');
		if (error.message !== 'Forbidden' || error.status !== 403 || error.code !== 'forbidden') process.exit(1);`;
	const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
		cwd: fixture, encoding: 'utf8', timeout: 10000,
	});
	assert.equal(result.status, 0, result.stderr);
});
