import { createServer, type Socket } from 'node:net';
import { Duplex } from 'node:stream';

interface SessionData {
	id: string;
	stream_url: string;
	token: string;
}
interface HandshakeAction {
	ActionType: string;
	ActionParameters?: { SessionType?: string; Properties?: { type?: string } };
}
export interface PortSession {
	on(event: string, listener: (...args: any[]) => void): unknown;
	writeRaw(data: Uint8Array): void;
	sendHandshakeResponse(response: unknown): void;
	close(): void;
}

// Bound data waiting for a local client, or for a slow client to read.
const MAX_BUFFER = 16 * 1024 * 1024;

export function parseSession(raw: string): SessionData {
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		throw new Error('Expected database session JSON (id, stream_url, token).');
	}
	if (!data || typeof data !== 'object' || !['id', 'stream_url', 'token'].every(
		key => typeof (data as Record<string, unknown>)[key] === 'string' && (data as Record<string, string>)[key].length > 0
	)) {
		throw new Error('Session JSON must contain non-empty id, stream_url, and token strings.');
	}
	const session = data as SessionData;
	try {
		if (new URL(session.stream_url).protocol !== 'wss:') throw new Error();
	} catch {
		throw new Error('Session stream_url must be a valid wss:// URL.');
	}
	return session;
}

/** One non-multiplexed SSM session supports one database client connection. */
export function forwardSession(session: PortSession, port = 3306) {
	let stopped = false;
	let accepted = false;
	let negotiated = false;
	let listeningStarted = false;
	let paused = false;
	let pendingWrite: (() => void) | undefined;
	let client: Socket | undefined;
	let resolveDone: () => void;
	let rejectDone: (error: Error) => void;
	const done = new Promise<void>((resolve, reject) => {
		resolveDone = resolve;
		rejectDone = reject;
	});
	const tunnel = new Duplex({
		read() {},
		write(chunk: Buffer, _encoding, callback) {
			const write = () => {
				try { session.writeRaw(chunk); callback(); }
				catch (error) { callback(error as Error); }
			};
			if (paused) pendingWrite = write;
			else write();
		},
	});
	const server = createServer(socket => {
		if (accepted || stopped) {
			socket.destroy();
			return;
		}
		accepted = true;
		client = socket;
		socket.on('error', stop);
		socket.on('close', () => stop());
		socket.pipe(tunnel).pipe(socket);
	});
	const stop = (error?: Error) => {
		if (stopped) return;
		stopped = true;
		clearTimeout(timeout);
		pendingWrite = undefined;
		process.removeListener('SIGINT', interrupt);
		process.removeListener('SIGTERM', interrupt);
		client?.destroy();
		tunnel.destroy();
		server.close();
		try { session.close(); }
		catch (closeError) { error ??= closeError as Error; }
		if (error) rejectDone(error);
		else resolveDone();
	};
	const interrupt = () => stop();
	const timeout = setTimeout(() => stop(new Error('Timed out negotiating the database session.')), 30_000);
	process.on('SIGINT', interrupt);
	process.on('SIGTERM', interrupt);
	tunnel.on('error', stop);
	server.on('error', stop);
	session.on('disconnect', (reason?: string) => stop(new Error(reason || 'Database session disconnected.')));
	session.on('pause', () => { paused = true; });
	session.on('resume', () => {
		paused = false;
		const write = pendingWrite;
		pendingWrite = undefined;
		write?.();
	});
	session.on('rawOutput', (data: Uint8Array) => {
		if (stopped) return;
		if (tunnel.readableLength + data.byteLength > MAX_BUFFER) {
			stop(new Error('Database client is too slow: tunnel buffer limit exceeded.'));
			return;
		}
		tunnel.push(Buffer.from(data));
	});
	session.on('handshake', (data: { RequestedClientActions: HandshakeAction[] }) => {
		if (stopped) return;
		try {
			let portSession = false;
			const errors: string[] = [];
			const actions = data.RequestedClientActions.map(action => {
				const supported = action.ActionType === 'SessionType'
					&& action.ActionParameters?.SessionType === 'Port'
					&& action.ActionParameters.Properties?.type === 'LocalPortForwarding';
				if (supported) portSession = true;
				else errors.push(`Unsupported database session action: ${action.ActionType}`);
				return { ActionType: action.ActionType, ActionStatus: supported ? 1 : 3,
					ActionResult: null, Error: supported ? '' : errors[errors.length - 1] };
			});
			// Stay below 1.1.70: this transport does not implement SSM multiplexing.
			session.sendHandshakeResponse({ ClientVersion: '1.1.69', ProcessedClientActions: actions, Errors: errors });
			if (!portSession || errors.length) {
				stop(new Error(errors.join('; ') || 'SSM did not request a port forwarding session.'));
				return;
			}
			negotiated = true;
		} catch (error) { stop(error as Error); }
	});
	session.on('handshakeComplete', () => {
		if (stopped || listeningStarted) return;
		if (!negotiated) {
			stop(new Error('SSM completed the handshake without negotiating port forwarding.'));
			return;
		}
		clearTimeout(timeout);
		listeningStarted = true;
		server.listen({ host: '127.0.0.1', port });
	});
	// Do not send application-level keepalive data into the database stream.
	return { server, done, close: () => stop() };
}
