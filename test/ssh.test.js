import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { attachSessionInput, startKeepalive } from '../lib/commands/stack/ssh.js';

test('SSH input resumes a paused terminal and forwards data', async () => {
	const input = new PassThrough();
	const rawModes = [];
	input.isTTY = true;
	input.isRaw = false;
	input.setRawMode = value => {
		input.isRaw = value;
		rawModes.push(value);
	};
	input.pause();

	const writes = [];
	const session = {
		write: value => writes.push(value),
		close: () => {},
	};
	const detach = attachSessionInput(session, input, new PassThrough());
	input.write(Buffer.from('pwd\r'));
	await new Promise(resolve => setImmediate(resolve));

	assert.deepEqual(writes, ['pwd\r']);
	assert.deepEqual(rawModes, [true]);
	detach();
	assert.deepEqual(rawModes, [true, false]);
});

test('SSH escape sequence closes the active session', async () => {
	const input = new PassThrough();
	let closed = false;
	const session = {
		write: () => assert.fail('escape sequence should not be forwarded'),
		close: () => { closed = true; },
	};
	const detach = attachSessionInput(session, input, new PassThrough());
	input.write(Buffer.from('~.'));
	await new Promise(resolve => setImmediate(resolve));
	detach();

	assert.equal(closed, true);
});

test('SSH keepalive pings the active session', () => {
	let callback;
	let pings = 0;
	const timer = Symbol('timer');
	const returnedTimer = startKeepalive(
		{ ping: () => { pings++; } },
		fn => {
			callback = fn;
			return timer;
		},
	);

	assert.equal(returnedTimer, timer);
	callback();
	assert.equal(pings, 1);
});
