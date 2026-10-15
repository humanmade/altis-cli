import type stream from './stream.ts';

type LogStream = ReturnType<typeof stream>;

/** Keep a tail alive until it closes, with explicit terminal shutdown. */
export function tailStream(connect: () => Promise<LogStream>, listen: (source: LogStream) => void, stopSpinner: () => void = () => {}): Promise<void> {
	return new Promise((resolve, reject) => {
		let source: LogStream | undefined;
		let stopping = false;
		const cleanup = () => {
			process.off('SIGINT', interrupt);
			process.off('SIGTERM', terminate);
		};
		const stop = (code: number) => {
			if (stopping) return;
			stopping = true;
			cleanup();
			stopSpinner();
			source?.destroy();
			if (process.stdin.isTTY && process.stdin.isRaw) process.stdin.setRawMode(false);
			process.stdin.pause();
			process.exit(code);
		};
		const interrupt = () => stop(130);
		const terminate = () => stop(143);
		process.once('SIGINT', interrupt);
		process.once('SIGTERM', terminate);
		Promise.resolve().then(connect).then(connected => {
			source = connected;
			source.once('close', () => { cleanup(); resolve(); });
			source.once('error', error => { cleanup(); reject(error); source?.destroy(); });
			listen(source);
		}).catch(error => { cleanup(); stopSpinner(); reject(error); });
	});
}
