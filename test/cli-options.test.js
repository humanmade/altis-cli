import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import { isInformationalInvocation, toParserArgs } from '../lib/cli-options.js';

const run = promisify(execFile);

const bin = fileURLToPath(new URL('../bin/altis-cli.js', import.meta.url));
const pkg = JSON.parse(
	fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')
);

// Run the real entry point in an environment with no configuration file, exactly
// like an unconfigured install in CI (a non-TTY, so setup can't be prompted for).
const runCli = (args, { entry = bin } = {}) => {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), 'altis-cli-test-'));
	return run(process.execPath, [entry, ...args], {
		env: {
			...process.env,
			HOME: home,
			XDG_CONFIG_HOME: path.join(home, 'config'),
		},
	}).catch(err => err);
};

test('isInformationalInvocation recognises the informational options', () => {
	for (const args of [['--help'], ['--version'], ['-h'], ['-v']]) {
		assert.equal(isInformationalInvocation(args), true);
	}
	// --help/--version count wherever they appear.
	assert.equal(isInformationalInvocation(['stack', 'scp', '--help']), true);
	// A -h/-v short form only counts as the first argument.
	assert.equal(isInformationalInvocation(['stack', 'scp', '-v']), false);
	assert.equal(isInformationalInvocation(['config', 'status']), false);
});

test('toParserArgs rewrites only a leading short option', () => {
	assert.deepEqual(toParserArgs(['-h']), ['--help']);
	assert.deepEqual(toParserArgs(['-v']), ['--version']);
	assert.deepEqual(toParserArgs(['--help']), ['--help']);
	// A -v after a subcommand is left alone.
	assert.deepEqual(toParserArgs(['stack', 'scp', '-v']), ['stack', 'scp', '-v']);
});

test('--version and --help work without configuration', async () => {
	const version = await runCli(['--version']);
	assert.equal(version.code ?? 0, 0);
	assert.equal(version.stdout.trim(), pkg.version);

	const help = await runCli(['--help']);
	assert.equal(help.code ?? 0, 0);
	assert.match(help.stdout, /Commands:/);
});

test('-v and -h work without configuration', async () => {
	const version = await runCli(['-v']);
	assert.equal(version.code ?? 0, 0);
	assert.equal(version.stdout.trim(), pkg.version);

	const help = await runCli(['-h']);
	assert.equal(help.code ?? 0, 0);
	assert.match(help.stdout, /Commands:/);
});

test('the entry point runs when invoked through a symlink', async () => {
	// npm installs the bin as a symlink; the CLI must still run when reached that
	// way, not only via a direct path to the file.
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'altis-cli-link-'));
	const link = path.join(dir, 'altis-cli');
	fs.symlinkSync(bin, link);

	const version = await runCli(['--version'], { entry: link });
	assert.equal(version.code ?? 0, 0);
	assert.equal(version.stdout.trim(), pkg.version);
});

test('a -v after a subcommand is not treated as --version', async () => {
	// `stack scp` defines its own -v (verbose), so it must reach the normal path
	// rather than printing the version. Unconfigured and non-TTY, that path exits
	// non-zero asking for setup — which proves -v was not short-circuited.
	const result = await runCli(['stack', 'scp', '-v', 'stack:/tmp/x', './x']);
	assert.notEqual(result.code ?? 0, 0);
	assert.doesNotMatch(result.stdout ?? '', new RegExp(pkg.version.replace(/\./g, '\\.')));
	assert.match(result.stderr ?? '', /not configured/);
});
