import assert from 'node:assert/strict';
import test from 'node:test';

import { main } from '../bin/altis-cli.js';
import {
	hasInformationalOption,
	normalizeInformationalOptions,
} from '../lib/cli-options.js';

test('informational options bypass configuration setup', () => {
	for (const option of ['--help', '-h', '--version', '-v']) {
		assert.equal(hasInformationalOption([option]), true);
	}

	assert.equal(hasInformationalOption(['config', 'status']), false);
	assert.deepEqual(
		normalizeInformationalOptions(['-h', '--version', '-v']),
		['--help', '--version', '--version'],
	);
});

test('informational options are parsed without loading configuration', async () => {
	const parsed = [];
	const configureParser = async () => ({
		parse: async args => parsed.push(args),
	});

	await main(['node', 'altis-cli.js', '-h'], { configureParser });
	await main(['node', 'altis-cli.js', '-v'], { configureParser });

	assert.deepEqual(parsed, [['--help'], ['--version']]);
});
