import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { LiveSession } from '../scripts/live-ssm.js';

test('live runner waits for remote shell exit before closing its socket', async () => {
	const session = new EventEmitter();
	const events = [];
	session.write = command => {
		events.push(command);
		queueMicrotask(() => {
			events.push('remote exit');
			session.emit('disconnect');
		});
	};
	session.close = () => events.push('socket close');
	const client = new LiveSession(session, 1000);
	await client.close();
	await client.close();
	assert.deepEqual(events, ['exit\n', 'remote exit', 'socket close']);
});

test('live runner releases the socket when it cannot send remote exit', async () => {
	const session = new EventEmitter();
	const events = [];
	session.write = () => { throw new Error('socket unavailable'); };
	session.close = () => events.push('close');
	session.webSocket = { terminate: () => events.push('terminate') };
	const client = new LiveSession(session, 1000);
	await assert.rejects(client.close(), /socket unavailable/);
	assert.deepEqual(events, ['close', 'terminate']);
});
